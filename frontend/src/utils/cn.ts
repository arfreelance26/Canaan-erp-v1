import { clsx, type ClassValue } from "clsx";
import { cx } from "@/utils/cx";

/**
 * Conditional class merge: clsx (arrays, objects, falsy values) followed by
 * the BoardUI-aware tailwind-merge in `cx`, so composite type utilities like
 * `text-body-medium` survive next to a text color.
 *
 * - `cx("a", "b")`                 plain strings (BoardUI components use this)
 * - `cn("a", cond && "b", { c })`  conditional input (shadcn components, app code)
 *
 * The legacy `cn` in `@/lib/utils` re-exports this one, so there is a single
 * merge implementation in the app.
 */
export function cn(...inputs: ClassValue[]) {
  return cx(clsx(inputs));
}
