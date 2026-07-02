"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;                   // YYYY-MM-DD or ""
  onChange: (v: string) => void;   // emits YYYY-MM-DD or ""
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
};

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function DateInput({ value, onChange, required, readOnly, disabled, className }: Props) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);

    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    setDisplay(formatted);

    if (digits.length === 8) {
      onChange(`${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
    } else {
      onChange("");
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => handleChange(e.target.value)}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      placeholder="DD/MM/YYYY"
      maxLength={10}
      className={cn(className)}
    />
  );
}
