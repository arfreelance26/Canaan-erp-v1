import { PageSkeleton } from "@/components/ui/PageSkeleton";

/**
 * Shown the moment a page link is clicked, while that page's code loads.
 * One file at the root covers every route: the sidebar and topbar stay put
 * and only the content area switches to the skeleton, so a click always gets
 * an instant response instead of the old page sitting there.
 */
export default function Loading() {
  return <PageSkeleton hasSearch rows={8} />;
}
