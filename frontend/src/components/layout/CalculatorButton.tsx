"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { RiCalculatorLine as CalculatorIcon, RiDeleteBack2Line as Delete } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { PercentageCalculator } from "./PercentageCalculator";

type Operator = "+" | "-" | "×" | "÷";

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  // Trim floating-point noise (e.g. 0.1 + 0.2) without mangling large integers.
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toString();
}

function apply(a: number, b: number, op: Operator): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
  }
}

type CalcState = {
  display: string;
  accumulator: number | null;
  operator: Operator | null;
  overwrite: boolean;
  expression: string;
};

const INITIAL_STATE: CalcState = {
  display: "0",
  accumulator: null,
  operator: null,
  overwrite: true,
  expression: "",
};

type CalcAction =
  | { type: "DIGIT"; digit: string }
  | { type: "DECIMAL" }
  | { type: "BACKSPACE" }
  | { type: "TOGGLE_SIGN" }
  | { type: "PERCENT" }
  | { type: "OPERATOR"; op: Operator }
  | { type: "EQUALS" }
  | { type: "RESET" }
  | { type: "LOAD"; value: number };

// A single reducer keeps every transition atomic, so the keyboard listener
// never needs to re-bind when state changes (see the effect below) — that
// re-binding was the source of dropped/garbled keystrokes when typing fast,
// since keydown events can fire faster than React re-runs the effect.
function calcReducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case "DIGIT": {
      if (state.overwrite) {
        return { ...state, display: action.digit, overwrite: false };
      }
      const { display } = state;
      const next = display === "0" ? action.digit : display.length < 15 ? display + action.digit : display;
      return { ...state, display: next };
    }
    case "DECIMAL": {
      if (state.overwrite) return { ...state, display: "0.", overwrite: false };
      if (state.display.includes(".")) return state;
      return { ...state, display: state.display + "." };
    }
    case "BACKSPACE": {
      if (state.overwrite) return state;
      const next = state.display.length > 1 ? state.display.slice(0, -1) : "0";
      return { ...state, display: next };
    }
    case "TOGGLE_SIGN": {
      const { display } = state;
      if (display === "0") return state;
      return { ...state, display: display.startsWith("-") ? display.slice(1) : "-" + display };
    }
    case "PERCENT": {
      const value = parseFloat(state.display);
      if (!Number.isFinite(value)) return state;
      return { ...state, display: formatResult(value / 100), overwrite: true };
    }
    case "OPERATOR": {
      const { op } = action;
      const current = parseFloat(state.display);
      if (state.accumulator === null) {
        return { ...state, accumulator: current, operator: op, overwrite: true, expression: `${state.display} ${op}` };
      }
      if (!state.overwrite) {
        const result = apply(state.accumulator, current, state.operator as Operator);
        return { ...state, accumulator: result, operator: op, overwrite: true, expression: `${formatResult(result)} ${op}` };
      }
      // Operator pressed again before entering a new number — just swap it.
      return { ...state, operator: op, overwrite: true, expression: `${formatResult(state.accumulator)} ${op}` };
    }
    case "EQUALS": {
      if (state.operator === null || state.accumulator === null) return state;
      const current = parseFloat(state.display);
      const result = apply(state.accumulator, current, state.operator);
      return {
        ...state,
        expression: `${formatResult(state.accumulator)} ${state.operator} ${state.display} =`,
        display: formatResult(result),
        accumulator: null,
        operator: null,
        overwrite: true,
      };
    }
    case "RESET":
      return INITIAL_STATE;
    case "LOAD":
      // A result handed over from the Percentage tab — starts a fresh calculation from it.
      return { ...INITIAL_STATE, display: formatResult(action.value) };
  }
}

const KEY_CLASS =
  "flex h-12 items-center justify-center rounded-xl text-headline-semibold transition duration-100";

// Maps a physical keydown to the on-screen button it corresponds to, so we
// can flash that button for tactile feedback on keyboard input.
const KEY_TO_BUTTON: Record<string, string> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", "+": "+", "-": "-", "*": "×", x: "×", X: "×",
  "/": "÷", "%": "%", Enter: "=", "=": "=",
  Backspace: "back", Delete: "C", Escape: "C", c: "C", C: "C",
};

type CalcTab = "basic" | "percent";
const TAB_KEY = "canaan.calc.tab";

export function CalculatorButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CalcTab>("basic");
  const [state, dispatch] = useReducer(calcReducer, INITIAL_STATE);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Remember the last-used tab (per browser).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TAB_KEY) === "percent") setTab("percent");
    } catch { /* storage unavailable — Basic is fine */ }
  }, []);

  function switchTab(next: CalcTab) {
    setTab(next);
    try { window.localStorage.setItem(TAB_KEY, next); } catch { /* ignore */ }
  }

  function flash(buttonId: string) {
    setFlashKey(buttonId);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashKey(null), 120);
  }

  // Bound once per popover open — dispatch is stable and the reducer keeps
  // every transition atomic, so fast typing can never race a stale closure.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      // The Percentage tab types into its own fields — the keypad shortcuts
      // stay off there, so a keystroke never lands in both. Esc just closes.
      if (tab === "percent") {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        dispatch({ type: "DIGIT", digit: e.key });
        flash(e.key);
        return;
      }
      const buttonId = KEY_TO_BUTTON[e.key];
      switch (e.key) {
        case ".":
          e.preventDefault();
          dispatch({ type: "DECIMAL" });
          break;
        case "+":
          e.preventDefault();
          dispatch({ type: "OPERATOR", op: "+" });
          break;
        case "-":
          e.preventDefault();
          dispatch({ type: "OPERATOR", op: "-" });
          break;
        case "*":
        case "x":
        case "X":
          e.preventDefault();
          dispatch({ type: "OPERATOR", op: "×" });
          break;
        case "/":
          e.preventDefault();
          dispatch({ type: "OPERATOR", op: "÷" });
          break;
        case "%":
          e.preventDefault();
          dispatch({ type: "PERCENT" });
          break;
        case "Enter":
        case "=":
          e.preventDefault();
          dispatch({ type: "EQUALS" });
          break;
        case "Backspace":
          e.preventDefault();
          dispatch({ type: "BACKSPACE" });
          break;
        case "Delete":
        case "Escape":
        case "c":
        case "C":
          e.preventDefault();
          dispatch({ type: "RESET" });
          break;
        default:
          return;
      }
      if (buttonId) flash(buttonId);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, tab]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const { display, expression } = state;

  function keyClass(buttonId: string, base: string) {
    return cn(KEY_CLASS, base, flashKey === buttonId && "scale-95 ring-2 ring-accent-border-strong ring-offset-1");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Calculator"
        onClick={() => setOpen((v) => !v)}
        title="Calculator"
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition duration-300",
          "hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
          open
            ? "border-accent-border-strong bg-accent-surface text-accent-text focus:ring-accent-solid/20"
            : "border-separator-border bg-background-primary-default text-text-secondary hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text focus:ring-accent-solid/10"
        )}
      >
        <CalculatorIcon className="h-5 w-5 transition-transform duration-300" />
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-3 w-[280px] origin-top-right rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
          {/* Tabs */}
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-fill-2 p-1">
            {([["basic", "Basic"], ["percent", "Percentage"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={cn(
                  "rounded-lg py-1.5 text-caption-1-semibold transition",
                  tab === id ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "percent" ? (
            <PercentageCalculator
              onUseResult={(value) => {
                dispatch({ type: "LOAD", value });
                switchTab("basic");
              }}
            />
          ) : (
          <>
          {/* Display */}
          {/* Fixed hex colours: an LCD-style display that stays dark in both themes
              (bg-gray-900 flips to near-white under the dark theme's gray remap). */}
          <div className="mb-3 rounded-xl bg-inverse px-4 py-3 text-right">
            <p className="h-4 truncate text-caption-2-medium text-on-solid/60">{expression || " "}</p>
            <p className="mt-1 truncate text-title-1-semibold text-on-solid/90 tabular-nums">{display}</p>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={() => dispatch({ type: "RESET" })} className={keyClass("C", "col-span-2 bg-danger-surface text-danger-text hover:bg-danger-surface-strong")}>
              C
            </button>
            <button type="button" onClick={() => dispatch({ type: "BACKSPACE" })} className={keyClass("back", "bg-fill-2 text-text-secondary hover:bg-fill-3")}>
              <Delete className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "÷" })} className={keyClass("÷", "bg-accent-surface text-accent-text hover:bg-accent-surface-strong")}>
              ÷
            </button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "7" })} className={keyClass("7", "bg-fill-1 text-text-primary hover:bg-fill-3")}>7</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "8" })} className={keyClass("8", "bg-fill-1 text-text-primary hover:bg-fill-3")}>8</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "9" })} className={keyClass("9", "bg-fill-1 text-text-primary hover:bg-fill-3")}>9</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "×" })} className={keyClass("×", "bg-accent-surface text-accent-text hover:bg-accent-surface-strong")}>×</button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "4" })} className={keyClass("4", "bg-fill-1 text-text-primary hover:bg-fill-3")}>4</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "5" })} className={keyClass("5", "bg-fill-1 text-text-primary hover:bg-fill-3")}>5</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "6" })} className={keyClass("6", "bg-fill-1 text-text-primary hover:bg-fill-3")}>6</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "-" })} className={keyClass("-", "bg-accent-surface text-accent-text hover:bg-accent-surface-strong")}>−</button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "1" })} className={keyClass("1", "bg-fill-1 text-text-primary hover:bg-fill-3")}>1</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "2" })} className={keyClass("2", "bg-fill-1 text-text-primary hover:bg-fill-3")}>2</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "3" })} className={keyClass("3", "bg-fill-1 text-text-primary hover:bg-fill-3")}>3</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "+" })} className={keyClass("+", "bg-accent-surface text-accent-text hover:bg-accent-surface-strong")}>+</button>

            <button type="button" onClick={() => dispatch({ type: "TOGGLE_SIGN" })} className={cn(KEY_CLASS, "bg-fill-2 text-text-secondary hover:bg-fill-3")}>±</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "0" })} className={keyClass("0", "bg-fill-1 text-text-primary hover:bg-fill-3")}>0</button>
            <button type="button" onClick={() => dispatch({ type: "DECIMAL" })} className={keyClass(".", "bg-fill-1 text-text-primary hover:bg-fill-3")}>.</button>
            <button type="button" onClick={() => dispatch({ type: "EQUALS" })} className={keyClass("=", "bg-accent-solid text-on-solid hover:bg-accent-solid-hover")}>=</button>

            <button type="button" onClick={() => dispatch({ type: "PERCENT" })} className={keyClass("%", "col-span-4 bg-fill-2 text-text-secondary hover:bg-fill-3")}>%</button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
