import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Illustration, type IllustrationName } from "@/components/illustrations/Illustration";

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  /** unDraw illustration; omit for compact inline empties (tables, menus). */
  illustration?: IllustrationName;
  /** One primary action at most, e.g. <Button>Add truck</Button>. */
  action?: ReactNode;
  size?: "compact" | "default";
  className?: string;
};

/**
 * The one empty / no-results / error state. Title says what's missing,
 * description says what to do next, nothing else.
 */
export function EmptyState({ title, description, illustration, action, size = "default", className }: EmptyStateProps) {
  const compact = size === "compact";
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-4 px-6 py-12",
        className,
      )}
    >
      {illustration ? <Illustration name={illustration} className={compact ? "h-20" : "h-32"} /> : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className={cx(compact ? "text-body-medium" : "text-headline-medium", "text-text-primary")}>{title}</p>
        {description ? <p className="text-body-regular text-text-secondary">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
