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
    <div className="space-y-20 pt-14 pb-16">
      {/* 1. Simple B2B Lens Coin & Unlimited Pricing */}
      <section id="pricing" className="space-y-8 scroll-mt-24">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold text-petrol-600 dark:text-lemon-300">
            Simple B2B Lens Coin &amp; Unlimited Pricing
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-petrol-900 dark:text-bone-50 [text-wrap:balance]">
            Pay per company with Lens Coins or unlock Unlimited Worldwide Pro for $
            {config.unlimitedMonthlyPriceUsdt}/month.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Starter Tier — Bone White Surface */}
          <div className="rounded-xl p-6 sm:p-8 bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  For outbound testing &amp; targeted prospecting
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-petrol-900 dark:text-bone-50">
                  Lens Coin Workspace
                </h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-petrol-900 dark:text-bone-50 font-mono tabular-nums">
                    $0
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · Starter Lens Coin access upon registration
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 text-sm text-slate-600 dark:text-bone-300 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-petrol-600 dark:text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    1 Lens Coin = 1 full company domain lookup or Filter Explorer
                    company reveal (all employees &amp; emails)
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-petrol-600 dark:text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    Zero coin deduction whenever a domain search returns no public
                    contacts
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-petrol-600 dark:text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    Repeat lookups on companies you already unlocked cost 0
                    additional Lens Coins
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-petrol-600 dark:text-lemon-300 shrink-0 mt-0.5" />
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
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-petrol-700 hover:bg-petrol-600 text-bone-50 transition-colors cursor-pointer"
            >
              <span>Create Workspace Account</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Unlimited Tier ($15/month) — Signature Deep Petrol Blue Anchor Card with Lemon Yellow CTA */}
          <div className="rounded-xl p-6 sm:p-8 bg-petrol-700 dark:bg-petrol-800 border border-petrol-600 dark:border-lemon-400/45 text-bone-50 flex flex-col justify-between gap-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-lemon-300">
                  For high-volume B2B agencies, SDRs &amp; recruiters
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-bone-50">
                  Unlimited Worldwide Pro
                </h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-bone-50 font-mono tabular-nums">
                    ${config.unlimitedMonthlyPriceUsdt}
                  </span>
                  <span className="text-xs text-bone-200/80">
                    USDT / month · {config.usdtNetworkLabel}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 text-sm text-bone-100/90 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-bone-50">
                      Unlimited domain lookups
                    </strong>{' '}
                    and unlimited company email reveals for{' '}
                    {config.subscriptionDurationDays} days
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    Unlimited Filter Explorer company drilldowns across 100M+
                    worldwide organizations
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-lemon-300 shrink-0 mt-0.5" />
                  <span>
                    Instant on-chain TRON (TRC20) TxID verification with zero bank
                    cards or middlemen
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-lemon-300 shrink-0 mt-0.5" />
                  <span>Direct priority onboarding &amp; billing Support</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onFocusAuthCard('signup')}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold bg-lemon-400 hover:bg-lemon-300 text-petrol-950 transition-colors cursor-pointer"
              >
                <span>Get Started Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={config.supportTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border border-bone-200/30 text-bone-100 hover:bg-petrol-600 transition-colors whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5 text-lemon-300" />
                <span>Support</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. B2B Outbound & Recruiting Infrastructure */}
      <section id="capabilities" className="space-y-8 scroll-mt-24">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold text-petrol-600 dark:text-lemon-300">
            B2B Outbound &amp; Recruiting Infrastructure
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-petrol-900 dark:text-bone-50 [text-wrap:balance]">
            Built for revenue teams that need verified corporate directories without bloated enterprise contracts
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {capabilities.map((cap, idx) => (
            <div
              key={cap.num}
              className={`rounded-xl p-6 bg-bone-50 dark:bg-petrol-900 border border-bone-300 dark:border-petrol-700/90 flex flex-col justify-between gap-5 ${
                idx === 0 || idx === 3 ? 'md:col-span-2' : 'md:col-span-1'
              }`}
            >
              <div className="space-y-2.5">
                <h3 className="font-display text-lg font-semibold text-petrol-900 dark:text-bone-50">
                  <span className="font-mono tabular-nums text-petrol-600 dark:text-lemon-300 mr-2">
                    {cap.num}
                  </span>
                  {cap.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-bone-300 max-w-[68ch]">
                  {cap.body}
                </p>
              </div>
              <div className="pt-3 border-t border-bone-200 dark:border-petrol-800 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {cap.metric}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
