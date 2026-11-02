export type Vendor = {
  id: string;
  name: string;
  category: string;
  contactNumber: string;
  gstin: string;
  pan: string;
  email: string;
  address: string;
  /** The vendor's picture: a face ("notionists") or "shapes", drawn from avatarSeed (ProfileAvatar). */
  avatarStyle?: "notionists" | "shapes" | null;
  avatarSeed?: string | null;
  createdAt: string;
  version?: number;
};
