"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "./AuthContext";
import type { ChatMessage } from "@/lib/ai/erpAgent";

interface ChatContextType {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const MAX_STORED_MESSAGES = 100;

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = user ? `canaan_chat_${user.id ?? "admin"}` : null;

  // Rehydrate from localStorage when user is known
  useEffect(() => {
    if (!storageKey) {
      setMessages([]);
      setHydrated(true);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setMessages(JSON.parse(stored) as ChatMessage[]);
    } catch {
      /* corrupt data — start fresh */
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist to localStorage on every change (after initial hydration)
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      // Keep only the most recent messages to avoid localStorage quota issues
      localStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))
      );
    } catch {
      /* quota exceeded — silently skip */
    }
  }, [messages, storageKey, hydrated]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);
  const clearMessages = useCallback(() => {
    setMessages([]);
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey]);

  return (
    <ChatContext.Provider
      value={{ isOpen, toggle, close, messages, setMessages, clearMessages }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
