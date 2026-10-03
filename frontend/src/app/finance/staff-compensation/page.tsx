"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { CompensationTable, type CompensationPerson } from "@/components/compensation/CompensationTable";
import { PaymentDialog } from "@/components/compensation/PaymentDialog";
import { TransactionHistoryDialog } from "@/components/compensation/TransactionHistoryDialog";
import { Banknote, History, Plus, Trash2 } from "lucide-react";
import { staffApi, financeApi, type CompensationEditEventRow } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { CompensationTransaction } from "@/types/compensation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";

const EDIT_EVENT_ICON: Record<CompensationEditEventRow["event"], typeof Plus> = {
  "Transaction Added": Plus,
  "Transaction Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<CompensationEditEventRow["event"], string> = {
  "Transaction Added": "bg-blue-100 text-blue-700",
  "Transaction Deleted": "bg-red-100 text-red-700",
};

export default function StaffCompensationPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<CompensationPerson | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompensationPerson | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<CompensationEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every staff salary
  // transaction ever added or deleted — searching by staff name doubles as
  // that staff member's own history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    financeApi.listCompensationEditEvents("staff")
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
        Promise.all([staffApi.list(), financeApi.listStaffCompensation()])
          .then(([s, tx]) => {
            setStaffList(s);
            setTransactions(tx);
          })
          .catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));


  const people: CompensationPerson[] = useMemo(
    () =>
      staffList.map((staff) => ({
        id: staff.id,
        photoUrl: staff.photoUrl,
        name: staff.name,
        status: "Active",
      })),
    [staffList]
  );

  function handlePaySalary(person: CompensationPerson) {
    setPaymentTarget(person);
  }

  async function handleSavePayment(payment: { amount: number; date: string; note: string }) {
    if (!paymentTarget) return;
    try {
      const created = await financeApi.addStaffCompensation(
        paymentTarget.id,
        "Salary",
        payment.amount,
        payment.date,
        payment.note
      );
      setTransactions((prev) => [...prev, created]);
      setPaymentTarget(null);
      showSuccess("Salary payment recorded successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to record salary payment.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  const filteredPeople = people.filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
            <Banknote className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Staff Compensation</h1>
            <p className="mt-0.5 text-sm text-gray-500">Pay salaries to staff members</p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search staff..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/staff-compensation"
            filename="staff_compensation.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <CompensationTable
        people={filteredPeople}
        showAdvance={false}
        onPayAdvance={() => {}}
        onPaySalary={handlePaySalary}
        onViewHistory={setHistoryTarget}
        photoLabel="Staff Photo"
        nameLabel="Staff Name"
      />

      <PaymentDialog
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        onSave={handleSavePayment}
        type="Salary"
        personName={paymentTarget?.name ?? ""}
      />

      <TransactionHistoryDialog
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        personName={historyTarget?.name ?? ""}
        transactions={transactions.filter((transaction) => transaction.personId === historyTarget?.id)}
      />

      {/* Edit History — every Add/Delete ever logged, across every staff
          member's salary transactions (not just the ones currently on this
          page), in one searchable log instead of having to open each staff
          member's own transaction history individually. A deleted
          transaction's row still shows since it's logged as a snapshot,
          not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by staff name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              (ev.personName ?? "").toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No compensation edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Staff</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Transaction</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.personName ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{ev.txType} · ₹{Number(ev.amount).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{ev.actorName}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
