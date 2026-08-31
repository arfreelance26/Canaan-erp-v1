import type { Staff } from "@/types/staff";

export const DEPARTMENT_OPTIONS = [
  "Canaan Global International",
  "Canaan Global Logistics",
  "Canaan Global Shipping Services",
  "Rehoboth Transports",
];

export const SOFTWARE_DESIGNATION_OPTIONS = [
  "Admin",
  "Commercial Manager",
  "Assistant Commercial Manager",
  "Accounts",
  "Maintenance",
  "Yard Supervisor",
  "Trip Sheet Register",
  "Auditor",
];

export const initialStaff: Staff[] = [
  {
    id: "1",
    photoUrl: null,
    name: "Anita Menon",
    staffId: "STF-1001",
    department: "Canaan Global Logistics",
    designation: "HR Executive",
    dateOfBirth: "1992-04-12",
    dateOfJoining: "2021-06-01",
    email: "anita.menon@canaanglobal.com",
    contactNumber: "+91 98765 43210",
    address: "12, Marina Street, Chennai, Tamil Nadu",
    aadharNumber: null,
    aadharFileName: "anita_menon_aadhar.pdf",

    softwareDesignation: "Trip Sheet Register",
    username: "anita.menon@canaanglobal.com",
    password: "Anita@1234",
  },
  {
    id: "2",
    photoUrl: null,
    name: "Rahul Verma",
    staffId: "STF-1002",
    department: "Canaan Global Shipping Services",
    designation: "Operations Manager",
    dateOfBirth: "1988-11-23",
    dateOfJoining: "2019-02-15",
    email: "rahul.verma@canaanglobal.com",
    contactNumber: "+91 91234 56789",
    address: "45, Harbour Road, Kochi, Kerala",
    aadharNumber: null,
    aadharFileName: "rahul_verma_aadhar.pdf",

    softwareDesignation: "Commercial Manager",
    username: "rahul.verma@canaanglobal.com",
    password: "Rahul@1234",
  },
  {
    id: "3",
    photoUrl: null,
    name: "Karthik Raja",
    staffId: "STF-1003",
    department: "Canaan Global Logistics",
    designation: "Tyre Manager",
    dateOfBirth: "1990-07-19",
    dateOfJoining: "2020-09-10",
    email: "karthik.raja@canaanglobal.com",
    contactNumber: "+91 90000 11223",
    address: "8, Anna Nagar, Chennai, Tamil Nadu",
    aadharNumber: null,
    aadharFileName: "karthik_raja_aadhar.pdf",

    softwareDesignation: "Maintenance",
    username: "karthik.raja@canaanglobal.com",
    password: "Karthik@1234",
  },
];
