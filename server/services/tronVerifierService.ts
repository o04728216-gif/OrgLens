import axios from 'axios';

const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export interface TronVerificationResult {
  verified: boolean;
  amountUsdt?: number;
  senderWallet?: string;
  recipientWallet?: string;
  details: string;
}

/**
 * Queries TRON's public read-only TronScan API to inspect a 64-character TRC20 TxID.
 * Verifies contract success, recipient wallet match, and USDT amount transferred.
 */
export async function verifyTronUsdtTransaction(
  rawTxHash: string,
  expectedWalletAddress: string,
  minimumAmountUsdt: number
): Promise<TronVerificationResult> {
  const cleanHash = rawTxHash.trim();

  if (!/^[a-fA-F0-9]{64}$/.test(cleanHash)) {
    return {
      verified: false,
      details:
        'Submitted reference is not a 64-character hexadecimal TRON TxID; queued for manual Admin verification.',
    };
  }

  try {
    const response = await axios.get(
      `https://apilist.tronscanapi.com/api/transaction-info?hash=${cleanHash}`,
      {
        timeout: 6500,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OrgLens-Billing-Verifier/1.0',
        },
        validateStatus: (s) => s >= 200 && s < 500,
      }
    );

    const data = response.data;
    if (!data || typeof data !== 'object' || !data.hash) {
      return {
        verified: false,
        details:
          'Transaction not yet indexed on TronScan (may still be confirming on TRON network). Queued for Admin review.',
      };
    }

    const contractRet = String(data.contractRet || '').toUpperCase();
    if (contractRet && contractRet !== 'SUCCESS') {
      return {
        verified: false,
        details: `TRON network returned status "${contractRet}" for this transaction.`,
      };
    }

    const transfers: Array<Record<string, unknown>> = Array.isArray(
      data.trc20TransferInfo
    )
      ? data.trc20TransferInfo
      : data.tokenTransferInfo && typeof data.tokenTransferInfo === 'object'
      ? [data.tokenTransferInfo as Record<string, unknown>]
      : [];

    if (transfers.length === 0) {
      return {
        verified: false,
        details:
          'No TRC20 token transfer payload detected on this TxID; queued for manual Admin review.',
      };
    }

    const expectedNormalized = expectedWalletAddress.trim();

    for (const tr of transfers) {
      const toAddress = String(tr.to_address || tr.to || '').trim();
      const fromAddress = String(tr.from_address || tr.from || '').trim();
      const contractAddr = String(
        tr.contract_address || tr.contract || ''
      ).trim();
      const symbol = String(tr.symbol || '').toUpperCase();
      const decimals = Number(tr.decimals ?? 6) || 6;
      const rawAmountStr = String(tr.amount_str || tr.amount || '0');
      const amountUsdt = Number(rawAmountStr) / Math.pow(10, decimals);

      const isUsdt =
        contractAddr === TRON_USDT_CONTRACT || symbol === 'USDT';
      const matchesWallet = toAddress === expectedNormalized;

      if (isUsdt && matchesWallet) {
        if (amountUsdt + 0.25 >= minimumAmountUsdt) {
          return {
            verified: true,
            amountUsdt: Number(amountUsdt.toFixed(2)),
            senderWallet: fromAddress,
            recipientWallet: toAddress,
            details: `Confirmed on-chain TRC20 transfer of ${amountUsdt.toFixed(
              2
            )} USDT from ${fromAddress} to ${toAddress}.`,
          };
        }
        return {
          verified: false,
          amountUsdt: Number(amountUsdt.toFixed(2)),
          senderWallet: fromAddress,
          recipientWallet: toAddress,
          details: `Detected ${amountUsdt.toFixed(
            2
          )} USDT to ${toAddress}, which is below the $${minimumAmountUsdt} plan requirement. Queued for Admin review.`,
        };
      }
    }

    return {
      verified: false,
      details: `TRC20 transfer did not match recipient wallet ${expectedNormalized}. Queued for Admin inspection.`,
    };
  } catch {
    return {
      verified: false,
      details:
        'Live TronScan check timed out; order saved to Pending Queue for manual Admin approval.',
    };
  }
}
