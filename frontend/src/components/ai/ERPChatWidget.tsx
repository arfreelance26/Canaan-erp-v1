"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useRouter } from "next/navigation";
import { buildSystemPrompt, runAgent } from "@/lib/ai/erpAgent";
import { X, Send, Square } from "lucide-react";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScrollerAutoScroll,
} from "@/components/ui/message-scroller";
import {
  Message,
  MessageContent,
  Bubble,
  BubbleContent,
} from "@/components/ui/message";

const SUGGESTIONS = [
  "How many active trips right now?",
  "Which trucks have compliance expiring soon?",
  "Show me trips pending reconciliation",
  "Take me to sheet collection",
];

function ChatMessages({
  messages,
  thinking,
}: {
  messages: { role: string; content: string; id: string }[];
  thinking: boolean;
}) {
  useMessageScrollerAutoScroll([messages, thinking]);

  return (
    <>
      {messages.map((m) => (
        <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
          <Message align={m.role === "user" ? "end" : "start"} className="px-3 py-1">
            <MessageContent>
              <Bubble variant={m.role === "user" ? "user" : m.role === "error" ? "error" : "assistant"}>
                <BubbleContent>{m.content}</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </MessageScrollerItem>
      ))}

      {thinking && (
        <Message align="start" className="px-3 py-1">
          <MessageContent>
            <Bubble variant="assistant">
              <BubbleContent>
                <span className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-gold"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )}
    </>
  );
}

export function ERPChatWidget() {
  const { user } = useAuth();
  const { isOpen, close, messages, setMessages, clearMessages } = useChat();
  const router = useRouter();

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const inputRef = useCallback((el: HTMLInputElement | null) => {
    if (el && isOpen) setTimeout(() => el.focus(), 80);
  }, [isOpen]);

  const onNavigate = useCallback((path: string) => { router.push(path); }, [router]);

  const send = useCallback(async () => {
    if (!input.trim() || thinking || !user) return;
    const userMsg = input.trim();
    const id = crypto.randomUUID();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg, id }]);
    setThinking(true);
    const ac = new AbortController();
    setAbortController(ac);
    try {
      const reply = await runAgent({
        userMessage: userMsg,
        history: messages,
        systemPrompt: buildSystemPrompt(user.softwareDesignation, user.name),
        token: user.token ?? "",
        onNavigate,
        signal: ac.signal,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply, id: crypto.randomUUID() }]);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { role: "error", content: `Error: ${e instanceof Error ? e.message : "Something went wrong."}`, id: crypto.randomUUID() },
      ]);
    } finally {
      setThinking(false);
      setAbortController(null);
    }
  }, [input, thinking, user, messages, onNavigate, setMessages]);

  const stop = useCallback(() => {
    abortController?.abort();
    setThinking(false);
    setAbortController(null);
  }, [abortController]);

  if (!user || !process.env.NEXT_PUBLIC_OR_API_KEY) return null;

  return (
    <aside
      className={[
        "flex flex-col shrink-0 overflow-hidden",
        "border-l border-gray-200",
        "bg-white",
        "transition-[width] duration-300 ease-in-out",
        isOpen ? "w-80" : "w-0",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between bg-brand-navy px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 p-1">
            <img src="/logo.png" alt="Canaan" width={20} height={20} className="object-contain" />
          </div>
          <div>
            <p className="text-xs font-bold leading-none text-white">ERP Assistant</p>
            <p className="mt-0.5 text-[10px] leading-none text-white/50">Canaan Global</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="text-[11px] text-white/50 transition-colors hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            onClick={close}
            aria-label="Close chat"
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <MessageScrollerProvider>
        <MessageScroller className="flex-1 bg-white py-3">
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {messages.length === 0 && (
                <div className="flex flex-col gap-2 px-3 pt-2">
                  <p className="text-center text-xs text-gray-400">
                    Ask me anything about your ERP data.
                  </p>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                        // focus is handled by the ref callback on re-render
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <ChatMessages messages={messages as { role: string; content: string; id: string }[]} thinking={thinking} />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {/* Input bar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about trips, compliance…"
          disabled={thinking}
          className="input-no-transform flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-gold focus:bg-white disabled:opacity-50"
        />
        {thinking ? (
          <button
            onClick={stop}
            title="Stop"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-colors hover:bg-red-600"
          >
            <Square size={10} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim()}
            title="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white transition-colors hover:bg-brand-navy/90 disabled:opacity-40"
          >
            <Send size={13} />
          </button>
        )}
      </div>
    </aside>
  );
}
