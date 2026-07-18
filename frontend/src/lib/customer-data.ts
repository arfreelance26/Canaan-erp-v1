import type { Customer } from "@/types/customer";

export const CUSTOMER_TYPE_OPTIONS = ["Transports", "Shipping"];

export const CUSTOMER_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "BLACKLISTED"];

export const initialCustomers: Customer[] = [
  {
    id: "1",
    photoUrl: null,
    name: "Sri Lakshmi Traders",
    gstin: "33AABCS1234F1Z5",
    contactPersonnelName: "Karthik Raja",
    phone: "+91 98765 11223",
    email: "karthik@srilakshmitraders.com",
    address: "12, Mount Road, Chennai, Tamil Nadu",
    customerType: "Transports",
    status: "ACTIVE",
    isGta: "No",
    applicableForEInvoice: "Yes",
    tdsExemptionApplicable: "No",
    msmeDeclarationSubmitted: "No",
    gstExemptedCustomer: "No",
  },
  {
    id: "2",
    photoUrl: null,
    name: "Blue Wave Shipping Pvt Ltd",
    gstin: "32AAACB5678G1Z2",
    contactPersonnelName: "Meera Nair",
    phone: "+91 91234 55667",
    email: "meera.nair@bluewaveshipping.com",
    address: "45, Marine Drive, Kochi, Kerala",
    customerType: "Shipping",
    status: "ACTIVE",
    isGta: "Yes",
    applicableForEInvoice: "Yes",
    tdsExemptionApplicable: "Yes",
    msmeDeclarationSubmitted: "No",
    gstExemptedCustomer: "No",
  },
];
