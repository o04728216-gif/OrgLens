import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CoinLedgerEntry,
  CoinLedgerReason,
  CompanyManualOverride,
  DeviceRegistrationPayload,
  PaymentOrderStatus,
  PlatformSettings,
  PromoVoucher,
  PublicPlatformConfig,
  RegisteredDeviceRecord,
  RegisteredDeviceStatus,
  SearchCoinMeta,
  SubscriptionPlan,
  UsdtPaymentOrder,
  UserAccountPublic,
  UserRole,
  UserStatus,
  UserWorkspacePreferences,
} from '../../src/types/platformTypes.ts';
import { resolveAuthStoragePaths } from './persistentDataDir.ts';

export const ROOT_ADMIN_ID = 'root-admin-permanent';
export const DEVICE_SEAL_COOKIE_NAME = 'ol_dseal';
const DB_SCHEMA_VERSION = 2;
const USDT_WALLET_DEFAULT = 'TBLQWJ5jptV28V3gMrm57kGPtEAAnxbRQS';
const SUPPORT_TELEGRAM_URL_DEFAULT = 'https://t.me/paraxait';

export interface StoredUserRecord {
  id: string;
  email: string;
  username: string;
  fullName: string;
  companyName: string;
  jobTitle?: string;
  preferences?: UserWorkspacePreferences;
  adminNotes?: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  isRootAdmin: boolean;
  usingDefaultPassword?: boolean;
  status: UserStatus;
  lensCoins: number;
  totalCoinsUsed: number;
  totalSearches: number;
  plan: SubscriptionPlan;
  unlimitedExpiresAt: string | null;
  unlockedCompanies: string[];
  registeredDeviceId?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface StoredSessionRecord {
  token: string;
  userId: string;
  deviceId?: string;
  deviceLabel?: string;
  platform?: string;
  timezone?: string;
  createdAt: string;
  lastSeenAt?: string;
  expiresAt: string;
}

const DEFAULT_USER_PREFERENCES: UserWorkspacePreferences = {
  defaultSessionMode: 'domain',
  copyFormat: 'email_only',
  exportFilenamePrefix: 'orglens-contacts',
  autoScrollOnPagination: true,
};

interface DisplacedSessionMeta {
  displacedAt: string;
  newDeviceLabel: string;
  reason: 'another_device' | 'password_changed' | 'admin_revoked';
}

const displacedSessionTokens = new Map<string, DisplacedSessionMeta>();

function rememberDisplacedToken(
  token: string,
  meta: DisplacedSessionMeta
): void {
  if (!token) return;
  if (displacedSessionTokens.size >= 2500) {
    const oldestKey = displacedSessionTokens.keys().next().value;
    if (oldestKey) displacedSessionTokens.delete(oldestKey);
  }
  displacedSessionTokens.set(token, meta);
}

export interface VpsDatabaseSchema {
  version: number;
  deviceHmacSecret: string;
  settings: PlatformSettings;
  users: StoredUserRecord[];
  sessions: StoredSessionRecord[];
  registeredDevices: RegisteredDeviceRecord[];
  ledger: CoinLedgerEntry[];
  payments: UsdtPaymentOrder[];
  overrides: Record<string, CompanyManualOverride>;
  vouchers: PromoVoucher[];
}

const AUTH_STORAGE = resolveAuthStoragePaths();
const DATA_DIR = AUTH_STORAGE.primaryDir;
const DB_FILE_PATH = AUTH_STORAGE.primaryDbPath;
const DB_BACKUP_PATH = AUTH_STORAGE.primaryBackupPath;

function hashPassword(password: string, salt?: string): {
  salt: string;
  hash: string;
} {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): boolean {
  try {
    const derived = crypto.scryptSync(password, storedSalt, 64);
    const target = Buffer.from(storedHash, 'hex');
    if (derived.length !== target.length) return false;
    return crypto.timingSafeEqual(derived, target);
  } catch {
    return false;
  }
}

export function createDefaultSettings(): PlatformSettings {
  return {
    defaultSignupCoins: 50,
    domainSearchCoinCost: 1,
    filterCompanyCoinCost: 1,
    chargeRepeatCompanyLookups: false,
    unlimitedMonthlyPriceUsdt: 15,
    subscriptionDurationDays: 30,
    usdtWalletAddress: USDT_WALLET_DEFAULT,
    usdtNetworkLabel: 'TRON Network (TRC20) Only',
    supportTelegramUrl: SUPPORT_TELEGRAM_URL_DEFAULT,
    supportTelegramHandle: '@paraxait',
    autoApproveVerifiedTronTx: true,
    allowNewRegistrations: true,
    enforceOneAccountPerDevice: true,
    strictHardwareFingerprintLock: true,
    announcementBanner: '',
    companyTagline: 'Corporate email finder & Worldwide company explorer',
  };
}

function createBootstrapRootAdmin(): StoredUserRecord {
  const defaultEmail = (
    process.env.ADMIN_EMAIL || 'admin@orglens.io'
  )
    .trim()
    .toLowerCase();
  const defaultUsername = (process.env.ADMIN_USERNAME || 'admin')
    .trim()
    .toLowerCase();
  const defaultPassword = process.env.ADMIN_PASSWORD || 'OrgLensAdmin2026!';
  const { salt, hash } = hashPassword(defaultPassword);
  const now = new Date().toISOString();

  return {
    id: ROOT_ADMIN_ID,
    email: defaultEmail,
    username: defaultUsername,
    fullName: 'Root Platform Administrator',
    companyName: 'OrgLens HQ',
    adminNotes: 'Permanent Root Administrator Account',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    isRootAdmin: true,
    usingDefaultPassword: !process.env.ADMIN_PASSWORD,
    status: 'active',
    lensCoins: 999999,
    totalCoinsUsed: 0,
    totalSearches: 0,
    plan: 'unlimited',
    unlimitedExpiresAt: 'lifetime',
    unlockedCompanies: [],
    createdAt: now,
    lastLoginAt: now,
  };
}

export function computeHasActiveUnlimited(user: StoredUserRecord): boolean {
  if (user.isRootAdmin || user.role === 'admin') return true;
  if (user.plan !== 'unlimited') return false;
  if (user.unlimitedExpiresAt === 'lifetime') return true;
  if (!user.unlimitedExpiresAt) return false;
  const expiryMs = Date.parse(user.unlimitedExpiresAt);
  return Number.isFinite(expiryMs) && expiryMs > Date.now();
}

/**
 * Guarantees that the Root Admin account NEVER self-destructs, gets deleted,
 * gets demoted, gets suspended, or loses unlimited authority.
 * Also performs schema v2 migration (e.g., $20 -> $15 Unlimited Worldwide Pro).
 */
function ensureRootAdminIntegrity(
  state: VpsDatabaseSchema
): { state: VpsDatabaseSchema; migrated: boolean } {
  let migrated = false;

  if (!Array.isArray(state.users)) {
    state.users = [];
  }
  const existingIdx = state.users.findIndex(
    (u) => u.id === ROOT_ADMIN_ID || u.isRootAdmin === true
  );

  if (existingIdx === -1) {
    state.users.unshift(createBootstrapRootAdmin());
  } else {
    const root = state.users[existingIdx];
    if (!root.passwordHash || !root.passwordSalt) {
      const fresh = createBootstrapRootAdmin();
      root.passwordHash = fresh.passwordHash;
      root.passwordSalt = fresh.passwordSalt;
      root.usingDefaultPassword = fresh.usingDefaultPassword;
    }
    root.id = ROOT_ADMIN_ID;
    root.isRootAdmin = true;
    root.role = 'admin';
    root.status = 'active';
    root.plan = 'unlimited';
    root.unlimitedExpiresAt = 'lifetime';
    if (!Number.isFinite(root.lensCoins) || root.lensCoins < 999999) {
      root.lensCoins = 999999;
    }
    if (!root.email) {
      root.email = (process.env.ADMIN_EMAIL || 'admin@orglens.io')
        .trim()
        .toLowerCase();
    }
    if (!root.username) {
      root.username = (process.env.ADMIN_USERNAME || 'admin')
        .trim()
        .toLowerCase();
    }
    if (!Array.isArray(root.unlockedCompanies)) {
      root.unlockedCompanies = [];
    }
  }

  state.settings = {
    ...createDefaultSettings(),
    ...(state.settings || {}),
  };

  // Schema v2 migration: update Unlimited Worldwide Pro default price from $20 -> $15 & add device registry
  if ((state.version || 1) < DB_SCHEMA_VERSION) {
    if (state.settings.unlimitedMonthlyPriceUsdt === 20) {
      state.settings.unlimitedMonthlyPriceUsdt = 15;
    }
    state.settings.enforceOneAccountPerDevice =
      state.settings.enforceOneAccountPerDevice ?? true;
    state.settings.strictHardwareFingerprintLock =
      state.settings.strictHardwareFingerprintLock ?? true;
    state.version = DB_SCHEMA_VERSION;
    migrated = true;
  }

  if (!state.deviceHmacSecret || state.deviceHmacSecret.length < 32) {
    state.deviceHmacSecret = crypto.randomBytes(32).toString('hex');
    migrated = true;
  }

  if (!state.settings.usdtWalletAddress?.trim()) {
    state.settings.usdtWalletAddress = USDT_WALLET_DEFAULT;
  }
  if (!state.settings.supportTelegramUrl?.trim()) {
    state.settings.supportTelegramUrl = SUPPORT_TELEGRAM_URL_DEFAULT;
  }
  if (!Array.isArray(state.sessions)) state.sessions = [];
  if (!Array.isArray(state.registeredDevices)) state.registeredDevices = [];
  if (!Array.isArray(state.ledger)) state.ledger = [];
  if (!Array.isArray(state.payments)) state.payments = [];
  if (!state.overrides || typeof state.overrides !== 'object') {
    state.overrides = {};
  }
  if (!Array.isArray(state.vouchers)) state.vouchers = [];

  return { state, migrated };
}

function scoreRecoveredDatabase(
  parsed: VpsDatabaseSchema,
  mtimeMs: number
): number {
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const nonRootUsers = users.filter(
    (u) => u && u.id !== ROOT_ADMIN_ID && !u.isRootAdmin
  ).length;
  const root = users.find((u) => u && (u.id === ROOT_ADMIN_ID || u.isRootAdmin));
  const customRootBonus =
    root && root.usingDefaultPassword === false ? 500 : 0;
  const paymentsScore = Array.isArray(parsed.payments)
    ? parsed.payments.length * 100
    : 0;
  const devicesScore = Array.isArray(parsed.registeredDevices)
    ? parsed.registeredDevices.length * 50
    : 0;
  const ledgerScore = Array.isArray(parsed.ledger)
    ? parsed.ledger.length * 10
    : 0;
  const vouchersScore = Array.isArray(parsed.vouchers)
    ? Math.max(0, parsed.vouchers.length - 1) * 40
    : 0;
  return (
    nonRootUsers * 10000 +
    customRootBonus +
    paymentsScore +
    devicesScore +
    ledgerScore +
    vouchersScore +
    Math.floor(mtimeMs / 1e12)
  );
}

function loadDatabaseFromDisk(): VpsDatabaseSchema {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Directory exists or read-only fallback
  }

  let bestState: VpsDatabaseSchema | null = null;
  let bestScore = -1;
  let bestMtime = -1;
  let bestPath = '';
  let bestMigrated = false;

  for (const filePath of AUTH_STORAGE.candidateReadPaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as VpsDatabaseSchema;
      if (!parsed || typeof parsed !== 'object') continue;
      const { state, migrated } = ensureRootAdminIntegrity(parsed);
      const score = scoreRecoveredDatabase(state, stat.mtimeMs);
      if (
        bestState === null ||
        score > bestScore ||
        (score === bestScore && stat.mtimeMs > bestMtime)
      ) {
        bestState = state;
        bestScore = score;
        bestMtime = stat.mtimeMs;
        bestPath = filePath;
        bestMigrated = migrated;
      }
    } catch {
      // Try next surviving backup candidate
    }
  }

  if (bestState) {
    // Self-heal primary & mirror paths if we recovered from an external/mirror/bak copy after redeploy
    if (bestMigrated || bestPath !== DB_FILE_PATH || !fs.existsSync(DB_FILE_PATH)) {
      persistDatabaseToDisk(bestState);
    }
    return bestState;
  }

  const { state: fresh } = ensureRootAdminIntegrity({
    version: DB_SCHEMA_VERSION,
    deviceHmacSecret: crypto.randomBytes(32).toString('hex'),
    settings: createDefaultSettings(),
    users: [createBootstrapRootAdmin()],
    sessions: [],
    registeredDevices: [],
    ledger: [],
    payments: [],
    overrides: {},
    vouchers: [
      {
        id: 'voucher-launch-bonus',
        code: 'ORGLENS25',
        rewardType: 'coins',
        rewardValue: 25,
        maxUses: 500,
        usedCount: 0,
        redeemedByUserIds: [],
        active: true,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
  });

  persistDatabaseToDisk(fresh);
  return fresh;
}

function writeAtomicDbCopy(
  dirPath: string,
  filePath: string,
  backupPath: string,
  serialized: string
): void {
  fs.mkdirSync(dirPath, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch {
      // Non-fatal backup copy
    }
  }
  fs.renameSync(tmpPath, filePath);
}

function persistDatabaseToDisk(state: VpsDatabaseSchema): void {
  ensureRootAdminIntegrity(state);

  const nowMs = Date.now();
  state.sessions = state.sessions.filter((s) => {
    const exp = Date.parse(s.expiresAt);
    return Number.isFinite(exp) && exp > nowMs;
  });

  if (state.ledger.length > 5000) {
    state.ledger = state.ledger.slice(0, 5000);
  }

  const serialized = JSON.stringify(state, null, 2);

  try {
    writeAtomicDbCopy(DATA_DIR, DB_FILE_PATH, DB_BACKUP_PATH, serialized);
  } catch (err) {
    console.error('Warning: Failed to persist VPS store to disk:', err);
  }

  if (
    AUTH_STORAGE.mirrorDir &&
    AUTH_STORAGE.mirrorDbPath &&
    AUTH_STORAGE.mirrorBackupPath
  ) {
    try {
      writeAtomicDbCopy(
        AUTH_STORAGE.mirrorDir,
        AUTH_STORAGE.mirrorDbPath,
        AUTH_STORAGE.mirrorBackupPath,
        serialized
      );
    } catch {
      // Best-effort secondary mirror for redeploy resilience
    }
  }
}

let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDatabaseFlush(): void {
  if (scheduledFlushTimer) return;
  scheduledFlushTimer = setTimeout(() => {
    scheduledFlushTimer = null;
    persistDatabaseToDisk(db);
  }, 25);
}

const db: VpsDatabaseSchema = loadDatabaseFromDisk();

export function toPublicUser(user: StoredUserRecord): UserAccountPublic {
  const activeUnlimited = computeHasActiveUnlimited(user);
  const nowMs = Date.now();
  const activeUserSessions = db.sessions.filter((s) => {
    if (s.userId !== user.id) return false;
    const exp = Date.parse(s.expiresAt);
    return Number.isFinite(exp) && exp > nowMs;
  });
  const latestSession = activeUserSessions[activeUserSessions.length - 1];

  const boundDevice = db.registeredDevices.find(
    (d) =>
      d.id === user.registeredDeviceId ||
      (d.boundUserId === user.id && d.status !== 'released')
  );

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    companyName: user.companyName,
    jobTitle: user.jobTitle || '',
    preferences: {
      ...DEFAULT_USER_PREFERENCES,
      ...(user.preferences || {}),
    },
    adminNotes: user.adminNotes || '',
    role: user.isRootAdmin ? 'admin' : user.role,
    isRootAdmin: Boolean(user.isRootAdmin),
    usingDefaultPassword: user.isRootAdmin
      ? Boolean(user.usingDefaultPassword)
      : undefined,
    status: user.isRootAdmin ? 'active' : user.status,
    lensCoins: user.lensCoins,
    totalCoinsUsed: user.totalCoinsUsed,
    totalSearches: user.totalSearches || 0,
    plan: activeUnlimited ? 'unlimited' : 'starter',
    unlimitedExpiresAt: user.isRootAdmin ? 'lifetime' : user.unlimitedExpiresAt,
    hasActiveUnlimited: activeUnlimited,
    unlockedCompaniesCount: Array.isArray(user.unlockedCompanies)
      ? user.unlockedCompanies.length
      : 0,
    unlockedCompaniesPreview: Array.isArray(user.unlockedCompanies)
      ? user.unlockedCompanies.slice(-20).reverse()
      : [],
    unlockedCompaniesList: Array.isArray(user.unlockedCompanies)
      ? [...user.unlockedCompanies].reverse()
      : [],
    activeSessionsCount: activeUserSessions.length,
    activeSessionDeviceId:
      latestSession?.deviceId || boundDevice?.deviceInstallId || undefined,
    activeSessionDeviceLabel:
      latestSession?.deviceLabel || boundDevice?.deviceLabel || 'Active Browser Session',
    activeSessionPlatform:
      latestSession?.platform || boundDevice?.platform || 'Web Workstation',
    activeSessionTimezone:
      latestSession?.timezone || boundDevice?.timezone || 'UTC',
    activeSessionStartedAt: latestSession?.createdAt,
    activeSessionLastSeenAt: latestSession?.lastSeenAt || latestSession?.createdAt,
    registeredDeviceId: boundDevice?.id,
    registeredDeviceLabel: boundDevice?.deviceLabel,
    registeredDeviceStatus: boundDevice?.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

// ============================================================================
// Server-Side HMAC Device Seal & Physical Hardware Anti-Spam Engine
// (Enforces 1 Account Per Physical Device — NEVER blocks by IP address)
// ============================================================================

function signDeviceSealId(sealId: string): string {
  const sig = crypto
    .createHmac('sha256', db.deviceHmacSecret)
    .update(sealId)
    .digest('hex');
  return `${sealId}.${sig}`;
}

export function verifyDeviceSealToken(rawToken?: string | null): string | null {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.includes('.')) {
    return null;
  }
  const [sealId, sig] = rawToken.split('.');
  if (!sealId || !sig || !sealId.startsWith('dseal_')) return null;
  const expected = crypto
    .createHmac('sha256', db.deviceHmacSecret)
    .update(sealId)
    .digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return null;
    return crypto.timingSafeEqual(a, b) ? sealId : null;
  } catch {
    return null;
  }
}

export function issueOrValidateDeviceSeal(existingCookieValue?: string | null): {
  sealId: string;
  signedCookieValue: string;
  isNew: boolean;
} {
  const verified = verifyDeviceSealToken(existingCookieValue);
  if (verified) {
    return {
      sealId: verified,
      signedCookieValue: signDeviceSealId(verified),
      isNew: false,
    };
  }
  const freshSealId = `dseal_${crypto.randomBytes(16).toString('hex')}`;
  return {
    sealId: freshSealId,
    signedCookieValue: signDeviceSealId(freshSealId),
    isNew: true,
  };
}

function sanitizeDevicePayload(
  raw?: Partial<DeviceRegistrationPayload> | null
): DeviceRegistrationPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const deviceInstallId = String(raw.deviceInstallId || '').trim().slice(0, 96);
  const hardwareHash = String(raw.hardwareHash || '').trim().slice(0, 128);
  const canvasFontHash = String(raw.canvasFontHash || '').trim().slice(0, 128);
  if (!deviceInstallId && !hardwareHash) return null;

  return {
    deviceInstallId:
      deviceInstallId || `did_${crypto.randomBytes(12).toString('hex')}`,
    hardwareHash: hardwareHash || '',
    canvasFontHash: canvasFontHash || '',
    deviceLabel:
      String(raw.deviceLabel || 'Browser Workstation').trim().slice(0, 140) ||
      'Browser Workstation',
    platform: String(raw.platform || 'Unknown OS').trim().slice(0, 64),
    gpuRenderer: String(raw.gpuRenderer || 'Standard GPU').trim().slice(0, 80),
    screenProfile: String(raw.screenProfile || 'Unknown').trim().slice(0, 64),
    cpuCores: Math.max(0, Number(raw.cpuCores || 0)),
    memoryGb: Math.max(0, Number(raw.memoryGb || 0)),
    timezone: String(raw.timezone || 'UTC').trim().slice(0, 64),
  };
}

function findMatchingRegisteredDevice(
  sealId: string | null,
  devicePayload: DeviceRegistrationPayload | null,
  includeHardwareMatch: boolean
): RegisteredDeviceRecord | undefined {
  return db.registeredDevices.find((rec) => {
    if (rec.status === 'released') return false;
    // 1. Authoritative unique server-signed browser seal
    if (sealId && rec.sealId && rec.sealId === sealId) return true;
    // 2. Authoritative unique persistent Device Installation ID (unique per phone/PC browser)
    if (
      devicePayload?.deviceInstallId &&
      rec.deviceInstallId &&
      rec.deviceInstallId === devicePayload.deviceInstallId
    ) {
      return true;
    }
    // 3. Hardware fallback ONLY if no distinct per-device Install ID exists.
    // Different users can own identical iPhone/Android/PC models with matching hardware/GPU/screen metrics;
    // distinct valid did_... IDs must never collide just because two phones/PCs share the same model.
    const hasDistinctInstallIds = Boolean(
      rec.deviceInstallId?.startsWith('did_') &&
        devicePayload?.deviceInstallId?.startsWith('did_') &&
        rec.deviceInstallId !== devicePayload.deviceInstallId
    );
    if (
      includeHardwareMatch &&
      !hasDistinctInstallIds &&
      devicePayload?.hardwareHash &&
      devicePayload.hardwareHash.length >= 16 &&
      rec.hardwareHash === devicePayload.hardwareHash
    ) {
      if (
        !rec.canvasFontHash ||
        !devicePayload.canvasFontHash ||
        rec.canvasFontHash === devicePayload.canvasFontHash
      ) {
        return true;
      }
    }
    return false;
  });
}

function appendLedgerEntry(entry: Omit<CoinLedgerEntry, 'id' | 'createdAt'>) {
  const record: CoinLedgerEntry = {
    ...entry,
    id: `led_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: new Date().toISOString(),
  };
  db.ledger.unshift(record);
  return record;
}

function createSessionForUser(
  userId: string,
  deviceInfo?: Partial<DeviceRegistrationPayload> | null,
  displaceReason: 'another_device' | 'password_changed' = 'another_device',
  sealId?: string | null
): { token: string; displacedCount: number } {
  const nowIso = new Date().toISOString();
  const currentDeviceId =
    String(deviceInfo?.deviceInstallId || sealId || '').trim().slice(0, 96) ||
    `dev_${crypto.randomBytes(6).toString('hex')}`;
  const deviceLabel =
    String(deviceInfo?.deviceLabel || '').trim().slice(0, 140) ||
    'Active Browser Workstation';
  const platform =
    String(deviceInfo?.platform || '').trim().slice(0, 64) || 'Web';
  const timezone =
    String(deviceInfo?.timezone || '').trim().slice(0, 64) || 'UTC';

  // Enforce strict ONE-DEVICE-LOGIN-AT-A-TIME keyed by unique Device ID:
  // revoke every prior active session for this user so only 1 Device ID can hold an active session.
  let displacedCount = 0;
  db.sessions = db.sessions.filter((existing) => {
    if (existing.userId !== userId) return true;
    if (!existing.deviceId || existing.deviceId !== currentDeviceId) {
      displacedCount += 1;
    }
    rememberDisplacedToken(existing.token, {
      displacedAt: nowIso,
      newDeviceLabel: `${deviceLabel} (${currentDeviceId.slice(0, 12)})`,
      reason: displaceReason,
    });
    return false;
  });

  const token = `orglens_${crypto.randomBytes(28).toString('hex')}`;
  const now = Date.now();
  const expiresAt = new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.sessions.push({
    token,
    userId,
    deviceId: currentDeviceId,
    deviceLabel,
    platform,
    timezone,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    expiresAt,
  });
  return { token, displacedCount };
}

export function getPublicPlatformConfig(
  includeAdminBootstrap = false
): PublicPlatformConfig {
  const s = db.settings;
  const root = db.users.find((u) => u.isRootAdmin);
  return {
    defaultSignupCoins: s.defaultSignupCoins,
    domainSearchCoinCost: s.domainSearchCoinCost,
    filterCompanyCoinCost: s.filterCompanyCoinCost,
    unlimitedMonthlyPriceUsdt: s.unlimitedMonthlyPriceUsdt,
    subscriptionDurationDays: s.subscriptionDurationDays,
    usdtWalletAddress: s.usdtWalletAddress,
    usdtNetworkLabel: s.usdtNetworkLabel,
    supportTelegramUrl: s.supportTelegramUrl,
    supportTelegramHandle: s.supportTelegramHandle,
    allowNewRegistrations: s.allowNewRegistrations,
    enforceOneAccountPerDevice: s.enforceOneAccountPerDevice,
    strictHardwareFingerprintLock: s.strictHardwareFingerprintLock,
    announcementBanner: s.announcementBanner,
    companyTagline: s.companyTagline,
    bootstrapAdminHint:
      includeAdminBootstrap && root
        ? {
            username: root.username,
            email: root.email,
            defaultPasswordActive: Boolean(root.usingDefaultPassword),
          }
        : undefined,
  };
}

export function getPlatformSettings(): PlatformSettings {
  return { ...db.settings };
}

export function updatePlatformSettings(
  partial: Partial<PlatformSettings>
): PlatformSettings {
  db.settings = {
    ...db.settings,
    ...partial,
    defaultSignupCoins: Math.max(
      0,
      Number(partial.defaultSignupCoins ?? db.settings.defaultSignupCoins)
    ),
    domainSearchCoinCost: Math.max(
      0,
      Number(partial.domainSearchCoinCost ?? db.settings.domainSearchCoinCost)
    ),
    filterCompanyCoinCost: Math.max(
      0,
      Number(partial.filterCompanyCoinCost ?? db.settings.filterCompanyCoinCost)
    ),
    unlimitedMonthlyPriceUsdt: Math.max(
      1,
      Number(
        partial.unlimitedMonthlyPriceUsdt ??
          db.settings.unlimitedMonthlyPriceUsdt
      )
    ),
    subscriptionDurationDays: Math.max(
      1,
      Number(
        partial.subscriptionDurationDays ?? db.settings.subscriptionDurationDays
      )
    ),
    usdtWalletAddress:
      (partial.usdtWalletAddress ?? db.settings.usdtWalletAddress).trim() ||
      USDT_WALLET_DEFAULT,
    supportTelegramUrl:
      (partial.supportTelegramUrl ?? db.settings.supportTelegramUrl).trim() ||
      SUPPORT_TELEGRAM_URL_DEFAULT,
    enforceOneAccountPerDevice: Boolean(
      partial.enforceOneAccountPerDevice ??
        db.settings.enforceOneAccountPerDevice
    ),
    strictHardwareFingerprintLock: Boolean(
      partial.strictHardwareFingerprintLock ??
        db.settings.strictHardwareFingerprintLock
    ),
  };
  persistDatabaseToDisk(db);
  return { ...db.settings };
}

export function registerNewUser(input: {
  email: string;
  password: string;
  fullName: string;
  companyName?: string;
  sealId?: string | null;
  device?: Partial<DeviceRegistrationPayload> | null;
}): { token: string; user: UserAccountPublic } {
  if (!db.settings.allowNewRegistrations) {
    throw new Error(
      'New registrations are temporarily paused by the administrator.'
    );
  }
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid work or personal email address.');
  }
  if (!input.password || input.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  const fullName = input.fullName.trim();
  if (!fullName || fullName.length < 2) {
    throw new Error('Please enter your full name.');
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email);
  if (existing) {
    throw new Error(
      'An account with this email already exists. Please sign in instead.'
    );
  }

  const sanitizedDevice = sanitizeDevicePayload(input.device);
  const sealId = input.sealId || null;

  // Enforce strict One-Device-Per-Signup (Device itself — NEVER IP)
  if (db.settings.enforceOneAccountPerDevice) {
    if (!sanitizedDevice && !sealId) {
      const missingErr = new Error(
        'Device verification is required to register an account. Please enable standard browser features and try again.'
      ) as Error & { statusCode?: number; code?: string };
      missingErr.statusCode = 403;
      missingErr.code = 'DEVICE_VERIFICATION_REQUIRED';
      throw missingErr;
    }

    const matchedDevice = findMatchingRegisteredDevice(
      sealId,
      sanitizedDevice,
      Boolean(db.settings.strictHardwareFingerprintLock)
    );

    if (matchedDevice) {
      matchedDevice.blockedAttempts = (matchedDevice.blockedAttempts || 0) + 1;
      matchedDevice.lastBlockedEmail = email;
      matchedDevice.lastBlockedAt = new Date().toISOString();
      matchedDevice.lastSeenAt = matchedDevice.lastBlockedAt;
      persistDatabaseToDisk(db);

      const message =
        matchedDevice.status === 'banned'
          ? 'This device has been permanently restricted from creating accounts on OrgLens. Please contact Support if you need assistance.'
          : 'This device is already registered to an existing OrgLens account. Only one account is permitted per physical device. Please sign in to your existing account or contact Support.';

      const lockErr = new Error(message) as Error & {
        statusCode?: number;
        code?: string;
      };
      lockErr.statusCode = 403;
      lockErr.code = 'DEVICE_ALREADY_REGISTERED';
      throw lockErr;
    }
  }

  const baseUsername =
    email
      .split('@')[0]
      .replace(/[^a-z0-9_.-]/g, '')
      .slice(0, 24) || 'member';
  const uniqueSuffix = crypto.randomBytes(2).toString('hex');
  const username = db.users.some((u) => u.username === baseUsername)
    ? `${baseUsername}_${uniqueSuffix}`
    : baseUsername;

  const { salt, hash } = hashPassword(input.password);
  const now = new Date().toISOString();
  const initialCoins = db.settings.defaultSignupCoins;
  const newUserId = `usr_${crypto.randomBytes(8).toString('hex')}`;

  let registeredDeviceId: string | undefined;
  if (sanitizedDevice || sealId) {
    const devRecord: RegisteredDeviceRecord = {
      id: `dev_${crypto.randomBytes(7).toString('hex')}`,
      sealId: sealId || `dseal_${crypto.randomBytes(12).toString('hex')}`,
      deviceInstallId:
        sanitizedDevice?.deviceInstallId ||
        `did_${crypto.randomBytes(12).toString('hex')}`,
      hardwareHash: sanitizedDevice?.hardwareHash || '',
      canvasFontHash: sanitizedDevice?.canvasFontHash || '',
      deviceLabel: sanitizedDevice?.deviceLabel || 'Registered Browser Device',
      platform: sanitizedDevice?.platform || 'Unknown OS',
      gpuRenderer: sanitizedDevice?.gpuRenderer || 'Standard GPU',
      screenProfile: sanitizedDevice?.screenProfile || 'Standard',
      cpuCores: sanitizedDevice?.cpuCores || 0,
      memoryGb: sanitizedDevice?.memoryGb || 0,
      timezone: sanitizedDevice?.timezone || 'UTC',
      boundUserId: newUserId,
      boundUserEmail: email,
      boundUserName: fullName,
      status: 'locked',
      blockedAttempts: 0,
      createdAt: now,
      lastSeenAt: now,
    };
    db.registeredDevices.unshift(devRecord);
    registeredDeviceId = devRecord.id;
  }

  const record: StoredUserRecord = {
    id: newUserId,
    email,
    username,
    fullName,
    companyName: (input.companyName || '').trim(),
    passwordHash: hash,
    passwordSalt: salt,
    role: 'user',
    isRootAdmin: false,
    status: 'active',
    lensCoins: initialCoins,
    totalCoinsUsed: 0,
    totalSearches: 0,
    plan: 'starter',
    unlimitedExpiresAt: null,
    unlockedCompanies: [],
    registeredDeviceId,
    createdAt: now,
    lastLoginAt: now,
  };

  db.users.push(record);

  appendLedgerEntry({
    userId: record.id,
    userEmail: record.email,
    delta: initialCoins,
    balanceAfter: initialCoins,
    reason: 'signup_bonus',
    note: `Account initialized (${initialCoins} Lens Coins)`,
  });

  const { token } = createSessionForUser(
    record.id,
    sanitizedDevice,
    'another_device',
    sealId
  );
  persistDatabaseToDisk(db);

  return { token, user: toPublicUser(record) };
}

export function authenticateUser(input: {
  identifier: string;
  password: string;
  sealId?: string | null;
  device?: Partial<DeviceRegistrationPayload> | null;
}): { token: string; user: UserAccountPublic; displacedPreviousDevice: boolean } {
  const ident = input.identifier.trim().toLowerCase();
  if (!ident || !input.password) {
    throw new Error('Please enter your email/username and password.');
  }

  ensureRootAdminIntegrity(db);

  const user = db.users.find(
    (u) =>
      u.email.toLowerCase() === ident || u.username.toLowerCase() === ident
  );
  if (!user) {
    throw new Error('Invalid credentials. Please verify your email and password.');
  }

  if (!verifyPassword(input.password, user.passwordHash, user.passwordSalt)) {
    throw new Error('Invalid credentials. Please verify your email and password.');
  }

  if (!user.isRootAdmin && user.status === 'suspended') {
    throw new Error(
      'This account has been suspended. Please contact Support.'
    );
  }

  const sanitizedDevice = sanitizeDevicePayload(input.device);
  const sealId = input.sealId || null;

  if (!user.isRootAdmin) {
    const matchedDevice = findMatchingRegisteredDevice(
      sealId,
      sanitizedDevice,
      Boolean(db.settings.strictHardwareFingerprintLock)
    );
    if (matchedDevice?.status === 'banned') {
      const banErr = new Error(
        'This device has been restricted by an administrator. Please contact Support.'
      ) as Error & { statusCode?: number };
      banErr.statusCode = 403;
      throw banErr;
    }

    // Update lastSeenAt if logging in from the user's bound device
    const ownDevice = db.registeredDevices.find(
      (d) => d.id === user.registeredDeviceId || d.boundUserId === user.id
    );
    if (ownDevice) {
      ownDevice.lastSeenAt = new Date().toISOString();
    }
  }

  user.lastLoginAt = new Date().toISOString();
  const { token, displacedCount } = createSessionForUser(
    user.id,
    sanitizedDevice,
    'another_device',
    sealId
  );
  scheduleDatabaseFlush();

  return {
    token,
    user: toPublicUser(user),
    displacedPreviousDevice: displacedCount > 0,
  };
}

export function inspectSessionToken(
  token: string,
  requestDeviceId?: string
): {
  user: StoredUserRecord | null;
  code?: 'SESSION_DISPLACED' | 'PASSWORD_CHANGED' | 'AUTH_REQUIRED';
  message?: string;
} {
  if (!token) {
    return {
      user: null,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please sign in to continue.',
    };
  }

  const session = db.sessions.find((s) => s.token === token);
  if (!session) {
    const displaced = displacedSessionTokens.get(token);
    if (displaced) {
      if (displaced.reason === 'password_changed') {
        return {
          user: null,
          code: 'PASSWORD_CHANGED',
          message:
            'Your password was updated from another session. Please sign in with your new password.',
        };
      }
      if (displaced.reason === 'admin_revoked') {
        return {
          user: null,
          code: 'SESSION_DISPLACED',
          message:
            'Your session was signed out by an administrator. Please sign in again.',
        };
      }
      return {
        user: null,
        code: 'SESSION_DISPLACED',
        message:
          'Signed out automatically because your account was logged into on another device (1 active device allowed at a time).',
      };
    }
    return {
      user: null,
      code: 'AUTH_REQUIRED',
      message: 'Session expired. Please sign in again.',
    };
  }

  const exp = Date.parse(session.expiresAt);
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    return {
      user: null,
      code: 'AUTH_REQUIRED',
      message: 'Session expired. Please sign in again.',
    };
  }

  // Enforce strict Device ID binding per session:
  // Two identical phone/PC models still have distinct unique Device IDs; a session bound to Device ID A
  // cannot be reused concurrently from Device ID B.
  if (requestDeviceId) {
    if (!session.deviceId) {
      session.deviceId = requestDeviceId;
    } else if (
      session.deviceId.startsWith('did_') &&
      requestDeviceId.startsWith('did_') &&
      session.deviceId !== requestDeviceId
    ) {
      return {
        user: null,
        code: 'SESSION_DISPLACED',
        message:
          'This session is locked to a different Device ID. Please sign in on this device.',
      };
    }
  }

  ensureRootAdminIntegrity(db);
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) {
    return {
      user: null,
      code: 'AUTH_REQUIRED',
      message: 'Account not found. Please sign in again.',
    };
  }
  if (!user.isRootAdmin && user.status === 'suspended') {
    return {
      user: null,
      code: 'AUTH_REQUIRED',
      message: 'This account has been suspended. Please contact Support.',
    };
  }

  session.lastSeenAt = new Date().toISOString();
  return { user };
}

export function getUserBySessionToken(token: string): StoredUserRecord | null {
  return inspectSessionToken(token).user;
}

export function revokeSessionToken(token: string): void {
  if (!token) return;
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.token !== token);
  displacedSessionTokens.delete(token);
  if (db.sessions.length !== before) {
    persistDatabaseToDisk(db);
  }
}

/**
 * Self-service profile update for authenticated users.
 * Strictly NEVER modifies `user.email` (users cannot change their email).
 */
export function updateSelfAccountProfile(
  userId: string,
  input: {
    fullName?: string;
    username?: string;
    companyName?: string;
    jobTitle?: string;
    preferences?: Partial<UserWorkspacePreferences>;
  }
): UserAccountPublic {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('Account not found.');

  if (typeof input.fullName === 'string') {
    const cleanName = input.fullName.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new Error('Full name must be between 2 and 80 characters.');
    }
    user.fullName = cleanName;
  }

  if (typeof input.username === 'string' && input.username.trim()) {
    const cleanUsername = input.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      throw new Error(
        'Username must be 3–32 characters using letters, numbers, dots, hyphens, or underscores.'
      );
    }
    const conflict = db.users.find(
      (u) => u.id !== user.id && u.username.toLowerCase() === cleanUsername
    );
    if (conflict) {
      throw new Error('That username is already taken. Try another handle.');
    }
    user.username = cleanUsername;
  }

  if (typeof input.companyName === 'string') {
    user.companyName = input.companyName.trim().slice(0, 100);
  }

  if (typeof input.jobTitle === 'string') {
    user.jobTitle = input.jobTitle.trim().slice(0, 80);
  }

  if (input.preferences && typeof input.preferences === 'object') {
    const currentPrefs = {
      ...DEFAULT_USER_PREFERENCES,
      ...(user.preferences || {}),
    };
    const rawPrefix =
      typeof input.preferences.exportFilenamePrefix === 'string'
        ? input.preferences.exportFilenamePrefix
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40) || 'orglens-contacts'
        : currentPrefs.exportFilenamePrefix;

    user.preferences = {
      defaultSessionMode:
        input.preferences.defaultSessionMode === 'filter' ? 'filter' : 'domain',
      copyFormat:
        input.preferences.copyFormat === 'name_and_email'
          ? 'name_and_email'
          : 'email_only',
      exportFilenamePrefix: rawPrefix,
      autoScrollOnPagination:
        typeof input.preferences.autoScrollOnPagination === 'boolean'
          ? input.preferences.autoScrollOnPagination
          : currentPrefs.autoScrollOnPagination,
    };
  }

  // Sync bound device display name if fullName changed
  for (const dev of db.registeredDevices) {
    if (dev.boundUserId === user.id) {
      dev.boundUserName = user.fullName;
    }
  }

  persistDatabaseToDisk(db);
  return toPublicUser(user);
}

/**
 * Self-service password change for authenticated users.
 * Verifies current password, updates scrypt hash, and rotates the single active session token.
 */
export function changeSelfAccountPassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  sealId?: string | null;
  device?: Partial<DeviceRegistrationPayload> | null;
}): { token: string; user: UserAccountPublic } {
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error('Account not found.');

  if (
    !params.currentPassword ||
    !verifyPassword(
      params.currentPassword,
      user.passwordHash,
      user.passwordSalt
    )
  ) {
    throw new Error('Your current password is incorrect.');
  }

  const trimmedNew = (params.newPassword || '').trim();
  if (trimmedNew.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }
  if (trimmedNew === params.currentPassword) {
    throw new Error('New password must be different from your current password.');
  }

  const { salt, hash } = hashPassword(trimmedNew);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  if (user.isRootAdmin) {
    user.usingDefaultPassword = false;
  }

  const sanitizedDevice = sanitizeDevicePayload(params.device);
  const { token } = createSessionForUser(
    user.id,
    sanitizedDevice,
    'password_changed',
    params.sealId
  );
  persistDatabaseToDisk(db);
  return { token, user: toPublicUser(user) };
}

export function rotateSelfSessionToken(params: {
  userId: string;
  sealId?: string | null;
  device?: Partial<DeviceRegistrationPayload> | null;
}): { token: string; user: UserAccountPublic } {
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error('Account not found.');
  const sanitizedDevice = sanitizeDevicePayload(params.device);
  const { token } = createSessionForUser(
    user.id,
    sanitizedDevice,
    'another_device',
    params.sealId
  );
  persistDatabaseToDisk(db);
  return { token, user: toPublicUser(user) };
}

export function getUserLedgerAndOrders(userId: string): {
  ledger: CoinLedgerEntry[];
  orders: UsdtPaymentOrder[];
} {
  return {
    ledger: db.ledger.filter((l) => l.userId === userId).slice(0, 100),
    orders: db.payments.filter((p) => p.userId === userId),
  };
}

/**
 * Checks whether a user is allowed to execute a company search BEFORE running network discovery.
 */
export function assertUserCanSearchCompany(
  user: StoredUserRecord,
  targetKeys: string[],
  source: 'domain' | 'filter_company',
  forceRefresh = false
): void {
  if (computeHasActiveUnlimited(user)) return;

  const cleanKeys = targetKeys
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const alreadyUnlocked =
    !forceRefresh &&
    !db.settings.chargeRepeatCompanyLookups &&
    cleanKeys.some((k) => user.unlockedCompanies.includes(k));

  if (alreadyUnlocked) return;

  const requiredCoins =
    source === 'filter_company'
      ? db.settings.filterCompanyCoinCost
      : db.settings.domainSearchCoinCost;

  if (user.lensCoins < requiredCoins) {
    const err = new Error(
      `You have 0 Lens Coins remaining. Upgrade for $${db.settings.unlimitedMonthlyPriceUsdt}/month in USDT (TRC20) for unlimited company emails.`
    ) as Error & { code?: string };
    err.code = 'INSUFFICIENT_COINS';
    throw err;
  }
}

/**
 * Finalizes Lens Coin accounting AFTER search results come back.
 * Zero-result lookups NEVER deduct coins.
 */
export function settleCompanyLookupCoins(params: {
  userId: string;
  source: 'domain' | 'filter_company';
  domain: string;
  companySlug?: string;
  companyName: string;
  employeesCount: number;
  forceRefresh?: boolean;
}): SearchCoinMeta {
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) {
    return {
      coinsDeducted: 0,
      balanceRemaining: 0,
      hasActiveUnlimited: false,
      reason: 'zero_results',
    };
  }

  user.totalSearches = (user.totalSearches || 0) + 1;
  const activeUnlimited = computeHasActiveUnlimited(user);

  if (params.employeesCount <= 0) {
    appendLedgerEntry({
      userId: user.id,
      userEmail: user.email,
      delta: 0,
      balanceAfter: user.lensCoins,
      reason: 'zero_result_no_charge',
      targetDomain: params.domain,
      targetCompany: params.companyName,
      note: `No public contacts found for ${
        params.domain || params.companyName
      } — 0 Lens Coins deducted`,
    });
    persistDatabaseToDisk(db);
    return {
      coinsDeducted: 0,
      balanceRemaining: user.lensCoins,
      hasActiveUnlimited: activeUnlimited,
      reason: 'zero_results',
    };
  }

  const unlockKeys = [
    params.domain?.trim().toLowerCase(),
    params.companySlug ? `slug:${params.companySlug.trim().toLowerCase()}` : '',
  ].filter(Boolean);

  if (activeUnlimited) {
    for (const k of unlockKeys) {
      if (!user.unlockedCompanies.includes(k)) {
        user.unlockedCompanies.push(k);
      }
    }
    appendLedgerEntry({
      userId: user.id,
      userEmail: user.email,
      delta: 0,
      balanceAfter: user.lensCoins,
      reason: 'unlimited_pass',
      targetDomain: params.domain,
      targetCompany: params.companyName,
      note: `Unlimited pass reveal: ${params.companyName} (${params.employeesCount.toLocaleString()} contacts)`,
    });
    persistDatabaseToDisk(db);
    return {
      coinsDeducted: 0,
      balanceRemaining: user.lensCoins,
      hasActiveUnlimited: true,
      reason: 'unlimited',
    };
  }

  const wasUnlocked =
    !params.forceRefresh &&
    !db.settings.chargeRepeatCompanyLookups &&
    unlockKeys.some((k) => user.unlockedCompanies.includes(k));

  if (wasUnlocked) {
    persistDatabaseToDisk(db);
    return {
      coinsDeducted: 0,
      balanceRemaining: user.lensCoins,
      hasActiveUnlimited: false,
      reason: 'already_unlocked',
    };
  }

  const cost =
    params.source === 'filter_company'
      ? db.settings.filterCompanyCoinCost
      : db.settings.domainSearchCoinCost;

  const actualDeducted = Math.min(user.lensCoins, cost);
  user.lensCoins = Math.max(0, user.lensCoins - actualDeducted);
  user.totalCoinsUsed = (user.totalCoinsUsed || 0) + actualDeducted;

  for (const k of unlockKeys) {
    if (!user.unlockedCompanies.includes(k)) {
      user.unlockedCompanies.push(k);
    }
  }

  const reason: CoinLedgerReason =
    params.source === 'filter_company'
      ? 'filter_company_reveal'
      : 'domain_search';

  appendLedgerEntry({
    userId: user.id,
    userEmail: user.email,
    delta: -actualDeducted,
    balanceAfter: user.lensCoins,
    reason,
    targetDomain: params.domain,
    targetCompany: params.companyName,
    note:
      params.source === 'filter_company'
        ? `Filter Explorer company reveal: ${params.companyName} (${params.employeesCount.toLocaleString()} contacts)`
        : `Domain lookup & email reveal: ${params.domain} (${params.employeesCount.toLocaleString()} contacts)`,
  });

  persistDatabaseToDisk(db);

  return {
    coinsDeducted: actualDeducted,
    balanceRemaining: user.lensCoins,
    hasActiveUnlimited: false,
    reason: 'charged',
  };
}

export function createUsdtPaymentSubmission(params: {
  userId: string;
  txHash: string;
  senderWallet?: string;
  userNote?: string;
  onChainVerified: boolean;
  onChainDetails?: string;
  detectedAmountUsdt?: number;
}): { order: UsdtPaymentOrder; user: UserAccountPublic; autoActivated: boolean } {
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error('User account not found.');

  const cleanHash = params.txHash.trim();
  if (cleanHash.length < 12) {
    throw new Error(
      'Please enter a valid TRON TRC20 Transaction Hash (TxID) or transfer reference.'
    );
  }

  const duplicate = db.payments.find(
    (p) =>
      p.txHash.toLowerCase() === cleanHash.toLowerCase() &&
      p.status !== 'rejected'
  );
  if (duplicate) {
    throw new Error(
      'This Transaction Hash (TxID) has already been submitted. Please contact Support if you need assistance.'
    );
  }

  const autoApprove = Boolean(
    params.onChainVerified && db.settings.autoApproveVerifiedTronTx
  );
  const now = new Date().toISOString();
  const durationDays = db.settings.subscriptionDurationDays;

  const order: UsdtPaymentOrder = {
    id: `pay_${crypto.randomBytes(7).toString('hex')}`,
    orderCode: `OL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullName,
    amountUsdt: params.detectedAmountUsdt || db.settings.unlimitedMonthlyPriceUsdt,
    network: 'TRC20',
    walletAddress: db.settings.usdtWalletAddress,
    txHash: cleanHash,
    senderWallet: params.senderWallet?.trim() || undefined,
    userNote: params.userNote?.trim() || undefined,
    status: autoApprove ? 'approved' : 'pending',
    onChainVerified: params.onChainVerified,
    onChainDetails: params.onChainDetails,
    durationDays,
    adminNote: autoApprove
      ? 'Automatically verified on TRON (TRC20) blockchain and activated.'
      : undefined,
    createdAt: now,
    reviewedAt: autoApprove ? now : undefined,
    reviewedBy: autoApprove ? 'TronScan Auto-Verifier' : undefined,
  };

  db.payments.unshift(order);

  if (autoApprove) {
    grantUnlimitedDaysToUserRecord(
      user,
      durationDays,
      `USDT TRC20 Verified Upgrade (${order.orderCode})`
    );
  }

  persistDatabaseToDisk(db);
  return {
    order,
    user: toPublicUser(user),
    autoActivated: autoApprove,
  };
}

function grantUnlimitedDaysToUserRecord(
  user: StoredUserRecord,
  days: number | 'lifetime',
  note: string
): void {
  user.plan = 'unlimited';
  if (days === 'lifetime' || user.isRootAdmin) {
    user.unlimitedExpiresAt = 'lifetime';
  } else {
    const currentExpiryMs =
      user.unlimitedExpiresAt && user.unlimitedExpiresAt !== 'lifetime'
        ? Date.parse(user.unlimitedExpiresAt)
        : 0;
    const baseMs =
      Number.isFinite(currentExpiryMs) && currentExpiryMs > Date.now()
        ? currentExpiryMs
        : Date.now();
    user.unlimitedExpiresAt = new Date(
      baseMs + days * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  appendLedgerEntry({
    userId: user.id,
    userEmail: user.email,
    delta: 0,
    balanceAfter: user.lensCoins,
    reason: 'usdt_upgrade',
    note,
  });
}

export function redeemPromoVoucherForUser(params: {
  userId: string;
  code: string;
}): { voucher: PromoVoucher; user: UserAccountPublic; message: string } {
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error('Account not found.');

  const cleanCode = params.code.trim().toUpperCase();
  if (!cleanCode) throw new Error('Enter a promo or voucher code.');

  const voucher = db.vouchers.find((v) => v.code.toUpperCase() === cleanCode);
  if (!voucher || !voucher.active) {
    throw new Error('Invalid or inactive voucher code.');
  }
  if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now()) {
    throw new Error('This voucher code has expired.');
  }
  if (voucher.usedCount >= voucher.maxUses) {
    throw new Error('This voucher code has reached its maximum redemption limit.');
  }
  if (voucher.redeemedByUserIds.includes(user.id)) {
    throw new Error('You have already redeemed this voucher code.');
  }

  voucher.usedCount += 1;
  voucher.redeemedByUserIds.push(user.id);

  let message = '';
  if (voucher.rewardType === 'coins') {
    user.lensCoins += voucher.rewardValue;
    appendLedgerEntry({
      userId: user.id,
      userEmail: user.email,
      delta: voucher.rewardValue,
      balanceAfter: user.lensCoins,
      reason: 'voucher_redeem',
      note: `Redeemed voucher ${voucher.code} (+${voucher.rewardValue} Lens Coins)`,
    });
    message = `Success! Added +${voucher.rewardValue} Lens Coins to your account.`;
  } else {
    grantUnlimitedDaysToUserRecord(
      user,
      voucher.rewardValue,
      `Redeemed voucher ${voucher.code} (${voucher.rewardValue} days Unlimited)`
    );
    message = `Success! Activated ${voucher.rewardValue} days of Unlimited Company Emails.`;
  }

  persistDatabaseToDisk(db);
  return { voucher, user: toPublicUser(user), message };
}

// ============================================================================
// Manual Directory & Company Overrides
// ============================================================================

export function getCompanyManualOverride(
  domain: string
): CompanyManualOverride | null {
  const clean = domain.trim().toLowerCase();
  if (!clean) return null;
  return db.overrides[clean] || null;
}

export function getAllCompanyManualOverrides(): CompanyManualOverride[] {
  return Object.values(db.overrides).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function upsertCompanyManualOverride(
  override: Omit<CompanyManualOverride, 'updatedAt'>
): CompanyManualOverride {
  const cleanDomain = override.domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  if (!cleanDomain || !cleanDomain.includes('.')) {
    throw new Error('Enter a valid company domain (e.g., acme.com).');
  }

  const record: CompanyManualOverride = {
    ...override,
    domain: cleanDomain,
    blocked: Boolean(override.blocked),
    blockedEmails: Array.isArray(override.blockedEmails)
      ? override.blockedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
      : [],
    addedContacts: Array.isArray(override.addedContacts)
      ? override.addedContacts
      : [],
    updatedAt: new Date().toISOString(),
  };

  db.overrides[cleanDomain] = record;
  persistDatabaseToDisk(db);
  return record;
}

export function deleteCompanyManualOverride(domain: string): void {
  const clean = domain.trim().toLowerCase();
  if (db.overrides[clean]) {
    delete db.overrides[clean];
    persistDatabaseToDisk(db);
  }
}

// ============================================================================
// Comprehensive Admin Operations (with Indestructible Root Shield)
// ============================================================================

export function getAdminStoreSnapshot() {
  ensureRootAdminIntegrity(db);
  const root = db.users.find((u) => u.isRootAdmin)!;
  const publicUsers = db.users
    .map(toPublicUser)
    .sort((a, b) => {
      if (a.isRootAdmin !== b.isRootAdmin) return a.isRootAdmin ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

  const activeUsers = publicUsers.filter((u) => u.status === 'active').length;
  const suspendedUsers = publicUsers.filter(
    (u) => u.status === 'suspended'
  ).length;
  const unlimitedSubscribers = publicUsers.filter(
    (u) => !u.isRootAdmin && u.hasActiveUnlimited
  ).length;
  const pendingPaymentsCount = db.payments.filter(
    (p) => p.status === 'pending'
  ).length;
  const approvedPayments = db.payments.filter((p) => p.status === 'approved');
  const totalRevenueUsdt = approvedPayments.reduce(
    (sum, p) => sum + (Number(p.amountUsdt) || 0),
    0
  );
  const totalCoinsInCirculation = publicUsers
    .filter((u) => !u.isRootAdmin)
    .reduce((sum, u) => sum + u.lensCoins, 0);
  const totalCoinsConsumed = publicUsers.reduce(
    (sum, u) => sum + u.totalCoinsUsed,
    0
  );
  const totalLookupsExecuted = publicUsers.reduce(
    (sum, u) => sum + u.totalSearches,
    0
  );
  const blockedSpamSignupsCount = db.registeredDevices.reduce(
    (sum, d) => sum + (d.blockedAttempts || 0),
    0
  );

  return {
    stats: {
      totalUsers: publicUsers.length,
      activeUsers,
      suspendedUsers,
      unlimitedSubscribers,
      pendingPaymentsCount,
      approvedPaymentsCount: approvedPayments.length,
      estimatedMonthlyRevenueUsdt: totalRevenueUsdt,
      totalCoinsInCirculation,
      totalCoinsConsumed,
      totalLookupsExecuted,
      manualOverridesCount: Object.keys(db.overrides).length,
      activeVouchersCount: db.vouchers.filter((v) => v.active).length,
      registeredDevicesCount: db.registeredDevices.filter(
        (d) => d.status !== 'released'
      ).length,
      blockedSpamSignupsCount,
    },
    rootAdminShield: {
      rootAdminId: root.id,
      rootEmail: root.email,
      rootUsername: root.username,
      indestructible: true as const,
      usingDefaultPassword: Boolean(root.usingDefaultPassword),
      storageFilePath: DB_FILE_PATH,
      backupFileExists: fs.existsSync(DB_BACKUP_PATH),
    },
    users: publicUsers,
    devices: db.registeredDevices,
    payments: db.payments,
    ledger: db.ledger.slice(0, 500),
    overrides: getAllCompanyManualOverrides(),
    vouchers: db.vouchers,
    settings: { ...db.settings },
  };
}

export function adminCreateUserManually(input: {
  email: string;
  username?: string;
  fullName: string;
  companyName?: string;
  adminNotes?: string;
  password: string;
  lensCoins: number;
  plan: SubscriptionPlan;
  unlimitedDays?: number | 'lifetime';
  customUnlimitedExpiresAt?: string;
  role: UserRole;
  status?: UserStatus;
  unlockedCompanies?: string[];
}): UserAccountPublic {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Provide a valid email address.');
  }
  if (db.users.some((u) => u.email.toLowerCase() === email)) {
    throw new Error('A user with that email already exists.');
  }
  if (!input.password || input.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const { salt, hash } = hashPassword(input.password);
  const now = new Date().toISOString();

  let username = (input.username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
  if (!username) {
    username = email.split('@')[0].replace(/[^a-z0-9_.-]/g, '') || 'user';
  }
  if (db.users.some((u) => u.username.toLowerCase() === username)) {
    username = `${username}_${crypto.randomBytes(2).toString('hex')}`;
  }

  const coins = Math.max(0, Math.round(Number(input.lensCoins) || 0));
  let unlimitedExpiresAt: string | null = null;
  if (input.plan === 'unlimited' || input.role === 'admin') {
    if (
      input.customUnlimitedExpiresAt &&
      input.customUnlimitedExpiresAt.trim()
    ) {
      const parsedExp = Date.parse(input.customUnlimitedExpiresAt.trim());
      if (Number.isFinite(parsedExp)) {
        unlimitedExpiresAt = new Date(parsedExp).toISOString();
      }
    }
    if (!unlimitedExpiresAt) {
      if (input.unlimitedDays === 'lifetime' || input.role === 'admin') {
        unlimitedExpiresAt = 'lifetime';
      } else {
        const days = Math.max(1, Number(input.unlimitedDays) || 30);
        unlimitedExpiresAt = new Date(
          Date.now() + days * 24 * 60 * 60 * 1000
        ).toISOString();
      }
    }
  }

  const preUnlocked = Array.isArray(input.unlockedCompanies)
    ? input.unlockedCompanies
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : [];

  // Admin-created accounts intentionally bypass client device registration locks
  const record: StoredUserRecord = {
    id: `usr_${crypto.randomBytes(8).toString('hex')}`,
    email,
    username,
    fullName: input.fullName.trim() || username,
    companyName: (input.companyName || '').trim(),
    adminNotes: (input.adminNotes || '').trim(),
    passwordHash: hash,
    passwordSalt: salt,
    role: input.role,
    isRootAdmin: false,
    status: input.status === 'suspended' ? 'suspended' : 'active',
    lensCoins: coins,
    totalCoinsUsed: 0,
    totalSearches: 0,
    plan: input.role === 'admin' ? 'unlimited' : input.plan,
    unlimitedExpiresAt,
    unlockedCompanies: Array.from(new Set(preUnlocked)),
    createdAt: now,
    lastLoginAt: now,
  };

  db.users.push(record);
  appendLedgerEntry({
    userId: record.id,
    userEmail: record.email,
    delta: coins,
    balanceAfter: coins,
    reason: 'admin_adjustment',
    note: `Account created manually by Admin (${coins} Lens Coins, plan: ${record.plan})`,
  });
  persistDatabaseToDisk(db);
  return toPublicUser(record);
}

export function adminUpdateUserAccount(
  userId: string,
  patch: {
    fullName?: string;
    username?: string;
    companyName?: string;
    email?: string;
    adminNotes?: string;
    exactCoins?: number;
    coinsDelta?: number;
    adjustmentNote?: string;
    plan?: SubscriptionPlan;
    unlimitedDays?: number | 'lifetime';
    customUnlimitedExpiresAt?: string | null;
    status?: UserStatus;
    role?: UserRole;
    newPassword?: string;
    clearUnlockedHistory?: boolean;
    addUnlockedDomains?: string[];
    removeUnlockedDomain?: string;
    resetUsageCounters?: boolean;
    revokeSessions?: boolean;
    releaseDeviceLock?: boolean;
  }
): UserAccountPublic {
  ensureRootAdminIntegrity(db);
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('Target user not found.');

  if (user.isRootAdmin) {
    if (patch.status && patch.status !== 'active') {
      throw new Error(
        'Root Admin is permanently protected and cannot be suspended.'
      );
    }
    if (patch.role && patch.role !== 'admin') {
      throw new Error(
        'Root Admin is permanently protected and cannot be demoted.'
      );
    }
    if (patch.plan && patch.plan !== 'unlimited') {
      throw new Error('Root Admin permanently retains Unlimited authority.');
    }
  }

  if (typeof patch.fullName === 'string' && patch.fullName.trim()) {
    user.fullName = patch.fullName.trim();
  }
  if (typeof patch.companyName === 'string') {
    user.companyName = patch.companyName.trim();
  }
  if (typeof patch.adminNotes === 'string') {
    user.adminNotes = patch.adminNotes.trim();
  }
  if (typeof patch.username === 'string' && patch.username.trim()) {
    const cleanUser = patch.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    if (cleanUser.length < 2) {
      throw new Error('Username must be at least 2 characters.');
    }
    const conflict = db.users.find(
      (u) => u.id !== user.id && u.username.toLowerCase() === cleanUser
    );
    if (conflict) {
      throw new Error('Another user already uses that username.');
    }
    user.username = cleanUser;
  }
  if (typeof patch.email === 'string' && patch.email.trim()) {
    const nextEmail = patch.email.trim().toLowerCase();
    const conflict = db.users.find(
      (u) => u.id !== user.id && u.email.toLowerCase() === nextEmail
    );
    if (conflict) {
      throw new Error('Another user already uses that email address.');
    }
    user.email = nextEmail;
  }

  if (!user.isRootAdmin) {
    if (patch.status) {
      user.status = patch.status;
      if (patch.status === 'suspended') {
        db.sessions = db.sessions.filter((s) => s.userId !== user.id);
      }
    }
    if (patch.role) {
      user.role = patch.role;
    }
  }

  if (typeof patch.exactCoins === 'number' && Number.isFinite(patch.exactCoins)) {
    const nextCoins = Math.max(0, Math.round(patch.exactCoins));
    const delta = nextCoins - user.lensCoins;
    user.lensCoins = nextCoins;
    appendLedgerEntry({
      userId: user.id,
      userEmail: user.email,
      delta,
      balanceAfter: user.lensCoins,
      reason: 'admin_adjustment',
      note:
        patch.adjustmentNote?.trim() ||
        `Admin set Lens Coin balance to ${user.lensCoins}`,
    });
  } else if (
    typeof patch.coinsDelta === 'number' &&
    Number.isFinite(patch.coinsDelta) &&
    patch.coinsDelta !== 0
  ) {
    const delta = Math.round(patch.coinsDelta);
    user.lensCoins = Math.max(0, user.lensCoins + delta);
    appendLedgerEntry({
      userId: user.id,
      userEmail: user.email,
      delta,
      balanceAfter: user.lensCoins,
      reason: 'admin_adjustment',
      note:
        patch.adjustmentNote?.trim() ||
        `Admin manual coin adjustment (${delta > 0 ? `+${delta}` : delta})`,
    });
  }

  if (!user.isRootAdmin && patch.plan) {
    if (patch.plan === 'starter') {
      user.plan = 'starter';
      user.unlimitedExpiresAt = null;
      appendLedgerEntry({
        userId: user.id,
        userEmail: user.email,
        delta: 0,
        balanceAfter: user.lensCoins,
        reason: 'admin_adjustment',
        note: 'Admin switched plan back to Lens Coin Starter tier',
      });
    } else if (patch.plan === 'unlimited') {
      if (
        typeof patch.customUnlimitedExpiresAt === 'string' &&
        patch.customUnlimitedExpiresAt.trim()
      ) {
        const rawExp = patch.customUnlimitedExpiresAt.trim();
        if (rawExp === 'lifetime') {
          user.plan = 'unlimited';
          user.unlimitedExpiresAt = 'lifetime';
        } else {
          const parsed = Date.parse(rawExp);
          if (!Number.isFinite(parsed)) {
            throw new Error('Invalid custom expiration date.');
          }
          user.plan = 'unlimited';
          user.unlimitedExpiresAt = new Date(parsed).toISOString();
        }
        appendLedgerEntry({
          userId: user.id,
          userEmail: user.email,
          delta: 0,
          balanceAfter: user.lensCoins,
          reason: 'usdt_upgrade',
          note:
            patch.adjustmentNote?.trim() ||
            `Admin set custom Unlimited expiration (${user.unlimitedExpiresAt})`,
        });
      } else {
        const dur = patch.unlimitedDays || db.settings.subscriptionDurationDays;
        grantUnlimitedDaysToUserRecord(
          user,
          dur,
          patch.adjustmentNote?.trim() ||
            `Admin granted Unlimited Access (${
              dur === 'lifetime' ? 'Lifetime' : `${dur} days`
            })`
        );
      }
    }
  } else if (
    !user.isRootAdmin &&
    typeof patch.customUnlimitedExpiresAt === 'string' &&
    patch.customUnlimitedExpiresAt.trim()
  ) {
    const rawExp = patch.customUnlimitedExpiresAt.trim();
    if (rawExp === 'lifetime') {
      user.plan = 'unlimited';
      user.unlimitedExpiresAt = 'lifetime';
    } else {
      const parsed = Date.parse(rawExp);
      if (!Number.isFinite(parsed)) {
        throw new Error('Invalid custom expiration date.');
      }
      user.plan = 'unlimited';
      user.unlimitedExpiresAt = new Date(parsed).toISOString();
    }
  }

  if (patch.newPassword && patch.newPassword.trim()) {
    if (patch.newPassword.trim().length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }
    const { salt, hash } = hashPassword(patch.newPassword.trim());
    user.passwordHash = hash;
    user.passwordSalt = salt;
    if (user.isRootAdmin) {
      user.usingDefaultPassword = false;
    }
  }

  if (patch.clearUnlockedHistory) {
    user.unlockedCompanies = [];
  }

  if (Array.isArray(patch.addUnlockedDomains)) {
    for (const dom of patch.addUnlockedDomains) {
      const clean = String(dom || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
      if (clean && !user.unlockedCompanies.includes(clean)) {
        user.unlockedCompanies.push(clean);
      }
    }
  }

  if (
    typeof patch.removeUnlockedDomain === 'string' &&
    patch.removeUnlockedDomain.trim()
  ) {
    const targetDom = patch.removeUnlockedDomain.trim().toLowerCase();
    user.unlockedCompanies = user.unlockedCompanies.filter(
      (d) => d.toLowerCase() !== targetDom
    );
  }

  if (patch.resetUsageCounters) {
    user.totalCoinsUsed = 0;
    user.totalSearches = 0;
  }

  if (patch.revokeSessions && !user.isRootAdmin) {
    const nowIso = new Date().toISOString();
    db.sessions = db.sessions.filter((s) => {
      if (s.userId !== user.id) return true;
      rememberDisplacedToken(s.token, {
        displacedAt: nowIso,
        newDeviceLabel: 'Admin Console',
        reason: 'admin_revoked',
      });
      return false;
    });
  }

  if (patch.releaseDeviceLock) {
    for (const dev of db.registeredDevices) {
      if (dev.id === user.registeredDeviceId || dev.boundUserId === user.id) {
        dev.status = 'released';
      }
    }
    user.registeredDeviceId = undefined;
  }

  persistDatabaseToDisk(db);
  return toPublicUser(user);
}

export function adminDeleteUserAccount(
  userId: string,
  releaseDevice = false
): void {
  ensureRootAdminIntegrity(db);
  const target = db.users.find((u) => u.id === userId);
  if (!target) throw new Error('User not found.');
  if (target.isRootAdmin || target.id === ROOT_ADMIN_ID) {
    throw new Error(
      'PROTECTED: The Root Admin account can never be deleted or self-destruct.'
    );
  }
  if (releaseDevice) {
    for (const dev of db.registeredDevices) {
      if (
        dev.id === target.registeredDeviceId ||
        dev.boundUserId === target.id
      ) {
        dev.status = 'released';
      }
    }
  }
  db.users = db.users.filter((u) => u.id !== userId);
  db.sessions = db.sessions.filter((s) => s.userId !== userId);
  persistDatabaseToDisk(db);
}

export function adminUpdateRegisteredDevice(
  deviceId: string,
  patch: {
    status?: RegisteredDeviceStatus;
    adminNote?: string;
    resetBlockedAttempts?: boolean;
  }
): RegisteredDeviceRecord {
  const rec = db.registeredDevices.find((d) => d.id === deviceId);
  if (!rec) throw new Error('Registered device not found.');

  if (
    patch.status === 'locked' ||
    patch.status === 'released' ||
    patch.status === 'banned'
  ) {
    rec.status = patch.status;
  }
  if (typeof patch.adminNote === 'string') {
    rec.adminNote = patch.adminNote.trim();
  }
  if (patch.resetBlockedAttempts) {
    rec.blockedAttempts = 0;
  }
  persistDatabaseToDisk(db);
  return rec;
}

export function adminDeleteRegisteredDevice(deviceId: string): void {
  const rec = db.registeredDevices.find((d) => d.id === deviceId);
  if (!rec) return;
  db.registeredDevices = db.registeredDevices.filter((d) => d.id !== deviceId);
  for (const u of db.users) {
    if (u.registeredDeviceId === deviceId) {
      u.registeredDeviceId = undefined;
    }
  }
  persistDatabaseToDisk(db);
}

export function adminReviewUsdtPayment(params: {
  orderId: string;
  action: PaymentOrderStatus;
  durationDays?: number | 'lifetime';
  bonusCoins?: number;
  adminNote?: string;
  reviewerEmail: string;
  onChainVerified?: boolean;
  onChainDetails?: string;
}): UsdtPaymentOrder {
  const order = db.payments.find((p) => p.id === params.orderId);
  if (!order) throw new Error('Payment order not found.');

  const prevStatus = order.status;
  order.status = params.action;
  order.reviewedAt = new Date().toISOString();
  order.reviewedBy = params.reviewerEmail;
  if (typeof params.adminNote === 'string') {
    order.adminNote = params.adminNote.trim();
  }
  if (typeof params.onChainVerified === 'boolean') {
    order.onChainVerified = params.onChainVerified;
  }
  if (typeof params.onChainDetails === 'string') {
    order.onChainDetails = params.onChainDetails;
  }

  const user = db.users.find((u) => u.id === order.userId);
  if (user && params.action === 'approved' && prevStatus !== 'approved') {
    const dur = params.durationDays || order.durationDays || 30;
    grantUnlimitedDaysToUserRecord(
      user,
      dur,
      `Admin approved USDT TRC20 order ${order.orderCode} (${
        dur === 'lifetime' ? 'Lifetime' : `${dur} days`
      })`
    );
    if (params.bonusCoins && params.bonusCoins > 0) {
      user.lensCoins += Math.round(params.bonusCoins);
      appendLedgerEntry({
        userId: user.id,
        userEmail: user.email,
        delta: Math.round(params.bonusCoins),
        balanceAfter: user.lensCoins,
        reason: 'admin_adjustment',
        note: `Bonus Lens Coins with approved order ${order.orderCode}`,
      });
    }
  }

  persistDatabaseToDisk(db);
  return order;
}

export function adminRecordManualUsdtGrant(params: {
  userEmailOrId: string;
  amountUsdt: number;
  txHash?: string;
  durationDays: number | 'lifetime';
  adminNote?: string;
  reviewerEmail: string;
}): UsdtPaymentOrder {
  const key = params.userEmailOrId.trim().toLowerCase();
  const user = db.users.find(
    (u) => u.id.toLowerCase() === key || u.email.toLowerCase() === key
  );
  if (!user) {
    throw new Error('No user matched that email or ID.');
  }

  const now = new Date().toISOString();
  const order: UsdtPaymentOrder = {
    id: `pay_${crypto.randomBytes(7).toString('hex')}`,
    orderCode: `OL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullName,
    amountUsdt: Number(params.amountUsdt) || db.settings.unlimitedMonthlyPriceUsdt,
    network: 'TRC20',
    walletAddress: db.settings.usdtWalletAddress,
    txHash:
      params.txHash?.trim() ||
      `MANUAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    status: 'approved',
    onChainVerified: true,
    onChainDetails: 'Manually verified & recorded by Administrator',
    durationDays:
      params.durationDays === 'lifetime' ? 36500 : Number(params.durationDays) || 30,
    adminNote: params.adminNote?.trim() || 'Manual USDT TRC20 activation',
    createdAt: now,
    reviewedAt: now,
    reviewedBy: params.reviewerEmail,
  };

  db.payments.unshift(order);
  grantUnlimitedDaysToUserRecord(
    user,
    params.durationDays,
    `Manual USDT TRC20 Upgrade (${order.orderCode})`
  );
  persistDatabaseToDisk(db);
  return order;
}

export function adminCreateVoucher(input: {
  code: string;
  rewardType: 'coins' | 'unlimited_days';
  rewardValue: number;
  maxUses: number;
  expiresAt?: string | null;
}): PromoVoucher {
  const cleanCode = input.code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  if (!cleanCode || cleanCode.length < 3) {
    throw new Error('Voucher code must be at least 3 alphanumeric characters.');
  }
  if (db.vouchers.some((v) => v.code.toUpperCase() === cleanCode)) {
    throw new Error('A voucher with this code already exists.');
  }

  const voucher: PromoVoucher = {
    id: `vch_${crypto.randomBytes(6).toString('hex')}`,
    code: cleanCode,
    rewardType: input.rewardType,
    rewardValue: Math.max(1, Math.round(Number(input.rewardValue) || 10)),
    maxUses: Math.max(1, Math.round(Number(input.maxUses) || 100)),
    usedCount: 0,
    redeemedByUserIds: [],
    active: true,
    expiresAt: input.expiresAt || null,
    createdAt: new Date().toISOString(),
  };

  db.vouchers.unshift(voucher);
  persistDatabaseToDisk(db);
  return voucher;
}

export function adminToggleVoucher(id: string, active: boolean): PromoVoucher {
  const v = db.vouchers.find((item) => item.id === id);
  if (!v) throw new Error('Voucher not found.');
  v.active = active;
  persistDatabaseToDisk(db);
  return v;
}

export function adminDeleteVoucher(id: string): void {
  db.vouchers = db.vouchers.filter((item) => item.id !== id);
  persistDatabaseToDisk(db);
}

export function adminUpdateRootCredentials(input: {
  currentPassword: string;
  newEmail?: string;
  newUsername?: string;
  newFullName?: string;
  newPassword?: string;
}): UserAccountPublic {
  ensureRootAdminIntegrity(db);
  const root = db.users.find((u) => u.isRootAdmin)!;

  if (
    !verifyPassword(
      input.currentPassword || '',
      root.passwordHash,
      root.passwordSalt
    )
  ) {
    throw new Error('Current Root Admin password is incorrect.');
  }

  if (input.newEmail && input.newEmail.trim()) {
    const cleanEmail = input.newEmail.trim().toLowerCase();
    const conflict = db.users.find(
      (u) => u.id !== root.id && u.email.toLowerCase() === cleanEmail
    );
    if (conflict) {
      throw new Error('Another account already uses that email.');
    }
    root.email = cleanEmail;
  }

  if (input.newUsername && input.newUsername.trim()) {
    const cleanUsername = input.newUsername
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    if (cleanUsername.length < 3) {
      throw new Error('Username must be at least 3 characters.');
    }
    root.username = cleanUsername;
  }

  if (input.newFullName && input.newFullName.trim()) {
    root.fullName = input.newFullName.trim();
  }

  if (input.newPassword && input.newPassword.trim()) {
    if (input.newPassword.trim().length < 8) {
      throw new Error('New Root Admin password must be at least 8 characters.');
    }
    const { salt, hash } = hashPassword(input.newPassword.trim());
    root.passwordHash = hash;
    root.passwordSalt = salt;
    root.usingDefaultPassword = false;
  }

  ensureRootAdminIntegrity(db);
  persistDatabaseToDisk(db);
  return toPublicUser(root);
}

export function exportFullVpsBackup(): VpsDatabaseSchema {
  ensureRootAdminIntegrity(db);
  return {
    ...db,
    sessions: [],
  };
}

export interface RestoreVpsBackupSummary {
  restoredUsersCount: number;
  restoredMembersCount: number;
  restoredAdminEmail: string;
  restoredPaymentsCount: number;
  restoredVouchersCount: number;
  restoredDevicesCount: number;
  restoredLedgerCount: number;
}

export function importFullVpsBackup(payload: unknown): RestoreVpsBackupSummary {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup JSON payload.');
  }
  const maybeWrapped = payload as { backup?: unknown };
  const rawObject =
    maybeWrapped.backup && typeof maybeWrapped.backup === 'object'
      ? maybeWrapped.backup
      : payload;
  const incoming = rawObject as Partial<VpsDatabaseSchema>;
  const currentRoot = db.users.find((u) => u.isRootAdmin)!;
  const activeAdminSessions = [...db.sessions];

  if (
    typeof incoming.deviceHmacSecret === 'string' &&
    incoming.deviceHmacSecret.length >= 32
  ) {
    db.deviceHmacSecret = incoming.deviceHmacSecret;
  }

  if (incoming.settings && typeof incoming.settings === 'object') {
    db.settings = { ...createDefaultSettings(), ...incoming.settings };
  }

  if (Array.isArray(incoming.users)) {
    const incomingRoot = incoming.users.find(
      (u) => u && (u.id === ROOT_ADMIN_ID || u.isRootAdmin === true)
    );
    const nonRootIncoming = incoming.users.filter(
      (u) =>
        u &&
        u.id !== ROOT_ADMIN_ID &&
        !u.isRootAdmin &&
        typeof u.email === 'string' &&
        Boolean(u.passwordHash) &&
        Boolean(u.passwordSalt)
    );

    const restoredRoot: StoredUserRecord =
      incomingRoot &&
      incomingRoot.passwordHash &&
      incomingRoot.passwordSalt
        ? {
            ...currentRoot,
            ...incomingRoot,
            id: ROOT_ADMIN_ID,
            isRootAdmin: true,
            role: 'admin',
            status: 'active',
            plan: 'unlimited',
            unlimitedExpiresAt: 'lifetime',
          }
        : currentRoot;

    db.users = [restoredRoot, ...nonRootIncoming];
  }

  if (Array.isArray(incoming.registeredDevices)) {
    db.registeredDevices = incoming.registeredDevices;
  }
  if (Array.isArray(incoming.payments)) {
    db.payments = incoming.payments;
  }
  if (Array.isArray(incoming.ledger)) {
    db.ledger = incoming.ledger;
  }
  if (incoming.overrides && typeof incoming.overrides === 'object') {
    db.overrides = incoming.overrides;
  }
  if (Array.isArray(incoming.vouchers)) {
    db.vouchers = incoming.vouchers;
  }
  // Keep current active admin session alive so restore finishes smoothly without logging out
  db.sessions = activeAdminSessions;

  ensureRootAdminIntegrity(db);
  persistDatabaseToDisk(db);

  const rootAfter = db.users.find((u) => u.isRootAdmin)!;
  return {
    restoredUsersCount: db.users.length,
    restoredMembersCount: db.users.filter((u) => !u.isRootAdmin).length,
    restoredAdminEmail: rootAfter.email,
    restoredPaymentsCount: db.payments.length,
    restoredVouchersCount: db.vouchers.length,
    restoredDevicesCount: db.registeredDevices.length,
    restoredLedgerCount: db.ledger.length,
  };
}
