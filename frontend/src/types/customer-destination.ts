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
  approxDistanceKm?: string;
  cargoClassification?: CargoClassification | "";
  containerType?: ContainerType | "";
  weightInTons?: WeightInTons | "";
};
