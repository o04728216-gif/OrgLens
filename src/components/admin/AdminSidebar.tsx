import React from 'react';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Database,
  Laptop,
  LayoutDashboard,
  LogOut,
  Moon,
  Radar,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import type { AdminDashboardSnapshot, AdminSectionId } from '../../types';

interface AdminSidebarProps {
  activeSection: AdminSectionId;
  onSelectSection: (section: AdminSectionId) => void;
  snapshot: AdminDashboardSnapshot | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onReturnToWorkspace: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeSection,
  onSelectSection,
  snapshot,
  theme,
  onToggleTheme,
  onReturnToWorkspace,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: Array<{
    id: AdminSectionId;
    label: string;
    icon: React.FC<{ className?: string }>;
    count?: number;
    highlightCount?: boolean;
  }> = [
    {
      id: 'overview',
      label: 'Executive Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'crawler',
      label: 'Worldwide Crawler',
      icon: Radar,
      count: snapshot?.crawlerStats?.vaultCompaniesCount,
    },
    {
      id: 'users',
      label: 'Users & Lens Coins',
      icon: Users,
      count: snapshot?.stats.totalUsers,
    },
    {
      id: 'devices',
      label: 'Device Anti-Spam',
      icon: Laptop,
      count: snapshot?.stats.registeredDevicesCount,
      highlightCount: Boolean(snapshot?.stats.blockedSpamSignupsCount),
    },
    {
      id: 'payments',
      label: 'USDT (TRC20) Payments',
      icon: CreditCard,
      count: snapshot?.stats.pendingPaymentsCount,
      highlightCount: Boolean(snapshot?.stats.pendingPaymentsCount),
    },
    {
      id: 'directory-overrides',
      label: 'Company & Contact Fixes',
      icon: Building2,
      count: snapshot?.stats.manualOverridesCount,
    },
    {
      id: 'ledger',
      label: 'Coin & Search Ledger',
      icon: ScrollText,
      count: snapshot?.ledger.length,
    },
    {
      id: 'vouchers',
      label: 'Promo Vouchers',
      icon: Ticket,
      count: snapshot?.stats.activeVouchersCount,
    },
    {
      id: 'settings',
      label: 'Wallet & Economy Config',
      icon: Settings,
    },
    {
      id: 'system',
      label: 'Cache, Backup & Root Shield',
      icon: Database,
    },
  ];

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-petrol-700 dark:bg-petrol-900 border-r border-petrol-600/80 dark:border-petrol-800 w-68 shrink-0 text-bone-50">
      <div className="p-4 space-y-5 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div>
            <div className="font-display text-base font-bold text-bone-50">
              OrgLens Admin
            </div>
            <div className="text-[11px] text-bone-200/75">
              Self-Hosted VPS Control Plane
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-bone-200 hover:bg-petrol-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Indestructible Shield Card */}
        <div className="rounded-xl p-3 bg-petrol-800/85 border border-petrol-600/80 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-lemon-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Root Shield Active</span>
          </div>
          <p className="text-[11px] text-bone-200/85 leading-snug">
            Root Admin is permanently protected on local VPS disk and can never
            self-destruct.
          </p>
        </div>

        {/* Navigation List */}
        <nav aria-label="Admin sections" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-lemon-400 text-petrol-950 font-bold shadow-xs'
                    : 'text-bone-100/90 hover:bg-petrol-600/80'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-petrol-950/15 text-petrol-950 font-bold'
                        : item.highlightCount
                        ? 'bg-lemon-400 text-petrol-950 font-bold'
                        : 'text-bone-200/75'
                    }`}
                  >
                    {item.count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-petrol-600/80 dark:border-petrol-800 space-y-2">
        <button
          type="button"
          onClick={onReturnToWorkspace}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-bone-50 hover:bg-bone-200 text-petrol-950 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Open Directory Explorer</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium border border-petrol-600 text-bone-100 hover:bg-petrol-600 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-lemon-300" />
                <span>Bone Light</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-lemon-300" />
                <span>Petrol Dark</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium border border-rose-400/50 text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block sticky top-0 h-screen shrink-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
