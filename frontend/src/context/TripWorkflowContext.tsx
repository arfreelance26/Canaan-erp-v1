"use client";

import { createContext, useContext, useState } from "react";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";

type TripWorkflowContextValue = {
  // Map of trip.id → closure data (set when user submits Close Trip)
  closures: Map<string, TripClosureData>;
  addClosure: (data: TripClosureData) => void;

  // Map of trip.id → trip sheet data (set when user submits Add Trip Sheet)
  sheets: Map<string, TripSheetData>;
  addSheet: (data: TripSheetData) => void;

  // Set of trip.ids that have been verified on the Trip Verification page
  verifications: Set<string>;
  addVerification: (tripId: string) => void;

  // Set of trip.ids flagged for rechecking on the Trip Verification page
  flags: Set<string>;
  addFlag: (tripId: string) => void;
  removeFlag: (tripId: string) => void;
};

const TripWorkflowContext = createContext<TripWorkflowContextValue | null>(null);

export function TripWorkflowProvider({ children }: { children: React.ReactNode }) {
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [verifications, setVerifications] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<Set<string>>(new Set());

  function addClosure(data: TripClosureData) {
    setClosures((prev) => new Map([...prev, [data.tripId, data]]));
  }

  function addSheet(data: TripSheetData) {
    setSheets((prev) => new Map([...prev, [data.tripId, data]]));
  }

  function addVerification(tripId: string) {
    setVerifications((prev) => new Set([...prev, tripId]));
    // Clear any flag when verified
    setFlags((prev) => { const s = new Set(prev); s.delete(tripId); return s; });
  }

  function addFlag(tripId: string) {
    setFlags((prev) => new Set([...prev, tripId]));
  }

  function removeFlag(tripId: string) {
    setFlags((prev) => { const s = new Set(prev); s.delete(tripId); return s; });
  }

  return (
    <TripWorkflowContext.Provider value={{ closures, addClosure, sheets, addSheet, verifications, addVerification, flags, addFlag, removeFlag }}>
      {children}
    </TripWorkflowContext.Provider>
  );
}

export function useTripWorkflow() {
  const ctx = useContext(TripWorkflowContext);
  if (!ctx) throw new Error("useTripWorkflow must be used inside TripWorkflowProvider");
  return ctx;
}
