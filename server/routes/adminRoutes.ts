import { Router } from 'express';
import type { Response } from 'express';
import {
  flushServerCaches,
  getServerCacheStats,
  invalidateDomainCaches,
} from '../cache.ts';
import {
  requireAdmin,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { verifyTronUsdtTransaction } from '../services/tronVerifierService.ts';
import {
  getCrawlerStatusSnapshot,
  runCrawlerCycleNow,
  setCrawlerDaemonEnabled,
} from '../services/worldwideCrawlerDaemon.ts';
import { probeGlobalRegistryFederationTotals } from '../services/worldwideRegistryConnectors.ts';
import {
  adminCreateUserManually,
  adminCreateVoucher,
  adminDeleteRegisteredDevice,
  adminDeleteUserAccount,
  adminDeleteVoucher,
  adminRecordManualUsdtGrant,
  adminReviewUsdtPayment,
  adminToggleVoucher,
  adminUpdateRegisteredDevice,
  adminUpdateRootCredentials,
  adminUpdateUserAccount,
  deleteCompanyManualOverride,
  exportFullVpsBackup,
  getAdminStoreSnapshot,
  getPlatformSettings,
  importFullVpsBackup,
  updatePlatformSettings,
  upsertCompanyManualOverride,
} from '../store/vpsStore.ts';

export const adminRouter = Router();

adminRouter.use('/api/admin', requireAdmin);

adminRouter.get(
  '/api/admin/dashboard',
  (_req: AuthenticatedRequest, res: Response) => {
    const store = getAdminStoreSnapshot();
    res.json({
      ...store,
      cacheStats: getServerCacheStats(),
      crawlerStats: getCrawlerStatusSnapshot(),
    });
  }
);

adminRouter.get(
  '/api/admin/crawler/stats',
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({ crawlerStats: getCrawlerStatusSnapshot() });
  }
);

adminRouter.post(
  '/api/admin/crawler/run',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const burstPages = Math.max(
        1,
        Math.min(5, Number(req.body?.burstPages || 2))
      );
      if (req.body?.refreshFederationTotals) {
        await probeGlobalRegistryFederationTotals();
      }
      const summary = await runCrawlerCycleNow({ burstPages });
      res.json({
        ok: true,
        summary,
        crawlerStats: getCrawlerStatusSnapshot(),
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to run crawler cycle.',
      });
    }
  }
);

adminRouter.post(
  '/api/admin/crawler/toggle',
  (req: AuthenticatedRequest, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    const crawlerStats = setCrawlerDaemonEnabled(enabled);
    res.json({ ok: true, crawlerStats });
  }
);

adminRouter.post(
  '/api/admin/users/create',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const created = adminCreateUserManually({
        email: String(req.body?.email || ''),
        username: req.body?.username ? String(req.body.username) : undefined,
        fullName: String(req.body?.fullName || ''),
        companyName: String(req.body?.companyName || ''),
        adminNotes: req.body?.adminNotes ? String(req.body.adminNotes) : undefined,
        password: String(req.body?.password || ''),
        lensCoins: Number(req.body?.lensCoins ?? 50),
        plan: req.body?.plan === 'unlimited' ? 'unlimited' : 'starter',
        unlimitedDays:
          req.body?.unlimitedDays === 'lifetime'
            ? 'lifetime'
            : Number(req.body?.unlimitedDays || 30),
        customUnlimitedExpiresAt: req.body?.customUnlimitedExpiresAt
          ? String(req.body.customUnlimitedExpiresAt)
          : undefined,
        role: req.body?.role === 'admin' ? 'admin' : 'user',
        status: req.body?.status === 'suspended' ? 'suspended' : 'active',
        unlockedCompanies: Array.isArray(req.body?.unlockedCompanies)
          ? req.body.unlockedCompanies
          : undefined,
      });
      res.json({ user: created });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to create user.',
      });
    }
  }
);

adminRouter.patch(
  '/api/admin/users/:id',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updated = adminUpdateUserAccount(String(req.params.id || ''), {
        fullName: req.body?.fullName,
        username: req.body?.username,
        companyName: req.body?.companyName,
        email: req.body?.email,
        adminNotes: req.body?.adminNotes,
        exactCoins:
          typeof req.body?.exactCoins === 'number'
            ? req.body.exactCoins
            : undefined,
        coinsDelta:
          typeof req.body?.coinsDelta === 'number'
            ? req.body.coinsDelta
            : undefined,
        adjustmentNote: req.body?.adjustmentNote,
        plan: req.body?.plan,
        unlimitedDays: req.body?.unlimitedDays,
        customUnlimitedExpiresAt: req.body?.customUnlimitedExpiresAt,
        status: req.body?.status,
        role: req.body?.role,
        newPassword: req.body?.newPassword,
        clearUnlockedHistory: Boolean(req.body?.clearUnlockedHistory),
        addUnlockedDomains: Array.isArray(req.body?.addUnlockedDomains)
          ? req.body.addUnlockedDomains
          : undefined,
        removeUnlockedDomain: req.body?.removeUnlockedDomain
          ? String(req.body.removeUnlockedDomain)
          : undefined,
        resetUsageCounters: Boolean(req.body?.resetUsageCounters),
        revokeSessions: Boolean(req.body?.revokeSessions),
        releaseDeviceLock: Boolean(req.body?.releaseDeviceLock),
      });
      res.json({ user: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update user.',
      });
    }
  }
);

adminRouter.delete(
  '/api/admin/users/:id',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const releaseDevice = req.query.releaseDevice === 'true';
      adminDeleteUserAccount(String(req.params.id || ''), releaseDevice);
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : 'Unable to delete user.',
      });
    }
  }
);

adminRouter.patch(
  '/api/admin/devices/:id',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const device = adminUpdateRegisteredDevice(String(req.params.id || ''), {
        status: req.body?.status,
        adminNote: req.body?.adminNote,
        resetBlockedAttempts: Boolean(req.body?.resetBlockedAttempts),
      });
      res.json({ device });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update registered device.',
      });
    }
  }
);

adminRouter.delete(
  '/api/admin/devices/:id',
  (req: AuthenticatedRequest, res: Response) => {
    adminDeleteRegisteredDevice(String(req.params.id || ''));
    res.json({ ok: true });
  }
);

adminRouter.post(
  '/api/admin/payments/:id/review',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const action = req.body?.action;
      if (action !== 'approved' && action !== 'rejected' && action !== 'pending') {
        res.status(400).json({ error: 'Invalid payment review action.' });
        return;
      }
      const order = adminReviewUsdtPayment({
        orderId: String(req.params.id || ''),
        action,
        durationDays:
          req.body?.durationDays === 'lifetime'
            ? 'lifetime'
            : req.body?.durationDays
            ? Number(req.body.durationDays)
            : undefined,
        bonusCoins: req.body?.bonusCoins ? Number(req.body.bonusCoins) : 0,
        adminNote: req.body?.adminNote,
        reviewerEmail: req.authUser?.email || 'admin',
      });
      res.json({ order });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to review payment.',
      });
    }
  }
);

adminRouter.post(
  '/api/admin/payments/:id/reverify',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const snapshot = getAdminStoreSnapshot();
      const targetOrder = snapshot.payments.find(
        (p) => p.id === String(req.params.id || '')
      );
      if (!targetOrder) {
        res.status(404).json({ error: 'Payment order not found.' });
        return;
      }

      const settings = getPlatformSettings();
      const check = await verifyTronUsdtTransaction(
        targetOrder.txHash,
        settings.usdtWalletAddress,
        settings.unlimitedMonthlyPriceUsdt
      );

      const updatedOrder = adminReviewUsdtPayment({
        orderId: targetOrder.id,
        action:
          check.verified && targetOrder.status === 'pending'
            ? 'approved'
            : targetOrder.status,
        adminNote: check.details,
        reviewerEmail: req.authUser?.email || 'admin',
        onChainVerified: check.verified,
        onChainDetails: check.details,
      });

      res.json({
        order: updatedOrder,
        verification: check,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to re-verify TRON transaction.',
      });
    }
  }
);

adminRouter.post(
  '/api/admin/payments/manual-grant',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const defaultPrice = getPlatformSettings().unlimitedMonthlyPriceUsdt;
      const order = adminRecordManualUsdtGrant({
        userEmailOrId: String(req.body?.userEmailOrId || ''),
        amountUsdt: Number(req.body?.amountUsdt || defaultPrice),
        txHash: req.body?.txHash ? String(req.body.txHash) : undefined,
        durationDays:
          req.body?.durationDays === 'lifetime'
            ? 'lifetime'
            : Number(req.body?.durationDays || 30),
        adminNote: req.body?.adminNote ? String(req.body.adminNote) : undefined,
        reviewerEmail: req.authUser?.email || 'admin',
      });
      res.json({ order });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to record manual USDT grant.',
      });
    }
  }
);

adminRouter.post(
  '/api/admin/overrides',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const saved = upsertCompanyManualOverride({
        domain: String(req.body?.domain || ''),
        companyName: req.body?.companyName
          ? String(req.body.companyName).trim()
          : undefined,
        industry: req.body?.industry
          ? String(req.body.industry).trim()
          : undefined,
        headquarters: req.body?.headquarters
          ? String(req.body.headquarters).trim()
          : undefined,
        employeeRange: req.body?.employeeRange
          ? String(req.body.employeeRange).trim()
          : undefined,
        revenueRange: req.body?.revenueRange
          ? String(req.body.revenueRange).trim()
          : undefined,
        forcedFormulaId: req.body?.forcedFormulaId || 'auto',
        forcedConfidence: req.body?.forcedConfidence
          ? Number(req.body.forcedConfidence)
          : undefined,
        blocked: Boolean(req.body?.blocked),
        blockedEmails: Array.isArray(req.body?.blockedEmails)
          ? req.body.blockedEmails
          : [],
        addedContacts: Array.isArray(req.body?.addedContacts)
          ? req.body.addedContacts
          : [],
      });
      invalidateDomainCaches(saved.domain);
      res.json({ override: saved });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to save manual company override.',
      });
    }
  }
);

adminRouter.delete(
  '/api/admin/overrides/:domain',
  (req: AuthenticatedRequest, res: Response) => {
    const dom = String(req.params.domain || '').trim().toLowerCase();
    deleteCompanyManualOverride(dom);
    invalidateDomainCaches(dom);
    res.json({ ok: true });
  }
);

adminRouter.post(
  '/api/admin/vouchers',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const voucher = adminCreateVoucher({
        code: String(req.body?.code || ''),
        rewardType:
          req.body?.rewardType === 'unlimited_days'
            ? 'unlimited_days'
            : 'coins',
        rewardValue: Number(req.body?.rewardValue || 25),
        maxUses: Number(req.body?.maxUses || 100),
        expiresAt: req.body?.expiresAt ? String(req.body.expiresAt) : null,
      });
      res.json({ voucher });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to create voucher.',
      });
    }
  }
);

adminRouter.patch(
  '/api/admin/vouchers/:id',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const voucher = adminToggleVoucher(
        String(req.params.id || ''),
        Boolean(req.body?.active)
      );
      res.json({ voucher });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to update voucher.',
      });
    }
  }
);

adminRouter.delete(
  '/api/admin/vouchers/:id',
  (req: AuthenticatedRequest, res: Response) => {
    adminDeleteVoucher(String(req.params.id || ''));
    res.json({ ok: true });
  }
);

adminRouter.put(
  '/api/admin/settings',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updated = updatePlatformSettings(req.body || {});
      res.json({ settings: updated });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to update settings.',
      });
    }
  }
);

adminRouter.post(
  '/api/admin/cache/flush',
  (req: AuthenticatedRequest, res: Response) => {
    const target = req.body?.target || 'all';
    flushServerCaches(target);
    res.json({
      ok: true,
      cacheStats: getServerCacheStats(),
    });
  }
);

adminRouter.put(
  '/api/admin/root-security',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const updatedRoot = adminUpdateRootCredentials({
        currentPassword: String(req.body?.currentPassword || ''),
        newEmail: req.body?.newEmail ? String(req.body.newEmail) : undefined,
        newUsername: req.body?.newUsername
          ? String(req.body.newUsername)
          : undefined,
        newFullName: req.body?.newFullName
          ? String(req.body.newFullName)
          : undefined,
        newPassword: req.body?.newPassword
          ? String(req.body.newPassword)
          : undefined,
      });
      res.json({ user: updatedRoot });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update Root Admin credentials.',
      });
    }
  }
);

adminRouter.get(
  '/api/admin/backup/export',
  (_req: AuthenticatedRequest, res: Response) => {
    const backup = exportFullVpsBackup();
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orglens-vps-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`
    );
    res.json(backup);
  }
);

adminRouter.post(
  '/api/admin/backup/import',
  (req: AuthenticatedRequest, res: Response) => {
    try {
      importFullVpsBackup(req.body?.backup || req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : 'Unable to restore VPS backup.',
      });
    }
  }
);
