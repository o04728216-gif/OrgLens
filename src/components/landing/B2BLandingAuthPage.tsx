import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Moon,
  Send,
  Sun,
} from 'lucide-react';
import type { PublicPlatformConfig } from '../../types';
import { LandingSections } from './LandingSections';
import { RainbowMotionBackdrop } from './RainbowMotionBackdrop';

interface B2BLandingAuthPageProps {
  authMode: 'login' | 'signup';
  onChangeAuthMode: (mode: 'login' | 'signup') => void;
  config: PublicPlatformConfig;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogin: (identifier: string, password: string) => Promise<unknown>;
  onSignup: (input: {
    email: string;
    password: string;
    fullName: string;
    companyName?: string;
  }) => Promise<unknown>;
  sessionDisplacedNotice?: string | null;
  onDismissSessionNotice?: () => void;
}

export const B2BLandingAuthPage: React.FC<B2BLandingAuthPageProps> = ({
  authMode,
  onChangeAuthMode,
  config,
  theme,
  onToggleTheme,
  onLogin,
  onSignup,
  sessionDisplacedNotice,
  onDismissSessionNotice,
}) => {
  const authCardRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const focusAuthCard = (mode: 'login' | 'signup') => {
    onChangeAuthMode(mode);
    setErrorMsg(null);
    authCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 180);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (authMode === 'login') {
        await onLogin(emailOrUsername, password);
      } else {
        await onSignup({
          email: emailOrUsername,
          password,
          fullName,
          companyName,
        });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Authentication request failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative overflow-x-clip min-h-screen flex flex-col bg-bone-100 text-petrol-900 dark:bg-petrol-950 dark:text-bone-100 transition-colors duration-200">
      <RainbowMotionBackdrop theme={theme} />

      {/* Strict 3-Zone Top Bar Contract — Signature Petrol Blue Header with Lemon Yellow Primary CTA */}
      <header className="sticky top-0 z-30 bg-petrol-700/96 dark:bg-petrol-900/96 backdrop-blur-md border-b border-petrol-600/70 dark:border-petrol-800">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-lg font-bold tracking-tight text-bone-50 whitespace-nowrap shrink-0"
          >
            OrgLens
          </a>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            aria-label="Landing navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-bone-200"
          >
            <a
              href="#pricing"
              className="hover:text-lemon-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#capabilities"
              className="hover:text-lemon-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href={config.supportTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-lemon-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </a>
          </nav>

          {/* Zone 3: Single Primary Action in Lemon Yellow */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                focusAuthCard(authMode === 'login' ? 'signup' : 'login')
              }
              className="px-4 py-2 rounded-lg text-xs font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              {authMode === 'login' ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14">
        {/* 2-Column Hero Split with Embedded Login / Sign Up Card */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left Column: B2B Value Proposition + Immediate 2-Step Direction */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-petrol-600 dark:text-lemon-300">
              <span>Corporate Email Directory</span>
              <span aria-hidden="true">·</span>
              <span>100M+ Worldwide Companies</span>
            </div>

            <h1 className="font-display text-[clamp(2.2rem,3.6vw,3.45rem)] font-bold leading-[1.11] tracking-tight text-petrol-900 dark:text-bone-50 [text-wrap:balance]">
              Find any company employees email address in seconds.
            </h1>

            <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-bone-300 max-w-2xl">
              Search any company domain directly—or filter 100M+ worldwide
              organizations by geography, industry, headcount, and revenue—to
              access verified corporate websites, executive reporting lines, and
              direct work email addresses.
            </p>

            {/* Clear 2-Step Visual Guide so First-Time Users Know Exactly Where to Start */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-2xl">
              <div className="rounded-xl p-4 bg-bone-50 dark:bg-petrol-900/80 border border-bone-300 dark:border-petrol-700/80">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-petrol-700 dark:text-lemon-300">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-petrol-700 text-lemon-300 dark:bg-lemon-400 dark:text-petrol-950 text-[11px] font-bold">
                    01
                  </span>
                  <span>Direct Domain Lookup</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-bone-300">
                  Sign in on the right, enter any website domain, and pull verified
                  employee names and business emails immediately.
                </p>
              </div>

              <div className="rounded-xl p-4 bg-bone-50 dark:bg-petrol-900/80 border border-bone-300 dark:border-petrol-700/80">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-petrol-700 dark:text-lemon-300">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-petrol-700 text-lemon-300 dark:bg-lemon-400 dark:text-petrol-950 text-[11px] font-bold">
                    02
                  </span>
                  <span>Worldwide Filter Explorer</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-bone-300">
                  Filter global organizations by country, industry, team size, and
                  revenue to export full decision-maker rosters.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Clean Login & Sign Up Card Framed in Petrol Blue + Bone White + Lemon CTA */}
          <div
            ref={authCardRef}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <div className="rounded-2xl bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700 shadow-sm overflow-hidden">
              {/* Crisp Petrol Top Accent Strip */}
              <div className="h-1.5 w-full bg-gradient-to-r from-petrol-700 via-petrol-500 to-lemon-400" />

              <div className="p-6 sm:p-8">
                {/* Segmented Auth Mode Switch: Sign In LEFT, Sign Up RIGHT */}
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-bone-200 dark:bg-petrol-950 border border-bone-300/80 dark:border-petrol-800 mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeAuthMode('login');
                      setErrorMsg(null);
                    }}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      authMode === 'login'
                        ? 'bg-petrol-700 text-bone-50 dark:bg-lemon-400 dark:text-petrol-950 shadow-xs'
                        : 'text-slate-600 dark:text-bone-300 hover:text-petrol-900 dark:hover:text-bone-50'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeAuthMode('signup');
                      setErrorMsg(null);
                    }}
                    className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-petrol-700 text-bone-50 dark:bg-lemon-400 dark:text-petrol-950 shadow-xs'
                        : 'text-slate-600 dark:text-bone-300 hover:text-petrol-900 dark:hover:text-bone-50'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold text-petrol-900 dark:text-bone-50">
                    {authMode === 'signup'
                      ? 'Create your B2B workspace'
                      : 'Sign in to OrgLens'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {authMode === 'signup'
                      ? 'Register your workstation to find company employee emails and filter worldwide directories.'
                      : 'Enter your email or username and password to open the directory workspace.'}
                  </p>
                </div>

                {sessionDisplacedNotice && (
                  <div
                    role="alert"
                    onClick={onDismissSessionNotice}
                    className="mb-4 rounded-lg px-3.5 py-2.5 text-xs font-medium bg-lemon-50 dark:bg-lemon-500/15 text-petrol-900 dark:text-lemon-200 border border-lemon-400/70 dark:border-lemon-500/40 cursor-pointer"
                  >
                    {sessionDisplacedNotice}
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="mb-4 rounded-lg px-3.5 py-2.5 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70"
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {authMode === 'signup' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-petrol-800 dark:text-bone-200 mb-1.5">
                          Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Alex Morgan"
                          className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-bone-100 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-900 dark:text-bone-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lemon-400/70 focus:border-petrol-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-petrol-800 dark:text-bone-200 mb-1.5">
                          Company <span className="text-slate-400">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Acme Growth"
                          className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-bone-100 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-900 dark:text-bone-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lemon-400/70 focus:border-petrol-600"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-petrol-800 dark:text-bone-200 mb-1.5">
                      {authMode === 'signup'
                        ? 'Work or Business Email'
                        : 'Email or Username'}
                    </label>
                    <input
                      ref={emailInputRef}
                      type={authMode === 'signup' ? 'email' : 'text'}
                      required
                      value={emailOrUsername}
                      onChange={(e) => setEmailOrUsername(e.target.value)}
                      placeholder="alex@company.com"
                      className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-bone-100 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-900 dark:text-bone-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lemon-400/70 focus:border-petrol-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-petrol-800 dark:text-bone-200 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          authMode === 'signup'
                            ? 'Minimum 6 characters'
                            : 'Enter your password'
                        }
                        className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm bg-bone-100 dark:bg-petrol-950 border border-bone-300 dark:border-petrol-700 text-petrol-900 dark:text-bone-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lemon-400/70 focus:border-petrol-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-petrol-700 dark:hover:text-bone-100 cursor-pointer"
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
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-bold bg-lemon-400 hover:bg-lemon-300 disabled:opacity-80 text-petrol-950 border border-lemon-500/40 shadow-xs transition-colors cursor-pointer"
                  >
                    <span>
                      {authMode === 'signup'
                        ? 'Create Workspace Account'
                        : 'Access Directory Workspace'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-bone-200 dark:border-petrol-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {authMode === 'signup'
                      ? 'Already registered?'
                      : 'Need a new account?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeAuthMode(authMode === 'signup' ? 'login' : 'signup');
                      setErrorMsg(null);
                    }}
                    className="font-semibold text-petrol-700 dark:text-lemon-300 hover:underline cursor-pointer"
                  >
                    {authMode === 'signup' ? 'Sign in here' : 'Create an account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing First, Followed Directly by B2B Outbound & Recruiting Infrastructure */}
        <LandingSections config={config} onFocusAuthCard={focusAuthCard} />
      </main>

      {/* Quiet B2B Footer */}
      <footer className="relative z-10 border-t border-bone-300 dark:border-petrol-800 py-8 bg-bone-50/80 dark:bg-petrol-900/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-display font-bold text-petrol-900 dark:text-bone-50">
              OrgLens
            </span>
            <span aria-hidden="true">·</span>
            <span>Find any company employees email address</span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href={config.supportTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-petrol-900 dark:hover:text-lemon-300 transition-colors"
            >
              <Send className="h-3.5 w-3.5 text-petrol-600 dark:text-lemon-300" />
              <span>Support</span>
            </a>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-petrol-900 dark:hover:text-lemon-300 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-lemon-300" />
                  <span>Bone Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-petrol-700" />
                  <span>Petrol Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
