/**
 * Imperative confirm / prompt dialogs.
 *
 * Call from anywhere (event handlers, async flows); <ConfirmHost/> in the root
 * layout renders them one at a time. Requests made while a dialog is open
 * queue up and show in order.
 *
 *   if (!(await confirm({ title: "Close this trip?" }))) return;
 *   const reason = await prompt({ title: "KM variance", inputLabel: "Reason", required: true });
 *   if (reason === null) return;  // cancelled
 */

export type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Label of the confirming button. Defaults to "Confirm" ("Delete" for danger). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` renders a red confirm button; use for deletes and irreversible actions. */
  tone?: ConfirmTone;
};

export type PromptOptions = ConfirmOptions & {
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Block confirming while the field is empty. */
  required?: boolean;
};

export type ConfirmRequest =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type Listener = (queue: readonly ConfirmRequest[]) => void;

let queue: ConfirmRequest[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(queue);
}

function enqueue(request: ConfirmRequest) {
  queue = [...queue, request];
  emit();
}

/** Used by <ConfirmHost/> only. */
export function subscribeConfirm(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => listeners.delete(listener);
}

/** Used by <ConfirmHost/> only: settle the front request and show the next. */
export function settleConfirm(id: number, value: boolean | string | null) {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);
  emit();
  if (request.kind === "confirm") request.resolve(value === true);
  else request.resolve(typeof value === "string" ? value : null);
}

/** Ask a yes/no question. Resolves `true` only when the user confirms. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "confirm", options, resolve }));
}

/** Ask for a line of text. Resolves the trimmed text, or `null` when cancelled. */
export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "prompt", options, resolve }));
}

/* -------------------------------------------------------------------------- */
/*  Legacy-shaped helpers (former SweetAlert API)                              */
/*  Existing call sites read `.isConfirmed`; new code should use `confirm()`.  */
/* -------------------------------------------------------------------------- */

export type ConfirmResult = { isConfirmed: boolean; isDismissed: boolean };

const toResult = (ok: boolean): ConfirmResult => ({ isConfirmed: ok, isDismissed: !ok });

/** Destructive confirmation: "Delete {itemName}?" with a red Delete button. */
export async function confirmDelete(itemName: string): Promise<ConfirmResult> {
  return toResult(
    await confirm({
      title: `Delete ${itemName}?`,
      description: "This can't be undone",
      confirmLabel: "Delete",
      tone: "danger",
    }),
  );
}

/** Generic confirmation with an optional description and confirm label. */
export async function confirmAction(
  title: string,
  description?: string,
  confirmLabel = "Confirm",
): Promise<ConfirmResult> {
  return toResult(await confirm({ title, description, confirmLabel }));
}
