"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type PercentMode = "of" | "what" | "change" | "addRemove" | "gst";

const MODES: { id: PercentMode; label: string; hint: string }[] = [
  { id: "of", label: "% of", hint: "What is X% of an amount" },
  { id: "what", label: "What %", hint: "A part is what % of a total" },
  { id: "change", label: "% Change", hint: "Increase / decrease between two amounts" },
  { id: "addRemove", label: "± %", hint: "Add or remove a % (GST, discount, markup)" },
  { id: "gst", label: "Ex-GST", hint: "Split a GST-inclusive total into base + GST" },
];

const QUICK_RATES = ["5", "12", "18", "28"];

/** Keeps only what a number field needs: digits, one dot, a leading minus. Commas are dropped. */
function sanitize(raw: string, allowNegative: boolean): string {
  let s = raw.replace(/,/g, "").replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, "");
  if (allowNegative) s = s.replace(/(?!^)-/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return s.slice(0, 15);
}

function num(s: string): number | null {
  if (s === "" || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Indian grouping (1,00,300), at most 2 decimals. */
function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

type Result = {
  /** Main figure shown big, already formatted (with % where it's a percent). */
  text: string;
  /** Raw value handed to Copy / "Use in calculator". */
  value: number;
  /** How the number was worked out, in one line. */
  breakdown: string;
  /** Optional second figure (e.g. the GST part, or the difference). */
  extra?: { label: string; text: string };
  tone?: "up" | "down";
};

function compute(mode: PercentMode, a: string, b: string, addMode: "add" | "remove"): Result | null {
  const x = num(a);
  const y = num(b);
  if (x === null || y === null) return null;
  switch (mode) {
    case "of": {
      // a = percent, b = amount
      const r = (x / 100) * y;
      return { text: fmt(r), value: r, breakdown: `${fmt(y)} × ${fmt(x)}% = ${fmt(r)}` };
    }
    case "what": {
      // a = part, b = total
      if (y === 0) return null;
      const r = (x / y) * 100;
      return { text: `${fmt(r)}%`, value: r, breakdown: `${fmt(x)} ÷ ${fmt(y)} × 100 = ${fmt(r)}%` };
    }
    case "change": {
      // a = from, b = to
      if (x === 0) return null;
      const diff = y - x;
      const r = (diff / Math.abs(x)) * 100;
      const sign = r > 0 ? "+" : "";
      return {
        text: `${sign}${fmt(r)}%`,
        value: r,
        breakdown: `(${fmt(y)} − ${fmt(x)}) ÷ ${fmt(Math.abs(x))} × 100`,
        extra: { label: r >= 0 ? "Increase" : "Decrease", text: `${diff > 0 ? "+" : ""}${fmt(diff)}` },
        tone: r > 0 ? "up" : r < 0 ? "down" : undefined,
      };
    }
    case "addRemove": {
      // a = amount, b = percent
      const part = (x * y) / 100;
      const r = addMode === "add" ? x + part : x - part;
      return {
        text: fmt(r),
        value: r,
        breakdown: `${fmt(x)} ${addMode === "add" ? "+" : "−"} ${fmt(y)}% (${fmt(part)}) = ${fmt(r)}`,
        extra: { label: addMode === "add" ? "Added" : "Removed", text: fmt(part) },
      };
    }
    case "gst": {
      // a = GST-inclusive total, b = GST percent
      if (y <= -100) return null;
      const base = x / (1 + y / 100);
      const tax = x - base;
      return {
        text: fmt(base),
        value: base,
        breakdown: `${fmt(x)} ÷ ${fmt(1 + y / 100)} = ${fmt(base)}`,
        extra: { label: `GST @ ${fmt(y)}%`, text: fmt(tax) },
      };
    }
  }
}

const FIELDS: Record<PercentMode, [{ label: string; suffix?: string; neg?: boolean }, { label: string; suffix?: string; neg?: boolean }]> = {
  of: [{ label: "Percentage", suffix: "%" }, { label: "Of amount" }],
  what: [{ label: "Part", neg: true }, { label: "Of total", neg: true }],
  change: [{ label: "From", neg: true }, { label: "To", neg: true }],
  addRemove: [{ label: "Amount", neg: true }, { label: "Percentage", suffix: "%" }],
  gst: [{ label: "Total incl. GST" }, { label: "GST rate", suffix: "%" }],
};

/** Which of the two fields holds the % (gets the quick-rate chips). */
const PERCENT_FIELD: Partial<Record<PercentMode, 0 | 1>> = { of: 0, addRemove: 1, gst: 1 };

const MODE_KEY = "canaan.calc.percentMode";

type Props = {
  /** Sends a result to the Basic tab's display. */
  onUseResult: (value: number) => void;
};

export function PercentageCalculator({ onUseResult }: Props) {
  const [mode, setMode] = useState<PercentMode>("of");
  const [values, setValues] = useState<Record<PercentMode, [string, string]>>({
    of: ["", ""], what: ["", ""], change: ["", ""], addRemove: ["", ""], gst: ["", "18"],
  });
  const [addMode, setAddMode] = useState<"add" | "remove">("add");
  const [copied, setCopied] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY) as PercentMode | null;
      if (saved && MODES.some((m) => m.id === saved)) setMode(saved);
    } catch { /* storage unavailable — default mode is fine */ }
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function pickMode(next: PercentMode) {
    setMode(next);
    try { window.localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
    requestAnimationFrame(() => firstInputRef.current?.focus());
  }

  function setField(i: 0 | 1, raw: string) {
    const neg = !!FIELDS[mode][i].neg;
    setValues((prev) => {
      const pair: [string, string] = [...prev[mode]];
      pair[i] = sanitize(raw, neg);
      return { ...prev, [mode]: pair };
    });
  }

  const [a, b] = values[mode];
  const result = compute(mode, a, b, addMode);
  const percentField = PERCENT_FIELD[mode];

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(String(Math.round(result.value * 100) / 100));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — nothing to do */ }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Modes */}
      <div className="grid grid-cols-5 gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.hint}
            onClick={() => pickMode(m.id)}
            className={cn(
              "rounded-lg px-1 py-1.5 text-[10.5px] font-semibold leading-tight transition-colors",
              mode === m.id ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-[11px] text-gray-400">{MODES.find((m) => m.id === mode)?.hint}</p>

      {/* Add / Remove switch */}
      {mode === "addRemove" && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          {(["add", "remove"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAddMode(k)}
              className={cn(
                "rounded-md py-1 text-xs font-semibold transition-colors",
                addMode === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {k === "add" ? "+ Add %" : "− Remove %"}
            </button>
          ))}
        </div>
      )}

      {/* Inputs */}
      {([0, 1] as const).map((i) => {
        const f = FIELDS[mode][i];
        return (
          <div key={`${mode}-${i}`} className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{f.label}</label>
            <div className="relative">
              <input
                ref={i === 0 ? firstInputRef : undefined}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values[mode][i]}
                onChange={(e) => setField(i, e.target.value)}
                placeholder="0"
                className={cn(
                  "h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-right text-sm font-semibold tabular-nums text-gray-900 outline-none transition-colors",
                  "focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/15",
                  f.suffix && "pr-8"
                )}
              />
              {f.suffix && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">{f.suffix}</span>
              )}
            </div>
            {percentField === i && (
              <div className="flex gap-1">
                {QUICK_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setField(i, r)}
                    className={cn(
                      "flex-1 rounded-md py-0.5 text-[11px] font-semibold transition-colors",
                      values[mode][i] === r ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Result */}
      <div className="rounded-xl bg-gray-900 px-4 py-3 text-right">
        <p className="h-4 truncate text-[11px] font-medium text-gray-400" title={result?.breakdown}>
          {result?.breakdown || " "}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-2xl font-bold tabular-nums",
            result?.tone === "up" ? "text-emerald-400" : result?.tone === "down" ? "text-red-400" : "text-gray-50"
          )}
        >
          {result ? result.text : "—"}
        </p>
        {result?.extra && (
          <p className="mt-0.5 truncate text-xs font-medium text-gray-400">
            {result.extra.label}: <span className="tabular-nums text-gray-200">{result.extra.text}</span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!result}
          className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => result && onUseResult(Math.round(result.value * 100) / 100)}
          disabled={!result}
          title="Send this result to the Basic calculator"
          className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-50 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40"
        >
          <CornerDownLeft className="h-3.5 w-3.5" />
          Use in calc
        </button>
      </div>
    </div>
  );
}
