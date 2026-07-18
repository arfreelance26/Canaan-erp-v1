import { useEffect, useRef } from "react";

/**
 * Persists `form` to sessionStorage under `storageKey` while `active` is true, so closing a
 * dialog without submitting and reopening it (e.g. via an "Add" button) restores what was typed
 * instead of starting from a blank form. Call `clearFormDraft(storageKey)` after a successful
 * submit so the next "Add" starts fresh.
 */
export function useFormDraft<T>(
  storageKey: string,
  active: boolean,
  form: T,
  restore: (draft: T) => void,
) {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!active) {
      restoredRef.current = false;
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) restore(JSON.parse(raw));
    } catch {
      // ignore malformed drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, storageKey]);

  useEffect(() => {
    if (!active || !restoredRef.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // ignore quota errors
    }
  }, [active, storageKey, form]);
}

export function clearFormDraft(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
