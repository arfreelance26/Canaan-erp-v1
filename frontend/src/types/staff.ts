export type StaffDevice = {
  id: string;        // device identifier (hash) — used to reset this one device
  kind: string;      // "web" | "mobile" | "unknown"
  os: string | null; // detected OS at login, e.g. "Windows" / "Android"
  label: string;     // human label, e.g. "Windows · Web browser"
  boundAt: string | null;
};

export type Staff = {
  id: string;
  photoUrl: string | null;
  name: string;
  staffId: string;
  department: string;
  designation: string;
  dateOfBirth: string;
  dateOfJoining: string;
  email: string;
  contactNumber: string;
  address: string;
  aadharNumber: string | null;
  aadharFileName: string | null;
  softwareDesignation: string;
  username: string;
  password: string;
  version?: number;
  deviceBound?: boolean;
  devices?: StaffDevice[];
};
