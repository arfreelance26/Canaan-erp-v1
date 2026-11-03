/**
 * Legacy import path. New code imports `cn` from "@/utils/cn" (or `cx` from
 * "@/utils/cx"); this re-export keeps the ~120 existing call sites working.
 */
export { cn } from "@/utils/cn";
