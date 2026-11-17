import React, { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import type { PublicPlatformConfig, UserAccountPublic } from '../../types';

interface AdminLoginGateProps {
  currentUser: UserAccountPublic | null;
  config: PublicPlatformConfig;
  onLogin: (identifier: string, password: string) => Promise<UserAccountPublic>;
  onBackToSite: () => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({
  currentUser,
  config,
  onLogin,
  onBackToSite,
}) => {
  const [identifier, setIdentifier] = useState(
    config.bootstrapAdminHint?.username || 'admin'
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const loggedIn = await onLogin(identifier, password);
      if (loggedIn.role !== 'admin' && !loggedIn.isRootAdmin) {
        setErrorMsg(
          `Signed in as ${loggedIn.email}, which is a standard user account. Please sign in with Administrator credentials.`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Admin authentication failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md space-y-5">
        <button
          type="button"
          onClick={onBackToSite}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to OrgLens</span>
        </button>

        <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>OrgLens VPS Control Plane</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Administrator Sign In
            </h1>
          </div>

          {currentUser && currentUser.role !== 'admin' && (
            <div className="rounded-lg p-3 text-xs bg-amber-50 dark:bg-amber-950/35 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70">
              You are currently signed in as <strong>{currentUser.email}</strong>{' '}
              (Standard User). Sign in below with an Admin account to switch
              into the Admin Console.
            </div>
          )}

          {config.bootstrapAdminHint?.defaultPasswordActive && (
            <div className="rounded-lg p-3.5 text-xs bg-sky-50 dark:bg-sky-950/35 text-sky-900 dark:text-sky-200 border border-sky-200 dark:border-sky-800/70 space-y-1">
              <div className="font-semibold">
                First-Run VPS Root Admin Bootstrap Active
              </div>
              <div className="font-mono text-[11px] space-y-0.5">
                <div>
                  Login: <strong>{config.bootstrapAdminHint.username}</strong>{' '}
                  or <strong>{config.bootstrapAdminHint.email}</strong>
                </div>
                <div>
                  Default Password: <strong>OrgLensAdmin2026!</strong>
                </div>
              </div>
              <p className="text-[11px] text-sky-700 dark:text-sky-300 pt-0.5">
                Once signed in, open System &amp; Root Shield to set your custom
                password—this notice hides automatically afterward.
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg p-3 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Username or Email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin or admin@orglens.io"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying Authority...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Unlock Admin Dashboard</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
