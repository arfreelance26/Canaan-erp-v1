import type { CustomerStatus } from "@/types/customer";

export type CustomerDestination = {
  id: string;
  customerId: string;
  destinationName: string;
  destinationState: string;
  status: CustomerStatus | "";
};
