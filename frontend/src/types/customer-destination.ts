import type { CargoClassification, ContainerType, WeightInTons } from "./customer-pricing";

export type CustomerDestination = {
  id: string;
  customerId: string;
  destinationName?: string;
  destinationState: string;
  destinationAddress?: string;
  originState?: string;
  originAddress?: string;
  status?: string;
  /** One way, road km. */
  approxDistanceKm?: string;
  /** The route's exact ends when pinned on the map (Pick on map); null = not pinned. */
  originLat?: number | null;
  originLon?: number | null;
  destinationLat?: number | null;
  destinationLon?: number | null;
  /** Where the km came from: pinned on the map, matched from the address, typed, or
   *  "auto" (Geoapify, filled in from a trip sheet when the route had no km). */
  distanceSource?: "map" | "address" | "typed" | "auto" | null;
  cargoClassification?: CargoClassification | "";
  containerType?: ContainerType | "";
  weightInTons?: WeightInTons | "";
};
