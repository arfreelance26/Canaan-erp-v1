"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { ArrowDown } from "lucide-react";

/* ── Context ───────────────────────────────────────────────────────── */

interface MessageScrollerCtx {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  atBottom: boolean;
}

const Ctx = createContext<MessageScrollerCtx | null>(null);

function useScrollerCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("MessageScroller components must be inside <MessageScrollerProvider>");
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────────────── */

function MessageScrollerProvider({ children }: { children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Consider "at bottom" when within 60px of the end
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }, []);

  return (
    <Ctx.Provider value={{ viewportRef, scrollToBottom, atBottom }}>
      <div className="relative flex h-full flex-col" onScroll={handleScroll}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/* ── Scroller (outer wrapper) ──────────────────────────────────────── */

function MessageScroller({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)} {...props} />;
}

/* ── Viewport (the scrollable area) ───────────────────────────────── */

function MessageScrollerViewport({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { viewportRef } = useScrollerCtx();
  return (
    <div
      ref={viewportRef}
      className={cn("flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}

/* ── Content wrapper ───────────────────────────────────────────────── */

function MessageScrollerContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

/* ── Item (single turn wrapper) ────────────────────────────────────── */

interface MessageScrollerItemProps extends React.HTMLAttributes<HTMLDivElement> {
  messageId: string;
  scrollAnchor?: boolean;
}

function MessageScrollerItem({
  messageId: _messageId,
  scrollAnchor: _scrollAnchor,
  className,
  ...props
}: MessageScrollerItemProps) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

/* ── Auto-scroll hook ──────────────────────────────────────────────── */

/**
 * Call this inside the chat component to trigger auto-scroll when `deps` change.
 * Only scrolls if the user is already at (or near) the bottom.
 */
function useMessageScrollerAutoScroll(deps: React.DependencyList) {
  const { scrollToBottom, atBottom } = useScrollerCtx();

  useEffect(() => {
    if (atBottom) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ── Jump-to-bottom button ─────────────────────────────────────────── */

function MessageScrollerButton({ className, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const { scrollToBottom, atBottom } = useScrollerCtx();

  if (atBottom) return null;

  return (
    <button
      type="button"
      onClick={scrollToBottom}
      className={cn(
        "absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5",
        "text-xs font-medium text-gray-600 shadow-md",
        "transition-all hover:bg-gray-50",
        className,
      )}
      {...props}
    >
      <ArrowDown className="h-3 w-3" />
      Jump to latest
    </button>
  );
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScrollerAutoScroll,
};
