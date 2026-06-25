export type VendorStatus = "ACTIVE" | "INACTIVE" | "BLACKLISTED";

export type Vendor = {
  id: string;
  name: string;
  category: string;
  contactNumber: string;
  gstin: string;
  pan: string;
  email: string;
  address: string;
  status: VendorStatus | "";
  createdAt: string;
};
