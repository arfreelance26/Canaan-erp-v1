import type { CustomerStatus } from "@/types/customer";

export type LoadType = "IMPORT" | "EXPORT" | "OPEN LOAD";

export type ContainerType = "20 FEET" | "40 FEET" | "2 X 20 FEET" | "OPEN LOAD";

export type WeightInTons = "NORMAL" | "Up to 20 Tons" | "Between 20 - 25 Tons" | "Between 25-28 Tons" | "Between 28-30 Tons";

export type CustomerPricing = {
  id: string;
  customerId: string;
  customerDestination: string;
  loadType: LoadType | "";
  containerType: ContainerType | "";
  weightInTons: WeightInTons | "";
  rate: string;
  validFrom: string;
  validTo: string;
  status: CustomerStatus | "";
};
