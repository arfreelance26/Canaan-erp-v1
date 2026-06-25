import type { Driver } from "@/types/driver";

const DRIVER_ID_PREFIX = "CGI-D";

export function generateDriverId(existing: Driver[]): string {
  const maxNumber = existing.reduce((max, driver) => {
    const match = driver.driverId.match(/(\d+)$/);
    const value = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, value);
  }, 0);

  return `${DRIVER_ID_PREFIX}${String(maxNumber + 1).padStart(3, "0")}`;
}

export const initialDrivers: Driver[] = [
  {
    id: "1",
    photoUrl: null,
    driverId: "CGI-D001",
    name: "Suresh Kumar",
    aadhaarNumber: "1234 5678 9012",
    aadhaarFileName: "suresh_kumar_aadhaar.pdf",
    dateOfBirth: "1985-03-18",
    dateOfJoining: "2018-09-01",
    email: "suresh.kumar@canaanglobal.com",
    contactNumber: "+91 99887 66554",
    address: "23, Ganesh Nagar, Coimbatore, Tamil Nadu",
    branch: "Coimbatore",
    licenseNumber: "TN38 20180012345",
    licenseExpiryDate: "2028-09-30",
    licenseFileName: "suresh_kumar_license.pdf",
    form11: "Yes",
    esiNumber: "TN/100/123456789",
    panNumber: "ABCDE1234F",
    agreementSigned: "Yes",
    bankName: "HDFC Bank",
    bankBranchName: "Coimbatore Main",
    accountNumber: "1234567890123456",
    ifscCode: "HDFC0001234",
    username: "suresh.kumar@canaanglobal.com",
    password: "Suresh@1234",
  },
  {
    id: "2",
    photoUrl: null,
    driverId: "CGI-D002",
    name: "Manoj Pillai",
    aadhaarNumber: "2345 6789 0123",
    aadhaarFileName: "manoj_pillai_aadhaar.pdf",
    dateOfBirth: "1990-07-09",
    dateOfJoining: "2020-01-20",
    email: "manoj.pillai@canaanglobal.com",
    contactNumber: "+91 98456 12378",
    address: "78, Beach Road, Kochi, Kerala",
    branch: "Kochi",
    licenseNumber: "KL07 20190054321",
    licenseExpiryDate: "2027-01-19",
    licenseFileName: "manoj_pillai_license.pdf",
    form11: "No",
    esiNumber: "KL/100/987654321",
    panNumber: "PQRST5678U",
    agreementSigned: "Yes",
    bankName: "Axis Bank",
    bankBranchName: "Kochi Princep",
    accountNumber: "9876543210987654",
    ifscCode: "UTIB0000234",
    username: "manoj.pillai@canaanglobal.com",
    password: "Manoj@1234",
  },
];
