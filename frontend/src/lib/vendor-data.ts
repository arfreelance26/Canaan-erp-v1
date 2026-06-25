import type { Vendor } from "@/types/vendor";

export const VENDOR_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "BLACKLISTED"];

export const VENDOR_CATEGORY_OPTIONS = [
  "Tyre Seller",
  "Tyre Rethreader",
  "Tyre Worker",
  "Mechanic",
  "Tinker",
  "Dealer",
  "Painter",
  "Spares",
  "Others",
];

export const initialVendors: Vendor[] = [
  {
    id: "1",
    name: "Annai Tyre Mart",
    category: "Tyre Seller",
    contactNumber: "+91 98765 22334",
    gstin: "33AABCT1234F1Z9",
    pan: "AABCT1234F",
    email: "contact@annaityremart.com",
    address: "21, GST Road, Chennai, Tamil Nadu",
    status: "ACTIVE",
    createdAt: "2026-01-15",
  },
  {
    id: "2",
    name: "Velu Auto Spares",
    category: "Spares",
    contactNumber: "+91 91234 88990",
    gstin: "33AAACV5678G1Z3",
    pan: "AAACV5678G",
    email: "velu.spares@gmail.com",
    address: "8, Ring Road, Coimbatore, Tamil Nadu",
    status: "ACTIVE",
    createdAt: "2026-02-02",
  },
];
