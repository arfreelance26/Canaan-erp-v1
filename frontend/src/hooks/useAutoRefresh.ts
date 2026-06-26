import { useEffect, useRef } from "react";

/**
 * A hook that calls a given callback at a specified interval.
 * It uses a ref to ensure the latest closure of the callback is always called,
 * preventing stale state closures while also not constantly resetting the interval.
 * 
 * @param callback The function to execute on each interval
 * @param intervalMs The interval in milliseconds (default: 5000)
 */
export function useAutoRefresh(callback: () => void, intervalMs: number = 5000) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    // Don't schedule if no interval or interval is negative
    if (intervalMs <= 0) return;

    const id = setInterval(() => {
      savedCallback.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);
}
