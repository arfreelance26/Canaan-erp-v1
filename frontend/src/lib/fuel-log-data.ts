export type FuelLog = {
  id: string;
  truckId: string; // matches Truck.id
  date: string;
  odometer: number;
  litres: number;
  pricePerLitre: number;
  totalCost: number;
  fuelStation: string;
  loggedBy: string; // driver name
};

export const initialFuelLogs: FuelLog[] = [
  // TN 69 AA 1256 (truckId "1") — logged by Suresh Kumar
  {
    id: "FL-001",
    truckId: "1",
    date: "2026-05-10",
    odometer: 83600,
    litres: 110,
    pricePerLitre: 92.5,
    totalCost: 10175,
    fuelStation: "Indian Oil, Coimbatore",
    loggedBy: "Suresh Kumar",
  },
  {
    id: "FL-002",
    truckId: "1",
    date: "2026-05-22",
    odometer: 84100,
    litres: 115,
    pricePerLitre: 92.5,
    totalCost: 10637.5,
    fuelStation: "BPCL, Kochi",
    loggedBy: "Suresh Kumar",
  },
  {
    id: "FL-003",
    truckId: "1",
    date: "2026-06-04",
    odometer: 84500,
    litres: 108,
    pricePerLitre: 93.0,
    totalCost: 10044,
    fuelStation: "HP Petrol Bunk, Chennai",
    loggedBy: "Suresh Kumar",
  },
];
