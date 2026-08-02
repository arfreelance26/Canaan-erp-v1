import { cn } from "@/lib/utils";

/* ── Message container ─────────────────────────────────────────────── */

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

function Message({ align = "start", className, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "flex w-full gap-2",
        align === "end" ? "flex-row-reverse" : "flex-row",
        className,
      )}
      {...props}
    />
  );
}

/* ── Avatar slot ───────────────────────────────────────────────────── */

function MessageAvatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex shrink-0 items-end", className)} {...props} />
  );
}

/* ── Content wrapper ───────────────────────────────────────────────── */

function MessageContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1", className)} {...props} />
  );
}

/* ── Header (sender name, timestamp) ──────────────────────────────── */

function MessageHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 px-1 text-[10px] text-gray-400", className)} {...props} />
  );
}

/* ── Footer (status, actions) ─────────────────────────────────────── */

function MessageFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 px-1 text-[10px] text-gray-400", className)} {...props} />
  );
}

/* ── Bubble shell ──────────────────────────────────────────────────── */

type BubbleVariant = "user" | "assistant" | "error";

const BUBBLE_VARIANTS: Record<BubbleVariant, string> = {
  user:      "bg-brand-navy text-white",
  assistant: "bg-gray-200 text-gray-900",
  error:     "border border-red-200 bg-red-50 text-red-600",
};

interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BubbleVariant;
}

function Bubble({ variant = "assistant", className, ...props }: BubbleProps) {
  return (
    <div
      className={cn("rounded-xl", BUBBLE_VARIANTS[variant], className)}
      {...props}
    />
  );
}

function BubbleContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap", className)}
      {...props}
    />
  );
}

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
  Bubble,
  BubbleContent,
};
