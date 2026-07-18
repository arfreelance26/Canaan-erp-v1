export type FuelLog = {
  id: string;
  truckId: string;
  date: string;
  odometer: string;
  litres: string;
  pricePerLitre: string;
  totalCost: string;
  distance: string;
  mileage: string;
  fuelStation: string | null;
  loggedBy: string | null;
  createdAt: string | null;
  version?: number;
};

export type FuelStats = {
  totalDistance: string;
  totalFuel: string;
  averageMileage: string;
  lastMileage: string;
  bestMileage: string;
  worstMileage: string;
  trendPercentage: string;
  costPerKm: string;
};
