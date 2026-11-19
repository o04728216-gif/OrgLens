import { useCallback, useEffect, useState } from 'react';
import type {
  CoinLedgerEntry,
  PublicPlatformConfig,
  SearchCoinMeta,
  UsdtPaymentOrder,
  UserAccountPublic,
  UserWorkspacePreferences,
} from '../types';
import {
  apiFetch,
  AUTH_TOKEN_KEY,
  loadAuthToken,
  saveAuthToken,
  SESSION_INVALIDATED_EVENT,
  type SessionInvalidatedDetail,
} from '../utils/authClient';
import {
  collectDeviceRegistrationPayload,
  collectFastLoginDevicePayload,
} from '../utils/deviceFingerprint';

const DEFAULT_PUBLIC_CONFIG: PublicPlatformConfig = {
  defaultSignupCoins: 50,
  domainSearchCoinCost: 1,
  filterCompanyCoinCost: 1,
  unlimitedMonthlyPriceUsdt: 15,
  subscriptionDurationDays: 30,
  usdtWalletAddress: 'TBLQWJ5jptV28V3gMrm57kGPtEAAnxbRQS',
  usdtNetworkLabel: 'TRON Network (TRC20) Only',
  supportTelegramUrl: 'https://t.me/paraxait',
  supportTelegramHandle: '@paraxait',
  allowNewRegistrations: true,
  enforceOneAccountPerDevice: true,
  strictHardwareFingerprintLock: true,
  announcementBanner: '',
  companyTagline: 'Corporate email finder & Worldwide company explorer',
};

export function usePlatformAuth(isAdminRoute: boolean) {
  const [user, setUser] = useState<UserAccountPublic | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicPlatformConfig>(
    DEFAULT_PUBLIC_CONFIG
  );
  const [coinLedger, setCoinLedger] = useState<CoinLedgerEntry[]>([]);
  const [usdtOrders, setUsdtOrders] = useState<UsdtPaymentOrder[]>([]);
  const [sessionDisplacedNotice, setSessionDisplacedNotice] = useState<
    string | null
  >(null);
  const [authInitializing, setAuthInitializing] = useState<boolean>(() =>
    Boolean(loadAuthToken())
  );

  const clearSessionDisplacedNotice = useCallback(() => {
    setSessionDisplacedNotice(null);
  }, []);

  const fetchPublicConfig = useCallback(async (adminCtx = false) => {
    try {
      const res = await fetch(
        `/api/public/config${adminCtx ? '?adminContext=true' : ''}`,
        { credentials: 'same-origin' }
      );
      if (res.ok) {
        const cfg = (await res.json()) as PublicPlatformConfig;
        setPublicConfig(cfg);
      }
    } catch {
      // Fallback to default config offline
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    const token = loadAuthToken();
    if (!token) {
      setUser(null);
      setAuthInitializing(false);
      return null;
    }
    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) {
        if (res.status === 401) {
          saveAuthToken('');
          setUser(null);
        }
        return null;
      }
      const payload = await res.json();
      if (payload?.user) {
        setUser(payload.user);
      }
      if (Array.isArray(payload?.ledger)) {
        setCoinLedger(payload.ledger);
      }
      if (Array.isArray(payload?.orders)) {
        setUsdtOrders(payload.orders);
      }
      if (payload?.config) {
        setPublicConfig(payload.config);
      }
      return payload.user as UserAccountPublic;
    } catch {
      return null;
    } finally {
      setAuthInitializing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPublicConfig(isAdminRoute);
  }, [fetchPublicConfig, isAdminRoute]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  // Real-time auto-logout listener when session is displaced by another device login
  useEffect(() => {
    const handleInvalidated = (evt: Event) => {
      const customEvt = evt as CustomEvent<SessionInvalidatedDetail>;
      const detail = customEvt.detail;
      saveAuthToken('');
      setUser(null);
      setCoinLedger([]);
      setUsdtOrders([]);
      if (
        detail?.code === 'SESSION_DISPLACED' ||
        detail?.code === 'PASSWORD_CHANGED'
      ) {
        setSessionDisplacedNotice(detail.message);
      }
    };

    const handleStorageSync = (evt: StorageEvent) => {
      if (evt.key === AUTH_TOKEN_KEY && !evt.newValue) {
        setUser(null);
        setCoinLedger([]);
        setUsdtOrders([]);
      }
    };

    window.addEventListener(SESSION_INVALIDATED_EVENT, handleInvalidated);
    window.addEventListener('storage', handleStorageSync);
    return () => {
      window.removeEventListener(SESSION_INVALIDATED_EVENT, handleInvalidated);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // Continuous single-device heartbeat (auto-logouts first device within seconds if signed in elsewhere)
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const checkActiveSession = async () => {
      if (cancelled || !navigator.onLine || !loadAuthToken()) return;
      try {
        const res = await apiFetch('/api/auth/session-check');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { user?: UserAccountPublic };
          if (data?.user) {
            setUser(data.user);
          }
        }
      } catch {
        // Ignore transient offline hiccup
      }
    };

    const intervalId = window.setInterval(() => {
      void checkActiveSession();
    }, 8000);

    const onWindowFocus = () => {
      void checkActiveSession();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkActiveSession();
      }
    };

    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<UserAccountPublic> => {
      const device = collectFastLoginDevicePayload();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, device }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to sign in.');
      }
      setSessionDisplacedNotice(null);
      saveAuthToken(payload.token);
      setUser(payload.user);
      setCoinLedger(Array.isArray(payload.ledger) ? payload.ledger : []);
      setUsdtOrders(Array.isArray(payload.orders) ? payload.orders : []);
      return payload.user as UserAccountPublic;
    },
    []
  );

  const signup = useCallback(
    async (input: {
      email: string;
      password: string;
      fullName: string;
      companyName?: string;
    }): Promise<UserAccountPublic> => {
      const device = await collectDeviceRegistrationPayload();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, device }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to create account.');
      }
      setSessionDisplacedNotice(null);
      saveAuthToken(payload.token);
      setUser(payload.user);
      setCoinLedger(Array.isArray(payload.ledger) ? payload.ledger : []);
      setUsdtOrders(Array.isArray(payload.orders) ? payload.orders : []);
      return payload.user as UserAccountPublic;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    saveAuthToken('');
    setUser(null);
    setCoinLedger([]);
    setUsdtOrders([]);
  }, []);

  const updateProfile = useCallback(
    async (input: {
      fullName?: string;
      username?: string;
      companyName?: string;
      jobTitle?: string;
      preferences?: Partial<UserWorkspacePreferences>;
    }): Promise<UserAccountPublic> => {
      const res = await apiFetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to update profile.');
      }
      if (payload?.user) {
        setUser(payload.user);
      }
      return payload.user as UserAccountPublic;
    },
    []
  );

  const changePassword = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
    }): Promise<string> => {
      const device = await collectDeviceRegistrationPayload();
      const res = await apiFetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, device }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to update password.');
      }
      if (payload?.token) {
        saveAuthToken(payload.token);
      }
      if (payload?.user) {
        setUser(payload.user);
      }
      return String(payload?.message || 'Password updated successfully.');
    },
    []
  );

  const rotateSession = useCallback(async (): Promise<string> => {
    const device = await collectDeviceRegistrationPayload();
    const res = await apiFetch('/api/account/rotate-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload?.error || 'Unable to rotate session.');
    }
    if (payload?.token) {
      saveAuthToken(payload.token);
    }
    if (payload?.user) {
      setUser(payload.user);
    }
    return String(payload?.message || 'Active session key rotated.');
  }, []);

  const applySearchCoinMeta = useCallback((meta?: SearchCoinMeta) => {
    if (!meta) return;
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lensCoins: meta.balanceRemaining,
        totalCoinsUsed: prev.totalCoinsUsed + meta.coinsDeducted,
        totalSearches: prev.totalSearches + 1,
        hasActiveUnlimited: meta.hasActiveUnlimited || prev.hasActiveUnlimited,
      };
    });
  }, []);

  const applyExactCoinBalance = useCallback((balance: number) => {
    setUser((prev) => (prev ? { ...prev, lensCoins: balance } : prev));
  }, []);

  const submitUsdtPayment = useCallback(
    async (input: {
      txHash: string;
      senderWallet?: string;
      userNote?: string;
    }) => {
      const res = await apiFetch('/api/billing/submit-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Payment submission failed.');
      }
      if (payload.user) setUser(payload.user);
      if (Array.isArray(payload.ledger)) setCoinLedger(payload.ledger);
      if (Array.isArray(payload.orders)) setUsdtOrders(payload.orders);
      return payload as {
        order: UsdtPaymentOrder;
        user: UserAccountPublic;
        autoActivated: boolean;
        verificationDetails: string;
      };
    },
    []
  );

  const redeemVoucher = useCallback(async (code: string) => {
    const res = await apiFetch('/api/billing/redeem-voucher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload?.error || 'Voucher redemption failed.');
    }
    if (payload.user) setUser(payload.user);
    if (Array.isArray(payload.ledger)) setCoinLedger(payload.ledger);
    if (Array.isArray(payload.orders)) setUsdtOrders(payload.orders);
    return String(payload.message || 'Voucher redeemed.');
  }, []);

  return {
    user,
    setUser,
    publicConfig,
    setPublicConfig,
    coinLedger,
    usdtOrders,
    sessionDisplacedNotice,
    clearSessionDisplacedNotice,
    authInitializing,
    login,
    signup,
    logout,
    updateProfile,
    changePassword,
    rotateSession,
    refreshAccount,
    fetchPublicConfig,
    applySearchCoinMeta,
    applyExactCoinBalance,
    submitUsdtPayment,
    redeemVoucher,
  };
}
