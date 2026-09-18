"use client";

import { useEffect, useRef, useState } from "react";
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

const KEY_CLASS =
  "flex h-12 items-center justify-center rounded-xl text-base font-semibold transition-colors active:scale-95";

export function CalculatorButton() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [expression, setExpression] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function reset() {
    setDisplay("0");
    setAccumulator(null);
    setOperator(null);
    setOverwrite(true);
    setExpression("");
  }

  function inputDigit(digit: string) {
    if (overwrite) {
      setDisplay(digit);
      setOverwrite(false);
    } else {
      setDisplay((prev) => (prev === "0" ? digit : prev.length < 15 ? prev + digit : prev));
    }
  }

  function inputDecimal() {
    if (overwrite) {
      setDisplay("0.");
      setOverwrite(false);
      return;
    }
    setDisplay((prev) => (prev.includes(".") ? prev : prev + "."));
  }

  function backspace() {
    if (overwrite) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }

  function toggleSign() {
    setDisplay((prev) => (prev === "0" ? prev : prev.startsWith("-") ? prev.slice(1) : "-" + prev));
  }

  function percent() {
    const value = parseFloat(display);
    if (!Number.isFinite(value)) return;
    setDisplay(formatResult(value / 100));
    setOverwrite(true);
  }

  function chooseOperator(nextOp: Operator) {
    const current = parseFloat(display);
    if (accumulator === null) {
      setAccumulator(current);
      setExpression(`${display} ${nextOp}`);
    } else if (!overwrite) {
      const result = apply(accumulator, current, operator as Operator);
      setAccumulator(result);
      setExpression(`${formatResult(result)} ${nextOp}`);
    } else {
      // Operator pressed again before entering a new number — just swap it.
      setExpression(`${formatResult(accumulator)} ${nextOp}`);
    }
    setOperator(nextOp);
    setOverwrite(true);
  }

  function equals() {
    if (operator === null || accumulator === null) return;
    const current = parseFloat(display);
    const result = apply(accumulator, current, operator);
    setExpression(`${formatResult(accumulator)} ${operator} ${display} =`);
    setDisplay(formatResult(result));
    setAccumulator(null);
    setOperator(null);
    setOverwrite(true);
  }

  // Keyboard input — only while the popover is open, so typing elsewhere on
  // the page is never hijacked.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        inputDigit(e.key);
        return;
      }
      switch (e.key) {
        case ".":
          e.preventDefault();
          inputDecimal();
          break;
        case "+":
          e.preventDefault();
          chooseOperator("+");
          break;
        case "-":
          e.preventDefault();
          chooseOperator("-");
          break;
        case "*":
        case "x":
        case "X":
          e.preventDefault();
          chooseOperator("×");
          break;
        case "/":
          e.preventDefault();
          chooseOperator("÷");
          break;
        case "%":
          e.preventDefault();
          percent();
          break;
        case "Enter":
        case "=":
          e.preventDefault();
          equals();
          break;
        case "Backspace":
          e.preventDefault();
          backspace();
          break;
        case "Delete":
        case "Escape":
        case "c":
        case "C":
          e.preventDefault();
          reset();
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, display, overwrite, accumulator, operator]);

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
            <p className="h-4 truncate text-[11px] font-medium text-gray-400">{expression || " "}</p>
            <p className="mt-1 truncate text-2xl font-bold text-gray-50 tabular-nums">{display}</p>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={reset} className={cn(KEY_CLASS, "col-span-2 bg-red-50 text-red-600 hover:bg-red-100")}>
              C
            </button>
            <button type="button" onClick={backspace} className={cn(KEY_CLASS, "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
              <Delete className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => chooseOperator("÷")} className={cn(KEY_CLASS, "bg-blue-50 text-blue-600 hover:bg-blue-100")}>
              ÷
            </button>

            <button type="button" onClick={() => inputDigit("7")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>7</button>
            <button type="button" onClick={() => inputDigit("8")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>8</button>
            <button type="button" onClick={() => inputDigit("9")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>9</button>
            <button type="button" onClick={() => chooseOperator("×")} className={cn(KEY_CLASS, "bg-blue-50 text-blue-600 hover:bg-blue-100")}>×</button>

            <button type="button" onClick={() => inputDigit("4")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>4</button>
            <button type="button" onClick={() => inputDigit("5")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>5</button>
            <button type="button" onClick={() => inputDigit("6")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>6</button>
            <button type="button" onClick={() => chooseOperator("-")} className={cn(KEY_CLASS, "bg-blue-50 text-blue-600 hover:bg-blue-100")}>−</button>

            <button type="button" onClick={() => inputDigit("1")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>1</button>
            <button type="button" onClick={() => inputDigit("2")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>2</button>
            <button type="button" onClick={() => inputDigit("3")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>3</button>
            <button type="button" onClick={() => chooseOperator("+")} className={cn(KEY_CLASS, "bg-blue-50 text-blue-600 hover:bg-blue-100")}>+</button>

            <button type="button" onClick={toggleSign} className={cn(KEY_CLASS, "bg-gray-100 text-gray-600 hover:bg-gray-200")}>±</button>
            <button type="button" onClick={() => inputDigit("0")} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>0</button>
            <button type="button" onClick={inputDecimal} className={cn(KEY_CLASS, "bg-gray-50 text-gray-800 hover:bg-gray-100")}>.</button>
            <button type="button" onClick={equals} className={cn(KEY_CLASS, "bg-blue-600 text-white hover:bg-blue-700")}>=</button>

            <button type="button" onClick={percent} className={cn(KEY_CLASS, "col-span-4 bg-gray-100 text-gray-600 hover:bg-gray-200")}>%</button>
          </div>
        </div>
      )}
    </div>
  );
}
