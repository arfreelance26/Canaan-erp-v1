"use client";

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react";
import { initialTyreInventory } from "@/lib/tyre-inventory-data";
import { initialTyreFitmentRecords } from "@/lib/tyre-fitment-data";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";

type TyreInventoryContextValue = {
  tyres: TyreInventoryItem[];
  setTyres: Dispatch<SetStateAction<TyreInventoryItem[]>>;
  fitmentRecords: TyreFitmentRecord[];
  setFitmentRecords: Dispatch<SetStateAction<TyreFitmentRecord[]>>;
};

const TyreInventoryContext = createContext<TyreInventoryContextValue | null>(null);

export function TyreInventoryProvider({ children }: { children: React.ReactNode }) {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>(initialTyreInventory);
  const [fitmentRecords, setFitmentRecords] = useState<TyreFitmentRecord[]>(initialTyreFitmentRecords);

  return (
    <TyreInventoryContext.Provider value={{ tyres, setTyres, fitmentRecords, setFitmentRecords }}>
      {children}
    </TyreInventoryContext.Provider>
  );
}

export function useTyreInventory() {
  const context = useContext(TyreInventoryContext);
  if (!context) {
    throw new Error("useTyreInventory must be used within a TyreInventoryProvider");
  }
  return context;
}
