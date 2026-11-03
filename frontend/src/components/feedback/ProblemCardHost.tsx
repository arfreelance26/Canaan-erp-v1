"use client";

import { useEffect, useRef, useState } from "react";
import {
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiLoader4Line,
  RiRefreshLine,
  RiServerLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Dialog } from "@/components/ui/Dialog";
import { Illustration } from "@/components/illustrations/Illustration";
import { checkConnection, onProblem, type ConnectionStatus, type Problem } from "@/lib/connection-problem";

function messageFor(problem: Problem, status: ConnectionStatus): string {
  if (!status.internet) return "You're offline. Reconnect and try again.";
  const canRetry = !!problem.onRetry;
  if (!status.server) {
    return canRetry
      ? "Our server isn't responding right now. Your data is safe. Please try again in a minute."
      : "Our server isn't responding right now. Please check whether your last change was saved, then try again in a minute.";
  }
  if (problem.kind === "timeout") return "This record is taking too long. Try a shorter date range, or try again.";
  if (problem.kind === "server") return "Something went wrong on our side. Please try again.";
  return canRetry ? "This record couldn't be prepared. Please try again." : "That didn't go through. Please try again.";
}

function StatusLine({ icon: Icon, label, ok }: { icon: RemixiconComponentType; label: string; ok: boolean | null }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      <span className="flex-1 text-body-medium text-text-primary">{label}</span>
      {ok === null ? (
        <RiLoader4Line className="size-4 animate-spin text-foreground-icon-tertiary" aria-label="Checking" />
      ) : ok ? (
        <RiCheckboxCircleLine className="size-4 text-notification-success-foreground" aria-label="Working" />
      ) : (
        <RiCloseCircleLine className="size-4 text-foreground-icon-error" aria-label="Not working" />
      )}
    </div>
  );
}

/** One app-wide card for requests that couldn't finish: checks the user's
 *  internet and the server, and says which side the problem is on. */
export function ProblemCardHost() {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const open = useRef(false);

  useEffect(() => onProblem((next) => {
    if (open.current) return;  // several requests failing together get one card
    open.current = true;
    setProblem(next);
    setStatus(null);
    setCopied(false);
    checkConnection().then(setStatus);
  }), []);

  function close() {
    open.current = false;
    setProblem(null);
  }

  function tryAgain() {
    const retry = problem?.onRetry;
    close();
    retry?.();
  }

  async function copyReference() {
    if (!problem?.reference) return;
    try {
      await navigator.clipboard.writeText(problem.reference);
      setCopied(true);
    } catch {
      /* the code is on screen to read out */
    }
  }

  return (
    <Dialog
      open={problem !== null}
      onClose={close}
      title={problem?.onRetry ? "We couldn't finish this download" : "That didn't go through"}
      className="sm:max-w-md"
    >
      {problem && (
        <div className="flex flex-col gap-4">
          {status && (!status.internet || !status.server) && (
            <Illustration name={!status.internet ? "offline" : "server-down"} className="mx-auto h-28" />
          )}
          <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-secondary-default">
            <StatusLine icon={RiGlobalLine} label="Your internet" ok={status?.internet ?? null} />
            <StatusLine icon={RiServerLine} label="Canaan server" ok={status?.server ?? null} />
          </div>

          <p className="text-body-regular text-text-secondary">{status ? messageFor(problem, status) : "Checking your connection…"}</p>

          {problem.reference && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-separator-border px-4 py-2">
              <div>
                <p className="text-caption-1-regular text-text-tertiary">Reference code</p>
                <p className="font-mono text-body-medium text-text-primary tabular-nums">{problem.reference}</p>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={copyReference}
                leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
            {problem.onRetry && (
              <Button onClick={tryAgain} leadingIcon={RiRefreshLine}>
                Try again
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
