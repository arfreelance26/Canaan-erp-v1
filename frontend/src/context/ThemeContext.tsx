"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Discrete font-scale steps. 1 = browser default (16px root). */
export const FONT_SCALE_STEPS = [0.9, 1, 1.1, 1.2, 1.3] as const;
export type FontScale = (typeof FONT_SCALE_STEPS)[number];

const THEME_KEY = "erp_theme";
const FONT_KEY = "erp_font_scale";
const DEFAULT_THEME: Theme = "light";
const DEFAULT_SCALE: FontScale = 1;

type ThemeContextValue = {
  theme: Theme;
  fontScale: FontScale;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setFontScale: (s: FontScale) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyFontScale(scale: FontScale) {
  document.documentElement.style.fontSize = `${scale * 100}%`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [fontScale, setFontScaleState] = useState<FontScale>(DEFAULT_SCALE);

  // Rehydrate from localStorage on mount (the inline pre-hydration script in
  // layout.tsx has already applied these to <html> to avoid a flash).
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") setThemeState(savedTheme);

    const savedScale = Number(localStorage.getItem(FONT_KEY));
    if (FONT_SCALE_STEPS.includes(savedScale as FontScale)) {
      setFontScaleState(savedScale as FontScale);
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  const setFontScale = useCallback((s: FontScale) => {
    setFontScaleState(s);
    localStorage.setItem(FONT_KEY, String(s));
    applyFontScale(s);
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    setFontScaleState((prev) => {
      const idx = FONT_SCALE_STEPS.indexOf(prev);
      const nextIdx = Math.min(FONT_SCALE_STEPS.length - 1, Math.max(0, idx + dir));
      const next = FONT_SCALE_STEPS[nextIdx];
      localStorage.setItem(FONT_KEY, String(next));
      applyFontScale(next);
      return next;
    });
  }, []);

  const increaseFont = useCallback(() => step(1), [step]);
  const decreaseFont = useCallback(() => step(-1), [step]);

  return (
    <ThemeContext.Provider
      value={{ theme, fontScale, setTheme, toggleTheme, setFontScale, increaseFont, decreaseFont }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
