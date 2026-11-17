import React, { useState } from 'react';
import { Ban, Plus, Save, Trash2, UserPlus } from 'lucide-react';
import type {
  CompanyManualOverride,
  DepartmentCategory,
  ManualContactOverride,
  SeniorityLevel,
} from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminOverridesPanelProps {
  overrides: CompanyManualOverride[];
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminOverridesPanel: React.FC<AdminOverridesPanelProps> = ({
  overrides,
  onRefresh,
  onFeedback,
}) => {
  const [domain, setDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [employeeRange, setEmployeeRange] = useState('');
  const [revenueRange, setRevenueRange] = useState('');
  const [forcedConfidence, setForcedConfidence] = useState<number>(97);
  const [blocked, setBlocked] = useState(false);
  const [blockedEmailsText, setBlockedEmailsText] = useState('');
  const [addedContacts, setAddedContacts] = useState<ManualContactOverride[]>(
    []
  );

  // New custom contact row inputs
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cTitle, setCTitle] = useState('');
  const [cDept, setCDept] = useState<DepartmentCategory>('Leadership');
  const [cSeniority, setCSeniority] = useState<SeniorityLevel>('Executive');

  const [saving, setSaving] = useState(false);

  const loadExistingIntoForm = (ov: CompanyManualOverride) => {
    setDomain(ov.domain);
    setCompanyName(ov.companyName || '');
    setIndustry(ov.industry || '');
    setHeadquarters(ov.headquarters || '');
    setEmployeeRange(ov.employeeRange || '');
    setRevenueRange(ov.revenueRange || '');
    setForcedConfidence(ov.forcedConfidence || 97);
    setBlocked(ov.blocked);
    setBlockedEmailsText((ov.blockedEmails || []).join(', '));
    setAddedContacts(ov.addedContacts || []);
  };

  const resetForm = () => {
    setDomain('');
    setCompanyName('');
    setIndustry('');
    setHeadquarters('');
    setEmployeeRange('');
    setRevenueRange('');
    setForcedConfidence(97);
    setBlocked(false);
    setBlockedEmailsText('');
    setAddedContacts([]);
  };

  const handleAddContactToDraft = () => {
    if (!cName.trim() || !cEmail.trim()) return;
    setAddedContacts((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: cName.trim(),
        email: cEmail.trim().toLowerCase(),
        jobTitle: cTitle.trim() || 'Executive',
        department: cDept,
        seniority: cSeniority,
        emailAccuracy: 99,
      },
    ]);
    setCName('');
    setCEmail('');
    setCTitle('');
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const blockedEmails = blockedEmailsText
        .split(/[\n,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await apiFetch('/api/admin/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          companyName,
          industry,
          headquarters,
          employeeRange,
          revenueRange,
          forcedFormulaId: 'auto',
          forcedConfidence,
          blocked,
          blockedEmails,
          addedContacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save override.');
      resetForm();
      await onRefresh();
      onFeedback(
        'success',
        `Saved manual override for ${data.override.domain} and invalidated stale caches.`
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Failed to save override.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverride = async (targetDomain: string) => {
    try {
      const res = await apiFetch(
        `/api/admin/overrides/${encodeURIComponent(targetDomain)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Delete failed.');
      await onRefresh();
      onFeedback('success', `Removed manual override for ${targetDomain}.`);
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to delete override.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Manual Company &amp; Contact Overrides
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Manually edit any company’s profile metadata, headcount, revenue,
          verified contacts, or compliance opt-out blocklist. Changes take
          immediate priority across searches.
        </p>
      </div>

      {/* Override Editor Form */}
      <form
        onSubmit={handleSaveOverride}
        className="rounded-xl p-5 sm:p-6 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-5 text-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Target Domain *
            </label>
            <input
              type="text"
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. stripe.com"
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Override Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Leave blank to keep auto"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Override Industry
            </label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Financial Services"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Override Headquarters
            </label>
            <input
              type="text"
              value={headquarters}
              onChange={(e) => setHeadquarters(e.target.value)}
              placeholder="e.g. San Francisco, US"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Override Employee Count
            </label>
            <input
              type="text"
              value={employeeRange}
              onChange={(e) => setEmployeeRange(e.target.value)}
              placeholder="e.g. 1,001 - 5,000"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Override Annual Revenue
            </label>
            <input
              type="text"
              value={revenueRange}
              onChange={(e) => setRevenueRange(e.target.value)}
              placeholder="e.g. $100M - $500M"
              className="w-full rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Verification Confidence (%)
            </label>
            <input
              type="number"
              min={50}
              max={99}
              value={forcedConfidence}
              onChange={(e) => setForcedConfidence(Number(e.target.value))}
              className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 cursor-pointer">
            <input
              type="checkbox"
              checked={blocked}
              onChange={(e) => setBlocked(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium text-rose-700 dark:text-rose-300">
              Block / Opt-Out Entire Domain
            </span>
          </label>
        </div>

        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Opt-Out / Blocked Specific Emails (comma-separated)
          </label>
          <input
            type="text"
            value={blockedEmailsText}
            onChange={(e) => setBlockedEmailsText(e.target.value)}
            placeholder="privacy@domain.com, optout@domain.com"
            className="w-full rounded-lg px-3 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          />
        </div>

        {/* Custom Contacts Builder */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-sky-500" />
            <span>Inject Verified Contacts Into This Company ({addedContacts.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <input
              type="text"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Full Name"
              className="rounded-lg px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <input
              type="email"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              placeholder="verified@domain.com"
              className="rounded-lg px-2.5 py-2 font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <input
              type="text"
              value={cTitle}
              onChange={(e) => setCTitle(e.target.value)}
              placeholder="Job Title (e.g. CEO)"
              className="rounded-lg px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            />
            <select
              value={cDept}
              onChange={(e) => setCDept(e.target.value as DepartmentCategory)}
              className="rounded-lg px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              <option value="Leadership">Leadership</option>
              <option value="Engineering">Engineering</option>
              <option value="Sales & GTM">Sales &amp; GTM</option>
              <option value="Product & Design">Product &amp; Design</option>
              <option value="Research & Data">Research &amp; Data</option>
              <option value="Operations & Finance">Operations &amp; Finance</option>
              <option value="General">General</option>
            </select>
            <select
              value={cSeniority}
              onChange={(e) => setCSeniority(e.target.value as SeniorityLevel)}
              className="rounded-lg px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              <option value="Executive">Executive</option>
              <option value="Director / VP">Director / VP</option>
              <option value="Lead / Senior">Lead / Senior</option>
              <option value="Individual Contributor">Individual Contributor</option>
            </select>
            <button
              type="button"
              onClick={handleAddContactToDraft}
              className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 font-semibold bg-slate-900 dark:bg-slate-800 text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </button>
          </div>

          {addedContacts.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 px-3">
              {addedContacts.map((c) => (
                <div
                  key={c.id}
                  className="py-2 flex items-center justify-between gap-3"
                >
                  <div className="truncate">
                    <strong>{c.fullName}</strong> ·{' '}
                    <span className="font-mono">{c.email}</span> · {c.jobTitle} (
                    {c.seniority})
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAddedContacts((prev) =>
                        prev.filter((item) => item.id !== c.id)
                      )
                    }
                    className="text-rose-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={resetForm}
            className="px-3.5 py-2 rounded-lg font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            Reset Form
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving Override...' : 'Save Domain Override'}</span>
          </button>
        </div>
      </form>

      {/* Active Overrides Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {overrides.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No manual domain overrides configured yet.
          </p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Domain</th>
                <th className="py-3 px-4 font-semibold">Profile Metadata</th>
                <th className="py-3 px-4 font-semibold">Custom Contacts</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {overrides.map((ov) => (
                <tr key={ov.domain}>
                  <td className="py-3 px-4">
                    <div className="font-mono font-semibold text-slate-900 dark:text-white">
                      {ov.domain}
                    </div>
                    {ov.companyName && (
                      <div className="text-[11px] text-slate-500">
                        {ov.companyName}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {[ov.industry, ov.headquarters, ov.employeeRange]
                      .filter(Boolean)
                      .join(' · ') || `Confidence ${ov.forcedConfidence || 97}%`}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums">
                    {ov.addedContacts.length} added · {ov.blockedEmails.length}{' '}
                    hidden
                  </td>
                  <td className="py-3 px-4">
                    {ov.blocked ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                        <Ban className="h-3.5 w-3.5" />
                        Domain Blocked
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Active Override
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => loadExistingIntoForm(ov)}
                        className="px-2.5 py-1.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteOverride(ov.domain)}
                        className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
