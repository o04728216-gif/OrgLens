import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  extractBearerToken,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { verifyTronUsdtTransaction } from '../services/tronVerifierService.ts';
import { markUserApiActivity } from '../services/worldwideCrawlerDaemon.ts';
import {
  authenticateUser,
  changeSelfAccountPassword,
  createUsdtPaymentSubmission,
  DEVICE_SEAL_COOKIE_NAME,
  getPlatformSettings,
  getPublicPlatformConfig,
  getUserLedgerAndOrders,
  issueOrValidateDeviceSeal,
  redeemPromoVoucherForUser,
  registerNewUser,
  revokeSessionToken,
  rotateSelfSessionToken,
  toPublicUser,
  updateSelfAccountProfile,
} from '../store/vpsStore.ts';

export const authAndBillingRouter = Router();

function readCookieFromRequest(req: Request, name: string): string | null {
  const rawHeader = req.headers.cookie;
  if (!rawHeader || typeof rawHeader !== 'string') return null;
  const parts = rawHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

function attachDeviceSealCookie(req: Request, res: Response): string {
  const incomingCookie = readCookieFromRequest(req, DEVICE_SEAL_COOKIE_NAME);
  const { sealId, signedCookieValue } =
    issueOrValidateDeviceSeal(incomingCookie);
  const isSecure =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${DEVICE_SEAL_COOKIE_NAME}=${encodeURIComponent(
      signedCookieValue
    )}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax${
      isSecure ? '; Secure' : ''
    }`
  );
  return sealId;
}

authAndBillingRouter.get(
  '/api/public/config',
  (req: Request, res: Response) => {
    attachDeviceSealCookie(req, res);
    const includeAdminHint = req.query.adminContext === 'true';
    res.json(getPublicPlatformConfig(includeAdminHint));
  }
);

authAndBillingRouter.post('/api/auth/signup', (req: Request, res: Response) => {
  markUserApiActivity();
  try {
    const sealId = attachDeviceSealCookie(req, res);
    const email = String(req.body?.email || '');
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || '');
    const companyName = String(req.body?.companyName || '');
    const headerDeviceId = String(req.headers['x-orglens-device-id'] || '')
      .trim()
      .slice(0, 96);
    const rawDevice =
      req.body?.device && typeof req.body.device === 'object'
        ? req.body.device
        : {};
    const device =
      rawDevice.deviceInstallId || headerDeviceId
        ? {
            ...rawDevice,
            deviceInstallId: rawDevice.deviceInstallId || headerDeviceId,
          }
        : req.body?.device || null;

    const result = registerNewUser({
      email,
      password,
      fullName,
      companyName,
      sealId,
      device,
    });
    const { ledger, orders } = getUserLedgerAndOrders(result.user.id);
    res.json({
      token: result.token,
      user: result.user,
      ledger,
      orders,
    });
  } catch (err) {
    const status =
      (err as { statusCode?: number })?.statusCode === 403 ? 403 : 400;
    res.status(status).json({
      error:
        err instanceof Error ? err.message : 'Unable to create your account.',
      code: (err as { code?: string })?.code,
    });
  }
});

authAndBillingRouter.post('/api/auth/login', (req: Request, res: Response) => {
  markUserApiActivity();
  try {
    const sealId = attachDeviceSealCookie(req, res);
    const identifier = String(
      req.body?.identifier || req.body?.email || ''
    );
    const password = String(req.body?.password || '');
    const headerDeviceId = String(req.headers['x-orglens-device-id'] || '')
      .trim()
      .slice(0, 96);
    const rawDevice =
      req.body?.device && typeof req.body.device === 'object'
        ? req.body.device
        : {};
    const device =
      rawDevice.deviceInstallId || headerDeviceId
        ? {
            ...rawDevice,
            deviceInstallId: rawDevice.deviceInstallId || headerDeviceId,
          }
        : req.body?.device || null;

    const result = authenticateUser({
      identifier,
      password,
      sealId,
      device,
    });
    const { ledger, orders } = getUserLedgerAndOrders(result.user.id);
    res.json({
      token: result.token,
      user: result.user,
      displacedPreviousDevice: result.displacedPreviousDevice,
      ledger,
      orders,
    });
  } catch (err) {
    const status =
      (err as { statusCode?: number })?.statusCode === 403 ? 403 : 401;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Authentication failed.',
    });
  }
});

authAndBillingRouter.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (token) {
    revokeSessionToken(token);
  }
  res.json({ ok: true });
});

authAndBillingRouter.get(
  '/api/auth/me',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const { ledger, orders } = getUserLedgerAndOrders(user.id);
    res.json({
      user: toPublicUser(user),
      ledger,
      orders,
      config: getPublicPlatformConfig(user.isRootAdmin || user.role === 'admin'),
    });
  }
);

authAndBillingRouter.get(
  '/api/auth/session-check',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const pub = toPublicUser(req.authUser!);
    res.json({
      ok: true,
      user: pub,
    });
  }
);

authAndBillingRouter.patch(
  '/api/account/profile',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUser = req.authUser!;
      // Strictly forbid user-initiated email changes
      if (
        typeof req.body?.email === 'string' &&
        req.body.email.trim() &&
        req.body.email.trim().toLowerCase() !== currentUser.email.toLowerCase()
      ) {
        res.status(403).json({
          error:
            'Your account email address is permanently locked and cannot be changed.',
          code: 'EMAIL_CHANGE_FORBIDDEN',
        });
        return;
      }

      const updatedUser = updateSelfAccountProfile(currentUser.id, {
        fullName: req.body?.fullName,
        username: req.body?.username,
        companyName: req.body?.companyName,
        jobTitle: req.body?.jobTitle,
        preferences: req.body?.preferences,
      });
      res.json({
        user: updatedUser,
        message: 'Profile and workspace preferences saved.',
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to update your profile.',
      });
    }
  }
);

authAndBillingRouter.post(
  '/api/account/password',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUser = req.authUser!;
      if (typeof req.body?.email === 'string' && req.body.email.trim()) {
        res.status(403).json({
          error:
            'Only your password can be changed here. Email addresses cannot be modified.',
          code: 'EMAIL_CHANGE_FORBIDDEN',
        });
        return;
      }

      const sealId = attachDeviceSealCookie(req, res);
      const headerDeviceId = String(req.headers['x-orglens-device-id'] || '')
        .trim()
        .slice(0, 96);
      const rawDevice =
        req.body?.device && typeof req.body.device === 'object'
          ? req.body.device
          : {};
      const device =
        rawDevice.deviceInstallId || headerDeviceId
          ? {
              ...rawDevice,
              deviceInstallId: rawDevice.deviceInstallId || headerDeviceId,
            }
          : req.body?.device || null;

      const result = changeSelfAccountPassword({
        userId: currentUser.id,
        currentPassword: String(req.body?.currentPassword || ''),
        newPassword: String(req.body?.newPassword || ''),
        sealId,
        device,
      });

      res.json({
        token: result.token,
        user: result.user,
        message: 'Password updated successfully.',
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to change password.',
      });
    }
  }
);

authAndBillingRouter.post(
  '/api/account/rotate-session',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUser = req.authUser!;
      const sealId = attachDeviceSealCookie(req, res);
      const headerDeviceId = String(req.headers['x-orglens-device-id'] || '')
        .trim()
        .slice(0, 96);
      const rawDevice =
        req.body?.device && typeof req.body.device === 'object'
          ? req.body.device
          : {};
      const device =
        rawDevice.deviceInstallId || headerDeviceId
          ? {
              ...rawDevice,
              deviceInstallId: rawDevice.deviceInstallId || headerDeviceId,
            }
          : req.body?.device || null;

      const result = rotateSelfSessionToken({
        userId: currentUser.id,
        sealId,
        device,
      });
      res.json({
        token: result.token,
        user: result.user,
        message: 'Active single-device session key rotated.',
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to rotate session key.',
      });
    }
  }
);

authAndBillingRouter.post(
  '/api/billing/submit-usdt',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const txHash = String(req.body?.txHash || '').trim();
      const senderWallet = String(req.body?.senderWallet || '').trim();
      const userNote = String(req.body?.userNote || '').trim();
      const settings = getPlatformSettings();

      if (!txHash || txHash.length < 12) {
        res.status(400).json({
          error: `Please paste your TRON (TRC20) Transaction Hash (TxID) to verify your $${settings.unlimitedMonthlyPriceUsdt} USDT transfer.`,
        });
        return;
      }

      const verification = await verifyTronUsdtTransaction(
        txHash,
        settings.usdtWalletAddress,
        settings.unlimitedMonthlyPriceUsdt
      );

      const submission = createUsdtPaymentSubmission({
        userId: user.id,
        txHash,
        senderWallet: senderWallet || verification.senderWallet,
        userNote,
        onChainVerified: verification.verified,
        onChainDetails: verification.details,
        detectedAmountUsdt: verification.amountUsdt,
      });

      const { ledger, orders } = getUserLedgerAndOrders(user.id);
      res.json({
        order: submission.order,
        user: submission.user,
        autoActivated: submission.autoActivated,
        verificationDetails: verification.details,
        ledger,
        orders,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to submit USDT payment verification.',
      });
    }
  }
);

authAndBillingRouter.post(
  '/api/billing/redeem-voucher',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const code = String(req.body?.code || '');
      const result = redeemPromoVoucherForUser({
        userId: user.id,
        code,
      });
      const { ledger, orders } = getUserLedgerAndOrders(user.id);
      res.json({
        message: result.message,
        user: result.user,
        ledger,
        orders,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to redeem voucher code.',
      });
    }
  }
);
