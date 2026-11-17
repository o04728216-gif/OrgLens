import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Cpu,
  Laptop,
  Lock,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
} from 'lucide-react';
import type {
  PlatformSettings,
  RegisteredDeviceRecord,
  RegisteredDeviceStatus,
} from '../../../types';
import { apiFetch } from '../../../utils/authClient';

interface AdminDevicesPanelProps {
  devices: RegisteredDeviceRecord[];
  settings: PlatformSettings;
  onRefresh: () => Promise<void>;
  onFeedback: (tone: 'success' | 'error', text: string) => void;
}

export const AdminDevicesPanel: React.FC<AdminDevicesPanelProps> = ({
  devices,
  settings,
  onRefresh,
  onFeedback,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | RegisteredDeviceStatus
  >('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return devices.filter((dev) => {
      if (statusFilter !== 'all' && dev.status !== statusFilter) return false;
      if (!q) return true;
      return (
        dev.boundUserEmail.toLowerCase().includes(q) ||
        dev.boundUserName.toLowerCase().includes(q) ||
        dev.deviceLabel.toLowerCase().includes(q) ||
        dev.platform.toLowerCase().includes(q) ||
        dev.gpuRenderer.toLowerCase().includes(q) ||
        dev.hardwareHash.toLowerCase().includes(q) ||
        (dev.lastBlockedEmail || '').toLowerCase().includes(q) ||
        (dev.adminNote || '').toLowerCase().includes(q)
      );
    });
  }, [devices, searchQuery, statusFilter]);

  const totalBlockedAttempts = useMemo(
    () => devices.reduce((acc, d) => acc + (d.blockedAttempts || 0), 0),
    [devices]
  );

  const handlePatchDevice = async (
    deviceId: string,
    payload: {
      status?: RegisteredDeviceStatus;
      adminNote?: string;
      resetBlockedAttempts?: boolean;
    },
    successMsg: string
  ) => {
    setBusyId(deviceId);
    try {
      const res = await apiFetch(`/api/admin/devices/${deviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update device record.');
      }
      await onRefresh();
      onFeedback('success', successMsg);
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to update device.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDevice = async (dev: RegisteredDeviceRecord) => {
    setBusyId(dev.id);
    try {
      const res = await apiFetch(`/api/admin/devices/${dev.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove device registration.');
      await onRefresh();
      onFeedback(
        'success',
        `Removed registered device record for ${dev.boundUserEmail}.`
      );
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Unable to delete device record.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleProtectionSetting = async (
    field: 'enforceOneAccountPerDevice' | 'strictHardwareFingerprintLock',
    value: boolean
  ) => {
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          [field]: value,
        }),
      });
      if (!res.ok) throw new Error('Unable to update device anti-spam setting.');
      await onRefresh();
      onFeedback('success', 'Updated physical device anti-spam policy.');
    } catch (err) {
      onFeedback(
        'error',
        err instanceof Error ? err.message : 'Setting update failed.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Hardware Device Registry &amp; Anti-Spam Control
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Enforces 1 account per physical device (never IP-based). Combines
            HMAC server device seals, multi-vault browser IDs, and WebGL/GPU/screen
            hardware fingerprints so VPN changes or incognito tabs cannot spam
            free signups.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <div className="rounded-lg px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500">Registered Devices: </span>
            <strong className="text-slate-900 dark:text-white">
              {devices.length.toLocaleString()}
            </strong>
          </div>
          <div className="rounded-lg px-3.5 py-2 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70">
            <span className="text-rose-700 dark:text-rose-300">
              Spam Signups Blocked:{' '}
            </span>
            <strong className="text-rose-800 dark:text-rose-200">
              {totalBlockedAttempts.toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      {/* Live Policy Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <label className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enforceOneAccountPerDevice}
            onChange={(e) =>
              void handleToggleProtectionSetting(
                'enforceOneAccountPerDevice',
                e.target.checked
              )
            }
            className="mt-0.5 rounded"
          />
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">
              Enforce One Account Per Physical Device (Recommended)
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              Registers the device itself on first signup and blocks subsequent
              account creation from that device regardless of IP address or VPN.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.strictHardwareFingerprintLock}
            onChange={(e) =>
              void handleToggleProtectionSetting(
                'strictHardwareFingerprintLock',
                e.target.checked
              )
            }
            className="mt-0.5 rounded"
          />
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">
              Strict Hardware Fingerprint Lock (Incognito &amp; Wiped Storage)
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              Matches GPU renderer, CPU/RAM topology, screen geometry, audio DSP,
              and canvas font signature so clearing cookies or switching browsers
              still blocks duplicate signups.
            </p>
          </div>
        </label>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bound user email, GPU, OS, hardware hash, or blocked email..."
            className="w-full rounded-lg pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80 self-start">
          {(['all', 'locked', 'released', 'banned'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Devices Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {filteredDevices.length === 0 ? (
          <div className="p-10 text-center space-y-1.5">
            <Laptop className="h-6 w-6 text-slate-400 mx-auto" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              No registered devices match this filter yet.
            </p>
            <p className="text-[11px] text-slate-500">
              Devices are automatically fingerprinted and locked when users sign
              up on the public form.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Physical Device &amp; Hardware</th>
                <th className="py-3 px-4 font-semibold">Bound Account</th>
                <th className="py-3 px-4 font-semibold">Spam Blocks</th>
                <th className="py-3 px-4 font-semibold">Lock Status &amp; Note</th>
                <th className="py-3 px-4 font-semibold text-right">
                  Admin Controls
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredDevices.map((dev) => {
                const draftNote =
                  noteDrafts[dev.id] !== undefined
                    ? noteDrafts[dev.id]
                    : dev.adminNote || '';
                return (
                  <tr
                    key={dev.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 align-top"
                  >
                    <td className="py-3.5 px-4 max-w-xs space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                        <span className="truncate">{dev.deviceLabel}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        GPU: {dev.gpuRenderer || 'Standard'}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        Screen: {dev.screenProfile} · {dev.cpuCores || '?'}c /{' '}
                        {dev.memoryGb || '?'}GB · {dev.timezone}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        HW: {dev.hardwareHash.slice(0, 18)}…
                      </div>
                    </td>

                    <td className="py-3.5 px-4 space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {dev.boundUserName}
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {dev.boundUserEmail}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        Registered {new Date(dev.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {dev.blockedAttempts} blocked
                      </div>
                      {dev.lastBlockedEmail && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                          Last tried: {dev.lastBlockedEmail}
                        </div>
                      )}
                      {dev.blockedAttempts > 0 && (
                        <button
                          type="button"
                          disabled={busyId === dev.id}
                          onClick={() =>
                            void handlePatchDevice(
                              dev.id,
                              { resetBlockedAttempts: true },
                              `Reset blocked counter for ${dev.deviceLabel}.`
                            )
                          }
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset count</span>
                        </button>
                      )}
                    </td>

                    <td className="py-3.5 px-4 space-y-2 min-w-[200px]">
                      <div>
                        {dev.status === 'locked' && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                            <Lock className="h-3.5 w-3.5" />
                            <span>Locked (1 Signup Used)</span>
                          </span>
                        )}
                        {dev.status === 'released' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Released (New Signup Allowed)</span>
                          </span>
                        )}
                        {dev.status === 'banned' && (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>Device Banned (Login + Signup Blocked)</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={draftNote}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({
                              ...prev,
                              [dev.id]: e.target.value,
                            }))
                          }
                          placeholder="Admin note..."
                          className="flex-1 rounded-md px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                        />
                        <button
                          type="button"
                          disabled={busyId === dev.id}
                          onClick={() =>
                            void handlePatchDevice(
                              dev.id,
                              { adminNote: draftNote },
                              'Saved device note.'
                            )
                          }
                          title="Save device note"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Save className="h-3 w-3" />
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                        {dev.status !== 'released' && (
                          <button
                            type="button"
                            disabled={busyId === dev.id}
                            onClick={() =>
                              void handlePatchDevice(
                                dev.id,
                                { status: 'released' },
                                `Released device lock on ${dev.deviceLabel}.`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          >
                            <Unlock className="h-3 w-3" />
                            <span>Release</span>
                          </button>
                        )}

                        {dev.status !== 'locked' && (
                          <button
                            type="button"
                            disabled={busyId === dev.id}
                            onClick={() =>
                              void handlePatchDevice(
                                dev.id,
                                { status: 'locked' },
                                `Locked device ${dev.deviceLabel} to 1 signup.`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold bg-slate-900 dark:bg-slate-800 text-white cursor-pointer"
                          >
                            <Lock className="h-3 w-3" />
                            <span>Lock</span>
                          </button>
                        )}

                        {dev.status !== 'banned' && (
                          <button
                            type="button"
                            disabled={busyId === dev.id}
                            onClick={() =>
                              void handlePatchDevice(
                                dev.id,
                                { status: 'banned' },
                                `Banned physical device ${dev.deviceLabel}.`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                          >
                            <Ban className="h-3 w-3" />
                            <span>Ban</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busyId === dev.id}
                          onClick={() => void handleDeleteDevice(dev)}
                          title="Delete device registration record"
                          className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
