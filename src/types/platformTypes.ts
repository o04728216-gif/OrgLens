import type { EmailFormulaId } from '../utils/emailFormulas.ts';
import type { DepartmentCategory, SeniorityLevel } from '../types.ts';

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type SubscriptionPlan = 'starter' | 'unlimited';

export type AdminSectionId =
  | 'overview'
  | 'crawler'
  | 'users'
  | 'devices'
  | 'payments'
  | 'directory-overrides'
  | 'ledger'
  | 'vouchers'
  | 'settings'
  | 'system';

export type TopLevelAppView =
  | 'workspace'
  | 'upgrade'
  | 'profile'
  | 'admin'
  | 'landing';

export interface UserWorkspacePreferences {
  defaultSessionMode: 'domain' | 'filter';
  copyFormat: 'email_only' | 'name_and_email';
  exportFilenamePrefix: string;
  autoScrollOnPagination: boolean;
}

export type RegisteredDeviceStatus = 'locked' | 'released' | 'banned';

export interface DeviceRegistrationPayload {
  deviceInstallId: string;
  hardwareHash: string;
  canvasFontHash: string;
  deviceLabel: string;
  platform: string;
  gpuRenderer: string;
  screenProfile: string;
  cpuCores: number;
  memoryGb: number;
  timezone: string;
}

export interface RegisteredDeviceRecord {
  id: string;
  sealId: string;
  deviceInstallId: string;
  hardwareHash: string;
  canvasFontHash: string;
  deviceLabel: string;
  platform: string;
  gpuRenderer: string;
  screenProfile: string;
  cpuCores: number;
  memoryGb: number;
  timezone: string;
  boundUserId: string;
  boundUserEmail: string;
  boundUserName: string;
  status: RegisteredDeviceStatus;
  blockedAttempts: number;
  lastBlockedEmail?: string;
  lastBlockedAt?: string;
  adminNote?: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface UserAccountPublic {
  id: string;
  email: string;
  username: string;
  fullName: string;
  companyName: string;
  jobTitle?: string;
  preferences?: UserWorkspacePreferences;
  adminNotes?: string;
  role: UserRole;
  isRootAdmin: boolean;
  usingDefaultPassword?: boolean;
  status: UserStatus;
  lensCoins: number;
  totalCoinsUsed: number;
  totalSearches: number;
  plan: SubscriptionPlan;
  unlimitedExpiresAt: string | null;
  hasActiveUnlimited: boolean;
  unlockedCompaniesCount: number;
  unlockedCompaniesPreview?: string[];
  unlockedCompaniesList?: string[];
  activeSessionsCount?: number;
  activeSessionDeviceId?: string;
  activeSessionDeviceLabel?: string;
  activeSessionPlatform?: string;
  activeSessionTimezone?: string;
  activeSessionStartedAt?: string;
  activeSessionLastSeenAt?: string;
  registeredDeviceId?: string;
  registeredDeviceLabel?: string;
  registeredDeviceStatus?: RegisteredDeviceStatus;
  createdAt: string;
  lastLoginAt: string;
}

export type CoinLedgerReason =
  | 'signup_bonus'
  | 'domain_search'
  | 'filter_company_reveal'
  | 'zero_result_no_charge'
  | 'unlimited_pass'
  | 'already_unlocked'
  | 'admin_adjustment'
  | 'voucher_redeem'
  | 'usdt_upgrade';

export interface CoinLedgerEntry {
  id: string;
  userId: string;
  userEmail: string;
  delta: number;
  balanceAfter: number;
  reason: CoinLedgerReason;
  targetDomain?: string;
  targetCompany?: string;
  note: string;
  createdAt: string;
}

export type PaymentOrderStatus = 'pending' | 'approved' | 'rejected';

export interface UsdtPaymentOrder {
  id: string;
  orderCode: string;
  userId: string;
  userEmail: string;
  userName: string;
  amountUsdt: number;
  network: 'TRC20';
  walletAddress: string;
  txHash: string;
  senderWallet?: string;
  userNote?: string;
  status: PaymentOrderStatus;
  onChainVerified: boolean;
  onChainDetails?: string;
  durationDays: number;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ManualContactOverride {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string;
  department: DepartmentCategory;
  seniority: SeniorityLevel;
  emailAccuracy: number;
}

export interface CompanyManualOverride {
  domain: string;
  companyName?: string;
  industry?: string;
  headquarters?: string;
  employeeRange?: string;
  revenueRange?: string;
  forcedFormulaId?: EmailFormulaId | 'auto';
  forcedConfidence?: number;
  blocked: boolean;
  blockedEmails: string[];
  addedContacts: ManualContactOverride[];
  updatedAt: string;
}

export interface PromoVoucher {
  id: string;
  code: string;
  rewardType: 'coins' | 'unlimited_days';
  rewardValue: number;
  maxUses: number;
  usedCount: number;
  redeemedByUserIds: string[];
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface PlatformSettings {
  defaultSignupCoins: number;
  domainSearchCoinCost: number;
  filterCompanyCoinCost: number;
  chargeRepeatCompanyLookups: boolean;
  unlimitedMonthlyPriceUsdt: number;
  subscriptionDurationDays: number;
  usdtWalletAddress: string;
  usdtNetworkLabel: string;
  supportTelegramUrl: string;
  supportTelegramHandle: string;
  autoApproveVerifiedTronTx: boolean;
  allowNewRegistrations: boolean;
  enforceOneAccountPerDevice: boolean;
  strictHardwareFingerprintLock: boolean;
  announcementBanner: string;
  companyTagline: string;
}

export interface PublicPlatformConfig {
  defaultSignupCoins: number;
  domainSearchCoinCost: number;
  filterCompanyCoinCost: number;
  unlimitedMonthlyPriceUsdt: number;
  subscriptionDurationDays: number;
  usdtWalletAddress: string;
  usdtNetworkLabel: string;
  supportTelegramUrl: string;
  supportTelegramHandle: string;
  allowNewRegistrations: boolean;
  enforceOneAccountPerDevice: boolean;
  strictHardwareFingerprintLock: boolean;
  announcementBanner: string;
  companyTagline: string;
  bootstrapAdminHint?: {
    username: string;
    email: string;
    defaultPasswordActive: boolean;
  };
}

export interface SearchCoinMeta {
  coinsDeducted: number;
  balanceRemaining: number;
  hasActiveUnlimited: boolean;
  reason: 'charged' | 'zero_results' | 'unlimited' | 'already_unlocked';
}

export interface ServerCacheStats {
  domainCache: number;
  emailPatternCache: number;
  slugToDomainCache: number;
  slugToWebsiteCache: number;
  industryCompaniesCache: number;
  countryCompaniesCache: number;
  quickRosterCache: number;
  mxVerificationCache: number;
  globalIndustriesCached: boolean;
}

export interface RegistryFederationItem {
  registryKey: string;
  label: string;
  liveReportedTotal: number;
  vaultIndexedCount: number;
  endpointUrl: string;
  lastSyncedAt: string;
}

export interface CrawlerStreamCursor {
  streamKey: string;
  cursorValue: string;
  itemsIngested: number;
  lastCrawledAt: string;
  lastStatus: string;
}

export interface CrawlerVaultStats {
  vaultCompaniesCount: number;
  confirmedContactsCount: number;
  confirmedDomainsCount: number;
  liveFederatedCatalogTotal: number;
  daemonRunning: boolean;
  daemonActiveCycle: boolean;
  lastCycleAt: string | null;
  totalCyclesRun: number;
  sqliteFilePath: string;
  registries: RegistryFederationItem[];
  streams: CrawlerStreamCursor[];
}

export interface AdminDashboardSnapshot {
  stats: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    unlimitedSubscribers: number;
    pendingPaymentsCount: number;
    approvedPaymentsCount: number;
    estimatedMonthlyRevenueUsdt: number;
    totalCoinsInCirculation: number;
    totalCoinsConsumed: number;
    totalLookupsExecuted: number;
    manualOverridesCount: number;
    activeVouchersCount: number;
    registeredDevicesCount: number;
    blockedSpamSignupsCount: number;
  };
  rootAdminShield: {
    rootAdminId: string;
    rootEmail: string;
    rootUsername: string;
    indestructible: true;
    usingDefaultPassword: boolean;
    storageFilePath: string;
    backupFileExists: boolean;
    storageDiagnostics?: {
      authDbName: string;
      vaultDbName: string;
      authStoragePath: string;
      vaultStoragePath: string;
      activeDataDir: string;
      isContainerRuntime: boolean;
      isPersistentVolumeMounted: boolean;
      detectedMountPoint: string | null;
      recommendedCoolifyMountPath: string;
    };
  };
  users: UserAccountPublic[];
  devices: RegisteredDeviceRecord[];
  payments: UsdtPaymentOrder[];
  ledger: CoinLedgerEntry[];
  overrides: CompanyManualOverride[];
  vouchers: PromoVoucher[];
  settings: PlatformSettings;
  cacheStats: ServerCacheStats;
  crawlerStats?: CrawlerVaultStats;
}

