"use client";

import { useEffect, useRef, useState } from "react";
import {
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiErrorWarningLine,
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
  const canRetry = !!problem.onRetry;
  if (status.internet === "offline") return "You're offline. Reconnect and try again.";
  if (status.internet === "slow") {
    return canRetry
      ? "Your internet is too slow right now, so this couldn't finish in time. Your data is safe. Try again when the connection is better."
      : "Your internet is too slow right now, so this couldn't finish in time. Please check whether your last change was saved, then try again when the connection is better.";
  }
  if (status.server === false) {
    return canRetry
      ? "Our server isn't responding right now. Your data is safe. Please try again in a minute."
      : "Our server isn't responding right now. Please check whether your last change was saved, then try again in a minute.";
  }
  if (problem.kind === "timeout") return "This record is taking too long. Try a shorter date range, or try again.";
  if (problem.kind === "server") return "Something went wrong on our side. Please try again.";
  if (problem.kind === "connection") return "The connection dropped before this finished. Please check whether your last change was saved, then try again.";
  return canRetry ? "This record couldn't be prepared. Please try again." : "That didn't go through. Please try again.";
}

function titleFor(problem: Problem, status: ConnectionStatus | null): string {
  if (status?.internet === "slow") return "Your internet is slow";
  if (status?.internet === "offline") return "You're offline";
  return problem.onRetry ? "We couldn't finish this download" : "That didn't go through";
}

type LineState = "checking" | "ok" | "slow" | "down" | "unknown";

const internetState = (s: ConnectionStatus | null): LineState =>
  !s ? "checking" : s.internet === "ok" ? "ok" : s.internet === "slow" ? "slow" : "down";
// On a slow or missing connection the server can't be judged, so say so
// instead of blaming it.
const serverState = (s: ConnectionStatus | null): LineState =>
  !s ? "checking" : s.server === null ? "unknown" : s.server ? "ok" : "down";

function StatusLine({ icon: Icon, label, state }: { icon: RemixiconComponentType; label: string; state: LineState }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      <span className="flex-1 text-body-medium text-text-primary">{label}</span>
      {state === "checking" ? (
        <RiLoader4Line className="size-4 animate-spin text-foreground-icon-tertiary" aria-label="Checking" />
      ) : state === "ok" ? (
        <RiCheckboxCircleLine className="size-4 text-notification-success-foreground" aria-label="Working" />
      ) : state === "slow" ? (
        <span className="flex items-center gap-1.5 text-body-regular text-warning-text">
          Slow
          <RiErrorWarningLine className="size-4" aria-hidden />
        </span>
      ) : state === "unknown" ? (
        <span className="text-body-regular text-text-tertiary">Can&apos;t check</span>
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
      title={problem ? titleFor(problem, status) : ""}
      className="sm:max-w-md"
    >
      {problem && (
        <div className="flex flex-col gap-4">
          {status && (status.internet !== "ok" || status.server === false) && (
            <Illustration name={status.internet !== "ok" ? "offline" : "server-down"} className="mx-auto h-28" />
          )}
          <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-secondary-default">
            <StatusLine icon={RiGlobalLine} label="Your internet" state={internetState(status)} />
            <StatusLine icon={RiServerLine} label="Canaan server" state={serverState(status)} />
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
