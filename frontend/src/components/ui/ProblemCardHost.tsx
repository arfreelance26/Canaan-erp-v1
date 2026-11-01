"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, Globe, Loader2, RefreshCw, Server, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
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

function StatusLine({ icon: Icon, label, ok }: { icon: typeof Globe; label: string; ok: boolean | null }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
      {ok === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Working" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" aria-label="Not working" />
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
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50">
            <StatusLine icon={Globe} label="Your internet" ok={status?.internet ?? null} />
            <StatusLine icon={Server} label="Canaan server" ok={status?.server ?? null} />
          </div>

          <p className="text-sm text-gray-600">{status ? messageFor(problem, status) : "Checking your connection…"}</p>

          {problem.reference && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3.5 py-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Reference code</p>
                <p className="font-mono text-sm font-semibold text-gray-800">{problem.reference}</p>
              </div>
              <button
                type="button"
                onClick={copyReference}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
            {problem.onRetry && (
              <button
                type="button"
                onClick={tryAgain}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
