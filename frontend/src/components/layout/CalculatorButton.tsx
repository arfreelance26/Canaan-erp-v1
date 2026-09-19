"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Calculator as CalculatorIcon, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

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
  | { type: "RESET" };

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
  }
}

const KEY_CLASS =
  "flex h-12 items-center justify-center rounded-xl text-base font-semibold transition-all duration-100 active:scale-95";

// Maps a physical keydown to the on-screen button it corresponds to, so we
// can flash that button for tactile feedback on keyboard input.
const KEY_TO_BUTTON: Record<string, string> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", "+": "+", "-": "-", "*": "×", x: "×", X: "×",
  "/": "÷", "%": "%", Enter: "=", "=": "=",
  Backspace: "back", Delete: "C", Escape: "C", c: "C", C: "C",
};

export function CalculatorButton() {
  const [open, setOpen] = useState(false);
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
  }, [open]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const { display, expression } = state;

  function keyClass(buttonId: string, base: string) {
    return cn(KEY_CLASS, base, flashKey === buttonId && "scale-95 ring-2 ring-blue-400 ring-offset-1");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Calculator"
        onClick={() => setOpen((v) => !v)}
        title="Calculator"
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4",
          open
            ? "border-blue-300 bg-blue-50 text-blue-600 focus:ring-blue-500/20"
            : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus:ring-blue-500/10"
        )}
      >
        <CalculatorIcon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-3 w-[280px] origin-top-right rounded-2xl border border-white/60 bg-white/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
          {/* Display */}
          <div className="mb-3 rounded-xl bg-gray-900 px-4 py-3 text-right">
            <p className="h-4 truncate text-[11px] font-medium text-gray-400">{expression || " "}</p>
            <p className="mt-1 truncate text-2xl font-bold text-gray-50 tabular-nums">{display}</p>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={() => dispatch({ type: "RESET" })} className={keyClass("C", "col-span-2 bg-red-50 text-red-600 hover:bg-red-100")}>
              C
            </button>
            <button type="button" onClick={() => dispatch({ type: "BACKSPACE" })} className={keyClass("back", "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
              <Delete className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "÷" })} className={keyClass("÷", "bg-blue-50 text-blue-600 hover:bg-blue-100")}>
              ÷
            </button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "7" })} className={keyClass("7", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>7</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "8" })} className={keyClass("8", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>8</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "9" })} className={keyClass("9", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>9</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "×" })} className={keyClass("×", "bg-blue-50 text-blue-600 hover:bg-blue-100")}>×</button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "4" })} className={keyClass("4", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>4</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "5" })} className={keyClass("5", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>5</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "6" })} className={keyClass("6", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>6</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "-" })} className={keyClass("-", "bg-blue-50 text-blue-600 hover:bg-blue-100")}>−</button>

            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "1" })} className={keyClass("1", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>1</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "2" })} className={keyClass("2", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>2</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "3" })} className={keyClass("3", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>3</button>
            <button type="button" onClick={() => dispatch({ type: "OPERATOR", op: "+" })} className={keyClass("+", "bg-blue-50 text-blue-600 hover:bg-blue-100")}>+</button>

            <button type="button" onClick={() => dispatch({ type: "TOGGLE_SIGN" })} className={cn(KEY_CLASS, "bg-gray-100 text-gray-600 hover:bg-gray-200")}>±</button>
            <button type="button" onClick={() => dispatch({ type: "DIGIT", digit: "0" })} className={keyClass("0", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>0</button>
            <button type="button" onClick={() => dispatch({ type: "DECIMAL" })} className={keyClass(".", "bg-gray-50 text-gray-800 hover:bg-gray-100")}>.</button>
            <button type="button" onClick={() => dispatch({ type: "EQUALS" })} className={keyClass("=", "bg-blue-600 text-white hover:bg-blue-700")}>=</button>

            <button type="button" onClick={() => dispatch({ type: "PERCENT" })} className={keyClass("%", "col-span-4 bg-gray-100 text-gray-600 hover:bg-gray-200")}>%</button>
          </div>
        </div>
      )}
    </div>
  );
}
