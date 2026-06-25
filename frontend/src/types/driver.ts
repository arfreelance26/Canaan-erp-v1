export type YesNo = "Yes" | "No";

export type Driver = {
  id: string;
  photoUrl: string | null;
  driverId: string;
  name: string;
  aadhaarNumber: string;
  aadhaarFileName: string | null;
  dateOfBirth: string;
  dateOfJoining: string;
  email: string;
  contactNumber: string;
  address: string;
  branch: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  licenseFileName: string | null;
  form11: YesNo | "";
  esiNumber: string;
  panNumber: string;
  agreementSigned: YesNo | "";
  bankName: string;
  bankBranchName: string;
  accountNumber: string;
  ifscCode: string;
  username: string;
  password: string;
};
