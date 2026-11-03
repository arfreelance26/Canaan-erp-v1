"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

import { RiCheckLine as OkIcon, RiCloseLine as NoIcon } from "@remixicon/react";
export type GuideTab = "overview" | "final" | "salary" | "advance" | "halt" | "cleaner" | "workshop";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "final", label: "Salary Record" },
  { id: "salary", label: "Trip Salary Record" },
  { id: "advance", label: "Advance Record" },
  { id: "halt", label: "Halt Pay Record" },
  { id: "cleaner", label: "Cleaner Batta" },
  { id: "workshop", label: "Workshop Batta" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Tab to open on (the Salary/Advance Record dialogs open their own tab). */
  initialTab?: GuideTab;
};

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;

// One worked example, reused for every trip type so the only thing that
// changes between rows is the rule being explained.
const EX = { advance: 2000, expenses: 1500, batta: 1200 };
const EX_OUTSTANDING = EX.advance - EX.expenses;

const TRIP_TYPE_RULES: {
  type: string;
  note?: string;
  battaPaid: boolean;
}[] = [
  { type: "Local / Local CFS / Outstation / Shifting", battaPaid: true },
  { type: "Return Trip", note: "Is Batta Applicable = Yes", battaPaid: true },
  { type: "Return Trip", note: "Is Batta Applicable = No", battaPaid: false },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-caption-2-semibold text-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function FormulaRow({ name, formula, note }: { name: string; formula: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body-semibold text-text-primary">{name}</span>
        <span className="font-mono text-xs text-accent-text-strong">{formula}</span>
      </div>
      {note && <p className="text-xs leading-relaxed text-text-secondary">{note}</p>}
    </div>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone: "purple" | "emerald" | "slate" }) {
  const cls = {
    purple: "bg-purple-surface-strong text-purple-text",
    emerald: "bg-success-surface-strong text-success-text",
    slate: "bg-fill-2 text-text-secondary",
  }[tone];
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-caption-2-semibold", cls)}>{children}</span>;
}

/**
 * Driver Compensation → "How is this Calculated?": plain-language guide to the
 * Salary Record and Advance Record — including how each trip type (Return
 * Trip in particular) affects Net Payable.
 */
export function CompensationGuideDialog({ open, onClose, initialTab = "overview" }: Props) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog open={open} onClose={onClose} title="How is this Calculated?" className="max-w-3xl">
      {/* Tabs — the app's pill toggle */}
      <div role="tablist" className="mb-5 flex w-fit gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-caption-1-semibold transition duration-200",
              tab === t.id
                ? "bg-accent-solid text-on-solid shadow-md"
                : "text-text-secondary hover:bg-fill-2 hover:text-text-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex max-h-[62vh] flex-col gap-6 overflow-y-auto pr-1">
        {tab === "overview" && (
          <>
            <Section title="The two records">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                  <p className="text-body-semibold text-text-primary">Advance Record</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    Money given to the driver <span className="font-semibold text-text-primary">before or during</span> a trip,
                    to cover trip expenses like tolls, loading and food.
                  </p>
                </div>
                <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                  <p className="text-body-semibold text-text-primary">Trip Salary Record</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    What the driver is <span className="font-semibold text-text-primary">owed after</span> the trip: their batta,
                    minus any advance money still left with them.
                  </p>
                </div>
              </div>
            </Section>
            <Section title="Which trips count">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Only trips assigned to this driver.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>
                  <span><span className="font-semibold text-text-primary">Advance Record</span> needs the trip&apos;s closure;{" "}
                  <span className="font-semibold text-text-primary">Trip Salary Record</span> needs its trip sheet. Until then the amounts show as &ldquo;—&rdquo;.</span>
                </li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>
                  The <span className="font-semibold text-text-primary">This Month / Custom</span> filters use the trip&apos;s <span className="font-semibold text-text-primary">completion date</span>.
                </li>
              </ul>
            </Section>
          </>
        )}

        {tab === "final" && (
          <>
            <Section title="The driver's final pay for a period">
              <FormulaRow name="Trip Salary Record" formula="Total Net Payable of the trips" note="By trip completed date. Each trip's advance is already deducted here, so the Advance Record isn't counted again." />
              <FormulaRow name="+ Halt pay owed" formula="Company + party halt pay from Close Trip" note="By trip completed date — the Halt Pay Record." />
              <FormulaRow name="+ Cleaner Batta" formula="Present / On Trip / On Halt days × the branch fee" note="By attendance date — the Cleaner Batta Record." />
              <FormulaRow name="+ Workshop Batta" formula="On Workshop days × the branch fee" note="By attendance date — the Workshop Batta Record." />
              <FormulaRow name="− Workshop Advance" formula="Advance paid on On Workshop days" note="By attendance date — the Workshop Advance Record." />
              <FormulaRow name="= Final Net Payable" formula="What the driver is owed for the period" note="Negative means the driver owes money back." />
            </Section>
            <Section title="Good to know">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Every part uses the same rules as its own record, so the numbers always match those records.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Click a part to see the trips or days behind it.</li>
              </ul>
            </Section>
          </>
        )}

        {tab === "salary" && (
          <>
            <Section title="Step by step, for each trip">
              <FormulaRow
                name="Regular Pay (Batta)"
                formula="Driver Batta Amount on the trip"
                note="Set when the trip is assigned, by its Driver Compensation Type (see below)."
              />
              <FormulaRow name="Total Advance" formula="Advance given for the trip" note="Taken from the trip sheet." />
              <FormulaRow name="Driver Expenses" formula="What the driver spent" note="The driver's expenses on the trip sheet." />
              <FormulaRow
                name="Outstanding Advance"
                formula="Total Advance − Driver Expenses"
                note="Positive: advance money still in the driver's hand. Negative: the driver spent their own money, so the company owes it back."
              />
              <FormulaRow
                name="Net Payable"
                formula="Regular Pay − Outstanding Advance"
                note="What the driver is actually paid for this trip."
              />
            </Section>

            <Section title="How Regular Pay (Batta) is decided">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { t: "Normal", d: "A percentage of the hire amount (the route's Accounts Hire Amount, if one is set) — the percentage is set per branch." },
                  { t: "Default", d: "A fixed amount from Default Batta Management, by trip type and container." },
                  { t: "Custom", d: "Typed in on the trip. Return Trips always use Custom." },
                ].map((c) => (
                  <div key={c.t} className="rounded-xl border border-separator-border bg-background-primary-default p-3.5">
                    <p className="text-body-semibold text-text-primary">{c.t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{c.d}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="By trip type">
              <p className="text-xs text-text-secondary">
                Same example on every row: advance <span className="font-semibold text-text-primary">{inr(EX.advance)}</span>, driver spent{" "}
                <span className="font-semibold text-text-primary">{inr(EX.expenses)}</span> (so{" "}
                <span className="font-semibold text-text-primary">{inr(EX_OUTSTANDING)}</span> is left with the driver), batta{" "}
                <span className="font-semibold text-text-primary">{inr(EX.batta)}</span>.
              </p>
              <div className="overflow-x-auto rounded-xl border border-separator-border">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-separator-border bg-fill-1">
                    <tr>
                      {["Trip type", "Batta paid?", "Leftover advance deducted?", "Net Payable"].map((h) => (
                        <th key={h} className="px-3.5 py-2.5 text-caption-2-semibold text-text-tertiary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border bg-background-primary-default">
                    {TRIP_TYPE_RULES.map((r, i) => {
                      const net = (r.battaPaid ? EX.batta : 0) - EX_OUTSTANDING;
                      return (
                        <tr key={i} className={!r.battaPaid ? "bg-purple-surface/40" : ""}>
                          <td className="px-3.5 py-3">
                            <span className="font-semibold text-text-primary">{r.type}</span>
                            {r.note && <span className="block text-xs text-text-secondary">{r.note}</span>}
                          </td>
                          <td className="px-3.5 py-3 text-text-primary">{r.battaPaid ? "Yes" : "No"}</td>
                          <td className="px-3.5 py-3 text-text-primary">Yes</td>
                          <td className="px-3.5 py-3">
                            <span className={cn("font-semibold tabular-nums", net < 0 ? "text-danger-text" : "text-success-text")}>{inr(net)}</span>
                            <span className="block text-[11px] text-text-tertiary">
                              {r.battaPaid ? `${inr(EX.batta)} − ${inr(EX_OUTSTANDING)}` : `₹0 − ${inr(EX_OUTSTANDING)}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Return Trips, in simple words">
              <div className="flex flex-col gap-2 rounded-xl border border-purple-border bg-purple-surface/50 p-4 text-sm leading-relaxed text-text-secondary">
                <p>
                  A return trip&apos;s batta is normally <span className="font-semibold text-text-primary">already paid with the outbound trip</span>,
                  so it isn&apos;t paid again — unless <span className="font-semibold text-text-primary">Is Batta Applicable</span> is set to Yes on that trip.
                </p>
                <p>
                  But a return trip can still have a <span className="font-semibold text-text-primary">Driver Advance</span>. Any of it left with the
                  driver is <span className="font-semibold text-text-primary">always deducted</span> from their pay, so it&apos;s never forgotten.
                  In the example, the driver gets no batta and the {inr(EX_OUTSTANDING)} left over is taken off — a Net Payable of{" "}
                  <span className="font-semibold text-danger-text">{inr(-EX_OUTSTANDING)}</span>.
                </p>
              </div>
            </Section>

            <Section title="Tags you'll see in the table">
              <div className="flex flex-col gap-2 text-sm text-text-secondary">
                <p><Tag tone="purple">Batta Excluded</Tag> <span className="ml-1">Return Trip with Is Batta Applicable = No — batta not paid, leftover advance still deducted.</span></p>
                <p><Tag tone="emerald">Batta Applicable</Tag> <span className="ml-1">Return Trip whose batta is still owed — paid like any other trip.</span></p>
                <p><Tag tone="slate">*</Tag> <span className="ml-1">On Net Payable: that amount is only the leftover advance being deducted.</span></p>
              </div>
            </Section>

            <Section title="Total Net Payable">
              <p className="text-sm leading-relaxed text-text-secondary">
                The sum of Net Payable for every trip in the selected period — every trip counts, including Return Trips. This is the amount
                <span className="font-semibold text-text-primary"> Record Salary Payment</span> pays out. It can come out lower than the batta total
                when advance money is still with the driver.
              </p>
            </Section>
          </>
        )}

        {tab === "halt" && (
          <>
            <Section title="What a halt is">
              <p className="text-sm leading-relaxed text-text-secondary">
                When a truck sits idle for days, the driver is still owed for those days. They&apos;re entered at{" "}
                <span className="font-semibold text-text-primary">Close Trip → Halt Information</span>, split by whose fault it was:
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                  <p className="text-body-semibold text-text-primary">Company Halt</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">The delay was caused by the company. Counted as the company&apos;s own trip expense.</p>
                </div>
                <div className="rounded-xl border border-warning-border bg-warning-surface/50 p-4">
                  <p className="text-body-semibold text-text-primary">Party Halt</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">The delay was caused by the customer. The driver is still paid, and the amount is recoverable from the customer.</p>
                </div>
              </div>
            </Section>
            <Section title="How the amount is worked out">
              <FormulaRow
                name="Rate per Day"
                formula="Branch fee — Company or Customer, 20 FT or 40 FT"
                note="Set per branch in Branch Management: a Company Halt Fee for company-caused days and a Customer Halt Fee for customer-caused days. Taken when the trip is closed — a later change to the fees doesn't alter closed trips."
              />
              <FormulaRow name="Amount Owed" formula="Halt Days × that type's Rate per Day" note="Company and Party halt days are each priced at their own rate." />
              <p className="text-xs text-text-secondary">
                Example: Company fee ₹500, Customer fee ₹600. 1 company day and 2 party days — Company <span className="font-semibold text-text-primary">₹500</span>, Party{" "}
                <span className="font-semibold text-text-primary">₹1,200</span>, Total Owed <span className="font-semibold text-text-primary">₹1,700</span>.
              </p>
            </Section>
            <Section title="Good to know">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Each trip shows one row per halt type, so a trip with both shows two rows.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Halt pay isn&apos;t part of the Trip Salary Record, but it <span className="font-semibold text-text-primary">is added in the Salary Record</span> (the driver&apos;s final pay).</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>This record is view-only: it shows what&apos;s owed, and payments are handled by the admins.</li>
              </ul>
            </Section>
          </>
        )}

        {tab === "cleaner" && (
          <>
            <Section title="What it is">
              <p className="text-sm leading-relaxed text-text-secondary">
                A daily amount the driver earns for every day they work, based on their <span className="font-semibold text-text-primary">attendance</span>.
                Each branch has a <span className="font-semibold text-text-primary">Cleaner Batta Fee</span> for each vehicle type in Branch Management, and the type is picked when the driver is marked in Driver Attendance.
              </p>
            </Section>
            <Section title="Which days count">
              <div className="flex flex-wrap gap-2 text-xs">
                {["Present", "On Trip", "On Halt"].map((s) => (
                  <span key={s} className="rounded-full bg-success-surface-strong px-2.5 py-1 font-semibold text-success-text inline-flex items-center gap-1"><OkIcon className="size-3.5" />{s}</span>
                ))}
                {["Absent", "Leave", "On Leave", "Not Marked", "On Workshop"].map((s) => (
                  <span key={s} className="rounded-full bg-fill-2 px-2.5 py-1 font-semibold text-text-secondary inline-flex items-center gap-1"><NoIcon className="size-3.5" />{s}</span>
                ))}
              </div>
            </Section>
            <Section title="How each day is priced">
              <FormulaRow name="Truck that day" formula="Trip → assigned truck → current truck" note="The truck on the trip the driver was on that day; otherwise the truck they were assigned to that day; otherwise their current truck." />
              <FormulaRow name="Branch that day" formula="That truck's branch on that day" note="Follows the truck's branch history, so a branch change mid-month is handled day by day." />
              <FormulaRow name="Vehicle type" formula="20FT, 40FT, 2×20FT or Open Load" note="Picked when the day is marked On Trip or On Halt. Days marked before this have no type and keep the branch's earlier single fee." />
              <FormulaRow name="Amount" formula="That branch's Cleaner Batta Fee for that vehicle type on that day" note="A changed fee only applies from the day it's changed — past days keep the fee they had. (A branch's very first fee also covers the days before it.)" />
            </Section>
            <Section title="Good to know">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Days with no truck, no branch, or a ₹0 fee are highlighted so they can be checked.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Cleaner Batta isn&apos;t part of the Trip Salary Record, but it is added in the Salary Record (the driver&apos;s final pay). This record is view-only.</li>
              </ul>
            </Section>
          </>
        )}

        {tab === "workshop" && (
          <>
            <Section title="What it is">
              <p className="text-sm leading-relaxed text-text-secondary">
                A daily amount the driver earns for every day they&apos;re marked <span className="font-semibold text-text-primary">On Workshop</span> in attendance
                (the truck is in for repairs and the driver is with it). Each branch&apos;s daily amount is its{" "}
                <span className="font-semibold text-text-primary">On Workshop Batta Fee</span> in Branch Management.
              </p>
            </Section>
            <Section title="Which days count">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-purple-surface-strong px-2.5 py-1 font-semibold text-purple-text inline-flex items-center gap-1"><OkIcon className="size-3.5" />On Workshop</span>
                {["Present", "On Trip", "On Halt", "Absent", "Leave", "Not Marked"].map((s) => (
                  <span key={s} className="rounded-full bg-fill-2 px-2.5 py-1 font-semibold text-text-secondary inline-flex items-center gap-1"><NoIcon className="size-3.5" />{s}</span>
                ))}
              </div>
            </Section>
            <Section title="How each day is priced">
              <FormulaRow name="Truck that day" formula="Assigned truck → current truck" note="The truck the driver was assigned to that day; otherwise their current truck." />
              <FormulaRow name="Branch that day" formula="That truck's branch on that day" note="Follows the truck's branch history." />
              <FormulaRow name="Amount" formula="That branch's On Workshop Batta Fee on that day" note="A changed fee only applies from the day it's changed — past days keep the fee they had. (A branch's very first fee also covers the days before it.)" />
            </Section>
            <Section title="Good to know">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Days with no truck, no branch, or a ₹0 fee are highlighted so they can be checked.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>On Workshop days earn Workshop Batta, not Cleaner Batta. This record is view-only; payments are handled by the admins.</li>
              </ul>
            </Section>
          </>
        )}

        {tab === "advance" && (
          <>
            <Section title="For each trip">
              <FormulaRow name="Driver Advance" formula="From the trip closure" note="The advance handed over for the trip." />
              <FormulaRow name="Additional Driver Advance" formula="From the trip closure" note="Any extra advance given during the trip." />
              <FormulaRow name="Total Advance" formula="Driver Advance + Additional Driver Advance" />
            </Section>
            <Section title="Good to know">
              <ul className="flex flex-col gap-2 text-sm text-text-secondary">
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>Trips without a closure yet show &ldquo;—&rdquo; and don&apos;t add to the total.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>All trip types are included the same way — Return Trips too.</li>
                <li className="flex gap-2"><span className="text-text-tertiary">•</span>
                  What the driver doesn&apos;t spend from these advances is the <span className="font-semibold text-text-primary">Outstanding Advance</span>{" "}
                  that the Trip Salary Record later deducts from their pay.
                </li>
              </ul>
            </Section>
          </>
        )}
      </div>
    </Dialog>
  );
}
