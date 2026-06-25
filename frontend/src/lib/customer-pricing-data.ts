import type { CustomerPricing } from "@/types/customer-pricing";

export const LOAD_TYPE_OPTIONS = ["IMPORT", "EXPORT", "OPEN LOAD"];

export const CONTAINER_TYPE_OPTIONS = ["20 FEET", "40 FEET", "2 X 20 FEET", "OPEN LOAD"];

export const WEIGHT_IN_TONS_OPTIONS = ["NORMAL", "Up to 20 Tons", "Between 20 - 25 Tons", "Between 25-28 Tons", "Between 28-30 Tons"];

export const initialCustomerPricing: CustomerPricing[] = [
  {
    id: "1",
    customerId: "1",
    customerDestination: "Bengaluru, Karnataka",
    loadType: "IMPORT",
    containerType: "20 FEET",
    weightInTons: "NORMAL",
    rate: "25000",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    status: "ACTIVE",
  },
];
