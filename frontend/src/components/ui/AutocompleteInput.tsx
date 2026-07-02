"use client";
import { useState, useEffect, type KeyboardEvent } from "react";

const STORAGE_LIMIT = 30;

export function saveToAutocompleteHistory(key: string, value: string) {
  if (!value?.trim()) return;
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    localStorage.setItem(
      key,
      JSON.stringify([value.trim(), ...existing.filter((v) => v !== value.trim())].slice(0, STORAGE_LIMIT))
    );
  } catch {}
}

export function getAutocompleteHistory(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  storageKey: string;
  suggestions?: string[];
  placeholder?: string;
  required?: boolean;
}

export function AutocompleteInput({ value, onChange, storageKey, suggestions, placeholder, required }: AutocompleteInputProps) {
  const [suggestion, setSuggestion] = useState("");

  useEffect(() => {
    if (!value?.trim()) { setSuggestion(""); return; }
    const local = getAutocompleteHistory(storageKey);
    const pool = [...local, ...(suggestions ?? []).filter((s) => !local.includes(s))];
    const match = pool.find(
      (h) => h.toLowerCase().startsWith(value.toLowerCase()) && h.toLowerCase() !== value.toLowerCase()
    );
    setSuggestion(match ?? "");
  }, [value, storageKey, suggestions]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      onChange(suggestion);
    }
  }

  return (
    <div className="relative w-full rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm transition-all duration-200 focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(27,43,94,0.1)] hover:border-gray-300 hover:bg-white/90">
      {suggestion && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3"
        >
          <span className="invisible whitespace-pre text-sm uppercase">{value}</span>
          <span className="text-sm uppercase text-gray-400">{suggestion.slice(value.length)}</span>
        </div>
      )}
      <input
        type="text"
        value={value}
        required={required}
        placeholder={!suggestion ? placeholder : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent px-3 py-2 text-sm uppercase text-gray-900 outline-none placeholder:normal-case placeholder:text-gray-400"
      />
    </div>
  );
}
