"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lock,
  ShieldAlert,
  RefreshCw,
  Clock,
  User,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Unlock,
  Download,
  Search,
  X,
  Eye,
  Smartphone,
} from "lucide-react";
import { securityApi, fileUrl, type AuditLogEntry, type LockoutEntry } from "@/lib/api";
import { showSuccess, showError, confirmAction } from "@/lib/swal";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const EVENT_LABELS: Record<string, string> = {
  "login.success": "Login — Success",
  "login.failure": "Login — Failed",
  logout: "Logout",
  "file.download": "Document Download",
  "file.upload": "File Upload",
};

const EVENT_FILTERS = [
  { value: "", label: "All Events" },
  { value: "login.success", label: "Logins" },
  { value: "login.failure", label: "Failed Logins" },
  { value: "logout", label: "Logouts" },
  { value: "file.download", label: "Doc Downloads" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).replace(/\//g, "-");
}

function formatMinutes(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return `${m} min${m !== 1 ? "s" : ""}`;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "success")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/30 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Success
      </span>
    );
  if (outcome === "failure")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-100 dark:text-red-400">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <AlertTriangle className="h-3 w-3" /> {outcome}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function SecurityLogPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [eventFilter, setEventFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [auditLoading, setAuditLoading] = useState(true);

  const [lockouts, setLockouts] = useState<LockoutEntry[]>([]);
  const [lockoutsLoading, setLockoutsLoading] = useState(true);
  const [resettingKey, setResettingKey] = useState<string | null>(null);

  // Device lock settings
  const [dlEnabled, setDlEnabled] = useState(true);
  const [dlLimit, setDlLimit] = useState(2);
  const [dlStaffLimit, setDlStaffLimit] = useState(1);
  const [dlLoading, setDlLoading] = useState(true);
  const [dlSaving, setDlSaving] = useState(false);
  const [dlResetting, setDlResetting] = useState(false);

  const [showIpHelp, setShowIpHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");

  const REFRESH_INTERVAL = 30;

  useEffect(() => {
    if (user && user.softwareDesignation !== "Admin") {
      router.replace("/");
    }
  }, [user, router]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const result = await securityApi.getAuditLogs({
        skip: auditPage * PAGE_SIZE,
        limit: PAGE_SIZE,
        event: eventFilter || undefined,
        user: userFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setAuditLogs(result.items);
      setAuditTotal(result.total);
    } catch {
      // silently ignore — user sees empty table
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, eventFilter, userFilter, dateFrom, dateTo]);

  const fetchLockouts = useCallback(async () => {
    setLockoutsLoading(true);
    try {
      const result = await securityApi.getLockouts();
      setLockouts(result.items);
    } catch {
      setLockouts([]);
    } finally {
      setLockoutsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    void fetchLockouts();
  }, [fetchLockouts]);

  async function handleResetLockout(ipAddress: string, username: string) {
    const key = `${ipAddress}|${username}`;
    setResettingKey(key);
    try {
      await securityApi.resetLockout(ipAddress, username);
      await showSuccess("Lockout cleared", `${username} can now log in again from ${ipAddress}.`);
      void fetchLockouts();
    } catch {
      void showError("Failed to reset lockout. Please try again.");
    } finally {
      setResettingKey(null);
    }
  }

  const fetchDeviceLock = useCallback(async () => {
    setDlLoading(true);
    try {
      const s = await securityApi.getDeviceLock();
      setDlEnabled(s.enabled);
      setDlLimit(s.adminLimit);
      setDlStaffLimit(s.staffLimit);
    } catch {
      // leave defaults
    } finally {
      setDlLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDeviceLock();
  }, [fetchDeviceLock]);

  async function handleSaveDeviceLock() {
    setDlSaving(true);
    try {
      const s = await securityApi.updateDeviceLock({ enabled: dlEnabled, adminLimit: dlLimit, staffLimit: dlStaffLimit });
      setDlEnabled(s.enabled);
      setDlLimit(s.adminLimit);
      setDlStaffLimit(s.staffLimit);
      await showSuccess("Device lock settings saved.");
    } catch (err) {
      void showError(err instanceof Error ? err.message : "Failed to save device lock settings.");
    } finally {
      setDlSaving(false);
    }
  }

  async function handleResetAllDevices() {
    const result = await confirmAction(
      "Reset ALL device locks?",
      "Every staff member's device binding will be cleared. They will each re-bind on their next login. This cannot be undone.",
      "Reset all",
    );
    if (!result.isConfirmed) return;
    setDlResetting(true);
    try {
      const r = await securityApi.resetAllDevices();
      await showSuccess(`Cleared ${r.cleared} device binding${r.cleared === 1 ? "" : "s"}.`);
    } catch (err) {
      void showError(err instanceof Error ? err.message : "Failed to reset device locks.");
    } finally {
      setDlResetting(false);
    }
  }

  useEffect(() => {
    setAuditPage(0);
  }, [eventFilter, userFilter, dateFrom, dateTo]);

  // Auto-refresh every 30 s silently in the background
  useEffect(() => {
    const id = setInterval(() => {
      void fetchAuditLogs();
      void fetchLockouts();
    }, REFRESH_INTERVAL * 1000);
    return () => clearInterval(id);
  }, [fetchAuditLogs, fetchLockouts]);

  const totalPages = Math.ceil(auditTotal / PAGE_SIZE);

  async function fetchAllLogsForExport(): Promise<AuditLogEntry[]> {
    const result = await securityApi.getAuditLogs({ skip: 0, limit: 10000, event: eventFilter || undefined, user: userFilter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    return result.items;
  }

  function triggerDownload(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportJSON() {
    setExporting(true);
    try {
      const rows = await fetchAllLogsForExport();
      const data = rows.map((r) => ({
        id: r.id,
        date_time_ist: formatDateTime(r.createdAt),
        event: r.event,
        outcome: r.outcome,
        user: r.actorName ?? "",
        role: r.actorRole ?? "",
        ip_address: r.ipAddress ?? "",
        resource: r.resource ?? "",
        detail: r.detail ?? "",
      }));
      triggerDownload(JSON.stringify(data, null, 2), `audit-log-${Date.now()}.json`, "application/json");
    } finally {
      setExporting(false);
    }
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const rows = await fetchAllLogsForExport();
      const headers = ["ID", "Date & Time (IST)", "Event", "Outcome", "User", "Role", "IP Address", "Resource", "Detail"];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.id,
            escape(formatDateTime(r.createdAt)),
            escape(r.event),
            escape(r.outcome),
            escape(r.actorName ?? ""),
            escape(r.actorRole ?? ""),
            escape(r.ipAddress ?? ""),
            escape(r.resource ?? ""),
            escape(r.detail ?? ""),
          ].join(",")
        ),
      ];
      triggerDownload(lines.join("\n"), `audit-log-${Date.now()}.csv`, "text/csv");
    } finally {
      setExporting(false);
    }
  }

  if (!user || user.softwareDesignation !== "Admin") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/10">
          <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security Log</h1>
          <p className="text-sm text-gray-500">
            Monitor logins, document access, and active lockouts — visible to Admin only
          </p>
        </div>
      </div>

      {/* ── Section 0: Device Lock Settings ── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <Smartphone className="h-5 w-5 text-blue-500" />
          <h2 className="font-semibold text-gray-900">Device Lock</h2>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-[#0f1f3d]">
            <p className="text-sm text-blue-800 dark:text-white">
              <strong>What is this? </strong> <br/>Device lock ties each staff account to the machine(s) it first logs
              in from, so a password alone can&apos;t be used from an unknown computer. Regular staff are limited to
              1 device; Admins can use several (e.g. desktop + mobile app). If someone is stuck on
              &quot;locked to another device&quot;, clear their binding on the Staff page, or reset everyone below.
            </p>
          </div>

          {dlLoading ? (
            <div className="flex items-center py-4 text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Enforce device lock</p>
                  <p className="text-xs text-gray-500">
                    When off, anyone can log in from any device — no binding is checked or created.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dlEnabled}
                  onClick={() => setDlEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    dlEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      dlEnabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Admin device limit */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Admin device limit</p>
                  <p className="text-xs text-gray-500">
                    How many devices each Admin account may use at once (desktop web + mobile app, etc.).
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={dlLimit}
                  onChange={(e) => setDlLimit(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-sm text-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Staff device limit */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Staff device limit</p>
                  <p className="text-xs text-gray-500">
                    How many devices each non-Admin staff account may use at once. Default 1.
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={dlStaffLimit}
                  onChange={(e) => setDlStaffLimit(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-sm text-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => void handleResetAllDevices()}
                  disabled={dlResetting}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-200 dark:text-red-400"
                >
                  {dlResetting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                  Reset all device locks
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveDeviceLock()}
                  disabled={dlSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {dlSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save settings
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 1: Active Lockouts ── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            <h2 className="font-semibold text-gray-900">Active Login Lockouts</h2>
            {lockouts.length > 0 && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                {lockouts.length} locked
              </span>
            )}
          </div>
          <button
            onClick={() => void fetchLockouts()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${lockoutsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="p-5">
          {/* What is a lockout — plain English */}
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-[#0f1f3d]">
            <p className="text-sm text-blue-800 dark:text-white">
              <strong>What is this?</strong> If someone enters the wrong password 5 times in a row, their login is
              temporarily blocked for 15 minutes to protect the system. This table shows who is currently blocked and
              from which network address (IP).
            </p>
          </div>

          {lockoutsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : lockouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-gray-400">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">No active lockouts</p>
              <p className="text-xs text-gray-400">All login access is normal right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 pr-4 font-semibold text-gray-600">Username (attempted)</th>
                    <th className="pb-2 pr-4 font-semibold text-gray-600">IP Address</th>
                    <th className="pb-2 pr-4 font-semibold text-gray-600">Failed Attempts</th>
                    <th className="pb-2 pr-4 font-semibold text-gray-600">Unlocks In</th>
                    <th className="pb-2 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lockouts.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1.5 font-medium text-gray-800">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          {row.username}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1.5 font-mono text-xs text-gray-700">
                          <Globe className="h-3.5 w-3.5 text-gray-400" />
                          {row.ipAddress}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {row.failedAttempts} attempts
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                          <Clock className="h-3.5 w-3.5" />
                          {formatMinutes(row.lockedUntilSeconds)}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => void handleResetLockout(row.ipAddress, row.username)}
                          disabled={resettingKey === `${row.ipAddress}|${row.username}`}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                        >
                          {resettingKey === `${row.ipAddress}|${row.username}` ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                          Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* How to find your IP — non-technical instructions */}
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <button
              onClick={() => setShowIpHelp((v) => !v)}
              className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                How to find your computer&apos;s IP address
              </span>
              <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${showIpHelp ? "rotate-90" : ""}`} />
            </button>

            {showIpHelp && (
              <div className="border-t border-gray-200 bg-white px-4 py-4">
                <p className="mb-3 text-xs text-gray-500">
                  An IP address is like your computer&apos;s home address on the network. If you see a suspicious IP in
                  the lockout table, you can check it against the computers in the office using these steps:
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-gray-800">
                      Windows (any laptop/desktop)
                    </p>
                    <ol className="space-y-1.5 text-xs text-gray-600">
                      <li>1. Press the <kbd className="rounded border border-gray-300 bg-white px-1 py-0.5 font-mono">Windows</kbd> key</li>
                      <li>2. Type <strong className="text-gray-800">cmd</strong> and press Enter</li>
                      <li>3. In the black window, type <strong className="text-gray-800">ipconfig</strong> and press Enter</li>
                      <li>4. Look for <strong className="text-gray-800">IPv4 Address</strong> — that is your IP
                        <span className="mt-1 block font-mono text-blue-600 dark:text-blue-400">Example: 192.168.1.25</span>
                      </li>
                    </ol>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-gray-800">
                      Mac (MacBook)
                    </p>
                    <ol className="space-y-1.5 text-xs text-gray-600">
                      <li>1. Click the Apple menu → <strong className="text-gray-800">System Settings</strong></li>
                      <li>2. Click <strong className="text-gray-800">Network</strong></li>
                      <li>3. Click your active connection (Wi-Fi or Ethernet)</li>
                      <li>4. Your IP is shown next to <strong className="text-gray-800">IP Address</strong>
                        <span className="mt-1 block font-mono text-blue-600 dark:text-blue-400">Example: 192.168.1.30</span>
                      </li>
                    </ol>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  If the locked IP matches a computer in the office, speak to that person. If it is an unfamiliar
                  address, it may be an outsider — contact your IT support.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 2: Audit Trail ── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4 space-y-3">
          {/* Row 1: title + export + refresh */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-5 w-5 shrink-0 text-indigo-500" />
              <h2 className="whitespace-nowrap font-semibold text-gray-900">Audit Trail</h2>
              <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {auditTotal} records
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void exportCSV()}
                disabled={exporting}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                CSV
              </button>
              <button
                onClick={() => void exportJSON()}
                disabled={exporting}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                JSON
              </button>
              <button
                onClick={() => void fetchAuditLogs()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Row 2: filters */}
          <div className="flex items-center gap-2">
            {/* User filter */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Filter by user…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-40 rounded-lg border border-gray-200 bg-white py-1.5 pl-7 pr-7 text-xs text-gray-700 placeholder:text-gray-400"
              />
              {userFilter && (
                <button
                  onClick={() => setUserFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                title="From date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                title="To date"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="rounded p-1 text-gray-400 hover:text-gray-600"
                  title="Clear dates"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Event type */}
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
            >
              {EVENT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {auditLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No audit records found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Date &amp; Time (IST)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Event</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">User</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">IP Address</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Outcome</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="font-medium text-gray-800">
                        {EVENT_LABELS[row.event] ?? row.event}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <User className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        {row.actorName ?? <span className="text-gray-400">—</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                      {row.actorRole ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="flex items-center gap-1.5 font-mono text-xs text-gray-600">
                        <Globe className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        {row.ipAddress ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <OutcomeBadge outcome={row.outcome} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {row.event === "file.download" && row.resource ? (() => {
                        const parts = row.resource.split("/");
                        const url = parts.length >= 3 ? fileUrl(parts[0], parts[1], parts[2]) : null;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-600 dark:text-indigo-400">{row.resource}</span>
                            {url && (
                              <button
                                onClick={() => { setPreviewUrl(url); setPreviewLabel(row.resource ?? ""); }}
                                className="flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:text-indigo-400"
                              >
                                <Eye className="h-3 w-3" /> Preview
                              </button>
                            )}
                          </div>
                        );
                      })() : row.resource ? (
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">{row.resource}</span>
                      ) : (
                        row.detail ?? "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination — always visible when there are records */}
        {auditTotal > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
            <span className="text-xs text-gray-500">
              Showing {auditPage * PAGE_SIZE + 1}–{Math.min((auditPage + 1) * PAGE_SIZE, auditTotal)} of {auditTotal} records
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={auditPage === 0}
                onClick={() => setAuditPage((p) => p - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-600">
                Page {auditPage + 1} of {Math.max(totalPages, 1)}
              </span>
              <button
                disabled={auditPage >= totalPages - 1}
                onClick={() => setAuditPage((p) => p + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Document Preview Modal ── */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-white">Document Preview</span>
                <span className="font-mono text-xs text-gray-400">{previewLabel}</span>
              </div>
              <button
                onClick={() => setPreviewUrl(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Preview area */}
            <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-50 p-4 dark:bg-gray-800">
              <img
                src={previewUrl}
                alt="Document preview"
                className="max-h-[75vh] max-w-full rounded-lg object-contain shadow"
                onError={(e) => {
                  // Not an image — swap to iframe for PDF / other types
                  const target = e.currentTarget;
                  const parent = target.parentElement;
                  if (parent) {
                    target.remove();
                    const frame = document.createElement("iframe");
                    frame.src = previewUrl;
                    frame.className = "h-[75vh] w-full rounded-lg border-0";
                    frame.title = "Document preview";
                    parent.appendChild(frame);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
