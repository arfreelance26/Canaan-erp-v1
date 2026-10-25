import type { ComplianceDocType } from "@/lib/api";
import type { ComplianceField } from "@/lib/compliance";
import type { Truck } from "@/types/truck";

/** The 7 truck compliance documents and the Truck fields holding each one's
 *  CURRENT values (mirrors backend routers/compliance_records.py DOCS). */
export type ComplianceDocMeta = {
  key: ComplianceDocType;
  label: string;
  short: string;
  /** Its expiry-warning rule in lib/compliance. */
  statusField: ComplianceField;
  dateKey: keyof Truck;
  expensesKey: keyof Truck;
  fileNameKey: keyof Truck;
  /** Only documents that carry a number (road tax, permits, PUC). */
  numberKey?: keyof Truck;
};

export const COMPLIANCE_DOCS: ComplianceDocMeta[] = [
  { key: "rc",              label: "RC",                       short: "RC",        statusField: "rc",             dateKey: "rcValidityDate",           expensesKey: "rcExpenses",                   fileNameKey: "rcDocumentUrl" },
  { key: "fc",              label: "FC (Fitness Certificate)", short: "FC",        statusField: "fc",             dateKey: "fcExpiryDate",             expensesKey: "fcExpenses",                   fileNameKey: "fcDocumentFileName" },
  { key: "road_tax",        label: "Road Tax",                 short: "Road Tax",  statusField: "roadTax",        dateKey: "roadTaxDate",              expensesKey: "roadTaxExpenses",              fileNameKey: "roadTaxDocumentFileName",           numberKey: "roadTaxNumber" },
  { key: "insurance",       label: "Insurance",                short: "Insurance", statusField: "insurance",      dateKey: "insuranceExpiryDate",      expensesKey: "insuranceExpenses",            fileNameKey: "insuranceDocumentProofFileName" },
  { key: "national_permit", label: "National Permit",          short: "N. Permit", statusField: "nationalPermit", dateKey: "nationalPermitDate",       expensesKey: "nationalPermitExpenses",       fileNameKey: "nationalPermitProofFileName",       numberKey: "nationalPermitNumber" },
  { key: "local_permit",    label: "Local Permit",             short: "L. Permit", statusField: "localPermit",    dateKey: "localPermitDate",          expensesKey: "localPermitExpenses",          fileNameKey: "localPermitProofFileName",          numberKey: "localPermitNumber" },
  { key: "pollution_cert",  label: "Pollution Certificate",    short: "PUC",       statusField: "pollution",      dateKey: "pollutionCertificateDate", expensesKey: "pollutionCertificateExpenses", fileNameKey: "pollutionCertificateProofFileName", numberKey: "pollutionCertificateNumber" },
];

/** Who can renew / correct documents and see Compliance History (Admin always). */
export const COMPLIANCE_MANAGER_ROLES = ["Admin", "Commercial Manager", "Assistant Commercial Manager"];

export const formatRupees = (n: number | null | undefined) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
