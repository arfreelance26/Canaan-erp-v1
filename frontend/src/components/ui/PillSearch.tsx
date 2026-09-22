"use client";

import { Search } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** "sm" (32px) suits card and table headers; "md" (40px) is the page-toolbar size. */
  size?: "md" | "sm";
};

// Literal class strings so Tailwind can see every variant.
const SIZE = {
  md: {
    box: "h-10 px-3",
    icon: "h-4 w-4",
    text: "text-sm",
    open: "w-64",
    closed: "w-10 hover:w-64 focus-within:w-64",
  },
  sm: {
    box: "h-8 px-2",
    icon: "h-3.5 w-3.5",
    text: "text-xs",
    open: "w-56",
    closed: "w-8 hover:w-56 focus-within:w-56",
  },
} as const;

// Minimal search: a round icon pill that lifts on hover and expands into a
// full field on hover / focus / while it holds text.
export function PillSearch({ value, onChange, placeholder = "Search…", size = "md" }: Props) {
  const z = SIZE[size];
  return (
    <label
      className={`group flex ${z.box} shrink-0 cursor-text items-center justify-center gap-2 overflow-hidden rounded-full border border-gray-200 bg-white px-3 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md focus-within:scale-105 focus-within:border-blue-400 focus-within:shadow-md dark:border-gray-300/30 dark:bg-gray-200 ${
        value ? z.open : z.closed
      }`}
    >
      <Search className={`${z.icon} shrink-0 text-gray-500`} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 bg-transparent ${z.text} text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-950`}
      />
    </label>
  );
}
