"use client";

import { useEffect, useState } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/base/buttons/button";
import { Textarea } from "@/components/base/textarea/textarea";
import { settleConfirm, subscribeConfirm, type ConfirmRequest } from "@/lib/feedback/confirm";

/**
 * Renders the confirm / prompt queue from `@/lib/feedback` one dialog at a
 * time. Mounted once in app/layout.tsx; never render it anywhere else.
 */
export function ConfirmHost() {
  const [queue, setQueue] = useState<readonly ConfirmRequest[]>([]);
  useEffect(() => subscribeConfirm(setQueue), []);

  const current = queue[0];

  return (
    <AlertDialog
      open={Boolean(current)}
      onOpenChange={(open) => {
        if (!open && current) settleConfirm(current.id, current.kind === "prompt" ? null : false);
      }}
    >
      {current ? <ConfirmDialogBody key={current.id} request={current} /> : null}
    </AlertDialog>
  );
}

function ConfirmDialogBody({ request }: { request: ConfirmRequest }) {
  const { options } = request;
  const isPrompt = request.kind === "prompt";
  const danger = options.tone === "danger";
  const [value, setValue] = useState(isPrompt ? (request.options.defaultValue ?? "") : "");
  const [touched, setTouched] = useState(false);

  const required = isPrompt && Boolean(request.options.required);
  const invalid = required && value.trim() === "";

  function submit() {
    if (isPrompt) {
      setTouched(true);
      if (invalid) return;
      settleConfirm(request.id, value.trim());
    } else {
      settleConfirm(request.id, true);
    }
  }

  return (
    <AlertDialogContent className="gap-6 rounded-2xl border-separator-border bg-background-primary-default p-6 shadow-xl sm:max-w-md">
      <AlertDialogHeader className="gap-1">
        <AlertDialogTitle className="text-headline-semibold text-text-primary">{options.title}</AlertDialogTitle>
        {options.description ? (
          <AlertDialogDescription className="text-body-regular text-text-secondary">
            {options.description}
          </AlertDialogDescription>
        ) : (
          // Radix warns without a description; keep one for screen readers.
          <AlertDialogDescription className="sr-only">{options.title}</AlertDialogDescription>
        )}
      </AlertDialogHeader>

      {isPrompt ? (
        <Textarea
          autoFocus
          label={request.options.inputLabel}
          aria-label={request.options.inputLabel ? undefined : options.title}
          placeholder={request.options.placeholder}
          value={value}
          onChange={setValue}
          isInvalid={touched && invalid}
          hint={touched && invalid ? "Required" : undefined}
          rows={3}
          autoResize
          maxRows={8}
        />
      ) : null}

      <AlertDialogFooter className="gap-2">
        <AlertDialogPrimitive.Cancel asChild>
          <Button variant="secondary">{options.cancelLabel ?? "Cancel"}</Button>
        </AlertDialogPrimitive.Cancel>
        <Button variant={danger ? "danger" : "primary"} onClick={submit} autoFocus={!isPrompt && !danger}>
          {options.confirmLabel ?? (danger ? "Delete" : "Confirm")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
