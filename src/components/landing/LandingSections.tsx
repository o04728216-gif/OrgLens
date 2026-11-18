import React from 'react';
import { ArrowRight, Check, Send } from 'lucide-react';
import type { PublicPlatformConfig } from '../../types';

interface LandingSectionsProps {
  config: PublicPlatformConfig;
  onFocusAuthCard: (mode: 'signup' | 'login') => void;
}

export const LandingSections: React.FC<LandingSectionsProps> = ({
  config,
  onFocusAuthCard,
}) => {
  const capabilities = [
    {
      num: '01.',
      title: 'Verified Corporate Contact & Domain Discovery',
      body: 'Enter any corporate domain to retrieve decision-maker full names, verified work emails, and active job titles validated against live domain mail servers and public web records.',
      metric: 'DNS MX & live web verification on every company lookup',
    },
    {
      num: '02.',
      title: '100M+ Worldwide Organization & Revenue Filtering',
      body: 'Segment target accounts across 195+ countries and 6 continents by primary industry, employee headcount bracket, estimated annual revenue, and leadership role keywords.',
      metric: '500 organizations per batch with direct company drilldowns',
    },
    {
      num: '03.',
      title: 'Executive-to-Contributor Command Hierarchy',
      body: 'Every discovered organization is ranked from C-Suite founders and VPs down to department leads and individual contributors so outbound sales and recruiting teams reach decision-makers first.',
      metric: 'Ranked across 7 functional departments & 4 authority tiers',
    },
    {
      num: '04.',
      title: 'Zero-Waste Lens Coin Protection',
      body: '1 Lens Coin unlocks an entire company’s employee names, titles, and corporate emails. Searches returning zero contacts never deduct a single coin from your balance.',
      metric: '1 Company = 1 Lens Coin · Zero charge on empty lookups',
    },
  ];

  return (
    <div className="space-y-20 pt-12 pb-16">
      {/* 1. Simple B2B Lens Coin & Unlimited Pricing (ABOVE Capabilities) */}
      <section id="pricing" className="space-y-8 scroll-mt-24">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
            Simple B2B Lens Coin &amp; Unlimited Pricing
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
            Pay per company with Lens Coins or unlock Unlimited Worldwide Pro for $
            {config.unlimitedMonthlyPriceUsdt}/month.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Starter Tier */}
          <div className="rounded-xl p-6 sm:p-8 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  For outbound testing &amp; targeted prospecting
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
                  Lens Coin Workspace
                </h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                    $0
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · Starter Lens Coin access upon registration
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    1 Lens Coin = 1 full company domain lookup or Filter Explorer
                    company reveal (all employees &amp; emails)
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    Zero coin deduction whenever a domain search returns no public
                    contacts
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    Repeat lookups on companies you already unlocked cost 0
                    additional Lens Coins
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    Full access to CSV export, Command Hierarchy, and Worldwide
                    Filter Explorer
                  </span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onFocusAuthCard('signup')}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              <span>Create Workspace Account</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Unlimited Tier ($15/month) */}
          <div className="rounded-xl p-6 sm:p-8 bg-white dark:bg-slate-900/90 border border-sky-500/60 dark:border-sky-500/50 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
                  For high-volume B2B agencies, SDRs &amp; recruiters
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
                  Unlimited Worldwide Pro
                </h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                    ${config.unlimitedMonthlyPriceUsdt}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    USDT / month · {config.usdtNetworkLabel}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-900 dark:text-white">
                      Unlimited domain lookups
                    </strong>{' '}
                    and unlimited company email reveals for{' '}
                    {config.subscriptionDurationDays} days
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Unlimited Filter Explorer company drilldowns across 100M+
                    worldwide organizations
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Instant on-chain TRON (TRC20) TxID verification with zero bank
                    cards or middlemen
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Direct priority onboarding &amp; billing Support</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onFocusAuthCard('signup')}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
              >
                <span>Get Started Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={config.supportTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5 text-sky-500" />
                <span>Support</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. B2B Outbound & Recruiting Infrastructure (UNDER Simple B2B Lens Coin & Unlimited Pricing) */}
      <section id="capabilities" className="space-y-8 scroll-mt-24">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
            B2B Outbound &amp; Recruiting Infrastructure
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
            Built for revenue teams that need verified corporate directories without bloated enterprise contracts
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {capabilities.map((cap, idx) => (
            <div
              key={cap.num}
              className={`rounded-xl p-6 bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800/90 flex flex-col justify-between gap-5 ${
                idx === 0 || idx === 3 ? 'md:col-span-2' : 'md:col-span-1'
              }`}
            >
              <div className="space-y-2.5">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400 mr-2">
                    {cap.num}
                  </span>
                  {cap.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-[68ch]">
                  {cap.body}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {cap.metric}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
