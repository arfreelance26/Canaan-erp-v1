import { useEffect, useRef } from "react";

/**
 * Persists `form` to sessionStorage under `storageKey` while `active` is true, so closing a
 * dialog without submitting and reopening it (e.g. via an "Add" button) restores what was typed
 * instead of starting from a blank form. Call `clearFormDraft(storageKey)` after a successful
 * submit so the next "Add" starts fresh.
 */
export function useFormDraft<T extends object>(
  storageKey: string,
  active: boolean,
  form: T,
  restore: (draft: T) => void,
) {
  const restoredRef = useRef(false);
  // Snapshot of `form` as of the most recent render, read (not depended on) by
  // the mount effect below — see the comment there for why. Updated in its own
  // effect (never during render — refs must not be written mid-render).
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });

  useEffect(() => {
    if (!active) {
      restoredRef.current = false;
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      // Merge onto the current (freshly-initialized) form instead of replacing
      // it outright — a draft saved under an older/different field shape (a
      // field since added, renamed, or simply absent from a partial save)
      // would otherwise restore with a missing key `undefined`, flipping that
      // input from controlled to uncontrolled on the next render.
      if (raw) restore({ ...formRef.current, ...JSON.parse(raw) });
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
