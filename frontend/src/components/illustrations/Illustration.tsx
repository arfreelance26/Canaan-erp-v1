import { cx } from "@/utils/cx";
import { ILLUSTRATIONS, type IllustrationName } from "./assets";

type IllustrationProps = {
  name: IllustrationName;
  className?: string;
};

/**
 * Theme-aware unDraw illustration. Decorative (aria-hidden): the text next to
 * it carries the meaning. Use for empty states, errors, login, onboarding;
 * never as decoration on working screens.
 *
 *   <Illustration name="no-data" className="h-32" />
 */
export function Illustration({ name, className }: IllustrationProps) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex [&>svg]:h-full [&>svg]:w-auto", className)}
      // Local, sanitised SVG generated into ./assets.ts (no scripts, no handlers).
      dangerouslySetInnerHTML={{ __html: ILLUSTRATIONS[name] }}
    />
  );
}

export type { IllustrationName };
