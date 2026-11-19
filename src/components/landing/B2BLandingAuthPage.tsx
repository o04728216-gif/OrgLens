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
    <div className="relative overflow-x-clip min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors duration-200">
      <RainbowMotionBackdrop theme={theme} />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-[#090d16]/80 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            OrgLens
          </a>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            aria-label="Landing navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#pricing"
              className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#capabilities"
              className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href={config.supportTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 dark:hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </a>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                focusAuthCard(authMode === 'login' ? 'signup' : 'login')
              }
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authMode === 'login' ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14">
        {/* 2-Column Hero Split with Embedded Login / Sign Up Card */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left Column: B2B Value Proposition */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-400">
              <span>B2B Corporate Contact Intelligence</span>
              <span aria-hidden="true">·</span>
              <span>100M+ Worldwide Companies</span>
            </div>

            <h1 className="font-display text-[clamp(2.15rem,3.4vw,3.3rem)] font-bold leading-[1.13] tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              Identify corporate leadership, organizational rosters, and verified work emails across any global domain.
            </h1>

            <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
              Search any company domain directly—or filter 100M+ worldwide
              organizations by geography, industry, headcount, and revenue—to
              access verified corporate websites, executive reporting lines, and
              direct business email addresses in seconds.
            </p>
          </div>

          {/* Right Column: Clean Login & Sign Up Card */}
          <div
            ref={authCardRef}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
              {/* Segmented Auth Mode Switch: Sign In LEFT, Sign Up RIGHT */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    onChangeAuthMode('login');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="mb-5">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {authMode === 'signup'
                    ? 'Create your B2B workspace'
                    : 'Sign in to OrgLens'}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {authMode === 'signup'
                    ? 'Register your workstation to access verified corporate contacts and worldwide company filters.'
                    : 'Enter your email or username and password to access the directory.'}
                </p>
              </div>

              {sessionDisplacedNotice && (
                <div
                  role="alert"
                  onClick={onDismissSessionNotice}
                  className="mb-4 rounded-lg px-3.5 py-2.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70 cursor-pointer"
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
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Alex Morgan"
                        className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Company <span className="text-slate-400">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Acme Growth"
                        className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
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
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
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
                      className="w-full rounded-lg pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-80 text-white transition-colors cursor-pointer"
                >
                  <span>
                    {authMode === 'signup'
                      ? 'Create Workspace Account'
                      : 'Access Directory Workspace'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
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
                  className="font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  {authMode === 'signup' ? 'Sign in here' : 'Create an account'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing First, Followed Directly by B2B Outbound & Recruiting Infrastructure */}
        <LandingSections config={config} onFocusAuthCard={focusAuthCard} />
      </main>

      {/* Quiet B2B Footer */}
      <footer className="relative z-10 border-t border-slate-200/80 dark:border-slate-800/80 py-8 backdrop-blur-xs bg-white/40 dark:bg-[#090d16]/40">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-display font-semibold text-slate-800 dark:text-slate-200">
              OrgLens
            </span>
            <span aria-hidden="true">·</span>
            <span>{config.companyTagline}</span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href={config.supportTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Send className="h-3.5 w-3.5 text-sky-500" />
              <span>Support</span>
            </a>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
