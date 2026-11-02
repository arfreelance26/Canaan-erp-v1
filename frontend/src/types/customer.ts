export type CustomerType = "Transports" | "Shipping";

export type YesNoOption = "Yes" | "No";

export type Customer = {
  id: string;
  name: string;
  gstin: string;
  contactPersonnelName: string;
  phone: string;
  email: string;
  address: string;
  customerType: CustomerType | "";
  isGta: YesNoOption | "";
  applicableForEInvoice: YesNoOption | "";
  photoUrl?: string | null;
  /** The customer's picture: a face ("notionists") or "shapes", drawn from avatarSeed (ProfileAvatar). */
  avatarStyle?: "notionists" | "shapes" | null;
  avatarSeed?: string | null;
  status?: string;
  tdsExemptionApplicable?: YesNoOption | "";
  msmeDeclarationSubmitted?: YesNoOption | "";
  gstExemptedCustomer?: YesNoOption | "";
  version?: number;
};
