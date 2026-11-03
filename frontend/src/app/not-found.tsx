import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

/** 404 — any route that doesn't exist (static export writes it as 404.html). */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <EmptyState
        illustration="page-not-found"
        title="This page doesn't exist"
        description="The link may be old, or the page was moved"
        action={
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg bg-accent-solid px-4 text-body-medium text-on-solid outline-none transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}
