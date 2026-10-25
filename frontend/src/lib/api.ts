/**
 * Centralized API client — all calls to the FastAPI backend go through here.
 * Transforms snake_case backend responses to the camelCase frontend types.
 */
import { previewQuery } from "@/lib/celebration-preview";
import type { AdBlueLog } from "@/types/adblue-log";
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Staff } from "@/types/staff";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerOrigin } from "@/types/customer-origin";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import type { Vendor } from "@/types/vendor";
import type { DriverAssignment } from "@/types/driver-assignment";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { DriverAttendanceRecord, StaffAttendanceRecord, AttendanceSummaryRow, DriverAttendanceRemark, StaffSelfSummary } from "@/types/attendance";
import type { LeaveRequest } from "@/types/leave-request";
import type { EditApprovalRequest, EditApprovalAction, EditApprovalResourceType } from "@/types/edit-approval";
import type { MaintenanceRecord, MaintenanceProof } from "@/types/truck-maintenance";
import type { MaintenanceRequest, MaintenanceRequestProof } from "@/types/maintenance-request";
import type { TyreInventoryItem, TyreData, TyreRemarkPreset, TyreRemarkScenario } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import type { CompensationTransaction } from "@/types/compensation";
import type { FuelLog, FuelStats } from "@/types/fuel-log";
import type { Branch } from "@/types/branch";
import type { RepairType } from "@/types/repair-type";
import type { VendorCategory } from "@/types/vendor-category";
import type { SacCode } from "@/types/sac-code";
import type { CfsYardEntry } from "@/types/cfs-yard";
import type { MaintenanceCategory, MaintenanceCategoryRepair } from "@/types/maintenance-category";
import type { ChatMember, ChatMessage, ChatConversation, ChatConversationDetail, ChatPresence, ChatOwnerConversation, ChatOwnerHistoryEntry } from "@/types/chat";
import type { PaymentRequest } from "@/types/payment-request";

import { cacheGet, cacheSet, cacheGeneration, dedupe, cacheInvalidate, emitRevalidated, FRESH_MS } from "./api-cache";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Auth helpers — read the JWT saved by AuthContext and attach it to requests
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem("canaan_erp_user");
    const token = stored ? (JSON.parse(stored) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function handleUnauthorized() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("canaan_erp_user");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

// ---------------------------------------------------------------------------
// Core fetch utility
// ---------------------------------------------------------------------------

const method = (o?: RequestInit) => (o?.method ?? "GET").toUpperCase();

// How long to wait on a slow link before giving up. Generous so slow-but-working
// connections still succeed; reads get less patience than writes.
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 60_000;

// Marks connectivity errors so callers/UI can tell them apart from real HTTP errors.
export class NetworkError extends Error {
  readonly kind: "offline" | "timeout" | "unreachable";
  constructor(kind: "offline" | "timeout" | "unreachable", message: string) {
    super(message);
    this.name = "NetworkError";
    this.kind = kind;
  }
}

// One raw network round-trip + response parsing. No caching concern here.
async function rawReq<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const isWrite = method(options) !== "GET";
  const timeout = setTimeout(
    () => controller.abort(),
    isWrite ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS,
  );
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: options?.signal ?? controller.signal,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
    });
  } catch (err) {
    // Distinguish offline / timeout / server-unreachable so the UI can guide the user.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new NetworkError("offline", "You appear to be offline. Please check your internet connection and try again.");
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new NetworkError(
        "timeout",
        isWrite
          ? "The request is taking too long — your internet connection seems slow. Your changes may not have been saved; please check your connection and try again."
          : "The request is taking too long — please check your internet connection and try again.",
      );
    }
    throw new NetworkError("unreachable", "Can't reach the server — your connection may be slow or unstable. Please check your internet and try again.");
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 && !path.startsWith("/auth/")) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) {
    const raw = data?.detail;
    let errorMsg: string;
    if (typeof raw === "string") {
      errorMsg = raw;
    } else if (Array.isArray(raw)) {
      // FastAPI 422: detail is [{loc, msg, type}, ...]
      errorMsg = raw
        .map((e: Record<string, unknown>) => (typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
        .join("; ");
    } else if (raw != null) {
      errorMsg = JSON.stringify(raw);
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
    throw new Error(errorMsg);
  }
  return data as T;
}

/**
 * Cached request wrapper (stale-while-revalidate).
 *
 * GET: serves the persisted cache instantly so pages paint without waiting on
 * the network. Within FRESH_MS it skips the network entirely (no DB hit);
 * otherwise it returns cached data and revalidates in the background, notifying
 * subscribers (useAutoRefresh) only when the data actually changed. When there
 * is no cache at all it awaits the network as before. Concurrent identical GETs
 * are de-duplicated into one request.
 *
 * Mutations pass straight through and invalidate the affected resource's cache.
 */
async function req<T>(path: string, options?: RequestInit): Promise<T> {
  if (method(options) !== "GET") {
    const result = await rawReq<T>(path, options);
    cacheInvalidate(path);
    return result;
  }

  const cached = cacheGet(path);

  // A write to this resource while the GET is in flight means the response may
  // predate it. Never cache that — caching it would resurrect the old state
  // (e.g. a trip just marked Delivered reappearing as Pending). Background
  // refreshes just drop it; a caller awaiting data refetches once.
  const revalidate = (retried = false): Promise<T> => {
    const gen = cacheGeneration(path);
    return dedupe(path, () => rawReq<T>(path, options)).then((fresh) => {
      if (cacheGeneration(path) !== gen) {
        return retried ? (fresh as T) : revalidate(true);
      }
      if (cacheSet(path, fresh)) emitRevalidated();
      return fresh as T;
    });
  };

  if (cached) {
    // Fresh enough → zero network. Stale → refresh in background, return cached now.
    if (Date.now() - cached.ts >= FRESH_MS) {
      revalidate().catch(() => {
        /* keep showing cached data if the network is down */
      });
    }
    return cached.data as T;
  }

  // Cold cache — must wait for the network (first ever load / after invalidation).
  // Retry once on a transient connectivity error to ride out a brief slow-network blip.
  try {
    return await revalidate();
  } catch (err) {
    if (err instanceof NetworkError && err.kind !== "offline") {
      await new Promise((r) => setTimeout(r, 1500));
      return revalidate();
    }
    throw err;
  }
}

// Returns the URL to serve a stored file (photo / document).
// The download endpoint now requires authentication (SECURITY_PLAN.md CRITICAL-1);
// <img src> tags cannot send headers, so the current session token is appended as
// a query param, which the backend accepts in addition to the Authorization header.
export function fileUrl(entity: string, entityId: string, field: string): string {
  const base = `${BASE}/files/${entity}/${entityId}/${field}`;
  if (typeof window === "undefined") return base;
  try {
    const stored = localStorage.getItem("canaan_erp_user");
    const token = stored ? (JSON.parse(stored) as { token?: string }).token : undefined;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  } catch {
    return base;
  }
}

// Requests a server-generated .xlsx export and returns the file (not yet saved).
export async function fetchExcel(path: string, fallbackFilename: string): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  } catch {
    throw new Error(`Cannot reach the server at ${BASE}. Make sure the backend is running (uvicorn main:app --port 8000).`);
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") errorMsg = data.detail;
    } catch {}
    throw new Error(errorMsg);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;
  return { blob: await res.blob(), filename };
}

// Triggers a browser download of an in-memory file.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Requests a server-generated .xlsx export and triggers a browser download.
export async function downloadExcel(path: string, fallbackFilename: string): Promise<void> {
  const { blob, filename } = await fetchExcel(path, fallbackFilename);
  saveBlob(blob, filename);
}

// Upload a file (photo or document) for an entity
export async function uploadFile(
  entity: string,
  entityId: string,
  field: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/files/${entity}/${entityId}/${field}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    throw new Error("Cannot reach the server. Make sure the backend is running.");
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 413) {
    // Server rejected the file for exceeding the size limit (defense-in-depth in
    // case the client-side check was bypassed). Surface the clean detail message.
    throw new Error(await extractDetail(res, "File too large. The maximum allowed size is 25MB."));
  }
  if (!res.ok) {
    throw new Error(await extractDetail(res, `Upload failed: HTTP ${res.status}`));
  }
}

// Clears a previously uploaded file (blob + filename) for an entity, without
// requiring a replacement upload.
export async function deleteFile(
  entity: string,
  entityId: string,
  field: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/files/${entity}/${entityId}/${field}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    throw new Error("Cannot reach the server. Make sure the backend is running.");
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    throw new Error(await extractDetail(res, `Failed to remove file: HTTP ${res.status}`));
  }
}

// ---------------------------------------------------------------------------
// Truck compliance history — every document a truck has held (Our Fleet →
// Compliance History); renewed / corrected on Compliance & Renewals.
// ---------------------------------------------------------------------------

export type ComplianceDocType =
  "rc" | "fc" | "road_tax" | "insurance" | "national_permit" | "local_permit" | "pollution_cert";

export type ComplianceRecord = {
  id: number;
  docType: ComplianceDocType;
  docLabel: string;
  kind: "First entry" | "Renewal";
  isCurrent: boolean;
  docNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  expense: number | null;
  fileName: string | null;
  hasFile: boolean;
  createdByName: string;
  createdAt: string;
  correctedByName: string | null;
  correctedAt: string | null;
  correctionNote: string | null;
};

export type ComplianceLogEntry = {
  id: number;
  docType: ComplianceDocType | null;
  documentType: string;
  /** null = document added / renewed / updated; "Corrected"; "Renewal undone". */
  action: string | null;
  note: string | null;
  actorName: string;
  createdAt: string;
};

export type ComplianceDocInput = {
  validUntil: string;
  validFrom?: string;
  expense?: string;
  docNumber?: string;
  note?: string;
  file?: File | null;
  /** Correct only: remove the current file without a replacement. */
  removeFile?: boolean;
};

function complianceForm(input: ComplianceDocInput): FormData {
  const form = new FormData();
  form.append("valid_until", input.validUntil);
  if (input.validFrom) form.append("valid_from", input.validFrom);
  if (input.expense) form.append("expense", input.expense);
  if (input.docNumber) form.append("doc_number", input.docNumber);
  if (input.note) form.append("note", input.note);
  if (input.file) form.append("file", input.file);
  if (input.removeFile) form.append("remove_file", "true");
  return form;
}

async function postComplianceForm(path: string, form: FormData): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", headers: authHeaders(), body: form });
  } catch {
    throw new Error("Cannot reach the server. Make sure the backend is running.");
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) throw new Error(await extractDetail(res, `Couldn't save: HTTP ${res.status}`));
  cacheInvalidate("/trucks");
  cacheInvalidate("/compliance-records");
}

export const complianceRecordsApi = {
  listForTruck: (truckId: string) =>
    req<B[]>(`/compliance-records/truck/${truckId}`).then((rows) =>
      rows.map((r): ComplianceRecord => ({
        id: r.id,
        docType: r.doc_type,
        docLabel: r.doc_label,
        kind: r.kind,
        isCurrent: !!r.is_current,
        docNumber: r.doc_number ?? null,
        validFrom: r.valid_from ?? null,
        validUntil: r.valid_until ?? null,
        expense: r.expense ?? null,
        fileName: r.file_name ?? null,
        hasFile: !!r.has_file,
        createdByName: r.created_by_name ?? "",
        createdAt: r.created_at,
        correctedByName: r.corrected_by_name ?? null,
        correctedAt: r.corrected_at ?? null,
        correctionNote: r.correction_note ?? null,
      })),
    ),
  renew: (truckId: string, doc: ComplianceDocType, input: ComplianceDocInput) =>
    postComplianceForm(`/compliance-records/truck/${truckId}/${doc}/renew`, complianceForm(input)),
  correct: (truckId: string, doc: ComplianceDocType, input: ComplianceDocInput) =>
    postComplianceForm(`/compliance-records/truck/${truckId}/${doc}/correct`, complianceForm(input)),
  /** Everything that happened to a truck's documents, newest first. */
  getLog: (truckId: string) =>
    req<B[]>(`/compliance-records/truck/${truckId}/log`).then((rows) =>
      rows.map((r): ComplianceLogEntry => ({
        id: r.id,
        docType: r.doc_type ?? null,
        documentType: r.document_type ?? "",
        action: r.action ?? null,
        note: r.note ?? null,
        actorName: r.actor_name ?? "",
        createdAt: r.created_at,
      })),
    ),
  /** Admin only — delete the latest renewal and make the previous document current again. */
  undoRenewal: (truckId: string, doc: ComplianceDocType, reason: string) => {
    const form = new FormData();
    form.append("reason", reason);
    return postComplianceForm(`/compliance-records/truck/${truckId}/${doc}/undo-renewal`, form);
  },
  /** A past or current document's file (token in the URL, like fileUrl). */
  fileUrl: (recordId: number) => {
    const base = `${BASE}/compliance-records/${recordId}/file`;
    if (typeof window === "undefined") return base;
    try {
      const stored = localStorage.getItem("canaan_erp_user");
      const token = stored ? (JSON.parse(stored) as { token?: string }).token : undefined;
      return token ? `${base}?token=${encodeURIComponent(token)}` : base;
    } catch {
      return base;
    }
  },
};

// Parse a FastAPI error body ({"detail": "..."}) into a clean message, falling
// back to raw text or a provided default so popups never show raw JSON.
async function extractDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.text();
    if (!body) return fallback;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.detail === "string") return parsed.detail;
    } catch {
      return body; // not JSON — return the raw text
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Transformers  (backend → frontend type)
// ---------------------------------------------------------------------------

 
type B = Record<string, any>;

export type OdometerInfo = {
  odometer: number;
  maxTripSheetEndKm: number | null;
  maxMaintenanceOdometer: number | null;
  corrections: { id: number; oldOdometer: number; newOdometer: number; reason: string; actorName: string; createdAt: string }[];
};

function toTruck(b: B): Truck {
  return {
    id: String(b.id),
    truckId: b.truck_id ?? "",
    branchRegisteredTo: b.branch_registered_to ?? "",
    registrationNumber: b.registration_number ?? "",
    manufacturer: b.manufacturer ?? "",
    modelName: b.model_name ?? "",
    truckType: b.truck_type ?? "",
    truckPhotosFileName: b.truck_photos_file_name ?? null,
    chassisNumber: b.chassis_number ?? "",
    yearOfManufacture: b.year_of_manufacture ?? "",
    tyreLayout: b.tyre_layout ?? "",
    fuelCapacity: String(b.fuel_capacity ?? "0"),
    odometerDuringPurchase: String(b.odometer_during_purchase ?? "0"),
    odometer: String(b.odometer ?? "0"),
    rcValidityDate: b.rc_validity_date ?? "",
    rcExpenses: String(b.rc_expenses ?? ""),
    rcDocumentUrl: b.rc_document_url ?? null,
    fcExpiryDate: b.fc_expiry_date ?? "",
    fcDocumentFileName: b.fc_document_file_name ?? null,
    fcExpenses: String(b.fc_expenses ?? ""),
    roadTaxDate: b.road_tax_date ?? "",
    roadTaxNumber: b.road_tax_number ?? "",
    roadTaxDocumentFileName: b.road_tax_document_file_name ?? null,
    roadTaxExpenses: String(b.road_tax_expenses ?? ""),
    insuranceExpiryDate: b.insurance_expiry_date ?? "",
    insuranceExpenses: String(b.insurance_expenses ?? ""),
    insuranceDocumentProofFileName: b.insurance_document_proof_file_name ?? null,
    nationalPermitNumber: b.national_permit_number ?? "",
    nationalPermitDate: b.national_permit_date ?? "",
    nationalPermitProofFileName: b.national_permit_proof_file_name ?? null,
    nationalPermitExpenses: String(b.national_permit_expenses ?? ""),
    localPermitNumber: b.local_permit_number ?? "",
    localPermitDate: b.local_permit_date ?? "",
    localPermitProofFileName: b.local_permit_proof_file_name ?? null,
    localPermitExpenses: String(b.local_permit_expenses ?? ""),
    pollutionCertificateDate: b.pollution_certificate_date ?? "",
    pollutionCertificateNumber: b.pollution_certificate_number ?? "",
    pollutionCertificateProofFileName: b.pollution_certificate_proof_file_name ?? null,
    pollutionCertificateExpenses: String(b.pollution_certificate_expenses ?? ""),
    frontViewFileName: b.front_view_file_name ?? null,
    rearViewFileName: b.rear_view_file_name ?? null,
    leftViewFileName: b.left_view_file_name ?? null,
    rightViewFileName: b.right_view_file_name ?? null,
    version: typeof b.version === "number" ? b.version : undefined,
    disposalType: b.disposal_type ?? null,
    soldDate: b.sold_date ?? null,
    soldOdometer: b.sold_odometer ?? null,
    soldNote: b.sold_note ?? null,
    soldByName: b.sold_by_name ?? null,
  };
}

function fromTruck(f: Truck) {
  return {
    truck_id: f.truckId,
    branch_registered_to: f.branchRegisteredTo || null,
    registration_number: f.registrationNumber,
    manufacturer: f.manufacturer,
    model_name: f.modelName,
    truck_type: f.truckType,
    truck_photos_file_name: f.truckPhotosFileName ?? null,
    chassis_number: f.chassisNumber || null,
    year_of_manufacture: f.yearOfManufacture || null,
    tyre_layout: f.tyreLayout,
    fuel_capacity: f.fuelCapacity ? parseFloat(f.fuelCapacity) : 0,
    odometer_during_purchase: f.odometerDuringPurchase ? parseFloat(f.odometerDuringPurchase) : 0,
    odometer: f.odometer ? parseFloat(f.odometer) : 0,
    rc_validity_date: f.rcValidityDate || null,
    rc_expenses: f.rcExpenses ? parseFloat(f.rcExpenses) : null,
    rc_document_url: f.rcDocumentUrl ?? null,
    fc_expiry_date: f.fcExpiryDate || null,
    fc_document_file_name: f.fcDocumentFileName ?? null,
    fc_expenses: f.fcExpenses ? parseFloat(f.fcExpenses) : null,
    road_tax_date: f.roadTaxDate || null,
    road_tax_number: f.roadTaxNumber || null,
    road_tax_document_file_name: f.roadTaxDocumentFileName ?? null,
    road_tax_expenses: f.roadTaxExpenses ? parseFloat(f.roadTaxExpenses) : null,
    insurance_expiry_date: f.insuranceExpiryDate || null,
    insurance_expenses: f.insuranceExpenses ? parseFloat(f.insuranceExpenses) : null,
    insurance_document_proof_file_name: f.insuranceDocumentProofFileName ?? null,
    national_permit_number: f.nationalPermitNumber || null,
    national_permit_date: f.nationalPermitDate || null,
    national_permit_proof_file_name: f.nationalPermitProofFileName ?? null,
    national_permit_expenses: f.nationalPermitExpenses ? parseFloat(f.nationalPermitExpenses) : null,
    local_permit_number: f.localPermitNumber || null,
    local_permit_date: f.localPermitDate || null,
    local_permit_proof_file_name: f.localPermitProofFileName ?? null,
    local_permit_expenses: f.localPermitExpenses ? parseFloat(f.localPermitExpenses) : null,
    pollution_certificate_date: f.pollutionCertificateDate || null,
    pollution_certificate_number: f.pollutionCertificateNumber || null,
    pollution_certificate_proof_file_name: f.pollutionCertificateProofFileName ?? null,
    pollution_certificate_expenses: f.pollutionCertificateExpenses ? parseFloat(f.pollutionCertificateExpenses) : null,
    front_view_file_name: f.frontViewFileName ?? null,
    rear_view_file_name: f.rearViewFileName ?? null,
    left_view_file_name: f.leftViewFileName ?? null,
    right_view_file_name: f.rightViewFileName ?? null,
    client_version: f.version,
  };
}

function toDriver(b: B): Driver {
  return {
    id: String(b.id),
    photoUrl: b.photo_url ? fileUrl("drivers", String(b.id), "photo") : null,
    driverId: b.driver_id ?? "",
    name: b.name ?? "",
    aadhaarNumber: b.aadhaar_number ?? "",
    aadhaarFileName: b.aadhaar_file_name ?? null,
    dateOfBirth: b.date_of_birth ?? "",
    dateOfJoining: b.date_of_joining ?? "",
    email: b.email ?? "",
    contactNumber: b.contact_number ?? "",
    address: b.address ?? "",

    licenseNumber: b.license_number ?? "",
    licenseExpiryDate: b.license_expiry_date ?? "",
    licenseFileName: b.license_file_name ?? null,
    form11: b.form_11 ?? "",
    esiNumber: b.esi_number ?? "",
    panNumber: b.pan_number ?? "",
    agreementSigned: b.agreement_signed ?? "",
    bankName: b.bank_name ?? "",
    bankBranchName: b.bank_branch_name ?? "",
    accountNumber: b.account_number ?? "",
    ifscCode: b.ifsc_code ?? "",
    username: b.username ?? "",
    password: "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromDriver(f: Driver, password?: string) {
  return {
    driver_id: f.driverId,
    name: f.name,
    aadhaar_number: f.aadhaarNumber || null,
    aadhaar_file_name: f.aadhaarFileName ?? null,
    date_of_birth: f.dateOfBirth || null,
    date_of_joining: f.dateOfJoining || null,
    email: f.email || null,
    contact_number: f.contactNumber || null,
    address: f.address || null,

    license_number: f.licenseNumber || null,
    license_expiry_date: f.licenseExpiryDate || null,
    license_file_name: f.licenseFileName ?? null,
    form_11: f.form11 || null,
    esi_number: f.esiNumber || null,
    pan_number: f.panNumber || null,
    agreement_signed: f.agreementSigned || null,
    bank_name: f.bankName || null,
    bank_branch_name: f.bankBranchName || null,
    account_number: f.accountNumber || null,
    ifsc_code: f.ifscCode || null,
    photo_url: (f.photoUrl && f.photoUrl.startsWith("data:")) ? null : (f.photoUrl || null),
    username: f.username || null,
    password: (password || f.password) || undefined,
    client_version: f.version,
  };
}

function toStaff(b: B): Staff {
  return {
    id: String(b.id),
    photoUrl: b.photo_url ? fileUrl("staff", String(b.id), "photo") : null,
    identityImageUrl: b.identity_image_url ? fileUrl("staff", String(b.id), "identity") : null,
    staffId: b.staff_id ?? "",
    name: b.name ?? "",
    department: b.department ?? "",
    designation: b.designation ?? "",
    softwareDesignation: b.software_designation || "Trip Sheet Register",
    dateOfBirth: b.date_of_birth ?? "",
    dateOfJoining: b.date_of_joining ?? "",
    email: b.email ?? "",
    contactNumber: b.contact_number ?? "",
    address: b.address ?? "",

    aadharNumber: b.aadhar_number ?? null,
    aadharFileName: b.aadhar_file_name ?? null,
    username: b.username ?? "",
    password: "",
    version: typeof b.version === "number" ? b.version : undefined,
    deviceBound: Boolean(b.device_bound),
    devices: Array.isArray(b.devices)
      ? (b.devices as B[]).map((d) => ({
          id: String(d.id ?? ""),
          kind: String(d.kind ?? "unknown"),
          os: d.os ? String(d.os) : null,
          label: String(d.label ?? ""),
          boundAt: d.bound_at ? String(d.bound_at) : null,
        }))
      : [],
  };
}

function fromStaff(f: Staff, password?: string) {
  return {
    staff_id: f.staffId,
    name: f.name,
    department: f.department || null,
    designation: f.designation || null,
    software_designation: f.softwareDesignation,
    date_of_birth: f.dateOfBirth || null,
    date_of_joining: f.dateOfJoining || null,
    email: f.email || null,
    contact_number: f.contactNumber || null,
    address: f.address || null,

    aadhar_number: f.aadharNumber ?? null,
    aadhar_file_name: f.aadharFileName ?? null,
    photo_url: (f.photoUrl && f.photoUrl.startsWith("data:")) ? null : (f.photoUrl || null),
    identity_image_url: (f.identityImageUrl && f.identityImageUrl.startsWith("data:")) ? null : (f.identityImageUrl || null),
    username: f.username || null,
    password: (password || f.password) || undefined,
    client_version: f.version,
  };
}

function toCustomer(b: B): Customer {
  return {
    id: String(b.id),
    name: b.name ?? "",
    gstin: b.gstin ?? "",
    contactPersonnelName: b.contact_personnel_name ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    address: b.address ?? "",
    customerType: b.customer_type ?? "",
    isGta: b.is_gta ?? "",
    applicableForEInvoice: b.applicable_for_e_invoice ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromCustomer(f: Customer) {
  return {
    name: f.name,
    gstin: f.gstin || null,
    contact_personnel_name: f.contactPersonnelName || null,
    phone: f.phone || null,
    email: f.email || null,
    address: f.address || null,
    customer_type: f.customerType || null,
    is_gta: f.isGta || null,
    applicable_for_e_invoice: f.applicableForEInvoice || null,
    client_version: f.version,
  };
}

function toCustomerOrigin(b: B): CustomerOrigin {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    originName: b.origin_name ?? "",
  };
}

function toCustomerDestination(b: B): CustomerDestination {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    destinationName: b.destination_name ?? undefined,
    destinationState: b.destination_state ?? "",
    destinationAddress: b.destination_address ?? "",
    originState: b.origin_state ?? "",
    originAddress: b.origin_address ?? "",
    approxDistanceKm: b.approx_distance_km != null ? String(b.approx_distance_km) : "",
    status: b.status ?? undefined,
    cargoClassification: b.cargo_classification ?? "",
    containerType: b.container_type ?? "",
    weightInTons: b.weight_in_tons ?? "",
  };
}

function toCustomerPricing(b: B): CustomerPricing {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    customerDestinationId: b.customer_destination_id != null ? String(b.customer_destination_id) : null,
    customerDestination: b.customer_destination ?? "",
    rate: String(b.rate ?? ""),
    commissionAmount: b.commission_amount !== null && b.commission_amount !== undefined ? String(b.commission_amount) : "",
    status: b.status ?? "",
  };
}

function toFinalCustomerPricing(b: B): FinalCustomerPricing {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    customerDestinationId: b.customer_destination_id != null ? String(b.customer_destination_id) : null,
    customerDestination: b.customer_destination ?? null,
    actualHireAmount: b.actual_hire_amount != null ? String(b.actual_hire_amount) : null,
    accountsHireAmount: b.accounts_hire_amount != null ? String(b.accounts_hire_amount) : null,
    version: b.version ?? 1,
    createdAt: b.created_at ?? null,
  };
}

function toVendor(b: B): Vendor {
  return {
    id: String(b.id),
    name: b.name ?? "",
    category: b.category ?? "",
    contactNumber: b.contact_number ?? "",
    gstin: b.gstin ?? "",
    pan: b.pan ?? "",
    email: b.email ?? "",
    address: b.address ?? "",
    status: b.status ?? "",
    createdAt: b.created_at ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromVendor(f: Vendor) {
  return {
    name: f.name,
    category: f.category || null,
    contact_number: f.contactNumber || null,
    gstin: f.gstin || null,
    pan: f.pan || null,
    email: f.email || null,
    address: f.address || null,
    status: f.status || "ACTIVE",
    client_version: f.version,
  };
}

// Trip: backend trip_id is the internal int PK; the business "tripId" is trip_id string
function toTrip(b: B): Trip & { _dbId: number } {
  return {
    _dbId: b.id,
    id: String(b.id),
    tripId: b.trip_id ?? "",
    status: b.status ?? "Assigned",
    assignedDate: b.assigned_date ?? "",
    bookingReferenceNo: b.booking_reference_no ?? "",
    bookingCreatedDate: b.booking_created_date ?? "",
    tripCategory: b.trip_category ?? "",
    movementCategory: b.movement_category ?? "",
    customerId: String(b.customer_id ?? ""),
    shipperConsignee: b.shipper_consignee ?? "",
    cargoClassification: b.cargo_classification ?? "",
    containerSpecification: b.container_specification ?? "",
    containerNumber: b.container_number ?? "",
    containerNumber1: b.container_number_1 ?? "",
    containerNumber2: b.container_number_2 ?? "",
    cargoReference: b.cargo_reference ?? "",
    releaseOrderReference: b.release_order_reference ?? "",
    cargoWeight: String(b.cargo_weight ?? ""),
    origin: b.origin ?? "",
    destination: b.destination ?? "",
    shippingLine: b.shipping_line ?? "",
    vesselName: b.vessel_name ?? "",
    scheduledDate: b.scheduled_date ?? "",
    driverId: b.driver_id ?? "",
    vehicleId: b.vehicle_id ?? "",
    billTo: b.bill_to ?? "",
    paymentType: b.payment_type ?? "",
    customerCashAdvance: String(b.customer_cash_advance ?? ""),
    customerFuelAdvanceAmount: String(b.customer_fuel_advance_amount ?? ""),
    customerFuelAdvanceLitres: String(b.customer_fuel_advance_litres ?? ""),
    driverAdvanceAmount: String(b.driver_advance_amount ?? ""),
    driverAdvancePaymentMethod: b.driver_advance_payment_method ?? "",
    driverAdvance: String(b.driver_advance ?? ""),
    initialDisbursedAdvance: b.initial_disbursed_advance != null ? String(b.initial_disbursed_advance) : undefined,
    driverCompensationType: b.driver_compensation_type ?? "",
    isBattaApplicable: b.is_batta_applicable ?? false,
    isBillingApplicable: b.is_billing_applicable ?? true,
    openLoadHireType: b.open_load_hire_type ?? "",
    ratePerTon: String(b.rate_per_ton ?? ""),
    transportHireAmount: String(b.transport_hire_amount ?? ""),
    transportCrossingAmount: String(b.transport_crossing_amount ?? ""),
    transportCommissionAmount: b.transport_commission_amount != null ? String(b.transport_commission_amount) : undefined,
    approxKm: b.approx_km != null ? String(b.approx_km) : undefined,
    approxTripDistance: b.approx_trip_distance != null ? String(b.approx_trip_distance) : undefined,
    liftOnAmount: b.lift_on_amount != null ? String(b.lift_on_amount) : undefined,
    liftOnRemarks: b.lift_on_remarks ?? undefined,
    chaName: b.cha_name ?? undefined,
    flaggedForRecheck: b.flagged_for_recheck ?? undefined,
    flaggedRemark: b.flagged_remark ?? undefined,
    recheckReturned: b.recheck_returned ?? undefined,
    auditVerified: b.audit_verified ?? undefined,
    advanceVerified: b.advance_verified ?? undefined,
    advanceVerificationRemark: b.advance_verification_remark ?? undefined,
    advanceCorrectedAmount: b.advance_corrected_amount != null ? String(b.advance_corrected_amount) : undefined,
    internalRemarks: b.internal_remarks ?? "",
    driverChangeRemark: b.driver_change_remark ?? "",
    bookingInstructions: b.booking_instructions ?? "",
    hasClosure: b.has_closure ?? false,
    hasSheet: b.has_sheet ?? false,
    tripSheetCollected: b.trip_sheet_collected ?? false,
    tripSheetCollectedAt: b.trip_sheet_collected_at ?? null,
    tripSheetReceived: b.trip_sheet_received ?? false,
    tripSheetReceivedAt: b.trip_sheet_received_at ?? null,
    tripSheetDate: b.trip_sheet_date ?? null,
    verificationStatus: b.verification_status ?? "pending",
    verificationRejectionReason: b.verification_rejection_reason ?? null,
    isInvoiced: b.is_invoiced ?? false,
    invoiceRequired: b.invoice_required ?? true,
    useYardCfs: b.use_yard_cfs ?? false,
    useCustomRoute: b.use_custom_route ?? false,
    customerDestinationId: b.customer_destination_id != null ? String(b.customer_destination_id) : null,
    useCustomCustomer: b.use_custom_customer ?? false,
    customCustomerName: b.custom_customer_name ?? null,
    invoiceWaived: b.invoice_waived ?? false,
    isCombinedInvoice: b.is_combined_invoice ?? false,
    driverName: b.driver_name ?? null,
    truckRegistration: b.truck_registration ?? null,
    lrConsignor: b.lr_consignor ?? undefined,
    lrConsignee: b.lr_consignee ?? undefined,
    lrRefNo: b.lr_ref_no ?? undefined,
    lrDescriptionOfGoods: b.lr_description_of_goods ?? undefined,
    lrInvoiceNo: b.lr_invoice_no ?? undefined,
    lrSbBeNo: b.lr_sb_be_no ?? undefined,
    lrSealNoPackages: b.lr_seal_no_packages ?? undefined,
    lrTare: b.lr_tare ?? undefined,
    lrWeight: b.lr_weight ?? undefined,
    lrValue: b.lr_value ?? undefined,
    lrToPay: b.lr_to_pay ?? false,
    lrToBeBilled: b.lr_to_be_billed ?? false,
    lrSavedAt: b.lr_saved_at ?? null,
  };
}

function fromTrip(f: Trip) {
  return {
    trip_id: f.tripId,
    status: f.status,
    assigned_date: f.assignedDate || null,
    booking_reference_no: f.bookingReferenceNo,
    booking_created_date: f.bookingCreatedDate || null,
    trip_category: f.tripCategory || null,
    movement_category: f.movementCategory || null,
    customer_id: f.customerId ? parseInt(f.customerId) : null,
    shipper_consignee: f.shipperConsignee || null,
    cargo_classification: f.cargoClassification || null,
    container_specification: f.containerSpecification || null,
    container_number: f.containerNumber || null,
    container_number_1: f.containerNumber1 || null,
    container_number_2: f.containerNumber2 || null,
    cargo_reference: f.cargoReference || null,
    release_order_reference: f.releaseOrderReference || null,
    cargo_weight: f.cargoWeight || null,
    origin: f.origin || null,
    destination: f.destination || null,
    shipping_line: f.shippingLine || null,
    vessel_name: f.vesselName || null,
    scheduled_date: f.scheduledDate || null,
    driver_id: f.driverId || null,
    vehicle_id: f.vehicleId || null,
    bill_to: f.billTo || null,
    payment_type: f.paymentType || null,
    customer_cash_advance: f.customerCashAdvance ? parseFloat(f.customerCashAdvance) : null,
    customer_fuel_advance_amount: f.customerFuelAdvanceAmount ? parseFloat(f.customerFuelAdvanceAmount) : null,
    customer_fuel_advance_litres: f.customerFuelAdvanceLitres ? parseFloat(f.customerFuelAdvanceLitres) : null,
    driver_advance_amount: f.driverAdvanceAmount ? parseFloat(f.driverAdvanceAmount) : null,
    driver_advance_payment_method: f.driverAdvancePaymentMethod || null,
    driver_advance: f.driverAdvance ? parseFloat(f.driverAdvance) : null,
    initial_disbursed_advance: f.initialDisbursedAdvance ? parseFloat(f.initialDisbursedAdvance) : null,
    driver_compensation_type: f.driverCompensationType || null,
    is_batta_applicable: f.tripCategory === "RETURN TRIP" ? !!f.isBattaApplicable : false,
    is_billing_applicable: f.tripCategory === "SHIFTING" ? !!f.isBillingApplicable : true,
    open_load_hire_type: f.openLoadHireType || null,
    rate_per_ton: f.ratePerTon ? parseFloat(f.ratePerTon) : null,
    transport_hire_amount: f.transportHireAmount ? parseFloat(f.transportHireAmount) : null,
    transport_crossing_amount: f.transportCrossingAmount ? parseFloat(f.transportCrossingAmount) : null,
    transport_commission_amount: f.transportCommissionAmount ? parseFloat(f.transportCommissionAmount) : null,
    approx_km: f.approxKm ? parseFloat(f.approxKm) : null,
    approx_trip_distance: f.approxTripDistance ? parseFloat(f.approxTripDistance) : null,
    lift_on_amount: f.liftOnAmount ? parseFloat(f.liftOnAmount) : null,
    lift_on_remarks: f.liftOnRemarks || null,
    cha_name: f.chaName || null,
    // flagged_for_recheck / flagged_remark aren't sent — the Auditor's
    // recheck state only changes through tripsApi.flagForRecheck /
    // returnForReview / verifyRecheck (the server ignores it on an edit).
    advance_verified: f.advanceVerified ?? null,
    advance_verification_remark: f.advanceVerificationRemark || null,
    advance_corrected_amount: f.advanceCorrectedAmount ? parseFloat(f.advanceCorrectedAmount) : null,
    internal_remarks: f.internalRemarks || null,
    driver_change_remark: f.driverChangeRemark || null,
    booking_instructions: f.bookingInstructions || null,
    invoice_required: f.invoiceRequired ?? true,
    use_yard_cfs: f.useYardCfs ?? false,
    use_custom_route: f.useCustomRoute ?? false,
    // Only sent when the caller knows it — a payload built without it must not
    // wipe the trip's saved route link.
    ...(f.customerDestinationId !== undefined
      ? { customer_destination_id: f.customerDestinationId ? parseInt(f.customerDestinationId) : null }
      : {}),
    // Same rule: only sent when known, so a partial payload can't switch it off.
    ...(f.useCustomCustomer !== undefined
      ? { use_custom_customer: f.useCustomCustomer, custom_customer_name: f.useCustomCustomer ? (f.customCustomerName || "").trim() || null : null }
      : {}),
  };
}

function toClosure(b: B): TripClosureData {
  return {
    tripId: String(b.trip_id ?? ""),
    // 1. Shipment Information
    bookingNo: b.booking_no ?? "",
    containerNo: b.container_no ?? "",
    releaseOrderNo: b.release_order_no ?? "",
    containerType: b.container_type ?? "",
    line: b.line ?? "",
    loadType: b.load_type ?? "",
    movementCategory: b.movement_category ?? "",
    // 2. Assignment
    vehicleId: b.vehicle_id ?? "",
    driverId: b.driver_id ?? "",
    assignmentDate: b.assignment_date ?? "",
    // 3. Route
    fromLocation: b.from_location ?? "",
    toLocation: b.to_location ?? "",
    tripCompletedDate: b.trip_completed_date ?? "",
    // 4. Billing
    hireAmount: String(b.hire_amount ?? ""),
    transportAmount: String(b.transport_amount ?? ""),
    billingAmount: String(b.billing_amount ?? ""),
    advanceAmount: String(b.advance_amount ?? ""),
    driverAdvance: String(b.driver_advance ?? ""),
    additionalDriverAdvance: String(b.additional_driver_advance ?? ""),
    billTo: b.bill_to ?? "",
    // 5. Halt Information
    companyHaltDays: String(b.company_halt_days ?? "0"),
    partyHaltDays: String(b.party_halt_days ?? "0"),
    haltRemarks: b.halt_remarks ?? "",
    driverHaltCompensation: String(b.driver_halt_compensation ?? "0"),
    companyHaltPay: b.company_halt_pay != null ? String(b.company_halt_pay) : "",
    partyHaltPay: b.party_halt_pay != null ? String(b.party_halt_pay) : "",
    closureRemarks: b.closure_remarks ?? "",
    // Meta
    closedAt: b.created_at ? String(b.created_at).split("T")[0] : "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromClosure(f: TripClosureData) {
  const n = (v: string) => parseFloat(v) || 0;
  return {
    // 1. Shipment Information
    booking_no: f.bookingNo || null,
    container_no: f.containerNo || null,
    release_order_no: f.releaseOrderNo || null,
    container_type: f.containerType || null,
    line: f.line || null,
    load_type: f.loadType || null,
    movement_category: f.movementCategory || null,
    // 2. Assignment
    vehicle_id: f.vehicleId || null,
    driver_id: f.driverId || null,
    assignment_date: f.assignmentDate || null,
    // 3. Route
    from_location: f.fromLocation || null,
    to_location: f.toLocation || null,
    trip_completed_date: f.tripCompletedDate || null,
    // 4. Billing
    hire_amount: n(f.hireAmount),
    transport_amount: n(f.transportAmount),
    billing_amount: n(f.billingAmount),
    advance_amount: n(f.advanceAmount),
    driver_advance: n(f.driverAdvance),
    additional_driver_advance: n(f.additionalDriverAdvance),
    bill_to: f.billTo || null,
    ...(f.paymentType ? { payment_type: f.paymentType } : {}),
    // 5. Halt Information
    company_halt_days: parseInt(f.companyHaltDays) || 0,
    party_halt_days: parseInt(f.partyHaltDays) || 0,
    halt_remarks: f.haltRemarks || null,
    driver_halt_compensation: n(f.driverHaltCompensation),
    // Only sent when known — a closure saved without them keeps the stored parts.
    ...(f.companyHaltPay !== undefined && f.companyHaltPay !== "" ? { company_halt_pay: n(f.companyHaltPay) } : {}),
    ...(f.partyHaltPay !== undefined && f.partyHaltPay !== "" ? { party_halt_pay: n(f.partyHaltPay) } : {}),
    closure_remarks: f.closureRemarks || null,
    client_version: f.version,  // echo version back for optimistic locking
  };
}

function toSheet(b: B): TripSheetData {
  return {
    tripId: String(b.trip_id),
    tripSheetNo: b.trip_sheet_no ?? "",
    bookingReferenceNo: b.booking_reference_no ?? "",
    containerNumber: b.container_number ?? "",
    containerNumber1: b.container_number_1 ?? "",
    containerNumber2: b.container_number_2 ?? "",
    containerType: b.container_type ?? "",
    line: b.line ?? "",
    tripType: b.trip_type ?? "",
    vehicleId: b.vehicle_id ?? "",
    driverId: b.driver_id ?? "",
    bookingDate: b.booking_date ?? "",
    tripScheduledDate: b.trip_scheduled_date ?? "",
    tripCompletedDate: b.trip_completed_date ?? "",
    tripClosedDate: b.trip_closed_date ?? "",
    tripSheetDate: b.trip_sheet_date ?? "",
    from: b.from_location ?? "",
    to: b.to_location ?? "",
    clearingAgent: b.clearing_agent ?? "",
    hireAmount: String(b.hire_amount ?? ""),
    openLoadHireType: b.open_load_hire_type ?? "",
    ratePerTon: String(b.rate_per_ton ?? ""),
    startKm: String(b.start_km ?? ""),
    endKm: String(b.end_km ?? ""),
    totalKm: String(b.total_km ?? ""),
    cargoWeight: String(b.cargo_weight ?? ""),
    driverCompensationType: b.driver_compensation_type ?? "",
    driverPay: String(b.driver_pay ?? ""),
    driverAdvance: String(b.driver_advance ?? ""),
    additionalDriverAdvance: String(b.additional_driver_advance ?? ""),
    driverAdvanceAmount: String(b.driver_advance_amount ?? ""),
    driverBalance: String(b.driver_balance ?? ""),
    totalHaltDays: String(b.total_halt_days ?? ""),
    haltRemarks: b.halt_remarks ?? "",
    haltPay: String(b.halt_pay ?? ""),
    partyHaltPay: b.party_halt_pay != null ? String(b.party_halt_pay) : "",
    portPassExpense: String(b.port_pass_expense ?? ""),
    weightSheetExpense: String(b.weight_sheet_expense ?? ""),
    mamolExpense: String(b.mamol_expense ?? ""),
    claimableMamolExpense: String(b.claimable_mamol_expense ?? ""),
    trafficRtoExpense: String(b.traffic_rto_expense ?? ""),
    liftOnOffExpense: String(b.lift_on_off_expense ?? ""),
    craneOperatorExpense: String(b.crane_operator_expense ?? ""),
    parkingExpense: String(b.parking_expense ?? ""),
    majorRepairs: Array.isArray(b.major_repairs)
      ? b.major_repairs.map((r: { name?: string; date?: string; odometer?: number; description?: string; cost?: number }) => ({
          name: r.name ?? "",
          date: r.date ?? "",
          odometer: r.odometer != null ? String(r.odometer) : "",
          description: r.description ?? "",
          cost: String(r.cost ?? ""),
        }))
      : [],
    otherExpenses: String(b.other_expenses ?? ""),
    tripExpensesTotal: String(b.trip_expenses_total ?? ""),
    driverExpensesTotal: String(b.driver_expenses_total ?? ""),
    totalExpense: String(b.total_expense ?? ""),
    fuelCostApprox: String(b.fuel_cost_approx ?? ""),
    dieselEntries: Array.isArray(b.diesel_entries) ? b.diesel_entries : [],
    dieselLitres: String(b.diesel_litres ?? ""),
    dieselRate: String(b.diesel_rate ?? ""),
    dieselTotal: String(b.diesel_total ?? ""),
    dieselRemarks: b.diesel_remarks ?? "",
    kmVarianceRemark: b.km_variance_remark ?? "",
    tollCharges: String(b.toll_charges ?? ""),
    remarks: b.remarks ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromSheet(f: TripSheetData) {
  const n = (v: string) => parseFloat(v) || 0;
  return {
    trip_sheet_no: f.tripSheetNo || null,
    booking_reference_no: f.bookingReferenceNo || null,
    container_number: f.containerNumber || null,
    container_number_1: f.containerNumber1 || null,
    container_number_2: f.containerNumber2 || null,
    container_type: f.containerType || null,
    line: f.line || null,
    trip_type: f.tripType || null,
    vehicle_id: f.vehicleId || null,
    driver_id: f.driverId || null,
    booking_date: f.bookingDate || null,
    trip_scheduled_date: f.tripScheduledDate || null,
    trip_completed_date: f.tripCompletedDate || null,
    trip_closed_date: f.tripClosedDate || null,
    trip_sheet_date: f.tripSheetDate || null,
    from_location: f.from || null,
    to_location: f.to || null,
    clearing_agent: f.clearingAgent || null,
    hire_amount: n(f.hireAmount),
    open_load_hire_type: f.openLoadHireType || null,
    rate_per_ton: f.ratePerTon ? n(f.ratePerTon) : null,
    start_km: n(f.startKm),
    end_km: n(f.endKm),
    total_km: n(f.totalKm),
    cargo_weight: n(f.cargoWeight),
    driver_compensation_type: f.driverCompensationType || null,
    driver_pay: n(f.driverPay),
    driver_advance: f.driverAdvance ? n(f.driverAdvance) : null,
    additional_driver_advance: f.additionalDriverAdvance ? n(f.additionalDriverAdvance) : null,
    driver_advance_amount: n(f.driverAdvanceAmount),
    driver_balance: n(f.driverBalance),
    total_halt_days: parseInt(f.totalHaltDays) || 0,
    halt_remarks: f.haltRemarks || null,
    halt_pay: n(f.haltPay),
    port_pass_expense: n(f.portPassExpense),
    weight_sheet_expense: n(f.weightSheetExpense),
    mamol_expense: n(f.mamolExpense),
    claimable_mamol_expense: n(f.claimableMamolExpense),
    traffic_rto_expense: n(f.trafficRtoExpense),
    lift_on_off_expense: n(f.liftOnOffExpense),
    crane_operator_expense: n(f.craneOperatorExpense),
    parking_expense: n(f.parkingExpense),
    major_repairs: (f.majorRepairs || []).map(r => ({
      name: r.name,
      date: r.date || null,
      odometer: r.odometer ? parseInt(r.odometer) : null,
      description: r.description || null,
      cost: parseFloat(r.cost) || 0,
    })),
    other_expenses: n(f.otherExpenses),
    trip_expenses_total: n(f.tripExpensesTotal),
    driver_expenses_total: n(f.driverExpensesTotal),
    total_expense: n(f.totalExpense),
    fuel_cost_approx: n(f.fuelCostApprox),
    diesel_entries: (f.dieselEntries || []).filter(e => parseFloat(e.litres) > 0),
    diesel_litres: f.dieselLitres ? n(f.dieselLitres) : null,
    diesel_rate: f.dieselRate ? n(f.dieselRate) : null,
    diesel_total: f.dieselTotal ? n(f.dieselTotal) : null,
    diesel_remarks: f.dieselRemarks || null,
    km_variance_remark: f.kmVarianceRemark || null,
    toll_charges: n(f.tollCharges),
    remarks: f.remarks || null,
    client_version: f.version,  // echo version back for optimistic locking
  };
}

function toDriverAttendance(b: B): DriverAttendanceRecord {
  return {
    id: String(b.id),
    driverId: b.driver_id ?? "",
    date: b.date ?? "",
    status: b.status ?? "Not Marked",
    checkInTime: b.check_in_time ?? null,
    markedAt: b.marked_at ?? null,
  };
}

function toStaffAttendance(b: B): StaffAttendanceRecord {
  return {
    id: String(b.id),
    staffId: String(b.staff_id ?? ""),
    staffName: b.staff_name ?? null,
    date: b.date ?? "",
    status: b.status ?? "Not Marked",
    checkInTime: b.check_in_time ?? null,
    checkOutTime: b.check_out_time ?? null,
    autoClosed: Boolean(b.auto_closed),
    markedAt: b.marked_at ?? null,
    source: b.source ?? "Web",
    adminOverride: b.admin_override ?? false,
    lastActiveAt: b.last_active_at ?? null,
    closedBy: (b.closed_by as StaffAttendanceRecord["closedBy"]) ?? null,
  };
}

function toLeaveRequest(b: B): LeaveRequest {
  return {
    id: String(b.id),
    category: b.category ?? "Trip Sheet Register",
    applicantId: String(b.applicant_id ?? ""),
    applicantName: b.applicant_name ?? "",
    applicantCode: b.applicant_code ?? "",
    fromDate: b.from_date ?? "",
    toDate: b.to_date ?? "",
    reason: b.reason ?? "",
    status: b.status ?? "Pending",
    appliedAt: b.applied_at ?? "",
    decidedAt: b.decided_at ?? null,
    decidedByName: b.decided_by_name ?? null,
  };
}

/**
 * Every editable field of a maintenance record in the backend's shape. Blank
 * optional fields are sent as null so an edit can clear them. Used for the
 * Admin's direct edit and as an Edit Request's proposed changes, which the
 * backend applies through the same validation once approved.
 */
export function maintenanceRecordChanges(record: MaintenanceRecord): Record<string, unknown> {
  return {
    date: record.date,
    maintenance_end_date: record.maintenanceEndDate || null,
    odometer: parseInt(record.odometer) || 0,
    maintenance_type: record.maintenanceType,
    repair_type: record.repairType || null,
    compliant: record.compliant || null,
    maintenance_location: record.maintenanceLocation || null,
    maintenance_by: record.maintenanceBy || null,
    maintenance_by_type: record.maintenanceByType || null,
    vendor_id: record.maintenanceByType === "Vendor" && record.vendorId ? parseInt(record.vendorId) : null,
    invoice_number: record.invoiceNumber?.trim() || null,
    invoice_date: record.invoiceDate || null,
    description: record.description || null,
    cost: parseFloat(record.cost) || 0,
    remind_at_odometer: parseInt(record.remindAtOdometer ?? "") || null,
  };
}

function toMaintenanceRecord(b: B): MaintenanceRecord {
  return {
    id: String(b.id),
    truckId: String(b.truck_id),
    date: b.date ?? "",
    maintenanceEndDate: b.maintenance_end_date ?? "",
    odometer: String(b.odometer ?? ""),
    maintenanceType: b.maintenance_type ?? "",
    repairType: b.repair_type ?? "",
    compliant: b.compliant ?? "",
    maintenanceLocation: b.maintenance_location ?? "",
    maintenanceBy: b.maintenance_by ?? "",
    description: b.description ?? "",
    cost: String(b.cost ?? ""),
    enteredByName: b.entered_by_name ?? null,
    source: b.source ?? null,
    version: typeof b.version === "number" ? b.version : undefined,
    proofCount: Number(b.proof_count ?? 0),
    maintenanceByType: b.maintenance_by_type === "Vendor" || b.maintenance_by_type === "Individual" ? b.maintenance_by_type : null,
    vendorId: b.vendor_id != null ? String(b.vendor_id) : null,
    invoiceNumber: b.invoice_number ?? "",
    invoiceDate: b.invoice_date ?? "",
    remindAtOdometer: b.remind_at_odometer != null ? String(b.remind_at_odometer) : "",
    truckCode: b.truck_code ?? null,
    truckRegistration: b.truck_registration ?? null,
  };
}

function toMaintenanceProof(b: B): MaintenanceProof {
  return {
    id: String(b.id),
    recordId: String(b.record_id),
    kind: b.kind === "pdf" ? "pdf" : "image",
    fileName: b.file_name ?? "",
    sizeBytes: Number(b.size_bytes ?? 0),
    uploadedByName: b.uploaded_by_name ?? null,
    createdAt: b.created_at ?? null,
  };
}

function toFuelLog(b: B): FuelLog {
  return {
    id: String(b.id),
    truckId: String(b.truck_id),
    date: b.date ?? "",
    odometer: String(b.odometer ?? ""),
    litres: String(b.litres ?? ""),
    pricePerLitre: String(b.price_per_litre ?? ""),
    totalCost: String(b.total_cost ?? ""),
    distance: String(b.distance ?? ""),
    mileage: String(b.mileage ?? ""),
    fuelStation: b.fuel_station ?? null,
    loggedBy: b.logged_by ?? null,
    createdAt: b.created_at ?? null,
    enteredByName: b.entered_by_name ?? null,
    source: b.source ?? null,
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function toFuelStats(b: B): FuelStats {
  return {
    totalDistance: String(b.total_distance ?? ""),
    totalFuel: String(b.total_fuel ?? ""),
    averageMileage: String(b.average_mileage ?? ""),
    lastMileage: String(b.last_mileage ?? ""),
    bestMileage: String(b.best_mileage ?? ""),
    worstMileage: String(b.worst_mileage ?? ""),
    trendPercentage: String(b.trend_percentage ?? ""),
    costPerKm: String(b.cost_per_km ?? ""),
  };
}

function toTyreInventory(b: B): TyreInventoryItem {
  return {
    id: String(b.id),
    brand: b.brand ?? "",
    tyreType: b.tyre_type ?? "",
    tyreNumber: b.tyre_number ?? "",
    size: b.size ?? "",
    rangeKm: String(b.range_km ?? "0"),
    cost: String(b.cost ?? ""),
    costPerKm: String(b.cost_per_km ?? ""),
    purchaseDate: b.purchase_date ?? "",
    retreadCost: String(b.retread_cost ?? ""),
    retreadCount: String(b.retread_count ?? ""),
    // Condition follows the retread count (0 = New, 1+ = Rethreaded).
    condition: ((Number(b.retread_count) || 0) > 0 ? "Rethreaded" : "New") as "New" | "Rethreaded",
    maintenanceBy: b.maintenance_by ?? "",
    maintenanceByType: b.maintenance_by_type === "Vendor" || b.maintenance_by_type === "Individual" ? b.maintenance_by_type : null,
    vendorId: b.vendor_id != null ? String(b.vendor_id) : null,
    invoiceNumber: b.invoice_number ?? "",
    invoiceDate: b.invoice_date ?? "",
    proofFileName: b.proof_file_name ?? null,
    proofSizeBytes: b.proof_size_bytes != null ? Number(b.proof_size_bytes) : null,
    version: typeof b.version === "number" ? b.version : undefined,
    retreadFlaggedAt: b.retread_flagged_at ?? null,
    retreadFlaggedBy: b.retread_flagged_by ?? null,
    discardedAt: b.discarded_at ?? null,
    discardedBy: b.discarded_by ?? null,
    discardReason: b.discard_reason ?? null,
    soldWithTruckAt: b.sold_with_truck_at ?? null,
  };
}

function fromTyreInventory(f: TyreInventoryItem) {
  return {
    brand: f.brand,
    tyre_type: f.tyreType || null,
    tyre_number: f.tyreNumber,
    size: f.size || null,
    range_km: parseInt(f.rangeKm) || 0,
    cost: parseFloat(f.cost) || 0,
    cost_per_km: parseFloat(f.costPerKm) || null,
    purchase_date: f.purchaseDate || null,
    retread_cost: parseFloat(f.retreadCost) || 0,
    retread_count: parseInt(f.retreadCount) || 0,
    condition: (parseInt(f.retreadCount) || 0) > 0 ? "Rethreaded" : "New",
    maintenance_by: f.maintenanceBy?.trim() || null,
    maintenance_by_type: f.maintenanceBy?.trim() ? f.maintenanceByType || null : null,
    vendor_id: f.maintenanceByType === "Vendor" && f.vendorId ? parseInt(f.vendorId) : null,
    invoice_number: f.invoiceNumber?.trim() || null,
    invoice_date: f.invoiceDate || null,
    client_version: f.version,
  };
}

function toTyreFitment(b: B): TyreFitmentRecord {
  return {
    id: String(b.id),
    tyreId: String(b.tyre_id ?? ""),
    truckId: String(b.truck_id ?? ""),
    position: b.position ?? "",
    fittedOdometer: b.fitted_odometer ?? 0,
    fittedDate: b.fitted_date ?? "",
    fittedByName: b.fitted_by_name ?? null,
    fittedRemark: b.fitted_remark ?? null,
    removedOdometer: b.removed_odometer ?? null,
    removedDate: b.removed_date ?? null,
    removalRemark: b.removal_remark ?? null,
    removedByName: b.removed_by_name ?? null,
  };
}

function toEmiRecord(b: B): EmiRecord {
  return {
    id: String(b.id),
    emiName: b.emi_name ?? "",
    truckRegistration: b.truck_registration ?? "",
    loanNumber: b.loan_number ?? "",
    bankName: b.bank_name ?? "",
    loanAmount: String(b.loan_amount ?? ""),
    emiStartDate: b.emi_start_date ?? "",
    emiEndDate: b.emi_end_date ?? "",
    emiAmount: String(b.emi_amount ?? ""),
    tenureMonths: String(b.tenure_months ?? ""),
    autoDebitDate: b.auto_debit_date ?? "",
    costPerMonth: String(b.cost_per_month ?? ""),
    monthlyFinanceCost: String(b.monthly_finance_cost ?? ""),
    dailyFinanceCost: String(b.daily_finance_cost ?? ""),
    emiCostPerKm: String(b.emi_cost_per_km ?? ""),
    createdAt: b.created_at ?? null,
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromEmiRecord(f: EmiRecord) {
  return {
    emi_name: f.emiName,
    truck_registration: f.truckRegistration || null,
    loan_number: f.loanNumber || null,
    bank_name: f.bankName || null,
    loan_amount: parseFloat(f.loanAmount) || 0,
    emi_start_date: f.emiStartDate || null,
    emi_end_date: f.emiEndDate || null,
    emi_amount: parseFloat(f.emiAmount) || 0,
    tenure_months: parseInt(f.tenureMonths) || null,
    auto_debit_date: f.autoDebitDate || null,
    cost_per_month: parseFloat(f.costPerMonth) || 0,
    monthly_finance_cost: parseFloat(f.monthlyFinanceCost) || 0,
    daily_finance_cost: parseFloat(f.dailyFinanceCost) || 0,
    emi_cost_per_km: parseFloat(f.emiCostPerKm) || 0,
    client_version: f.version,
  };
}

function toRecurringPayment(b: B): RecurringPayment {
  return {
    id: String(b.id),
    title: b.title ?? "",
    category: b.category ?? "",
    amount: b.amount ?? 0,
    frequency: b.frequency ?? "Monthly",
    nextDueDate: b.next_due_date ?? "",
    status: b.status ?? "Active",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromRecurringPayment(f: RecurringPayment) {
  return {
    title: f.title,
    category: f.category || null,
    amount: f.amount,
    frequency: f.frequency,
    next_due_date: f.nextDueDate || null,
    status: f.status,
    client_version: f.version,
  };
}

function toCompensationTransaction(b: B): CompensationTransaction {
  return {
    id: String(b.id),
    personId: String(b.person_id ?? ""),
    personName: b.person_name ?? null,
    type: b.type ?? "Salary",
    amount: b.amount ?? 0,
    date: b.date ?? "",
    note: b.note ?? "",
    tripNumber: b.trip_number ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Trucks API
// ---------------------------------------------------------------------------

export type TruckEditEventType = "Truck Created" | "Truck Edited" | "Truck Deleted" | "Truck Restored";

// One row in the page-wide "Edit History" log on Compliance & Renewals —
// every compliance document update ever logged, across every truck. Derived
// directly from ComplianceUpdateHistory (already populated by Truck
// create/update).
export type ComplianceEditEventRow = {
  id: number;
  truckDbId: string;
  truckIdStr: string;
  registrationNumber: string;
  documentType: string;
  actorName: string;
  createdAt: string;
  /** null = document set / renewed; "Corrected"; "Renewal undone". */
  action: string | null;
  note: string | null;
};

// One row in the page-wide "Edit History" log on Our Fleet — every Create/
// Edit/Delete/Restore ever logged, across every truck. See
// TruckEditEventListOut on the backend.
export type TruckEditEventRow = {
  id: number;
  truckDbId: string;
  truckIdStr: string;
  registrationNumber: string;
  event: TruckEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type TruckRunConfigEditEventType = "Run Configuration Saved";

export type TruckRunConfigEditEventRow = {
  id: number;
  event: TruckRunConfigEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const trucksApi = {
  list: () => req<B[]>("/trucks").then((d) => d.map(toTruck)),
  create: (truck: Truck) =>
    req<B>("/trucks", { method: "POST", body: JSON.stringify(fromTruck(truck)) }).then(toTruck),
  // skipEditLog is only ever true for the automatic odometer sync fired on
  // every trip sheet save — keeps that out of the Truck Edit History log.
  update: (dbId: string, truck: Truck, branchChangeNote?: string, skipEditLog?: boolean) =>
    req<B>(`/trucks/${dbId}`, {
      method: "PUT",
      body: JSON.stringify({
        ...fromTruck(truck),
        branch_change_note: branchChangeNote || undefined,
        ...(skipEditLog ? { skip_edit_log: true } : {}),
      }),
    }).then(toTruck),
  /** tyrePlan: what happens to each fitted tyre (required when any are fitted). */
  delete: (dbId: string, tyrePlan?: Record<string, unknown> | null) =>
    req<void>(`/trucks/${dbId}`, {
      method: "DELETE",
      ...(tyrePlan ? { body: JSON.stringify({ tyre_plan: tyrePlan }) } : {}),
    }),
  restore: (dbId: string) => req<B>(`/trucks/${dbId}/restore`, { method: "POST" }).then(toTruck),
  removePermanent: (dbId: string) => req<void>(`/trucks/${dbId}/permanent`, { method: "DELETE" }),
  /** Sell Truck (Admin / Assistant Commercial Manager). tyrePlan required when tyres are fitted. */
  sell: (dbId: string, sale: { soldDate: string; soldOdometer: number; note: string; tyrePlan: Record<string, unknown> | null }) =>
    req<B>(`/trucks/${dbId}/sell`, {
      method: "POST",
      body: JSON.stringify({
        sold_date: sale.soldDate,
        sold_odometer: sale.soldOdometer,
        note: sale.note || null,
        tyre_plan: sale.tyrePlan,
      }),
    }).then(toTruck),
  /** Our Fleet → Sold Trucks. */
  listSold: () => req<B[]>("/trucks/sold").then((d) => d.map(toTruck)),
  /** Sold + deleted trucks (disposalType tells which) — Vehicle Record. */
  listRemoved: () => req<B[]>("/trucks/removed").then((d) => d.map(toTruck)),
  listDeletedIds: () => req<number[]>("/trucks/deleted-ids"),
  getNextId: () => req<{ truck_id: string }>("/trucks/next-id").then((d) => d.truck_id),
  // Page-wide "Edit History" log on Our Fleet — every Create/Edit/Delete/
  // Restore across every truck, enriched with identity for search.
  listEditEvents: (): Promise<TruckEditEventRow[]> =>
    req<B[]>(`/trucks/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        truckDbId: String(r.truck_id ?? ""),
        truckIdStr: String(r.truck_id_str ?? ""),
        registrationNumber: String(r.registration_number ?? ""),
        event: String(r.event) as TruckEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  getBranchHistory: (dbId: string) =>
    req<{ id: number; truck_id: number; from_branch: string | null; to_branch: string; note: string; changed_by_name: string; changed_at: string }[]>(
      `/trucks/${dbId}/branch-history`
    ),
  // Our Fleet → Admin's Correct Odometer.
  getOdometerInfo: (dbId: string): Promise<OdometerInfo> =>
    req<B>(`/trucks/${dbId}/odometer`).then((r) => ({
      odometer: Number(r.odometer ?? 0),
      maxTripSheetEndKm: r.max_trip_sheet_end_km != null ? Number(r.max_trip_sheet_end_km) : null,
      maxMaintenanceOdometer: r.max_maintenance_odometer != null ? Number(r.max_maintenance_odometer) : null,
      corrections: ((r.corrections ?? []) as B[]).map((c) => ({
        id: Number(c.id),
        oldOdometer: Number(c.old_odometer ?? 0),
        newOdometer: Number(c.new_odometer ?? 0),
        reason: String(c.reason ?? ""),
        actorName: String(c.actor_name ?? ""),
        createdAt: String(c.created_at ?? ""),
      })),
    })),
  correctOdometer: (dbId: string, odometer: number, reason: string) =>
    req<B>(`/trucks/${dbId}/odometer-correction`, {
      method: "POST",
      body: JSON.stringify({ odometer, reason }),
    }).then(toTruck),
  // Page-wide "Edit History" log on Compliance & Renewals — every compliance
  // document update ever logged, across every truck.
  listComplianceEditEvents: (): Promise<ComplianceEditEventRow[]> =>
    req<B[]>(`/trucks/compliance-history/all`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        truckDbId: String(r.truck_id ?? ""),
        truckIdStr: String(r.truck_id_str ?? ""),
        registrationNumber: String(r.registration_number ?? ""),
        documentType: String(r.document_type ?? ""),
        actorName: String(r.actor_name ?? ""),
        createdAt: String(r.created_at ?? ""),
        action: r.action ?? null,
        note: r.note ?? null,
      }))
    ),
  // "This Trip Only" branch reassignment from the Assign Trip flow — note is
  // the user's reason for the change, appended to the system-logged entry.
  changeBranchTripOnly: (dbId: string, branchName: string, tripId: string, note: string) =>
    req<B>(`/trucks/${dbId}/branch-change`, {
      method: "POST",
      body: JSON.stringify({ mode: "trip_only", branch_name: branchName, trip_id: tripId, note }),
    }).then(toTruck),
  changeBranchPermanently: (dbId: string, branchName: string, note: string) =>
    req<B>(`/trucks/${dbId}/branch-change`, {
      method: "POST",
      body: JSON.stringify({ mode: "permanent", branch_name: branchName, note }),
    }).then(toTruck),
  getRunConfig: () => req<{ tyre_layout: string; km_per_month: string | null; km_per_day: string | null }[]>("/trucks/run-config"),
  saveRunConfig: (configs: { tyre_layout: string; km_per_month: number | null; km_per_day: number | null }[]) =>
    req<B[]>("/trucks/run-config", { method: "PUT", body: JSON.stringify({ configs }) }),
  listRunConfigEditEvents: (): Promise<TruckRunConfigEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/trucks/run-config/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        event: String(r.event) as TruckRunConfigEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  getBaseTyreCost: () =>
    req<{ id: number; tyre_layout: string; cost: string | null; updated_at: string | null }[]>("/trucks/base-tyre-cost"),
  saveBaseTyreCost: (configs: { tyre_layout: string; cost: number | null }[]) =>
    req<{ id: number; tyre_layout: string; cost: string | null; updated_at: string | null }[]>(
      "/trucks/base-tyre-cost",
      { method: "PUT", body: JSON.stringify({ configs }) }
    ),
  getComplianceHistory: (truckId: string) =>
    req<{ id: number; truck_id: number; document_type: string; updated_at: string; updated_by_name: string }[]>(
      `/trucks/${truckId}/compliance-history`
    ),
  getCompliancePerKmAll: () => req<Record<string, number>>("/trucks/compliance-per-km/all"),
  getCompliancePerDayAll: () => req<Record<string, number>>("/trucks/compliance-per-day/all"),
  // Every truck's Basic-mode Total Cost/Km (fuel+tyre+maintenance+
  // compliance+EMI), cheapest first — only includes trucks with complete
  // config data. Powers the Assign Trip dialog's "recommended truck" list.
  getCostPerKmRanking: () => req<TruckCostPerKmRanking[]>("/trucks/cost-per-km-ranking"),
};

// ---------------------------------------------------------------------------
// Tyre Range Config API
// ---------------------------------------------------------------------------

export type TyreRangeConfigEditEventType = "Tyre Range Config Saved" | "Tyre Type Deleted";

export type TyreRangeConfigEditEventRow = {
  id: number;
  tyreType: string | null;
  event: TyreRangeConfigEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const tyreRangeConfigApi = {
  list: () => req<{ id: number; tyre_type: string; range_km: number | null; base_tyre_cost: number | null; base_cost_per_km: number | null; updated_at: string | null }[]>("/tyre-range-config"),
  save: (configs: { tyre_type: string; range_km: number | null; base_tyre_cost: number | null; base_cost_per_km: number | null }[]) =>
    req<{ id: number; tyre_type: string; range_km: number | null; base_tyre_cost: number | null; base_cost_per_km: number | null; updated_at: string | null }[]>(
      "/tyre-range-config",
      { method: "PUT", body: JSON.stringify({ configs }) }
    ),
  delete: (tyreType: string) =>
    req<void>(`/tyre-range-config/${encodeURIComponent(tyreType)}`, { method: "DELETE" }),
  listEditEvents: (): Promise<TyreRangeConfigEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/tyre-range-config/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        tyreType: (r.tyre_type as string | null) ?? null,
        event: String(r.event) as TyreRangeConfigEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

export type DefaultBattaRate = {
  id: number;
  branchId: number;
  tripType: string;
  cargoType: string;
  amount: number | null;
  updatedAt: string | null;
};

type DefaultBattaRateWire = {
  id: number;
  branch_id: number;
  trip_type: string;
  cargo_type: string;
  amount: number | null;
  updated_at: string | null;
};

function toDefaultBattaRate(r: DefaultBattaRateWire): DefaultBattaRate {
  return {
    id: r.id,
    branchId: r.branch_id,
    tripType: r.trip_type,
    cargoType: r.cargo_type,
    amount: r.amount,
    updatedAt: r.updated_at,
  };
}

export type DefaultBattaEditEventType = "Default Batta Rate Updated";

export type DefaultBattaEditEventRow = {
  id: number;
  branchId: number;
  branchName: string;
  tripType: string;
  cargoType: string;
  amount: number | null;
  event: DefaultBattaEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const defaultBattaApi = {
  list: (branchId?: string) =>
    req<DefaultBattaRateWire[]>(
      branchId ? `/default-batta-rates?branch_id=${encodeURIComponent(branchId)}` : "/default-batta-rates"
    ).then((rows) => rows.map(toDefaultBattaRate)),
  upsert: (branchId: string, tripType: string, cargoType: string, amount: number | null) =>
    req<DefaultBattaRateWire>("/default-batta-rates", {
      method: "PUT",
      body: JSON.stringify({ branch_id: Number(branchId), trip_type: tripType, cargo_type: cargoType, amount }),
    }).then(toDefaultBattaRate),
  listEditEvents: (): Promise<DefaultBattaEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/default-batta-rates/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        branchId: Number(r.branch_id),
        branchName: String(r.branch_name ?? ""),
        tripType: String(r.trip_type ?? ""),
        cargoType: String(r.cargo_type ?? ""),
        amount: r.amount != null ? Number(r.amount) : null,
        event: String(r.event) as DefaultBattaEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

export type TyreLayoutTypeConfigEditEventType = "Tyre Quantity Configuration Updated";

export type TyreLayoutTypeConfigEditEventRow = {
  id: number;
  event: TyreLayoutTypeConfigEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const tyreLayoutTypeConfigApi = {
  list: () => req<{ id: number; tyre_layout: string; tyre_type: string; quantity: number | null }[]>("/tyre-layout-type-config"),
  save: (configs: { tyre_layout: string; tyre_type: string; quantity: number | null }[]) =>
    req<{ id: number; tyre_layout: string; tyre_type: string; quantity: number | null }[]>(
      "/tyre-layout-type-config",
      { method: "PUT", body: JSON.stringify({ configs }) }
    ),
  listEditEvents: (): Promise<TyreLayoutTypeConfigEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/tyre-layout-type-config/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        event: String(r.event) as TyreLayoutTypeConfigEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Drivers API
// ---------------------------------------------------------------------------

export type DriverEditEventType = "Driver Created" | "Driver Edited" | "Driver Deleted" | "Driver Restored";

// One row in the page-wide "Edit History" log on Our Drivers — every Create/
// Edit/Delete/Restore ever logged, across every driver. See
// DriverEditEventListOut on the backend.
export type DriverEditEventRow = {
  id: number;
  driverDbId: string;
  driverIdStr: string;
  driverName: string;
  event: DriverEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const driversApi = {
  list: () => req<B[]>("/drivers").then((d) => d.map(toDriver)),
  create: (driver: Driver, password: string) =>
    req<B>("/drivers", { method: "POST", body: JSON.stringify(fromDriver(driver, password)) }).then(toDriver),
  update: (dbId: string, driver: Driver, password?: string) =>
    req<B>(`/drivers/${dbId}`, { method: "PUT", body: JSON.stringify(fromDriver(driver, password)) }).then(toDriver),
  delete: (dbId: string) => req<void>(`/drivers/${dbId}`, { method: "DELETE" }),
  restore: (dbId: string) => req<B>(`/drivers/${dbId}/restore`, { method: "POST" }).then(toDriver),
  removePermanent: (dbId: string) => req<void>(`/drivers/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/drivers/deleted-ids"),
  getNextId: () => req<{ driver_id: string }>("/drivers/next-id").then((d) => d.driver_id),
  // Aggregate salary totals only (no transaction detail) — open to any
  // authenticated role, unlike the rest of the Finance module.
  getSalarySummary: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const qs = params.toString();
    return req<Record<string, number>>(`/drivers/salary-summary${qs ? `?${qs}` : ""}`);
  },
  // Page-wide "Edit History" log on Our Drivers — every Create/Edit/Delete/
  // Restore across every driver, enriched with driver identity for search.
  listEditEvents: (): Promise<DriverEditEventRow[]> =>
    req<B[]>(`/drivers/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        driverDbId: String(r.driver_id ?? ""),
        driverIdStr: String(r.driver_id_str ?? ""),
        driverName: String(r.driver_name ?? ""),
        event: String(r.event) as DriverEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Driver Assignments API
// ---------------------------------------------------------------------------

export type DriverAssignmentEditEventType = "Driver Assigned" | "Assignment Removed";

export type DriverAssignmentEditEventRow = {
  id: number;
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  event: DriverAssignmentEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const assignmentsApi = {
  list: (): Promise<DriverAssignment[]> =>
    req<B[]>("/drivers/assignments/all").then((d) =>
      d.map((b) => ({ id: String(b.id), driverId: b.driver_id, vehicleId: b.vehicle_id }))
    ),
  upsert: (driverId: string, vehicleId: string) =>
    req<B>("/drivers/assignments", {
      method: "POST",
      body: JSON.stringify({ driver_id: driverId, vehicle_id: vehicleId }),
    }),
  remove: (driverId: string) => req<void>(`/drivers/assignments/${driverId}`, { method: "DELETE" }),
  listEditEvents: (): Promise<DriverAssignmentEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/drivers/assignments/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        driverId: String(r.driver_id ?? ""),
        driverName: String(r.driver_name ?? ""),
        vehicleId: (r.vehicle_id as string | null) ?? null,
        event: String(r.event) as DriverAssignmentEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Staff API
// ---------------------------------------------------------------------------

export type StaffEditEventType = "Staff Created" | "Staff Edited" | "Staff Deleted" | "Staff Restored";

// One row in the page-wide "Edit History" log on Our Staff — every Create/
// Edit/Delete/Restore ever logged, across every staff member. See
// StaffEditEventListOut on the backend.
export type StaffEditEventRow = {
  id: number;
  staffDbId: string;
  staffIdStr: string;
  staffName: string;
  event: StaffEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const staffApi = {
  list: () => req<B[]>("/staff").then((d) => d.map(toStaff)),
  // Raw (snake_case) single-record fetch for the Profile modal — unlike the
  // rest of this module it isn't remapped into the camelCase Staff type,
  // since the modal reads backend field names directly.
  getDetail: (dbId: string) => req<B>(`/staff/${dbId}`),
  create: (member: Staff, password: string) =>
    req<B>("/staff", { method: "POST", body: JSON.stringify(fromStaff(member, password)) }).then(toStaff),
  update: (dbId: string, member: Staff, password?: string) =>
    req<B>(`/staff/${dbId}`, { method: "PUT", body: JSON.stringify(fromStaff(member, password)) }).then(toStaff),
  delete: (dbId: string) => req<void>(`/staff/${dbId}`, { method: "DELETE" }),
  restore: (dbId: string) => req<B>(`/staff/${dbId}/restore`, { method: "POST" }).then(toStaff),
  removePermanent: (dbId: string) => req<void>(`/staff/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/staff/deleted-ids"),
  // Reset device binding. Pass a device id to reset just that device; omit it to clear all.
  resetDevice: (dbId: string, device?: string) =>
    req<{ ok: boolean; devices: Array<{ id: string; kind: string; label: string; bound_at: string | null }> }>(
      `/staff/${dbId}/reset-device`,
      { method: "POST", body: JSON.stringify({ device: device ?? null }) },
    ),
  // Page-wide "Edit History" log on Our Staff — every Create/Edit/Delete/
  // Restore across every staff member, enriched with identity for search.
  listEditEvents: (): Promise<StaffEditEventRow[]> =>
    req<B[]>(`/staff/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        staffDbId: String(r.staff_id ?? ""),
        staffIdStr: String(r.staff_id_str ?? ""),
        staffName: String(r.staff_name ?? ""),
        event: String(r.event) as StaffEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Customers API
// ---------------------------------------------------------------------------

export type CustomerEditEventType = "Customer Created" | "Customer Edited" | "Customer Deleted" | "Customer Restored";

// One row in the page-wide "Edit History" log on Our Customers — every
// Create/Edit/Delete/Restore ever logged, across every customer. See
// CustomerEditEventListOut on the backend.
export type CustomerEditEventRow = {
  id: number;
  customerDbId: string;
  customerName: string;
  event: CustomerEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const customersApi = {
  list: () => req<B[]>("/customers").then((d) => d.map(toCustomer)),
  listDestinationOriginStates: () => req<string[]>("/customers/destination-origin-states"),
  listDestinationStates: () => req<string[]>("/customers/destination-states"),
  create: (customer: Customer) =>
    req<B>("/customers", { method: "POST", body: JSON.stringify(fromCustomer(customer)) }).then(toCustomer),
  update: (dbId: string, customer: Customer) =>
    req<B>(`/customers/${dbId}`, { method: "PUT", body: JSON.stringify(fromCustomer(customer)) }).then(toCustomer),
  delete: (dbId: string) => req<void>(`/customers/${dbId}`, { method: "DELETE" }),
  restore: (dbId: string) => req<B>(`/customers/${dbId}/restore`, { method: "POST" }).then(toCustomer),
  removePermanent: (dbId: string) => req<void>(`/customers/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/customers/deleted-ids"),
  // Page-wide "Edit History" log on Our Customers — every Create/Edit/
  // Delete/Restore across every customer, enriched with name for search.
  listEditEvents: (): Promise<CustomerEditEventRow[]> =>
    req<B[]>(`/customers/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        customerDbId: String(r.customer_id ?? ""),
        customerName: String(r.customer_name ?? ""),
        event: String(r.event) as CustomerEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),

  listOrigins: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/origins`).then((d) => d.map(toCustomerOrigin)),
  createOrigin: (customerId: string, originName: string) =>
    req<B>(`/customers/${customerId}/origins`, {
      method: "POST",
      body: JSON.stringify({ origin_name: originName }),
    }).then(toCustomerOrigin),
  deleteOrigin: (customerId: string, originId: string) =>
    req<void>(`/customers/${customerId}/origins/${originId}`, { method: "DELETE" }),

  listDestinations: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/destinations`).then((d) => d.map(toCustomerDestination)),
  // Bulk variants — every active customer's rows in one request instead of
  // one request per customer.
  listAllDestinations: () =>
    req<B[]>(`/customers/bulk/destinations`).then((d) => d.map(toCustomerDestination)),
  listAllPricing: () =>
    req<B[]>(`/customers/bulk/pricing`).then((d) => d.map(toCustomerPricing)),
  listAllFinalPricing: () =>
    req<B[]>(`/customers/bulk/final-pricing`).then((d) => d.map(toFinalCustomerPricing)),
  createDestination: (customerId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations`, {
      method: "POST",
      body: JSON.stringify({
        destination_state: dest.destinationState,
        destination_address: dest.destinationAddress,
        origin_state: dest.originState || null,
        origin_address: dest.originAddress || null,
        approx_distance_km: dest.approxDistanceKm || null,
        cargo_classification: dest.cargoClassification || null,
        container_type: dest.containerType || null,
        weight_in_tons: dest.weightInTons || null,
      }),
    }).then(toCustomerDestination),
  updateDestination: (customerId: string, destId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations/${destId}`, {
      method: "PUT",
      body: JSON.stringify({
        destination_state: dest.destinationState,
        destination_address: dest.destinationAddress,
        origin_state: dest.originState || null,
        origin_address: dest.originAddress || null,
        approx_distance_km: dest.approxDistanceKm || null,
        cargo_classification: dest.cargoClassification || null,
        container_type: dest.containerType || null,
        weight_in_tons: dest.weightInTons || null,
      }),
    }).then(toCustomerDestination),
  deleteDestination: (customerId: string, destId: string) =>
    req<void>(`/customers/${customerId}/destinations/${destId}`, { method: "DELETE" }),

  listPricing: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/pricing`).then((d) => d.map(toCustomerPricing)),
  createPricing: (customerId: string, pricing: CustomerPricing) =>
    req<B>(`/customers/${customerId}/pricing`, {
      method: "POST",
      body: JSON.stringify({
        customer_destination_id: pricing.customerDestinationId ? parseInt(pricing.customerDestinationId) : null,
        rate: parseFloat(pricing.rate) || 0, status: pricing.status,
        commission_amount: pricing.commissionAmount ? parseFloat(pricing.commissionAmount) : null,
      }),
    }).then(toCustomerPricing),
  updatePricing: (customerId: string, priceId: string, pricing: CustomerPricing) =>
    req<B>(`/customers/${customerId}/pricing/${priceId}`, {
      method: "PUT",
      body: JSON.stringify({
        customer_destination_id: pricing.customerDestinationId ? parseInt(pricing.customerDestinationId) : null,
        rate: parseFloat(pricing.rate) || 0, status: pricing.status,
        commission_amount: pricing.commissionAmount ? parseFloat(pricing.commissionAmount) : null,
      }),
    }).then(toCustomerPricing),
  deletePricing: (customerId: string, priceId: string) =>
    req<void>(`/customers/${customerId}/pricing/${priceId}`, { method: "DELETE" }),

  listFinalPricing: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/final-pricing`).then((d) => d.map(toFinalCustomerPricing)),
  createFinalPricing: (customerId: string, data: { customerDestinationId: string; customerDestination: string; actualHireAmount: string | null; accountsHireAmount: string | null }) =>
    req<B>(`/customers/${customerId}/final-pricing`, {
      method: "POST",
      body: JSON.stringify({
        customer_destination_id: parseInt(data.customerDestinationId),
        customer_destination: data.customerDestination,
        actual_hire_amount: data.actualHireAmount ? parseFloat(data.actualHireAmount) : null,
        accounts_hire_amount: data.accountsHireAmount ? parseFloat(data.accountsHireAmount) : null,
      }),
    }).then(toFinalCustomerPricing),
  updateFinalPricing: (customerId: string, pricingId: string, data: { actualHireAmount: string | null; accountsHireAmount: string | null; clientVersion?: number; customerDestinationId?: string }) =>
    req<B>(`/customers/${customerId}/final-pricing/${pricingId}`, {
      method: "PUT",
      body: JSON.stringify({
        actual_hire_amount: data.actualHireAmount ? parseFloat(data.actualHireAmount) : null,
        accounts_hire_amount: data.accountsHireAmount ? parseFloat(data.accountsHireAmount) : null,
        client_version: data.clientVersion,
        // Only sent when resolving a legacy unlinked row (see
        // FinalCustomerPricingFormDialog's "Confirm Route" flow) — omitted
        // otherwise so a normal amount-only edit never touches the link.
        ...(data.customerDestinationId ? { customer_destination_id: parseInt(data.customerDestinationId) } : {}),
      }),
    }).then(toFinalCustomerPricing),
  deleteFinalPricing: (customerId: string, pricingId: string) =>
    req<void>(`/customers/${customerId}/final-pricing/${pricingId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Vendors API
// ---------------------------------------------------------------------------

export type VendorEditEventType = "Vendor Created" | "Vendor Edited" | "Vendor Deleted" | "Vendor Restored";

// One row in the page-wide "Edit History" log on Our Vendors — every
// Create/Edit/Delete/Restore ever logged, across every vendor. See
// VendorEditEventListOut on the backend.
export type VendorEditEventRow = {
  id: number;
  vendorDbId: string;
  vendorName: string;
  event: VendorEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const vendorsApi = {
  list: () => req<B[]>("/vendors").then((d) => d.map(toVendor)),
  /** Our Vendors → View Record: every maintenance job this vendor did. */
  maintenanceRecords: (vendorId: string, from?: string, to?: string): Promise<MaintenanceRecord[]> => {
    const qs = new URLSearchParams();
    if (from) qs.set("from_date", from);
    if (to) qs.set("to_date", to);
    const q = qs.toString();
    return rawReq<B[]>(`/vendors/${vendorId}/maintenance-records${q ? `?${q}` : ""}`).then((d) => d.map(toMaintenanceRecord));
  },
  create: (vendor: Vendor) =>
    req<B>("/vendors", { method: "POST", body: JSON.stringify(fromVendor(vendor)) }).then(toVendor),
  update: (dbId: string, vendor: Vendor) =>
    req<B>(`/vendors/${dbId}`, { method: "PUT", body: JSON.stringify(fromVendor(vendor)) }).then(toVendor),
  delete: (dbId: string) => req<void>(`/vendors/${dbId}`, { method: "DELETE" }),
  restore: (dbId: string) => req<B>(`/vendors/${dbId}/restore`, { method: "POST" }).then(toVendor),
  removePermanent: (dbId: string) => req<void>(`/vendors/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/vendors/deleted-ids"),
  // Page-wide "Edit History" log on Our Vendors — every Create/Edit/Delete/
  // Restore across every vendor, enriched with name for search.
  listEditEvents: (): Promise<VendorEditEventRow[]> =>
    req<B[]>(`/vendors/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        vendorDbId: String(r.vendor_id ?? ""),
        vendorName: String(r.vendor_name ?? ""),
        event: String(r.event) as VendorEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

function toVendorCategory(b: B): VendorCategory {
  return {
    id: String(b.id ?? ""),
    name: b.name ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

export const vendorCategoriesApi = {
  list: () => req<B[]>("/vendor-categories").then((d) => d.map(toVendorCategory)),
  create: (name: string) =>
    req<B>("/vendor-categories", { method: "POST", body: JSON.stringify({ name }) }).then(toVendorCategory),
  delete: (id: string) => req<void>(`/vendor-categories/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Trips API
// ---------------------------------------------------------------------------

export type TripRecheckEvent = {
  id: number;
  event: "Flagged" | "Returned for Review" | "Verified";
  remark: string | null;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

// One row in the page-wide "Recheck History" log on Audit Flagged Trips — see
// TripRecheckEventListOut on the backend. Unlike TripRecheckEvent above (one
// trip's own history), this is enriched with trip identity so it's
// searchable across every trip that's ever been flagged.
export type TripRecheckEventRow = {
  id: number;
  tripDbId: string;
  tripIdStr: string;
  driverName: string | null;
  origin: string | null;
  destination: string | null;
  event: "Flagged" | "Returned for Review" | "Verified";
  remark: string | null;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type TripEditEventType =
  | "Booking Created" | "Booking Edited" | "Trip Sheet Saved" | "Trip Updated"
  | "Trip Closed" | "Verification Confirmed" | "Verification Rejected"
  | "Trip Deleted" | "Trip Restored";

// One row in the page-wide "Edit History" log on the Trip History page —
// who edited the Booking Sheet/Trip Sheet/Closure/Verification on a trip and
// when. See TripEditEventListOut on the backend.
export type TripEditEventRow = {
  id: number;
  tripDbId: string;
  tripIdStr: string;
  driverName: string | null;
  origin: string | null;
  destination: string | null;
  event: TripEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

// One row on the "Audit Verified Trips" page — see AuditVerifiedTripOut on the
// backend. tripDbId is the internal numeric Trip.id (as a string, matching
// this file's `_dbId`/dbId convention elsewhere), tripId is the human TRP-xxxx.
export type AuditVerifiedTrip = {
  tripDbId: string;
  tripId: string;
  driverName: string | null;
  origin: string | null;
  destination: string | null;
  scheduledDate: string | null;
  verifiedBy: string;
  verifiedRole: string | null;
  verifiedAt: string;
  verifiedRemark: string | null;
  wasDisputed: boolean;
};

const BULK_CHUNK = 200;

async function bulkByTripId<T>(dbIds: string[], path: string, convert: (b: B) => T): Promise<Map<string, T>> {
  const ids = Array.from(new Set(dbIds));
  const out = new Map<string, T>();
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const chunk = ids.slice(i, i + BULK_CHUNK);
    const rows = await req<B[]>(`${path}?ids=${chunk.join(",")}`);
    for (const r of rows) out.set(String(r.trip_id), convert(r));
  }
  return out;
}

export const tripsApi = {
  list: (status?: string, opts?: { hasClosure?: boolean }) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (opts?.hasClosure !== undefined) qs.set("has_closure", String(opts.hasClosure));
    const q = qs.toString();
    return req<B[]>(`/trips${q ? `?${q}` : ""}`).then((d) => d.map(toTrip));
  },
  get: (dbId: string) => req<B>(`/trips/${dbId}`).then(toTrip),
  create: (trip: Trip) =>
    req<B>("/trips", { method: "POST", body: JSON.stringify(fromTrip(trip)) }).then(toTrip),
  // editContext tags the save for the Trip Edit History log — "BookingSheet"
  // when called from the booking-edit flow, so the log reads "Booking Edited"
  // instead of the generic fallback "Trip Updated".
  update: (dbId: string, trip: Trip, editContext?: "BookingSheet" | "TripSheet") =>
    req<B>(`/trips/${dbId}`, {
      method: "PUT",
      body: JSON.stringify({ ...fromTrip(trip), ...(editContext ? { edit_context: editContext } : {}) }),
    }).then(toTrip),
  updateStatus: (dbId: string, status: Trip["status"]) =>
    req<B>(`/trips/${dbId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).then(toTrip),
  cancel: (dbId: string) =>
    req<B>(`/trips/${dbId}/status`, { method: "PATCH", body: JSON.stringify({ status: "Cancelled" }) }).then(toTrip),

  // Closure
  close: (dbId: string, data: TripClosureData) =>
    req<B>(`/trips/${dbId}/close`, { method: "POST", body: JSON.stringify(fromClosure(data)) }).then(toClosure),
  getClosure: (dbId: string) =>
    req<B>(`/trips/${dbId}/closure`).then(toClosure),

  // Sheet
  upsertSheet: (dbId: string, data: TripSheetData) =>
    req<B>(`/trips/${dbId}/sheet`, { method: "POST", body: JSON.stringify(fromSheet(data)) }).then(toSheet),
  getSheet: (dbId: string) =>
    req<B | null>(`/trips/${dbId}/sheet`).then((b) => (b ? toSheet(b) : null)),

  // Bulk — sheets/closures for many trips in one request (chunked) instead of
  // one request per trip. Keyed by trip id; trips with no sheet/closure are
  // simply absent from the map.
  getSheetsBulk: (dbIds: string[]) =>
    bulkByTripId(dbIds, "/trips/bulk/sheets", toSheet),
  getClosuresBulk: (dbIds: string[]) =>
    bulkByTripId(dbIds, "/trips/bulk/closures", toClosure),
  getInvoicesBulk: (dbIds: string[]) =>
    bulkByTripId(dbIds, "/trips/bulk/invoices", (b) => b as Record<string, unknown>),

  // Workflow
  verify: (dbId: string) => req<B>(`/trips/${dbId}/verify`, { method: "POST" }).then(toTrip),
  waiveInvoice: (dbId: string) => req<B>(`/trips/${dbId}/waive-invoice`, { method: "POST" }).then(toTrip),
  flag: (dbId: string) => req<B>(`/trips/${dbId}/flag`, { method: "POST" }).then(toTrip),
  rejectVerification: (dbId: string, reason: string) =>
    req<B>(`/trips/${dbId}/reject-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).then(toTrip),
  resubmitVerification: (dbId: string) =>
    req<B>(`/trips/${dbId}/resubmit-verification`, { method: "POST" }).then(toTrip),
  invoice: (dbId: string, data: Record<string, unknown>) =>
    req<B>(`/trips/${dbId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(toTrip),
  // Trip Summary (P&L/Mileage) page — one page of rows plus totals aggregated
  // across every filtered trip, computed server-side so the page never needs
  // to fetch every trip's sheet just to show accurate page-wide totals.
  getPnlSummary: (params: { search?: string; dateFrom?: string; dateTo?: string; limit: number; offset: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.dateFrom) qs.set("date_from", params.dateFrom);
    if (params.dateTo) qs.set("date_to", params.dateTo);
    qs.set("limit", String(params.limit));
    qs.set("offset", String(params.offset));
    return req<TripPnlSummaryData>(`/trips/pnl-summary?${qs.toString()}`);
  },
  getInvoice: (dbId: string) => req<Record<string, unknown>>(`/trips/${dbId}/invoice`),
  getNextInvoiceNo: (type: string) => req<{ invoice_no: string }>(`/trips/invoices/next-seq?invoice_type=${encodeURIComponent(type)}`),
  // Combined invoicing — one invoice number spans several trips for the same customer.
  invoiceCombined: (payload: Record<string, unknown>) =>
    req<B[]>(`/trips/invoice-combined`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((arr) => arr.map(toTrip)),
  // Ids of every trip whose invoice shares this invoice_no — length > 1 means
  // it's a combined invoice; length 1 (or the lookup trip itself) is a normal one.
  getInvoiceGroup: (invoiceNo: string) =>
    req<number[]>(`/trips/invoice-group?invoice_no=${encodeURIComponent(invoiceNo)}`),
  getAutocompleteValues: () => req<{ origins: string[]; destinations: string[] }>("/trips/autocomplete-values"),
  listShippingLines: () => req<string[]>("/trips/shipping-lines"),
  listCargoReferences: () => req<string[]>("/trips/cargo-references"),
  remove: (dbId: string, reason: string) =>
    req<void>(`/trips/${dbId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  restore: (dbId: string) => req<B>(`/trips/${dbId}/restore`, { method: "POST" }).then(toTrip),
  removePermanent: (dbId: string) => req<void>(`/trips/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/trips/deleted-ids"),
  // Sends the desired state (not a toggle) so a repeated click or retry can't
  // flip a delivery back.
  collectSheet: (dbId: string, collected: boolean) =>
    req<B>(`/trips/${dbId}/collect-sheet`, { method: "POST", body: JSON.stringify({ collected }) }).then(toTrip),
  receiveSheet: (dbId: string) =>
    req<B>(`/trips/${dbId}/receive-sheet`, { method: "POST" }).then(toTrip),
  unmarkSheet: (dbId: string) =>
    req<B>(`/trips/${dbId}/unmark-sheet`, { method: "POST" }).then(toTrip),
  flagSheetMissing: (dbId: string) =>
    req<B>(`/trips/${dbId}/flag-sheet-missing`, { method: "POST" }).then(toTrip),
  // Auditor recheck workflow — see recheckReturned on the Trip type for the
  // state machine (Flag → blocked → Return for Review → unblocked → Verify).
  flagForRecheck: (dbId: string, remark: string) =>
    req<B>(`/trips/${dbId}/recheck-flag`, { method: "POST", body: JSON.stringify({ remark }) }).then(toTrip),
  returnForReview: (dbId: string, remark = "") =>
    req<B>(`/trips/${dbId}/recheck-return`, { method: "POST", body: JSON.stringify({ remark }) }).then(toTrip),
  verifyRecheck: (dbId: string, remark = "") =>
    req<B>(`/trips/${dbId}/recheck-verify`, { method: "POST", body: JSON.stringify({ remark }) }).then(toTrip),
  getRecheckHistory: (dbId: string): Promise<TripRecheckEvent[]> =>
    req<B[]>(`/trips/${dbId}/recheck-history`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        event: String(r.event) as "Flagged" | "Returned for Review" | "Verified",
        remark: (r.remark as string | null) ?? null,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  // Page-wide log for Audit Flagged Trips' "History" button — every recheck
  // event across every trip, enriched with trip identity for search.
  listRecheckEvents: (): Promise<TripRecheckEventRow[]> =>
    req<B[]>(`/trips/recheck-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        tripDbId: String(r.trip_id ?? ""),
        tripIdStr: String(r.trip_id_str ?? ""),
        driverName: (r.driver_name as string | null) ?? null,
        origin: (r.origin as string | null) ?? null,
        destination: (r.destination as string | null) ?? null,
        event: String(r.event) as "Flagged" | "Returned for Review" | "Verified",
        remark: (r.remark as string | null) ?? null,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  // Page-wide "Edit History" log on the Trip History page — every Booking/
  // Trip Sheet/Closure/Verification save across every trip, enriched with
  // trip identity so it's searchable without opening each trip individually.
  listEditEvents: (): Promise<TripEditEventRow[]> =>
    req<B[]>(`/trips/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        tripDbId: String(r.trip_id ?? ""),
        tripIdStr: String(r.trip_id_str ?? ""),
        driverName: (r.driver_name as string | null) ?? null,
        origin: (r.origin as string | null) ?? null,
        destination: (r.destination as string | null) ?? null,
        event: String(r.event) as TripEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  // Counterpart to Flagged Trips — trips whose most recent recheck event is
  // "Verified". See types.ts-style AuditVerifiedTrip below.
  listAuditVerified: (): Promise<AuditVerifiedTrip[]> =>
    req<B[]>(`/trips/audit-verified`).then((rows) =>
      rows.map((r) => ({
        tripDbId: String(r.trip_id ?? ""),
        tripId: String(r.trip_id_str ?? ""),
        driverName: (r.driver_name as string | null) ?? null,
        origin: (r.origin as string | null) ?? null,
        destination: (r.destination as string | null) ?? null,
        scheduledDate: (r.scheduled_date as string | null) ?? null,
        verifiedBy: String(r.verified_by ?? ""),
        verifiedRole: (r.verified_role as string | null) ?? null,
        verifiedAt: String(r.verified_at ?? ""),
        verifiedRemark: (r.verified_remark as string | null) ?? null,
        wasDisputed: Boolean(r.was_disputed ?? false),
      }))
    ),
  verifyAdvance: (dbId: string, verified: boolean, remark: string, correctedAmount: number | null) =>
    req<B>(`/trips/${dbId}/verify-advance`, { method: "POST", body: JSON.stringify({ verified, remark, corrected_amount: correctedAmount }) }).then(toTrip),
  saveLR: (dbId: string, data: Record<string, unknown>) =>
    req<{ ok: boolean; lr_saved_at: string }>(`/trips/${dbId}/lr`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getCustomerProfitability: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return req<CustomerProfitabilityData[]>(`/trips/customer-profitability${qs ? `?${qs}` : ""}`);
  },
  // Most profitable completed trips for one customer (+ optional route), with
  // the driver/truck that achieved each — powers the Assign Trip dialog's
  // customer insights panel.
  getCustomerTopProfitableTrips: (customerId: string, route?: string, limit = 500, routeId?: string | null) => {
    const params = new URLSearchParams({ customer_id: customerId, limit: String(limit) });
    if (route) params.set("route", route);
    if (routeId) params.set("route_id", routeId);
    return req<CustomerTopProfitableTrip[]>(`/trips/customer-profitability/top-trips?${params.toString()}`);
  },
  /** Customer Insights for one customer route — Final Profit (Advanced mode). */
  getRouteInsights: (customerId: string, routeId?: string | null, route?: string) => {
    const params = new URLSearchParams({ customer_id: customerId });
    if (routeId) params.set("route_id", routeId);
    if (route) params.set("route", route);
    return rawReq<RouteInsights>(`/trips/route-insights?${params.toString()}`);
  },
};

// ---------------------------------------------------------------------------
// Attendance API
// ---------------------------------------------------------------------------

export type DriverAttendanceEditEventType =
  | "Attendance Marked" | "Attendance Updated"
  | "Remark Added" | "Remark Edited" | "Remark Deleted";

export type DriverAttendanceEditEventRow = {
  id: number;
  driverId: string;
  driverName: string;
  date: string;
  event: DriverAttendanceEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type StaffAttendanceEditEventType = "Attendance Marked" | "Attendance Updated";

export type StaffAttendanceEditEventRow = {
  id: number;
  staffId: number;
  staffName: string;
  date: string;
  event: StaffAttendanceEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type HolidayEditEventType = "Holiday Created" | "Holiday Updated" | "Holiday Deleted";

export type HolidayEditEventRow = {
  id: number;
  holidayDate: string;
  name: string;
  event: HolidayEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type LeaveRequestEditEventType = "Leave Requested" | "Leave Approved" | "Leave Rejected";

export type LeaveRequestEditEventRow = {
  id: number;
  applicantName: string;
  category: string;
  event: LeaveRequestEditEventType;
  actorName: string;
  createdAt: string;
};

export const attendanceApi = {
  getLatestDate: (category: "driver" | "staff") =>
    req<{ latest_date: string | null }>(`/attendance/latest-date?category=${category}`).then((d) => d.latest_date),
  listDrivers: (date?: string, driverId?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (driverId) params.set("driver_id", driverId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return req<B[]>(`/attendance/drivers?${params}`).then((d) => d.map(toDriverAttendance));
  },
  markDriver: (driverId: string, date: string, status: string, checkInTime?: string) =>
    req<B>("/attendance/drivers", {
      method: "POST",
      body: JSON.stringify({ driver_id: driverId, date, status, check_in_time: checkInTime ?? null, marked_at: new Date().toISOString() }),
    }).then(toDriverAttendance),
  updateDriver: (recordId: string, status: string, checkInTime?: string) =>
    req<B>(`/attendance/drivers/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({ status, check_in_time: checkInTime ?? null }),
    }).then(toDriverAttendance),

  listDriverRemarks: (driverId?: string, date?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (driverId) params.set("driver_id", driverId);
    if (date) params.set("date", date);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return req<B[]>(`/attendance/drivers/remarks?${params}`).then((d) =>
      d.map((b) => ({
        id: String(b.id),
        driverId: b.driver_id ?? "",
        date: b.date ?? "",
        remark: b.remark ?? "",
        isLateEntry: b.is_late_entry ?? false,
        createdAt: b.created_at ?? null,
      }))
    );
  },
  addDriverRemark: (driverId: string, date: string, remark: string) =>
    req<B>("/attendance/drivers/remarks", {
      method: "POST",
      body: JSON.stringify({ driver_id: driverId, date, remark }),
    }).then((b) => ({
      id: String(b.id),
      driverId: b.driver_id ?? "",
      date: b.date ?? "",
      remark: b.remark ?? "",
      isLateEntry: b.is_late_entry ?? false,
      createdAt: b.created_at ?? null,
    })),
  updateDriverRemark: (remarkId: string, remark: string) =>
    req<B>(`/attendance/drivers/remarks/${remarkId}`, {
      method: "PUT",
      body: JSON.stringify({ remark }),
    }).then((b) => ({
      id: String(b.id),
      driverId: b.driver_id ?? "",
      date: b.date ?? "",
      remark: b.remark ?? "",
      isLateEntry: b.is_late_entry ?? false,
      createdAt: b.created_at ?? null,
    })),
  deleteDriverRemark: (remarkId: string) =>
    req<void>(`/attendance/drivers/remarks/${remarkId}`, { method: "DELETE" }),
  listDriverEditEvents: (): Promise<DriverAttendanceEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/attendance/drivers/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        driverId: String(r.driver_id ?? ""),
        driverName: String(r.driver_name ?? ""),
        date: String(r.date ?? ""),
        event: String(r.event) as DriverAttendanceEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  getLateEntryLog: (date: string) =>
    req<B[]>(`/attendance/drivers/late-entry-log?date=${date}`).then((d) =>
      d.length > 0 ? { id: String(d[0].id), date: d[0].date ?? "", remark: d[0].remark ?? "", createdAt: d[0].created_at ?? null } : null
    ),
  postLateEntryLog: (date: string, remark: string) =>
    req<B>("/attendance/drivers/late-entry-log", {
      method: "POST",
      body: JSON.stringify({ date, remark }),
    }).then((b) => ({ id: String(b.id), date: b.date ?? "", remark: b.remark ?? "", createdAt: b.created_at ?? null })),

  listStaff: (date?: string, staffId?: number, dateFrom?: string, dateTo?: string, includeLastActive?: boolean) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (staffId) params.set("staff_id", String(staffId));
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (includeLastActive) params.set("include_last_active", "true");
    return req<B[]>(`/attendance/staff?${params}`).then((d) => d.map(toStaffAttendance));
  },
  markStaff: (staffId: number, date: string, status: string, checkInTime?: string, source?: string) =>
    req<B>("/attendance/staff", {
      method: "POST",
      body: JSON.stringify({ staff_id: staffId, date, status, check_in_time: checkInTime ?? null, marked_at: new Date().toISOString(), source: source ?? "Web" }),
    }).then(toStaffAttendance),
  updateStaff: (recordId: string, status: string, checkInTime?: string) =>
    req<B>(`/attendance/staff/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({ status, check_in_time: checkInTime ?? null }),
    }).then(toStaffAttendance),
  listStaffEditEvents: (): Promise<StaffAttendanceEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/attendance/staff/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        staffId: Number(r.staff_id ?? 0),
        staffName: String(r.staff_name ?? ""),
        date: String(r.date ?? ""),
        event: String(r.event) as StaffAttendanceEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),

  /**
   * Self-service mark for the Mark Attendance page.
   * Always marks TODAY (IST) — the backend ignores any client-supplied date.
   * Upserts: creates or updates atomically server-side.
   */
  selfMarkStaff: (staffId: number, status: string) =>
    req<B>("/attendance/staff/self-mark", {
      method: "POST",
      body: JSON.stringify({ staff_id: staffId, status }),
    }).then(toStaffAttendance),

  closeShiftStaff: (staffId: number) =>
    req<B>(`/attendance/staff/close-shift?staff_id=${staffId}`, {
      method: "POST",
    }).then(toStaffAttendance),
  // Reopens today's shift after an auto-close or Admin force-close (a
  // self-close stays final — see backend's resume_shift for why).
  resumeShiftStaff: (staffId: number) =>
    req<B>(`/attendance/staff/resume-shift?staff_id=${staffId}`, {
      method: "POST",
    }).then(toStaffAttendance),

  /**
   * Returns present/absent/on_leave/not_marked counts + attendance percentage
   * for a single staff member for the given month.
   * percentage = (present / 26) × 100, capped at 100.
   */
  getStaffSelfSummary: (staffId: number, year: number, month: number) =>
    req<{
      present: number; absent: number; on_leave: number; not_marked: number;
      holidays: number; days_elapsed: number; working_days: number; percentage: number;
    }>(`/attendance/staff/self-summary?staff_id=${staffId}&year=${year}&month=${month}`)
    .then((b): StaffSelfSummary => ({
      present: b.present,
      absent: b.absent,
      onLeave: b.on_leave,
      notMarked: b.not_marked,
      holidays: b.holidays ?? 0,
      daysElapsed: b.days_elapsed,
      workingDays: b.working_days,
      percentage: b.percentage,
    })),

  // ── Holidays (staff attendance only; Sundays are automatic, not stored) ──
  listHolidays: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return req<B[]>(`/attendance/holidays?${params}`).then((d) =>
      d.map((b) => ({
        id: String(b.id),
        date: b.date ?? "",
        name: b.name ?? "",
        type: (b.type ?? "Government") as "Government" | "Company",
        createdAt: b.created_at ?? null,
      }))
    );
  },
  createHoliday: (date: string, name: string, type: "Government" | "Company" = "Government") =>
    req<B>("/attendance/holidays", {
      method: "POST",
      body: JSON.stringify({ date, name, type }),
    }).then((b) => ({
      id: String(b.id),
      date: b.date ?? "",
      name: b.name ?? "",
      type: (b.type ?? "Government") as "Government" | "Company",
      createdAt: b.created_at ?? null,
    })),
  deleteHoliday: (id: string) =>
    req<void>(`/attendance/holidays/${id}`, { method: "DELETE" }),
  listHolidayEditEvents: (): Promise<HolidayEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/attendance/holidays/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        holidayDate: String(r.holiday_date ?? ""),
        name: String(r.name ?? ""),
        event: String(r.event) as HolidayEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),

  lookupApplicant: (code: string) =>
    req<B>(`/attendance/lookup-applicant?code=${encodeURIComponent(code)}`),

  // scope "mine" = only requests the logged-in user filed (the Leave Requests page). Admin without a scope
  // gets every request (Leave Approvals, dashboard, notifications); other roles always get their own.
  listLeaveRequests: (status?: string, scope?: "mine" | "all") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    return req<B[]>(`/attendance/leave-requests${qs ? `?${qs}` : ""}`).then((d) => d.map(toLeaveRequest));
  },
  createLeaveRequest: (payload: Omit<LeaveRequest, "id" | "status" | "appliedAt">) =>
    req<B>("/attendance/leave-requests", {
      method: "POST",
      body: JSON.stringify({
        category: payload.category,
        applicant_id: parseInt(payload.applicantId) || 0,
        applicant_name: payload.applicantName,
        applicant_code: payload.applicantCode,
        from_date: payload.fromDate,
        to_date: payload.toDate,
        reason: payload.reason,
      }),
    }).then(toLeaveRequest),
  approveLeave: (id: string) =>
    req<B>(`/attendance/leave-requests/${id}/approve`, { method: "PATCH" }).then(toLeaveRequest),
  rejectLeave: (id: string) =>
    req<B>(`/attendance/leave-requests/${id}/reject`, { method: "PATCH" }).then(toLeaveRequest),
  listLeaveRequestEditEvents: (): Promise<LeaveRequestEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/attendance/leave-requests/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        applicantName: String(r.applicant_name ?? ""),
        category: String(r.category ?? ""),
        event: String(r.event) as LeaveRequestEditEventType,
        actorName: String(r.actor_name ?? ""),
        createdAt: String(r.created_at ?? ""),
      }))
    ),

  getSummary: (category: "driver" | "staff", from: string, to: string) =>
    req<B[]>(`/attendance/summary?category=${category}&from=${from}&to=${to}`).then((d) =>
      d.map((b): AttendanceSummaryRow => ({
        id: String(b.id),
        code: String(b.code),
        name: String(b.name),
        present: Number(b.present) || 0,
        absent: Number(b.absent) || 0,
        onLeave: Number(b.on_leave) || 0,
        onTrip: Number(b.on_trip) || 0,
        onHalt: Number(b.on_halt) || 0,
        leave: Number(b.leave) || 0,
        onWorkshop: Number(b.on_workshop) || 0,
        notMarked: Number(b.not_marked) || 0,
        totalDays: Number(b.total_days) || 0,
      }))
    ),
};

// ---------------------------------------------------------------------------
// Maintenance API
// ---------------------------------------------------------------------------

export type MaintenanceRecordEditEventType = "Record Created" | "Record Edited" | "Record Deleted";

// One row in the page-wide "Edit History" log on Truck Maintenance — every
// Create/Edit/Delete ever logged, across every maintenance record. See
// MaintenanceRecordEditEventListOut on the backend. maintenanceType/
// recordDate are a snapshot taken at log time — a deleted record is
// hard-deleted, so there's nothing left to join back to for those rows.
export type MaintenanceRecordEditEventRow = {
  id: number;
  truckDbId: string;
  truckIdStr: string;
  registrationNumber: string;
  recordId: number;
  maintenanceType: string;
  recordDate: string | null;
  event: MaintenanceRecordEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const maintenanceApi = {
  listRecords: (truckId?: string) =>
    req<B[]>(`/maintenance/records${truckId ? `?truck_id=${truckId}` : ""}`).then((d) => d.map(toMaintenanceRecord)),
  // Page-wide "Edit History" log on Truck Maintenance — every Create/Edit/
  // Delete across every maintenance record, enriched for search.
  listRecordEditEvents: (): Promise<MaintenanceRecordEditEventRow[]> =>
    req<B[]>(`/maintenance/record-edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        truckDbId: String(r.truck_id ?? ""),
        truckIdStr: String(r.truck_id_str ?? ""),
        registrationNumber: String(r.registration_number ?? ""),
        recordId: Number(r.record_id),
        maintenanceType: String(r.maintenance_type ?? ""),
        recordDate: (r.record_date as string | null) ?? null,
        event: String(r.event) as MaintenanceRecordEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  // Read-only EMI listing — routers/finance.py's /finance/emi requires Accounts/Admin;
  // this is the same data via a login-only endpoint, for roles like Auditor.
  listEmiRecordsReadOnly: () => req<B[]>("/maintenance/emi-records").then((d) => d.map(toEmiRecord)),
  // -- Proof of Payment files on a record (5 JPGs + 3 PDFs max) --------------
  listProofs: (recordId: string): Promise<MaintenanceProof[]> =>
    rawReq<B[]>(`/maintenance/records/${recordId}/proofs`).then((d) => d.map(toMaintenanceProof)),
  uploadProof: async (recordId: string, file: File): Promise<MaintenanceProof> => {
    const form = new FormData();
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/maintenance/records/${recordId}/proofs`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Upload failed: HTTP ${res.status}`));
    return toMaintenanceProof(await res.json());
  },
  /** Fetched with the auth header (never a token in the URL), returned as a blob. */
  fetchProofBlob: async (recordId: string, proofId: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/maintenance/records/${recordId}/proofs/${proofId}`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Could not open the file: HTTP ${res.status}`));
    return res.blob();
  },
  deleteProof: (recordId: string, proofId: string): Promise<void> =>
    rawReq<void>(`/maintenance/records/${recordId}/proofs/${proofId}`, { method: "DELETE" }),

  /** Admin only — other roles send the same body as an Edit Request (see maintenanceRecordChanges). */
  updateRecord: (id: string, record: MaintenanceRecord) =>
    req<B>(`/maintenance/records/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...maintenanceRecordChanges(record), client_version: record.version }),
    }).then(toMaintenanceRecord),
  deleteRecord: (id: string) => req<void>(`/maintenance/records/${id}`, { method: "DELETE" }),
  requestDeletion: (payload: {
    resource_id: number;
    resource_name: string;
    log_details: Record<string, unknown>;
    reason: string;
  }) =>
    req<{ id: number }>("/deletion-approvals", {
      method: "POST",
      body: JSON.stringify({ ...payload, resource_type: "MaintenanceRecord" }),
    }),
  getCompliance: () => req<B[]>("/maintenance/compliance"),
  getMaintenanceCostPerDay: () => req<Record<string, number>>("/maintenance/cost-per-day/all"),
  /** One truck's maintenance cost over the months it's been on record (≤ 12)
   *  — the server's single figure behind Full Status and the calculator. */
  getTruckCostSummary: (truckDbId: string) =>
    req<{ total: number; months: number; monthly: number; daily: number; from: string | null; to: string }>(
      `/maintenance/trucks/${truckDbId}/cost-summary`,
    ),
  getMaintenanceCostPerKm: () => req<Record<string, number>>("/maintenance/cost-per-km/all"),
};

export type FuelLogEditEventType = "Log Created" | "Log Edited" | "Log Deleted";

// One row in the page-wide "Edit History" log on Fuel History — every
// Create/Edit/Delete ever logged, across every fuel log. date/litres are a
// snapshot taken at log time (a deleted log is hard-deleted).
export type FuelLogEditEventRow = {
  id: number;
  truckDbId: string;
  truckIdStr: string;
  registrationNumber: string;
  logId: number;
  logDate: string | null;
  litres: string | null;
  event: FuelLogEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const fuelLogsApi = {
  listFuelStations: () => req<string[]>("/maintenance/fuel-stations"),
  listEditEvents: (): Promise<FuelLogEditEventRow[]> =>
    req<B[]>(`/maintenance/fuel-logs/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        truckDbId: String(r.truck_id ?? ""),
        truckIdStr: String(r.truck_id_str ?? ""),
        registrationNumber: String(r.registration_number ?? ""),
        logId: Number(r.log_id),
        logDate: (r.log_date as string | null) ?? null,
        litres: r.litres != null ? String(r.litres) : null,
        event: String(r.event) as FuelLogEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  listFuelLogs: (truckId?: string) =>
    req<B[]>(`/maintenance/fuel-logs${truckId ? `?truck_id=${truckId}` : ""}`).then((d) => d.map(toFuelLog)),
  createFuelLog: (log: Omit<FuelLog, "id" | "distance" | "mileage" | "createdAt" | "pricePerLitre" | "enteredByName" | "source">) =>
    req<B>("/maintenance/fuel-logs", {
      method: "POST",
      body: JSON.stringify({
        truck_id: parseInt(log.truckId),
        date: log.date,
        odometer: parseInt(log.odometer),
        litres: parseFloat(log.litres),
        price_per_litre: parseFloat(log.totalCost) / parseFloat(log.litres),
        total_cost: parseFloat(log.totalCost),
        fuel_station: log.fuelStation,
        logged_by: log.loggedBy,
      }),
    }).then(toFuelLog),
  getFuelStats: (truckId: string) =>
    req<B>(`/maintenance/trucks/${truckId}/fuel-stats`).then(toFuelStats),
  getAllFuelStats: () =>
    req<Record<string, number>>("/maintenance/fuel-stats/all"),
  updateFuelLog: (id: string, log: Partial<FuelLog>) =>
    req<B>(`/maintenance/fuel-logs/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        date: log.date,
        odometer: log.odometer ? parseInt(log.odometer) : undefined,
        litres: log.litres ? parseFloat(log.litres) : undefined,
        price_per_litre: (log.totalCost && log.litres) ? parseFloat(log.totalCost) / parseFloat(log.litres) : undefined,
        total_cost: log.totalCost ? parseFloat(log.totalCost) : undefined,
        fuel_station: log.fuelStation,
        logged_by: log.loggedBy,
        client_version: log.version,
      }),
    }).then(toFuelLog),
  deleteFuelLog: (id: string) => req<void>(`/maintenance/fuel-logs/${id}`, { method: "DELETE" }),
  requestFuelLogDeletion: (payload: {
    resource_id: number;
    resource_name: string;
    log_details: Record<string, unknown>;
    reason: string;
  }) =>
    req<{ id: number }>("/deletion-approvals", {
      method: "POST",
      body: JSON.stringify({ ...payload, resource_type: "FuelLog" }),
    }),
  // cost_per_litre comes back as a numeric string (the backend Decimal is
  // JSON-serialized as a string, not a number) — every consumer must coerce
  // with Number(...) before doing arithmetic on it.
  getBaseConfig: () => req<{ id: number; cost_per_litre: string | null; updated_at: string | null }>("/maintenance/fuel-base-config"),
  setBaseConfig: (costPerLitre: number | null) =>
    req<{ id: number; cost_per_litre: string | null; updated_at: string | null }>(
      "/maintenance/fuel-base-config",
      { method: "PUT", body: JSON.stringify({ cost_per_litre: costPerLitre }) }
    ),
};

// ---------------------------------------------------------------------------
// Deletion Approvals API
// ---------------------------------------------------------------------------

export type DeletionApprovalRequest = {
  id: number;
  resourceType: string;
  resourceId: number;
  resourceName: string;
  logDetails: Record<string, unknown> | null;
  requestedByStaffId: number;
  requestedByName: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  adminNote: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  requesterSeenAt: string | null;
};

function toDeletionApproval(b: B): DeletionApprovalRequest {
  return {
    id: b.id,
    resourceType: b.resource_type,
    resourceId: b.resource_id,
    resourceName: b.resource_name,
    logDetails: b.log_details ?? null,
    requestedByStaffId: b.requested_by_staff_id,
    requestedByName: b.requested_by_name,
    reason: b.reason,
    status: b.status,
    adminNote: b.admin_note ?? null,
    approvedByName: b.approved_by_name ?? null,
    approvedAt: b.approved_at ?? null,
    createdAt: b.created_at ?? null,
    requesterSeenAt: (b.requester_seen_at as string | null) ?? null,
  };
}

// Maps DeletionApprovalRequest.resourceType to the API path segment whose
// cached GETs (list, deleted-ids) need invalidating after an approve — see
// deletionApprovalsApi.approve below.
const DELETION_RESOURCE_SEGMENT: Record<string, string> = {
  Driver: "/drivers",
  Truck: "/trucks",
  Staff: "/staff",
  Customer: "/customers",
  Vendor: "/vendors",
  Trip: "/trips",
  FuelLog: "/maintenance",
  MaintenanceRecord: "/maintenance",
  TyreInventory: "/tyre-inventory",
};

export type DeletionApprovalEditEventType = "Deletion Approved" | "Deletion Rejected";

export type DeletionApprovalEditEventRow = {
  id: number;
  requestedByName: string;
  resourceType: string;
  resourceName: string;
  event: DeletionApprovalEditEventType;
  actorName: string;
  createdAt: string;
};

function toMaintenanceRequest(b: B): MaintenanceRequest {
  const p = (b.payload ?? {}) as B;
  return {
    id: String(b.id),
    truckId: String(b.truck_id),
    truckIdStr: b.truck_id_str ?? "",
    registrationNumber: b.registration_number ?? "",
    tripId: b.trip_id != null ? String(b.trip_id) : null,
    tripIdStr: b.trip_id_str ?? null,
    source: b.source === "Trip Sheet" ? "Trip Sheet" : "Web",
    status: b.status,
    date: p.date ?? "",
    maintenanceEndDate: p.maintenance_end_date ?? "",
    odometer: Number(p.odometer ?? 0),
    maintenanceType: p.maintenance_type ?? "",
    repairType: p.repair_type ?? "",
    compliant: p.compliant ?? "",
    maintenanceLocation: p.maintenance_location ?? "",
    maintenanceBy: p.maintenance_by ?? "",
    maintenanceByType: p.maintenance_by_type === "Vendor" || p.maintenance_by_type === "Individual" ? p.maintenance_by_type : null,
    invoiceNumber: p.invoice_number ?? "",
    invoiceDate: p.invoice_date ?? "",
    description: p.description ?? "",
    cost: Number(p.cost ?? 0),
    remindAtOdometer: p.remind_at_odometer != null ? Number(p.remind_at_odometer) : null,
    submittedByName: b.submitted_by_name ?? "",
    submittedByRole: b.submitted_by_role ?? null,
    decidedByName: b.decided_by_name ?? null,
    decidedAt: b.decided_at ?? null,
    rejectReason: b.reject_reason ?? null,
    recordId: b.record_id != null ? String(b.record_id) : null,
    requesterSeenAt: b.requester_seen_at ?? null,
    proofCount: Number(b.proof_count ?? 0),
    createdAt: b.created_at ?? "",
  };
}

/** Maintenance Approvals — every new maintenance record waits here for Admin
 *  or Accounts. Uncached (rawReq): a pending list must never show stale. */
export const maintenanceRequestsApi = {
  submit: (record: MaintenanceRecord, truckDbId: string): Promise<MaintenanceRequest> =>
    rawReq<B>("/maintenance-requests", {
      method: "POST",
      body: JSON.stringify({ truck_id: parseInt(truckDbId), ...maintenanceRecordChanges(record) }),
    }).then(toMaintenanceRequest),
  list: (opts: { status?: string; truckId?: string } = {}): Promise<MaintenanceRequest[]> => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.truckId) params.set("truck_id", opts.truckId);
    const qs = params.toString();
    return rawReq<B[]>(`/maintenance-requests${qs ? `?${qs}` : ""}`).then((d) => d.map(toMaintenanceRequest));
  },
  /** The logged-in user's own requests (any status but Cancelled). */
  listMine: (): Promise<MaintenanceRequest[]> =>
    rawReq<B[]>("/maintenance-requests/mine").then((d) => d.map(toMaintenanceRequest)),
  markMineSeen: (): Promise<void> => rawReq<void>("/maintenance-requests/mine/mark-seen", { method: "POST" }),
  approve: (id: string): Promise<MaintenanceRequest> =>
    rawReq<B>(`/maintenance-requests/${id}/approve`, { method: "PUT" }).then((b) => {
      // The new record feeds the truck's records, running cost and P&L.
      cacheInvalidate("/maintenance");
      return toMaintenanceRequest(b);
    }),
  reject: (id: string, reason: string): Promise<MaintenanceRequest> =>
    rawReq<B>(`/maintenance-requests/${id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) }).then(toMaintenanceRequest),
  uploadProof: async (requestId: string, file: File): Promise<MaintenanceRequestProof> => {
    const form = new FormData();
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/maintenance-requests/${requestId}/proofs`, { method: "POST", headers: authHeaders(), body: form });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Upload failed: HTTP ${res.status}`));
    return toMaintenanceRequestProof(await res.json());
  },
  listProofs: (requestId: string): Promise<MaintenanceRequestProof[]> =>
    rawReq<B[]>(`/maintenance-requests/${requestId}/proofs`).then((d) => d.map(toMaintenanceRequestProof)),
  fetchProofBlob: async (requestId: string, proofId: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/maintenance-requests/${requestId}/proofs/${proofId}`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Could not open the file: HTTP ${res.status}`));
    return res.blob();
  },
};

function toMaintenanceRequestProof(b: B): MaintenanceRequestProof {
  return {
    id: String(b.id),
    requestId: String(b.request_id),
    kind: b.kind === "pdf" ? "pdf" : "image",
    fileName: b.file_name ?? "",
    sizeBytes: Number(b.size_bytes ?? 0),
    uploadedByName: b.uploaded_by_name ?? null,
    createdAt: b.created_at ?? null,
  };
}

export const deletionApprovalsApi = {
  create: (payload: {
    resourceType: string;
    resourceId: number;
    resourceName: string;
    reason: string;
    logDetails?: Record<string, unknown>;
  }): Promise<DeletionApprovalRequest> =>
    req<B>("/deletion-approvals", {
      method: "POST",
      body: JSON.stringify({
        resource_type: payload.resourceType,
        resource_id: payload.resourceId,
        resource_name: payload.resourceName,
        log_details: payload.logDetails ?? null,
        reason: payload.reason,
      }),
    }).then(toDeletionApproval),
  list: (status?: string, resourceType?: string): Promise<DeletionApprovalRequest[]> => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (resourceType) params.set("resource_type", resourceType);
    const qs = params.toString();
    return req<B[]>(`/deletion-approvals${qs ? `?${qs}` : ""}`).then((d) =>
      d.map(toDeletionApproval)
    );
  },
  /** Every deletion request the logged-in user has filed (any status). */
  listMine: (): Promise<DeletionApprovalRequest[]> =>
    req<B[]>("/deletion-approvals/mine").then((d) => d.map(toDeletionApproval)),
  /** Clears the bell badge for this user's decided deletion requests. */
  markMineSeen: (): Promise<void> =>
    req<void>("/deletion-approvals/mine/mark-seen", { method: "POST" }),
  approve: (id: number, adminNote?: string): Promise<DeletionApprovalRequest> =>
    req<B>(`/deletion-approvals/${id}/approve`, {
      method: "PUT",
      body: JSON.stringify({ admin_note: adminNote ?? null }),
    }).then(toDeletionApproval).then((r) => {
      // req()'s auto-invalidation only drops the "/deletion-approvals" cache
      // segment (the path actually hit), not the resource that was just
      // soft-deleted — without this, a cached "/drivers/deleted-ids" (etc.)
      // read can keep showing the resource as not-yet-deleted on Archive
      // until the cache's own TTL/background revalidation catches up.
      const segment = DELETION_RESOURCE_SEGMENT[r.resourceType];
      if (segment) cacheInvalidate(segment);
      return r;
    }),
  reject: (id: number, adminNote?: string): Promise<DeletionApprovalRequest> =>
    req<B>(`/deletion-approvals/${id}/reject`, {
      method: "PUT",
      body: JSON.stringify({ admin_note: adminNote ?? null }),
    }).then(toDeletionApproval),
  listEditEvents: (): Promise<DeletionApprovalEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/deletion-approvals/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        requestedByName: String(r.requested_by_name ?? ""),
        resourceType: String(r.resource_type ?? ""),
        resourceName: String(r.resource_name ?? ""),
        event: String(r.event) as DeletionApprovalEditEventType,
        actorName: String(r.actor_name ?? ""),
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Truck Manufacturers API (historical "adblue" names)
// ---------------------------------------------------------------------------

export type TripPnlSummaryData = {
  total_count: number;
  total_hire: number;
  total_expense: number;
  total_pnl: number;
  rows: {
    id: string;
    trip_id: string;
    scheduled_date: string | null;
    driver_name: string | null;
    truck_registration: string | null;
    origin: string | null;
    destination: string | null;
    hire: number;
    expense: number;
    pnl: number;
    km: number;
  }[];
};

export type CostMode = "Basic" | "Advanced" | "Manual";

export type CustomerProfitabilityData = {
  customer_id: string;
  customer_name: string;
  /** Typed in by name on the trip, or no customer recorded (e.g. a return trip). */
  is_custom: boolean;
  /** Per Cost/KM mode: diesel = km × diesel ₹/km, truck_cost = km × Cost/KM (diesel
   *  included); *_missing = trips with km but no figure in that mode (counted as ₹0). */
  diesel: Record<CostMode, number>;
  diesel_missing: Record<CostMode, number>;
  truck_cost: Record<CostMode, number>;
  cost_missing: Record<CostMode, number>;

  trip_count: number;
  flagged_trip_count: number;
  total_revenue: number;
  total_expense: number;
  total_profit: number;
  profit_margin_pct: number;
  total_km: number;
  routes: {
    route: string;
    trip_count: number;
    revenue: number;
    expense: number;
    profit: number;
    margin_pct: number;
    avg_km: number;
    counted_trip_count: number;
    /** Per Cost/KM mode: diesel = km × diesel ₹/km, truck_cost = km × Cost/KM (diesel
     *  included); *_missing = trips with km but no figure in that mode (counted as ₹0). */
    diesel: Record<CostMode, number>;
    diesel_missing: Record<CostMode, number>;
    truck_cost: Record<CostMode, number>;
    cost_missing: Record<CostMode, number>;
  }[];
  recent_trips: {
    trip_id: string;
    date: string | null;
    route: string;
    revenue: number;
    expense: number;
    profit: number;
    margin_pct: number;
    km: number;
    // Under review by an Auditor — shown for context, but excluded from this
    // customer's totals (see excluded_from_totals) until resolved.
    flagged_for_recheck: boolean;
    flagged_remark: string | null;
    excluded_from_totals: boolean;
    /** Per Cost/KM mode; null = no figure for this trip's truck in that mode. */
    diesel: Record<CostMode, number | null>;
    truck_cost: Record<CostMode, number | null>;
  }[];
};

/** One past trip in Customer Insights. final_profit is null without cost data. */
/** Customer Insights' colour for a profit — see backend profit_level. */
export type ProfitLevel = "top" | "strong" | "good" | "thin" | "zero" | "small_loss" | "mid_loss" | "big_loss";

/** Money fields are only sent to Admin (RouteInsights.show_money); everyone
 *  else gets profit_level and the ranking order. */
export type RouteInsightTrip = {
  trip_id: number;
  trip_id_str: string;
  date: string | null;
  customer_name: string;
  origin: string;
  destination: string;
  container: string;
  driver_id: string | null;
  driver_name: string;
  driver_left: boolean;
  vehicle_id: string | null;
  truck_registration: string;
  truck_removed: string | null;
  km: number;
  profit_level: ProfitLevel | null;
  revenue?: number;
  trip_expense?: number;
  cost_per_km?: number | null;
  truck_cost?: number | null;
  final_profit?: number | null;
  margin_pct?: number | null;
};

/** A truck or driver ranked by average Final Profit per trip. */
export type RouteInsightRank = {
  id: string;
  name: string;
  trip_count: number;
  loss_trips: number;
  profit_trips: number;
  profit_level: ProfitLevel | null;
  total_profit?: number;
  avg_profit?: number;
  avg_margin_pct?: number | null;
};

export type RouteInsightCostTruck = {
  truck_id: string;
  registration_number: string;
  manufacturer: string;
  /** Cheapest / middle / costliest third of the fleet to run. */
  cost_band: "low" | "mid" | "high";
  profit_level: ProfitLevel | null;
  cost_per_km?: number;
  est_cost?: number | null;
  est_profit?: number | null;
  status: "Available" | "On a trip" | "No driver";
  driver_name: string | null;
};

/** GET /trips/route-insights — see backend get_route_insights. */
export type RouteInsights = {
  mode: string;
  /** True for Admin only — the ₹ figures are in the response. */
  show_money: boolean;
  route: {
    label: string; origin: string; destination: string;
    est_km: number | null; km_source: string | null;
    est_hire: number | null; hire_source: string | null;
    est_expense: number | null; expense_source: string | null;
  };
  trips: { this_route: RouteInsightTrip[]; other_customers: RouteInsightTrip[]; other_routes: RouteInsightTrip[] };
  trucks: { this_route: RouteInsightRank[]; other_customers: RouteInsightRank[] };
  drivers: { this_route: RouteInsightRank[]; other_customers: RouteInsightRank[] };
  cost_trucks: RouteInsightCostTruck[];
  trucks_without_cost: number;
};

export type CustomerTopProfitableTrip = {
  trip_id: number;
  trip_id_str: string;
  date: string | null;
  route: string;
  driver_id: string | null;
  driver_name: string;
  vehicle_id: string | null;
  truck_registration: string;
  revenue: number;
  expense: number;
  profit: number;
  margin_pct: number;
  km: number;
  on_route: boolean;
};

export type TruckCostPerKmRanking = {
  truck_db_id: string;
  truck_id: string;
  registration_number: string;
  manufacturer: string;
  // Fuel + tyre + maintenance per km — what the ranking is sorted
  // by. Excludes EMI/compliance (financing/legal costs, not efficiency).
  efficiency_cost_per_km: number;
  // efficiency_cost_per_km + compliance + EMI — shown for reference only.
  total_cost_per_km: number;
  breakdown: {
    fuel_per_km: number;
    tyre_per_km: number;
    maintenance_per_km: number;
    compliance_per_km: number;
    emi_per_km: number;
  };
};

/** A truck manufacturer (Truck's AdBlue History → Manufacturers). The "AdBlue" names are
 * historical — this list used to be managed on the AdBlue page. */
export type AdBlueManufacturer = {
  id: string;
  name: string;
  defaultPricePerLitre: string;
  createdAt?: string;
  updatedAt?: string;
};

function toAdBlueManufacturer(b: B): AdBlueManufacturer {
  return {
    id: String(b.id),
    name: b.name ?? "",
    defaultPricePerLitre: String(b.default_price_per_litre ?? "0"),
    createdAt: b.created_at ?? undefined,
    updatedAt: b.updated_at ?? undefined,
  };
}

export type AdBlueEditEventType = "Manufacturer Created" | "Manufacturer Edited" | "Manufacturer Deleted";

// One row in the Edit History on Truck's AdBlue History → Manufacturers.
export type AdBlueEditEventRow = {
  id: string;
  category: "Manufacturer";
  label: string;
  event: AdBlueEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const adblueApi = {
  listEditEvents: (): Promise<AdBlueEditEventRow[]> =>
    req<B[]>(`/maintenance/adblue/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        category: "Manufacturer",
        label: String(r.label ?? ""),
        event: String(r.event) as AdBlueEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  listManufacturers: () =>
    req<B[]>("/maintenance/adblue-manufacturers").then((d) => d.map(toAdBlueManufacturer)),
  /** pricePerLitre: the manufacturer's AdBlue cost per litre (null = not set). */
  createManufacturer: (name: string, pricePerLitre: number | null) =>
    req<B>("/maintenance/adblue-manufacturers", {
      method: "POST",
      body: JSON.stringify({ name, default_price_per_litre: pricePerLitre }),
    }).then(toAdBlueManufacturer),
  updateManufacturer: (id: string, name: string, pricePerLitre: number | null) =>
    req<B>(`/maintenance/adblue-manufacturers/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, default_price_per_litre: pricePerLitre }),
    }).then(toAdBlueManufacturer),
  deleteManufacturer: (id: string) =>
    req<void>(`/maintenance/adblue-manufacturers/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// AdBlue Logs API (Truck's Adblue History — a record only)
// ---------------------------------------------------------------------------

function toAdBlueLog(b: B): AdBlueLog {
  return {
    id: String(b.id),
    truckId: String(b.truck_id),
    date: b.date ?? "",
    odometer: String(b.odometer ?? ""),
    litres: String(b.litres ?? ""),
    pricePerLitre: String(b.price_per_litre ?? ""),
    totalCost: String(b.total_cost ?? ""),
    fillingLocation: b.supplier ?? null,
    remarks: b.remarks ?? null,
    enteredByName: b.entered_by_name ?? null,
    createdAt: b.created_at ?? null,
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

// One row in the Edit History on Truck's Adblue History.
export type AdBlueLogEditEventRow = {
  id: string;
  label: string;
  event: "Log Created" | "Log Edited" | "Log Deleted";
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const adblueLogsApi = {
  listLogs: (truckId?: string) =>
    rawReq<B[]>(`/maintenance/adblue-logs${truckId ? `?truck_id=${truckId}` : ""}`).then((d) => d.map(toAdBlueLog)),
  listEditEvents: (): Promise<AdBlueLogEditEventRow[]> =>
    rawReq<B[]>("/maintenance/adblue-logs/edit-events").then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        label: String(r.label ?? ""),
        event: String(r.event) as AdBlueLogEditEventRow["event"],
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  createLog: (log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">) =>
    req<B>("/maintenance/adblue-logs", {
      method: "POST",
      body: JSON.stringify({
        truck_id: parseInt(log.truckId),
        date: log.date,
        odometer: parseInt(log.odometer),
        litres: parseFloat(log.litres),
        price_per_litre: parseFloat(log.pricePerLitre),
        total_cost: parseFloat(log.totalCost),
        supplier: log.fillingLocation || null,
        remarks: log.remarks || null,
      }),
    }).then(toAdBlueLog),
  deleteLog: (id: string) => req<void>(`/maintenance/adblue-logs/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Tyre API
// ---------------------------------------------------------------------------

export type TyreInventoryEditEventType = "Tyre Created" | "Tyre Edited" | "Tyre Deleted" | "Tyre Restored";

// One row in the page-wide "Edit History" log on Tyre Inventory — every
// Create/Edit/Delete/Restore ever logged, across every tyre stock record.
export type TyreInventoryEditEventRow = {
  id: number;
  tyreDbId: string;
  tyreNumber: string;
  brand: string;
  event: TyreInventoryEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type TyreFitmentEventType = "Tyre Fitted" | "Tyre Removed";

// One row in the page-wide "Edit History" log on Tyre Management — every
// fit/remove (including each half of a position swap) ever logged, derived
// from TyreFitmentRecord.
export type TyreFitmentEventRow = {
  id: string;
  truckDbId: string;
  truckIdStr: string;
  registrationNumber: string;
  tyreDbId: string;
  tyreNumber: string;
  position: string;
  event: TyreFitmentEventType;
  actorName: string;
  eventDate: string | null;
  remark: string | null;
};

export type ActivityEventRow = {
  id: number;
  createdAt: string;
  userName: string;
  role: string | null;
  kind: string;
  method: string | null;
  route: string;
  label: string | null;
  status: number | null;
  durationMs: number | null;
  ip: string | null;
};

export type ActivitySummaryRow = {
  userName: string;
  role: string | null;
  firstAt: string | null;
  lastAt: string | null;
  activeMinutes: number;
  saves: number;
  deletes: number;
  exports: number;
  logins: number;
  failedLogins: number;
  views: number;
  clicks: number;
  reads: number;
  total: number;
};

export type ActivityEventFilters = {
  dateFrom?: string;
  dateTo?: string;
  user?: string;
  kinds?: string[];
  role?: string;
  route?: string;
  failedOnly?: boolean;
  afterId?: number;
  offset?: number;
  limit?: number;
};

export type ActivityTimelineItem = {
  time: string;
  type: string;
  kind: string;
  method: string | null;
  route: string;
  label: string | null;
  status: number | null;
  count: number | null;
  last?: string | null;
  ip?: string | null;
};

export type ActivityAlert = {
  type: string;
  severity: "high" | "medium" | "low";
  userName: string;
  at: string | null;
  message: string;
};

export type ActivityOverview = {
  day: string;
  activeUsers: number;
  failedActions: number;
  hourly: { hour: number; saves: number; deletes: number; exports: number; logins: number; views: number; clicks: number; reads: number }[];
  topScreens: { route: string; views: number; users: number }[];
  online: { userName: string; role: string | null; status: "active" | "idle"; lastAt: string | null; screen: string | null }[];
  alerts: ActivityAlert[];
};

function activityFilterParams(filters: ActivityEventFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.user) params.set("user", filters.user);
  if (filters.kinds && filters.kinds.length) params.set("kind", filters.kinds.join(","));
  if (filters.role) params.set("role", filters.role);
  if (filters.route) params.set("route", filters.route);
  if (filters.failedOnly) params.set("failed_only", "true");
  return params;
}

// Reads below use rawReq, not the cached req(): the Activity Log refreshes on
// every live push, and a 12s-fresh cache would show the previous numbers.
export const activityApi = {
  // Page views and clicks, sent in batches by useActivityTracking.
  // keepalive=true for the pagehide flush — a plain fetch is routinely
  // cancelled by the browser mid-flight once the page is being torn down;
  // keepalive is what's actually guaranteed to survive that.
  sendBatch: (events: { kind: string; route: string; label?: string }[], keepalive = false) =>
    req<void>("/activity/batch", { method: "POST", body: JSON.stringify({ events }), keepalive }),
  events: (filters: ActivityEventFilters) => {
    const params = activityFilterParams(filters);
    if (filters.afterId != null) params.set("after_id", String(filters.afterId));
    if (filters.offset) params.set("offset", String(filters.offset));
    params.set("limit", String(filters.limit ?? 200));
    return rawReq<Record<string, unknown>[]>(`/activity/events?${params.toString()}`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        createdAt: String(r.created_at),
        userName: String(r.user_name ?? ""),
        role: (r.role as string | null) ?? null,
        kind: String(r.kind),
        method: (r.method as string | null) ?? null,
        route: String(r.route),
        label: (r.label as string | null) ?? null,
        status: (r.status as number | null) ?? null,
        durationMs: (r.duration_ms as number | null) ?? null,
        ip: (r.ip as string | null) ?? null,
      })) as ActivityEventRow[],
    );
  },
  // Total matching the same filters, for the Events page numbers.
  eventsCount: (filters: ActivityEventFilters) =>
    rawReq<{ total: number }>(`/activity/events/count?${activityFilterParams(filters).toString()}`).then((r) =>
      Number(r.total ?? 0),
    ),
  // One employee's day in time order: events and read counts merged.
  timeline: (userName: string, day: string) => {
    const params = new URLSearchParams({ user_name: userName, day });
    return rawReq<ActivityTimelineItem[]>(`/activity/timeline?${params.toString()}`);
  },
  overview: (day: string) =>
    rawReq<Record<string, unknown>>(`/activity/overview?day=${encodeURIComponent(day)}`).then((d) => {
      const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
      return {
        day: String(d.day ?? day),
        activeUsers: Number(d.active_users ?? 0),
        failedActions: Number(d.failed_actions ?? 0),
        hourly: list(d.hourly).map((h) => ({
          hour: Number(h.hour),
          saves: Number(h.saves ?? 0),
          deletes: Number(h.deletes ?? 0),
          exports: Number(h.exports ?? 0),
          logins: Number(h.logins ?? 0),
          views: Number(h.views ?? 0),
          clicks: Number(h.clicks ?? 0),
          reads: Number(h.reads ?? 0),
        })),
        topScreens: list(d.top_screens).map((s) => ({
          route: String(s.route ?? ""),
          views: Number(s.views ?? 0),
          users: Number(s.users ?? 0),
        })),
        online: list(d.online).map((o) => ({
          userName: String(o.user_name ?? ""),
          role: (o.role as string | null) ?? null,
          status: o.status === "active" ? "active" : "idle",
          lastAt: (o.last_at as string | null) ?? null,
          screen: (o.screen as string | null) ?? null,
        })),
        alerts: list(d.alerts).map((a) => ({
          type: String(a.type ?? ""),
          severity: (a.severity === "high" || a.severity === "medium" ? a.severity : "low") as ActivityAlert["severity"],
          userName: String(a.user_name ?? ""),
          at: (a.at as string | null) ?? null,
          message: String(a.message ?? ""),
        })),
      } as ActivityOverview;
    }),
  summary: (day: string) =>
    rawReq<Record<string, unknown>[]>(`/activity/summary?day=${encodeURIComponent(day)}`).then((rows) =>
      rows.map((r) => ({
        userName: String(r.user_name ?? ""),
        role: (r.role as string | null) ?? null,
        firstAt: (r.first_at as string | null) ?? null,
        lastAt: (r.last_at as string | null) ?? null,
        activeMinutes: Number(r.active_minutes ?? 0),
        saves: Number(r.saves ?? 0),
        deletes: Number(r.deletes ?? 0),
        exports: Number(r.exports ?? 0),
        logins: Number(r.logins ?? 0),
        failedLogins: Number(r.failed_logins ?? 0),
        views: Number(r.views ?? 0),
        clicks: Number(r.clicks ?? 0),
        reads: Number(r.reads ?? 0),
        total: Number(r.total ?? 0),
      })) as ActivitySummaryRow[],
    ),
};

// Shared quick-pick remarks for the Manage Tyres dialog (Attachment, Removal, Swap).
export const tyreRemarkPresetApi = {
  list: () => req<TyreRemarkPreset[]>("/tyre-remark-presets"),
  create: (scenario: TyreRemarkScenario, text: string) =>
    req<TyreRemarkPreset>("/tyre-remark-presets", {
      method: "POST",
      body: JSON.stringify({ scenario, text }),
    }),
  remove: (id: number) => req<void>(`/tyre-remark-presets/${id}`, { method: "DELETE" }),
};

export const tyreApi = {
  listInventory: () => req<B[]>("/tyre-inventory").then((d) => d.map(toTyreInventory)),
  // Moves a tyre to the Retread Queue (same record, marked — not copied).
  flagForRetread: (id: string) => req<B>(`/tyre-inventory/${id}/flag-retread`, { method: "POST" }).then(toTyreInventory),
  listRetreadQueue: () => req<B[]>("/tyre-inventory/retread-queue").then((d) => d.map(toTyreInventory)),
  // "Flag as Discarded" — writes a tyre off with a required reason.
  flagForDiscard: (id: string, reason: string) =>
    req<B>(`/tyre-inventory/${id}/flag-discard`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }).then(toTyreInventory),
  listDiscarded: () => req<B[]>("/tyre-inventory/discarded").then((d) => d.map(toTyreInventory)),
  // Moves a discarded tyre back into Tyre Inventory.
  restoreFromDiscard: (id: string) =>
    req<B>(`/tyre-inventory/${id}/restore-from-discard`, { method: "POST" }).then(toTyreInventory),
  // Everything recorded about one tyre: current record, first-added date and every move.
  getTyreData: (id: string) =>
    req<B>(`/tyre-inventory/${id}/data`).then((d) => ({
      tyre: toTyreInventory(d.tyre),
      addedToInventoryAt: d.added_to_inventory_at ?? null,
      movements: (d.movements ?? []).map((m: B) => ({
        id: m.id,
        event: m.event,
        actorName: m.actor_name ?? "",
        actorRole: m.actor_role ?? null,
        retreadCost: m.retread_cost != null ? String(m.retread_cost) : null,
        expectedRange: m.expected_range ?? null,
        retreadCount: m.retread_count ?? null,
        retreadDoneBy: m.retread_done_by ?? null,
        createdAt: m.created_at,
      })),
    }) as TyreData),
  // Moves a retread-queue tyre back to inventory; its retread cost becomes purchase cost.
  moveToInventory: (id: string, retreadCost: string, expectedRange: string, retreadDoneBy: string) =>
    req<B>(`/tyre-inventory/${id}/move-to-inventory`, {
      method: "POST",
      body: JSON.stringify({
        retread_cost: retreadCost,
        expected_range: parseInt(expectedRange, 10),
        retread_done_by: retreadDoneBy,
      }),
    }).then(toTyreInventory),
  // Page-wide "Edit History" log on Tyre Inventory — every Create/Edit/
  // Delete/Restore across every tyre stock record.
  listInventoryEditEvents: (): Promise<TyreInventoryEditEventRow[]> =>
    req<B[]>(`/tyre-inventory/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        tyreDbId: String(r.tyre_id ?? ""),
        tyreNumber: String(r.tyre_number ?? ""),
        brand: String(r.brand ?? ""),
        event: String(r.event) as TyreInventoryEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  // Page-wide "Edit History" log on Tyre Management — every fit/remove
  // across every truck, derived from TyreFitmentRecord.
  listFitmentEvents: (): Promise<TyreFitmentEventRow[]> =>
    req<B[]>(`/tyre-fitment/events`).then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        truckDbId: String(r.truck_id ?? ""),
        truckIdStr: String(r.truck_id_str ?? ""),
        registrationNumber: String(r.registration_number ?? ""),
        tyreDbId: String(r.tyre_id ?? ""),
        tyreNumber: String(r.tyre_number ?? ""),
        position: String(r.position ?? ""),
        event: String(r.event) as TyreFitmentEventType,
        actorName: String(r.actor_name ?? ""),
        eventDate: (r.event_date as string | null) ?? null,
        remark: (r.remark as string | null) ?? null,
      }))
    ),
  availableInventory: () => req<B[]>("/tyre-inventory/available").then((d) => d.map(toTyreInventory)),
  createTyre: (tyre: TyreInventoryItem) =>
    req<B>("/tyre-inventory", { method: "POST", body: JSON.stringify(fromTyreInventory(tyre)) }).then(toTyreInventory),
  updateTyre: (dbId: string, tyre: TyreInventoryItem) =>
    req<B>(`/tyre-inventory/${dbId}`, { method: "PUT", body: JSON.stringify(fromTyreInventory(tyre)) }).then(toTyreInventory),
  deleteTyre: (dbId: string) => req<void>(`/tyre-inventory/${dbId}`, { method: "DELETE" }),
  restore: (dbId: string) => req<B>(`/tyre-inventory/${dbId}/restore`, { method: "POST" }).then(toTyreInventory),
  // -- Proof of Payment/Invoice (one PDF or image per tyre, 15 MB) -----------
  uploadProof: async (dbId: string, file: File): Promise<TyreInventoryItem> => {
    const form = new FormData();
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/tyre-inventory/${dbId}/proof`, { method: "POST", headers: authHeaders(), body: form });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Upload failed: HTTP ${res.status}`));
    return toTyreInventory(await res.json());
  },
  /** Fetched with the auth header (never a token in the URL), returned as a blob. */
  fetchProofBlob: async (dbId: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/tyre-inventory/${dbId}/proof`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(await extractDetail(res, `Could not open the file: HTTP ${res.status}`));
    return res.blob();
  },
  deleteProof: (dbId: string) =>
    rawReq<B>(`/tyre-inventory/${dbId}/proof`, { method: "DELETE" }).then(toTyreInventory),
  removePermanent: (dbId: string) => req<void>(`/tyre-inventory/${dbId}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/tyre-inventory/deleted-ids"),
  getTyreHistory: (dbId: string) => req<B[]>(`/tyre-inventory/${dbId}/history`).then((d) => d.map(toTyreFitment)),

  listFitments: (truckId?: string, activeOnly?: boolean) => {
    const params = new URLSearchParams();
    if (truckId) params.set("truck_id", truckId);
    if (activeOnly) params.set("active_only", "true");
    return req<B[]>(`/tyre-fitment?${params}`).then((d) => d.map(toTyreFitment));
  },
  fitTyre: (tyreDbId: string, truckDbId: string, position: string, fittedOdometer: number, fittedDate: string, fittedRemark?: string) =>
    req<B>("/tyre-fitment", {
      method: "POST",
      body: JSON.stringify({
        tyre_id: parseInt(tyreDbId), truck_id: parseInt(truckDbId), position,
        fitted_odometer: fittedOdometer, fitted_date: fittedDate,
        fitted_remark: fittedRemark || null,
      }),
    }).then(toTyreFitment),
  removeTyre: (fitmentId: string, removedOdometer: number, removedDate: string, removalRemark: string) =>
    req<B>(`/tyre-fitment/${fitmentId}/remove`, {
      method: "PATCH",
      body: JSON.stringify({ removed_odometer: removedOdometer, removed_date: removedDate, removal_remark: removalRemark }),
    }).then(toTyreFitment),
  // Removes several tyres from one truck, all or nothing. An empty fitmentIds list removes every fitted tyre on the truck.
  removeTyresBulk: (truckId: string, fitmentIds: string[], removedOdometer: number, removedDate: string, removalRemark: string) =>
    req<B[]>("/tyre-fitment/remove-bulk", {
      method: "POST",
      body: JSON.stringify({
        truck_id: parseInt(truckId, 10),
        fitment_ids: fitmentIds.map((id) => parseInt(id, 10)),
        removed_odometer: removedOdometer,
        removed_date: removedDate,
        removal_remark: removalRemark,
      }),
    }).then((rows) => rows.map(toTyreFitment)),
  swapPositions: (truckDbId: string, pairs: [string, string][], odometer: number, remark: string, date: string) =>
    req<B[]>("/tyre-fitment/swap", {
      method: "POST",
      body: JSON.stringify({
        truck_id: parseInt(truckDbId),
        pairs: pairs.map(([a, b]) => ({ position_a: a, position_b: b })),
        odometer,
        remark,
        date,
      }),
    }).then((d) => d.map(toTyreFitment)),
};

// ---------------------------------------------------------------------------
// Finance API
// ---------------------------------------------------------------------------

export type EmiRecordEditEventType = "EMI Created" | "EMI Edited" | "EMI Deleted";

// One row in the page-wide "Edit History" log on EMI Tracking — every
// Create/Edit/Delete ever logged, across every EMI record.
export type EmiRecordEditEventRow = {
  id: number;
  emiId: number;
  emiName: string;
  truckRegistration: string | null;
  event: EmiRecordEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type CompensationEditEventType = "Transaction Added" | "Transaction Deleted";

// One row in the page-wide "Edit History" log shared by the Driver
// Compensation and Staff Compensation pages (filtered by personType).
export type CompensationEditEventRow = {
  id: number;
  personType: "driver" | "staff";
  personId: number;
  personName: string | null;
  txType: "Advance" | "Salary";
  amount: string;
  txDate: string | null;
  event: CompensationEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

/** One day of Cleaner / Workshop Batta (see backend finance._daily_batta_rows). */
export type BattaRow = {
  date: string;
  status: string;
  truck_id: string | null;
  truck_registration: string | null;
  truck_source: string;
  branch: string | null;
  rate: number;
  amount: number;
  note: string | null;
};

export const financeApi = {
  listEmi: () => req<B[]>("/finance/emi").then((d) => d.map(toEmiRecord)),
  listEmiEditEvents: (): Promise<EmiRecordEditEventRow[]> =>
    req<B[]>(`/finance/emi/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        emiId: Number(r.emi_id),
        emiName: String(r.emi_name ?? ""),
        truckRegistration: (r.truck_registration as string | null) ?? null,
        event: String(r.event) as EmiRecordEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  createEmi: (record: EmiRecord) =>
    req<B>("/finance/emi", { method: "POST", body: JSON.stringify(fromEmiRecord(record)) }).then(toEmiRecord),
  updateEmi: (dbId: string, record: EmiRecord) =>
    req<B>(`/finance/emi/${dbId}`, { method: "PUT", body: JSON.stringify(fromEmiRecord(record)) }).then(toEmiRecord),
  deleteEmi: (dbId: string) => req<void>(`/finance/emi/${dbId}`, { method: "DELETE" }),

  listRecurring: () => req<B[]>("/finance/recurring-payments").then((d) => d.map(toRecurringPayment)),
  createRecurring: (payment: RecurringPayment) =>
    req<B>("/finance/recurring-payments", { method: "POST", body: JSON.stringify(fromRecurringPayment(payment)) }).then(toRecurringPayment),
  updateRecurring: (dbId: string, payment: RecurringPayment) =>
    req<B>(`/finance/recurring-payments/${dbId}`, { method: "PUT", body: JSON.stringify(fromRecurringPayment(payment)) }).then(toRecurringPayment),
  deleteRecurring: (dbId: string) => req<void>(`/finance/recurring-payments/${dbId}`, { method: "DELETE" }),

  listDriverCompensation: (personId?: string) =>
    req<B[]>(`/finance/compensation/drivers${personId ? `?driver_id=${personId}` : ""}`).then((d) => d.map(toCompensationTransaction)),
  // Total Net Payable per driver (keyed by driver_id, e.g. "CGI-D001") for one YYYY-MM month
  driverMonthlyNetPayable: (month: string, driverIds: string[]) => {
    const params = new URLSearchParams({ month, driver_ids: driverIds.join(",") });
    return req<Record<string, number>>(`/finance/compensation/drivers/monthly-net-payable?${params.toString()}`);
  },
  /** Driver Compensation → Cleaner Batta Record: every attendance day that earns Cleaner Batta. */
  getDriverCleanerBatta: (driverCode: string) =>
    rawReq<{ statuses: string[]; rows: BattaRow[] }>(
      `/finance/compensation/cleaner-batta?driver_id=${encodeURIComponent(driverCode)}`,
    ),
  /** Driver Compensation → Workshop Batta Record: every On Workshop day. */
  getDriverWorkshopBatta: (driverCode: string) =>
    rawReq<{ statuses: string[]; rows: BattaRow[] }>(
      `/finance/compensation/workshop-batta?driver_id=${encodeURIComponent(driverCode)}`,
    ),
  addDriverCompensation: (personId: string, type: string, amount: number, date: string, note?: string, tripNumber?: string) =>
    req<B>("/finance/compensation/drivers", {
      method: "POST",
      body: JSON.stringify({ person_type: "driver", person_id: parseInt(personId), type, amount, date, note: note ?? null, trip_number: tripNumber ?? null }),
    }).then(toCompensationTransaction),

  listStaffCompensation: (personId?: string) =>
    req<B[]>(`/finance/compensation/staff${personId ? `?staff_id=${personId}` : ""}`).then((d) => d.map(toCompensationTransaction)),
  addStaffCompensation: (personId: string, type: string, amount: number, date: string, note?: string) =>
    req<B>("/finance/compensation/staff", {
      method: "POST",
      body: JSON.stringify({ person_type: "staff", person_id: parseInt(personId), type, amount, date, note: note ?? null }),
    }).then(toCompensationTransaction),

  deleteCompensation: (txId: string) => req<void>(`/finance/compensation/${txId}`, { method: "DELETE" }),

  // Page-wide "Edit History" log shared by Driver Compensation and Staff
  // Compensation — pass personType to scope it to that page.
  listCompensationEditEvents: (personType: "driver" | "staff"): Promise<CompensationEditEventRow[]> =>
    req<B[]>(`/finance/compensation/edit-events?person_type=${personType}`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        personType: r.person_type as "driver" | "staff",
        personId: Number(r.person_id),
        personName: (r.person_name as string | null) ?? null,
        txType: r.tx_type as "Advance" | "Salary",
        amount: String(r.amount ?? "0"),
        txDate: (r.tx_date as string | null) ?? null,
        event: String(r.event) as CompensationEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Branches API
// ---------------------------------------------------------------------------

function toBranch(b: B): Branch {
  return {
    id: String(b.id),
    name: b.name ?? "",
    haltDayFee20ft: String(b.halt_day_fee_20ft ?? "0"),
    haltDayFee40ft: String(b.halt_day_fee_40ft ?? "0"),
    partyHaltFee20ft: String(b.party_halt_fee_20ft ?? b.halt_day_fee_20ft ?? "0"),
    partyHaltFee40ft: String(b.party_halt_fee_40ft ?? b.halt_day_fee_40ft ?? "0"),
    haltDayFee2x20: String(b.halt_day_fee_2x20 ?? b.halt_day_fee_20ft ?? "0"),
    haltDayFeeOpenLoad: String(b.halt_day_fee_open_load ?? b.halt_day_fee_20ft ?? "0"),
    partyHaltFee2x20: String(b.party_halt_fee_2x20 ?? b.party_halt_fee_20ft ?? b.halt_day_fee_20ft ?? "0"),
    partyHaltFeeOpenLoad: String(b.party_halt_fee_open_load ?? b.party_halt_fee_20ft ?? b.halt_day_fee_20ft ?? "0"),
    driverHaltDayPercentage: String(b.driver_halt_day_percentage ?? "0"),
    cleanerBattaFee: String(b.cleaner_batta_fee ?? "0"),
    workshopBattaFee: String(b.workshop_batta_fee ?? "0"),
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function fromBranch(f: Branch) {
  return {
    name: f.name,
    halt_day_fee_20ft: f.haltDayFee20ft ? parseFloat(f.haltDayFee20ft) : 0,
    halt_day_fee_40ft: f.haltDayFee40ft ? parseFloat(f.haltDayFee40ft) : 0,
    party_halt_fee_20ft: f.partyHaltFee20ft ? parseFloat(f.partyHaltFee20ft) : 0,
    party_halt_fee_40ft: f.partyHaltFee40ft ? parseFloat(f.partyHaltFee40ft) : 0,
    halt_day_fee_2x20: f.haltDayFee2x20 ? parseFloat(f.haltDayFee2x20) : 0,
    halt_day_fee_open_load: f.haltDayFeeOpenLoad ? parseFloat(f.haltDayFeeOpenLoad) : 0,
    party_halt_fee_2x20: f.partyHaltFee2x20 ? parseFloat(f.partyHaltFee2x20) : 0,
    party_halt_fee_open_load: f.partyHaltFeeOpenLoad ? parseFloat(f.partyHaltFeeOpenLoad) : 0,
    driver_halt_day_percentage: f.driverHaltDayPercentage ? parseFloat(f.driverHaltDayPercentage) : 0,
    cleaner_batta_fee: f.cleanerBattaFee ? parseFloat(f.cleanerBattaFee) : 0,
    workshop_batta_fee: f.workshopBattaFee ? parseFloat(f.workshopBattaFee) : 0,
    client_version: f.version,
  };
}

// ---------------------------------------------------------------------------
// Repair Types API
// ---------------------------------------------------------------------------

function toRepairType(b: B): RepairType {
  return {
    id: String(b.id ?? ""),
    name: b.name ?? "",
    defaultCost: String(b.default_cost ?? "0"),
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function toSacCode(b: B): SacCode {
  return {
    id: String(b.id ?? ""),
    description: b.description ?? "",
    code: b.code ?? "",
    gstRate: String(b.gst_rate ?? "0"),
    linkedExpense: b.linked_expense ?? undefined,
    autoPopulateInvoiceType: b.auto_populate_invoice_type ?? undefined,
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

export type RepairTypeEditEventType = "Repair Type Created" | "Repair Type Edited" | "Repair Type Deleted";

export type RepairTypeEditEventRow = {
  id: number;
  repairTypeId: number;
  name: string;
  event: RepairTypeEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const repairTypesApi = {
  list: () => req<B[]>("/repair-types").then((d) => d.map(toRepairType)),
  listEditEvents: (): Promise<RepairTypeEditEventRow[]> =>
    req<B[]>(`/repair-types/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        repairTypeId: Number(r.repair_type_id),
        name: String(r.name ?? ""),
        event: String(r.event) as RepairTypeEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  create: (payload: Omit<RepairType, "id">) =>
    req<B>("/repair-types", {
      method: "POST",
      body: JSON.stringify({ name: payload.name, default_cost: parseFloat(payload.defaultCost) || 0 }),
    }).then(toRepairType),
  update: (id: string, payload: Partial<RepairType>) =>
    req<B>(`/repair-types/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: payload.name, default_cost: payload.defaultCost !== undefined ? parseFloat(payload.defaultCost) || 0 : undefined, client_version: payload.version }),
    }).then(toRepairType),
  delete: (id: string) => req<void>(`/repair-types/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Maintenance Categories API (the "Maintenance Management" admin page —
// categories, each grouping several repair types underneath it)
// ---------------------------------------------------------------------------

function toMaintenanceCategoryRepair(b: B): MaintenanceCategoryRepair {
  return {
    id: String(b.id),
    categoryId: String(b.category_id),
    name: b.name ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
  };
}

function toMaintenanceCategory(b: B): MaintenanceCategory {
  return {
    id: String(b.id),
    name: b.name ?? "",
    version: typeof b.version === "number" ? b.version : undefined,
    repairs: Array.isArray(b.repairs) ? (b.repairs as B[]).map(toMaintenanceCategoryRepair) : [],
  };
}

export type MaintenanceCategoryEditEventType =
  | "Category Created" | "Category Edited" | "Category Deleted"
  | "Repair Created" | "Repair Edited" | "Repair Deleted";

export type MaintenanceCategoryEditEventRow = {
  id: number;
  categoryId: number;
  categoryName: string;
  repairId: number | null;
  repairName: string | null;
  event: MaintenanceCategoryEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const maintenanceCategoriesApi = {
  list: () => req<B[]>("/maintenance-categories").then((d) => d.map(toMaintenanceCategory)),
  listEditEvents: (): Promise<MaintenanceCategoryEditEventRow[]> =>
    req<B[]>(`/maintenance-categories/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        categoryId: Number(r.category_id),
        categoryName: String(r.category_name ?? ""),
        repairId: r.repair_id != null ? Number(r.repair_id) : null,
        repairName: (r.repair_name as string | null) ?? null,
        event: String(r.event) as MaintenanceCategoryEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  create: (name: string) =>
    req<B>("/maintenance-categories", { method: "POST", body: JSON.stringify({ name }) }).then(toMaintenanceCategory),
  update: (id: string, name: string, clientVersion?: number) =>
    req<B>(`/maintenance-categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, client_version: clientVersion }),
    }).then(toMaintenanceCategory),
  delete: (id: string) => req<void>(`/maintenance-categories/${id}`, { method: "DELETE" }),

  createRepair: (categoryId: string, name: string) =>
    req<B>(`/maintenance-categories/${categoryId}/repairs`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }).then(toMaintenanceCategoryRepair),
  updateRepair: (categoryId: string, repairId: string, name: string, clientVersion?: number) =>
    req<B>(`/maintenance-categories/${categoryId}/repairs/${repairId}`, {
      method: "PUT",
      body: JSON.stringify({ name, client_version: clientVersion }),
    }).then(toMaintenanceCategoryRepair),
  deleteRepair: (categoryId: string, repairId: string) =>
    req<void>(`/maintenance-categories/${categoryId}/repairs/${repairId}`, { method: "DELETE" }),
};

// The CFS/yard directory behind TripFormDialog's "View All CFS" / "View All
// Yard" — Admin-editable.
function toCfsYardEntry(b: B): CfsYardEntry {
  return { id: String(b.id), kind: b.kind as CfsYardEntry["kind"], name: String(b.name ?? ""), version: Number(b.version ?? 1) };
}
export const cfsYardApi = {
  list: (kind: CfsYardEntry["kind"]) =>
    req<B[]>("/cfs-yard").then((rows) => rows.filter((r) => r.kind === kind).map(toCfsYardEntry)),
  create: (kind: CfsYardEntry["kind"], name: string) =>
    req<B>("/cfs-yard", { method: "POST", body: JSON.stringify({ kind, name }) }).then(toCfsYardEntry),
  update: (id: string, name: string, version?: number) =>
    req<B>(`/cfs-yard/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, client_version: version }),
    }).then(toCfsYardEntry),
  delete: (id: string) => req<void>(`/cfs-yard/${id}`, { method: "DELETE" }),
  restore: (id: string) => req<B>(`/cfs-yard/${id}/restore`, { method: "POST" }).then(toCfsYardEntry),
  removePermanent: (id: string) => req<void>(`/cfs-yard/${id}/permanent`, { method: "DELETE" }),
  listDeletedIds: () => req<number[]>("/cfs-yard/deleted-ids"),
};

export type SacCodeEditEventType = "SAC Code Created" | "SAC Code Edited" | "SAC Code Deleted";

export type SacCodeEditEventRow = {
  id: number;
  sacCodeId: number;
  code: string;
  description: string;
  event: SacCodeEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const sacCodesApi = {
  list: () => req<B[]>("/sac-codes").then((d) => d.map(toSacCode)),
  listEditEvents: (): Promise<SacCodeEditEventRow[]> =>
    req<B[]>(`/sac-codes/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        sacCodeId: Number(r.sac_code_id),
        code: String(r.code ?? ""),
        description: String(r.description ?? ""),
        event: String(r.event) as SacCodeEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  create: (payload: Omit<SacCode, "id">) =>
    req<B>("/sac-codes", {
      method: "POST",
      body: JSON.stringify({
        description: payload.description, code: payload.code,
        gst_rate: parseFloat(payload.gstRate) || 0,
      }),
    }).then(toSacCode),
  update: (id: string, payload: Partial<SacCode>) =>
    req<B>(`/sac-codes/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        description: payload.description, code: payload.code,
        gst_rate: payload.gstRate !== undefined ? parseFloat(payload.gstRate) || 0 : undefined,
        linked_expense: payload.linkedExpense !== undefined ? payload.linkedExpense : undefined,
        client_version: payload.version,
      }),
    }).then(toSacCode),
  linkExpense: (id: string, expense: string) =>
    req<B>(`/sac-codes/${id}/link-expense`, {
      method: "PATCH",
      body: JSON.stringify({ expense: expense || null }),
    }).then(toSacCode),
  setAutoPopulate: (id: string, invoiceType: string | null) =>
    req<B>(`/sac-codes/${id}/auto-populate`, {
      method: "PATCH",
      body: JSON.stringify({ invoice_type: invoiceType || null }),
    }).then(toSacCode),
  delete: (id: string) => req<void>(`/sac-codes/${id}`, { method: "DELETE" }),
};

export type BranchEditEventType = "Branch Created" | "Branch Edited" | "Branch Deleted";

export type BranchEditEventRow = {
  id: number;
  branchId: number;
  name: string;
  event: BranchEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const branchesApi = {
  list: () => req<B[]>("/branches").then((d) => d.map(toBranch)),
  listEditEvents: (): Promise<BranchEditEventRow[]> =>
    req<B[]>(`/branches/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        branchId: Number(r.branch_id),
        name: String(r.name ?? ""),
        event: String(r.event) as BranchEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
  get: (id: string) => req<B>(`/branches/${id}`).then(toBranch),
  create: (branch: Branch) =>
    req<B>("/branches", { method: "POST", body: JSON.stringify(fromBranch(branch)) }).then(toBranch),
  update: (id: string, branch: Branch) =>
    req<B>(`/branches/${id}`, { method: "PUT", body: JSON.stringify(fromBranch(branch)) }).then(toBranch),
  delete: (id: string) => req<void>(`/branches/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Trip Expense Rates API
// ---------------------------------------------------------------------------

export type TripExpenseRate = {
  id: number;
  name: string;
  portPassExpense: number;
  portPassExpenseAuto: boolean;
  weightSheetExpense: number;
  weightSheetExpenseAuto: boolean;
  mamolExpense: number;
  mamolExpenseAuto: boolean;
  claimableMamolExpense: number;
  claimableMamolExpenseAuto: boolean;
  trafficRtoExpense: number;
  trafficRtoExpenseAuto: boolean;
  liftOnOffExpense: number;
  liftOnOffExpenseAuto: boolean;
  craneOperatorExpense: number;
  craneOperatorExpenseAuto: boolean;
  parkingExpense: number;
  parkingExpenseAuto: boolean;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type TER = Record<string, unknown>;

function toTripExpenseRate(r: TER): TripExpenseRate {
  return {
    id: r.id as number,
    name: String(r.name ?? ""),
    portPassExpense: Number(r.port_pass_expense ?? 0),
    portPassExpenseAuto: Boolean(r.port_pass_expense_auto),
    weightSheetExpense: Number(r.weight_sheet_expense ?? 0),
    weightSheetExpenseAuto: Boolean(r.weight_sheet_expense_auto),
    mamolExpense: Number(r.mamol_expense ?? 0),
    mamolExpenseAuto: Boolean(r.mamol_expense_auto),
    claimableMamolExpense: Number(r.claimable_mamol_expense ?? 0),
    claimableMamolExpenseAuto: Boolean(r.claimable_mamol_expense_auto),
    trafficRtoExpense: Number(r.traffic_rto_expense ?? 0),
    trafficRtoExpenseAuto: Boolean(r.traffic_rto_expense_auto),
    liftOnOffExpense: Number(r.lift_on_off_expense ?? 0),
    liftOnOffExpenseAuto: Boolean(r.lift_on_off_expense_auto),
    craneOperatorExpense: Number(r.crane_operator_expense ?? 0),
    craneOperatorExpenseAuto: Boolean(r.crane_operator_expense_auto),
    parkingExpense: Number(r.parking_expense ?? 0),
    parkingExpenseAuto: Boolean(r.parking_expense_auto),
    version: Number(r.version ?? 1),
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  };
}

function fromTripExpenseRate(ter: Partial<TripExpenseRate> & { clientVersion?: number }): TER {
  const out: TER = {};
  if (ter.name !== undefined) out.name = ter.name;
  if (ter.portPassExpense !== undefined) out.port_pass_expense = ter.portPassExpense;
  if (ter.portPassExpenseAuto !== undefined) out.port_pass_expense_auto = ter.portPassExpenseAuto;
  if (ter.weightSheetExpense !== undefined) out.weight_sheet_expense = ter.weightSheetExpense;
  if (ter.weightSheetExpenseAuto !== undefined) out.weight_sheet_expense_auto = ter.weightSheetExpenseAuto;
  if (ter.mamolExpense !== undefined) out.mamol_expense = ter.mamolExpense;
  if (ter.mamolExpenseAuto !== undefined) out.mamol_expense_auto = ter.mamolExpenseAuto;
  if (ter.claimableMamolExpense !== undefined) out.claimable_mamol_expense = ter.claimableMamolExpense;
  if (ter.claimableMamolExpenseAuto !== undefined) out.claimable_mamol_expense_auto = ter.claimableMamolExpenseAuto;
  if (ter.trafficRtoExpense !== undefined) out.traffic_rto_expense = ter.trafficRtoExpense;
  if (ter.trafficRtoExpenseAuto !== undefined) out.traffic_rto_expense_auto = ter.trafficRtoExpenseAuto;
  if (ter.liftOnOffExpense !== undefined) out.lift_on_off_expense = ter.liftOnOffExpense;
  if (ter.liftOnOffExpenseAuto !== undefined) out.lift_on_off_expense_auto = ter.liftOnOffExpenseAuto;
  if (ter.craneOperatorExpense !== undefined) out.crane_operator_expense = ter.craneOperatorExpense;
  if (ter.craneOperatorExpenseAuto !== undefined) out.crane_operator_expense_auto = ter.craneOperatorExpenseAuto;
  if (ter.parkingExpense !== undefined) out.parking_expense = ter.parkingExpense;
  if (ter.parkingExpenseAuto !== undefined) out.parking_expense_auto = ter.parkingExpenseAuto;
  if (ter.clientVersion !== undefined) out.client_version = ter.clientVersion;
  return out;
}

export type TripExpenseRateEditEventType = "Trip Expense Rates Updated";

export type TripExpenseRateEditEventRow = {
  id: number;
  event: TripExpenseRateEditEventType;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export const tripExpenseRatesApi = {
  getConfig: () => req<TER>("/trip-expense-rates").then(toTripExpenseRate),
  saveConfig: (data: Partial<TripExpenseRate>, clientVersion?: number) =>
    req<TER>("/trip-expense-rates", {
      method: "PUT",
      body: JSON.stringify(fromTripExpenseRate({ ...data, clientVersion })),
    }).then(toTripExpenseRate),
  listEditEvents: (): Promise<TripExpenseRateEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/trip-expense-rates/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        event: String(r.event) as TripExpenseRateEditEventType,
        actorName: String(r.actor_name ?? ""),
        actorRole: (r.actor_role as string | null) ?? null,
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

export type TripOverviewRow = {
  tripId: string;
  status: string;
  origin: string;
  destination: string;
  scheduledDate: string;
  truckRegistration: string;
  driverName: string;
};

export type TripsOverview = {
  currentTrips: TripOverviewRow[];
  completedTrips: TripOverviewRow[];
  pendingInvoiceTrips: TripOverviewRow[];
};

function toOverviewRow(b: Record<string, unknown>): TripOverviewRow {
  return {
    tripId: (b.trip_id as string) ?? "",
    status: (b.status as string) ?? "",
    origin: (b.origin as string) ?? "",
    destination: (b.destination as string) ?? "",
    scheduledDate: (b.scheduled_date as string) ?? "",
    truckRegistration: (b.truck_registration as string) ?? "",
    driverName: (b.driver_name as string) ?? "",
  };
}

export const dashboardApi = {
  overview: () => req<Record<string, unknown>>("/dashboard/overview"),
  tripsOverview: (): Promise<TripsOverview> =>
    req<{ current_trips: Record<string, unknown>[]; completed_trips: Record<string, unknown>[]; pending_invoice_trips: Record<string, unknown>[] }>(
      "/dashboard/trips-overview"
    ).then((d) => ({
      currentTrips: d.current_trips.map(toOverviewRow),
      completedTrips: d.completed_trips.map(toOverviewRow),
      pendingInvoiceTrips: d.pending_invoice_trips.map(toOverviewRow),
    })),
};

// ---------------------------------------------------------------------------
// P&L Summary API
// ---------------------------------------------------------------------------

export type TruckPLTripRow = {
  /** trips.id — opens this row's Trip Breakdown. */
  tripId: number | null;
  /** The trip's code, e.g. TRP-1490 ("" for a sheet with no trip). */
  tripCode: string;
  tripSheetDate: string;
  tripSheetNo: string;
  bookingReferenceNo: string;
  fromLocation: string;
  toLocation: string;
  hireAmount: number;
  totalExpense: number;
  /** Hire − Trip Expenses, worked out by the server (only on /pl-summary/computed). */
  tripProfit?: number;
  /** Each trip-sheet line behind totalExpense (driver_pay, toll_charges, …) —
   *  see backend pl_summary.TRIP_EXPENSE_LINES. They add up to totalExpense. */
  expenseLines: Record<string, number>;
  totalKm: number;
  // Joined from trips + customers — used for profitability filter pills
  customerName: string;
  tripCategory: string;
  cargoClassification: string;
  containerSpecification: string;
  // Under review by an Auditor — shown for context, but excluded from this
  // truck's totals until resolved (see excludedFromTotals on the entry above).
  flaggedForRecheck: boolean;
  flaggedRemark: string | null;
  excludedFromTotals: boolean;
};

export type TruckPLMaintenanceRow = {
  date: string;
  maintenanceType: string;
  description: string;
  cost: number;
};

export type TruckPLEntry = {
  truckId: string;
  registrationNumber: string;
  /** "Sold" / "Deleted" — a truck no longer in the fleet, shown for its past trips. */
  disposal: string | null;
  tripCount: number;
  flaggedTripCount: number;
  totalHireAmount: number;
  tripExpenses: number;
  maintenanceExpenses: number;
  emiShare: number;
  documentShare: number;
  documentBreakdown: {
    rc: number;
    fc: number;
    road_tax: number;
    insurance: number;
    national_permit: number;
    local_permit: number;
    pollution_certificate: number;
  };
  emiDetails: Array<{
    emiName: string;
    bankName: string;
    monthlyEmi: number;
    shareForPeriod: number;
    monthlyFinanceCost: number;
    dailyFinanceCost: number;
    periodFinanceCost: number;
  }>;
  totalCost: number;
  netPl: number;
  totalKm: number;
  revenuePerKm: number;
  maintenanceCount: number;
  tripRows: TruckPLTripRow[];
  maintenanceRows: TruckPLMaintenanceRow[];
};

/** One mode's Cost/KM for a truck, split into its parts (₹/km). */
export type TripBreakdownCost = {
  total: number | null;
  parts: { emi: number | null; fuel: number | null; tyre: number | null; maintenance: number | null; compliance: number | null };
  /** False in Manual until the calculator saves the split. */
  partsKnown: boolean;
  dieselPrice: number | null;
  mileage: number | null;
  mileageSource: string;
  priceSource: string;
};

/** Everything behind one Trip Profitability row (GET /pl-summary/trip-breakdown/{id}). */
export type TripBreakdown = {
  tripId: number;
  tripCode: string;
  tripSheetNo: string;
  truckId: string;
  registrationNumber: string;
  customerName: string;
  fromLocation: string;
  toLocation: string;
  hire: { gross: number; commission: number; net: number };
  expenses: { total: number; items: { label: string; amount: number }[] };
  km: { start: number; end: number; total: number };
  flaggedForRecheck: boolean;
  flaggedRemark: string | null;
  cost: Record<"Manual" | "Basic" | "Advanced", TripBreakdownCost> | null;
};

function toBreakdownCost(c: B): TripBreakdownCost {
  const num = (v: unknown) => (v == null ? null : Number(v));
  const p = (c.parts ?? {}) as B;
  return {
    total: num(c.total),
    parts: { emi: num(p.emi), fuel: num(p.fuel), tyre: num(p.tyre), maintenance: num(p.maintenance), compliance: num(p.compliance) },
    partsKnown: Boolean(c.parts_known),
    dieselPrice: num(c.diesel_price),
    mileage: num(c.mileage),
    mileageSource: String(c.mileage_source ?? ""),
    priceSource: String(c.price_source ?? ""),
  };
}

function toPlTripRow(t: B): TruckPLTripRow {
  return {
          tripId:                 typeof t.trip_id === "number" ? t.trip_id : null,
          tripCode:               String(t.trip_code ?? ""),
          tripSheetDate:          String(t.trip_sheet_date ?? ""),
          tripSheetNo:            String(t.trip_sheet_no ?? ""),
          bookingReferenceNo:     String(t.booking_reference_no ?? ""),
          fromLocation:           String(t.from_location ?? ""),
          toLocation:             String(t.to_location ?? ""),
          hireAmount:             Number(t.hire_amount ?? 0),
          totalExpense:           Number(t.total_expense ?? 0),
          tripProfit:             t.trip_profit != null ? Number(t.trip_profit) : undefined,
          expenseLines:           Object.fromEntries(Object.entries((t.expense_lines as B) ?? {}).map(([k, v]) => [k, Number(v ?? 0)])),
          totalKm:                Number(t.total_km ?? 0),
          customerName:           String(t.customer_name ?? ""),
          tripCategory:           String(t.trip_category ?? ""),
          cargoClassification:    String(t.cargo_classification ?? ""),
          containerSpecification: String(t.container_specification ?? ""),
          flaggedForRecheck:      Boolean(t.flagged_for_recheck ?? false),
          flaggedRemark:          (t.flagged_remark as string | null) ?? null,
          excludedFromTotals:     Boolean(t.excluded_from_totals ?? false),
        };
}

function toTruckPLEntry(b: B): TruckPLEntry {
  return {
        truckId: String(b.truck_id ?? ""),
        registrationNumber: String(b.registration_number ?? ""),
        disposal: (b.disposal as string | null) ?? null,
        tripCount: Number(b.trip_count ?? 0),
        flaggedTripCount: Number(b.flagged_trip_count ?? 0),
        totalHireAmount: Number(b.total_hire_amount ?? 0),
        tripExpenses: Number(b.trip_expenses ?? 0),
        maintenanceExpenses: Number(b.maintenance_expenses ?? 0),
        emiShare: Number(b.emi_share ?? 0),
        documentShare: Number(b.document_share ?? 0),
        documentBreakdown: {
          rc: Number((b.document_breakdown as B)?.rc ?? 0),
          fc: Number((b.document_breakdown as B)?.fc ?? 0),
          road_tax: Number((b.document_breakdown as B)?.road_tax ?? 0),
          insurance: Number((b.document_breakdown as B)?.insurance ?? 0),
          national_permit: Number((b.document_breakdown as B)?.national_permit ?? 0),
          local_permit: Number((b.document_breakdown as B)?.local_permit ?? 0),
          pollution_certificate: Number((b.document_breakdown as B)?.pollution_certificate ?? 0),
        },
        emiDetails: ((b.emi_details as B[]) ?? []).map((e) => ({
          emiName: String(e.emi_name ?? ""),
          bankName: String(e.bank_name ?? ""),
          monthlyEmi: Number(e.monthly_emi ?? 0),
          shareForPeriod: Number(e.share_for_period ?? 0),
          monthlyFinanceCost: Number(e.monthly_finance_cost ?? 0),
          dailyFinanceCost: Number(e.daily_finance_cost ?? 0),
          periodFinanceCost: Number(e.period_finance_cost ?? 0),
        })),
        totalCost: Number(b.total_cost ?? 0),
        netPl: Number(b.net_pl ?? 0),
        totalKm: Number(b.total_km ?? 0),
        revenuePerKm: Number(b.revenue_per_km ?? 0),
        maintenanceCount: Number(b.maintenance_count ?? 0),
        tripRows: ((b.trip_rows as B[]) ?? []).map(toPlTripRow),
        maintenanceRows: ((b.maintenance_rows as B[]) ?? []).map((m) => ({
          date: String(m.date ?? ""),
          maintenanceType: String(m.maintenance_type ?? ""),
          description: String(m.description ?? ""),
          cost: Number(m.cost ?? 0),
        })),
      };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** One trip's money, worked out by the server (backend pl_compute.trip_money). */
export type PlTripMoney = {
  tripProfit: number;
  dieselRate: number | null;
  diesel: number | null;
  gross: number | null;
  costPerKm: number | null;
  truckExpenses: number | null;
  /** True when there's no diesel figure, so Truck Expenses is all of Cost/KM. */
  truckExpensesIncludeDiesel: boolean;
  finalProfit: number | null;
};

/** One truck's money for the period (backend pl_compute.truck_money). */
export type PlTruckMoney = {
  tripProfit: number;
  dieselRate: number | null;
  diesel: number | null;
  gross: number | null;
  tyreRate: number | null;
  tyres: number | null;
  running: number;
  fixed: number;
  net: number;
  incomplete: string[];
};

export type PlComputedTrip = TruckPLTripRow & { truckId: string; registrationNumber: string; disposal: string | null; money: PlTripMoney };
export type PlComputedTruck = TruckPLEntry & { money: PlTruckMoney };

/** GET /pl-summary/computed — the Profitability page's finished numbers. */
export type PlComputed = {
  mode: string;
  trips: PlComputedTrip[];
  tripTotals: {
    trips: number; counted: number; flagged: number;
    hire: number; tripExpenses: number; tripProfit: number;
    grossTrips: number; diesel: number; gross: number; truckExpenses: number;
    finalTrips: number; final: number | null;
    profitable: number; nonProfitable: number; profitablePct: number | null; nonProfitablePct: number | null;
    unjudged: number;
  };
  allTripCount: number;
  trucks: PlComputedTruck[];
  truckTotals: {
    trucks: number; idle: number; incomplete: number; profitable: number; nonProfitable: number;
    trips: number; km: number; hire: number; tripExpenses: number; tripProfit: number;
    diesel: number; gross: number; running: number; fixed: number; net: number;
  };
  allTruckCount: number;
};

function toPlComputed(b: B): PlComputed {
  const tt = b.trip_totals as B;
  const kt = b.truck_totals as B;
  return {
    mode: String(b.mode),
    trips: ((b.trips as B[]) ?? []).map((t) => {
      const m = t.money as B;
      return {
        ...toPlTripRow(t),
        truckId: String(t.truck_id ?? ""),
        registrationNumber: String(t.registration_number ?? ""),
        disposal: (t.disposal as string | null) ?? null,
        money: {
          tripProfit: Number(m.trip_profit ?? 0), dieselRate: num(m.diesel_rate), diesel: num(m.diesel),
          gross: num(m.gross), costPerKm: num(m.cost_per_km), truckExpenses: num(m.truck_expenses),
          truckExpensesIncludeDiesel: Boolean(m.truck_expenses_include_diesel), finalProfit: num(m.final_profit),
        },
      };
    }),
    tripTotals: {
      trips: Number(tt.trips), counted: Number(tt.counted), flagged: Number(tt.flagged),
      hire: Number(tt.hire), tripExpenses: Number(tt.trip_expenses), tripProfit: Number(tt.trip_profit),
      grossTrips: Number(tt.gross_trips), diesel: Number(tt.diesel), gross: Number(tt.gross),
      truckExpenses: Number(tt.truck_expenses), finalTrips: Number(tt.final_trips), final: num(tt.final),
      profitable: Number(tt.profitable), nonProfitable: Number(tt.non_profitable),
      profitablePct: num(tt.profitable_pct), nonProfitablePct: num(tt.non_profitable_pct), unjudged: Number(tt.unjudged),
    },
    allTripCount: Number(b.all_trip_count ?? 0),
    trucks: ((b.trucks as B[]) ?? []).map((e) => {
      const m = e.money as B;
      return {
        ...toTruckPLEntry(e),
        money: {
          tripProfit: Number(m.trip_profit ?? 0), dieselRate: num(m.diesel_rate), diesel: num(m.diesel),
          gross: num(m.gross), tyreRate: num(m.tyre_rate), tyres: num(m.tyres),
          running: Number(m.running ?? 0), fixed: Number(m.fixed ?? 0), net: Number(m.net ?? 0),
          incomplete: ((m.incomplete as string[]) ?? []).map(String),
        },
      };
    }),
    truckTotals: {
      trucks: Number(kt.trucks), idle: Number(kt.idle), incomplete: Number(kt.incomplete),
      profitable: Number(kt.profitable), nonProfitable: Number(kt.non_profitable),
      trips: Number(kt.trips), km: Number(kt.km), hire: Number(kt.hire), tripExpenses: Number(kt.trip_expenses),
      tripProfit: Number(kt.trip_profit), diesel: Number(kt.diesel), gross: Number(kt.gross),
      running: Number(kt.running), fixed: Number(kt.fixed), net: Number(kt.net),
    },
    allTruckCount: Number(b.all_truck_count ?? 0),
  };
}

export const plSummaryApi = {
  /** The page's numbers, finished on the server for this period + mode (+ search). */
  getComputed: (startDate: string, endDate: string, mode: string, search = ""): Promise<PlComputed> => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, mode, search });
    return rawReq<B>(`/pl-summary/computed?${params}`).then(toPlComputed);
  },
  /** The Excel report's sheets as the preview shows them (formulas worked out). */
  getExportPreview: (query: string): Promise<{ filename: string; sheets: { name: string; rows: string[][] }[] }> =>
    rawReq<{ filename: string; sheets: { name: string; rows: string[][] }[] }>(`/pl-summary/export-preview?${query}`),
  /** Earliest trip sheet date on record (or null). */
  getFirstTripDate: (): Promise<string | null> =>
    req<{ first_trip_date: string | null }>("/pl-summary/first-trip-date").then((r) => r.first_trip_date),
  getTripBreakdown: (tripId: number): Promise<TripBreakdown> =>
    rawReq<B>(`/pl-summary/trip-breakdown/${tripId}`).then((b) => ({
      tripId: Number(b.trip_id),
      tripCode: String(b.trip_code ?? ""),
      tripSheetNo: String(b.trip_sheet_no ?? ""),
      truckId: String(b.truck_id ?? ""),
      registrationNumber: String(b.registration_number ?? ""),
      customerName: String(b.customer_name ?? ""),
      fromLocation: String(b.from_location ?? ""),
      toLocation: String(b.to_location ?? ""),
      hire: { gross: Number(b.hire?.gross ?? 0), commission: Number(b.hire?.commission ?? 0), net: Number(b.hire?.net ?? 0) },
      expenses: {
        total: Number(b.expenses?.total ?? 0),
        items: ((b.expenses?.items as B[]) ?? []).map((i) => ({ label: String(i.label ?? ""), amount: Number(i.amount ?? 0) })),
      },
      km: { start: Number(b.km?.start ?? 0), end: Number(b.km?.end ?? 0), total: Number(b.km?.total ?? 0) },
      flaggedForRecheck: Boolean(b.flagged_for_recheck),
      flaggedRemark: (b.flagged_remark as string | null) ?? null,
      cost: b.cost
        ? { Manual: toBreakdownCost(b.cost.Manual), Basic: toBreakdownCost(b.cost.Basic), Advanced: toBreakdownCost(b.cost.Advanced) }
        : null,
    })),
  get: (startDate: string, endDate: string, truckId?: string): Promise<TruckPLEntry[]> => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (truckId) params.set("truck_id", truckId);
    return req<B[]>(`/pl-summary?${params}`).then((data) => data.map(toTruckPLEntry));
  },
};

// ---------------------------------------------------------------------------
// Edit Approvals
// ---------------------------------------------------------------------------

function toEditApproval(b: B): EditApprovalRequest {
  return {
    id: String(b.id),
    staffDbId: Number(b.staff_db_id),
    staffName: String(b.staff_name ?? ""),
    staffCode: b.staff_code ?? null,
    resourceType: b.resource_type as EditApprovalResourceType,
    resourceId: Number(b.resource_id),
    resourceName: String(b.resource_name ?? ""),
    action: b.action as EditApprovalAction,
    reason: String(b.reason ?? ""),
    proposedChanges: (b.proposed_changes as Record<string, unknown>) ?? null,
    adminNote: b.admin_note ?? null,
    approvedByName: b.approved_by_name ?? null,
    status: (b.status ?? "Pending") as EditApprovalRequest["status"],
    approvedAt: b.approved_at ?? null,
    expiresAt: b.expires_at ?? null,
    createdAt: b.created_at ?? null,
    usedAt: b.used_at ?? null,
    requesterSeenAt: (b.requester_seen_at as string | null) ?? null,
  };
}

export type EditApprovalEditEventType = "Edit Request Approved" | "Edit Request Rejected";

export type EditApprovalEditEventRow = {
  id: number;
  staffName: string;
  resourceType: string;
  resourceName: string;
  event: EditApprovalEditEventType;
  actorName: string;
  createdAt: string;
};

export const editApprovalsApi = {
  list: (status?: string, resourceType?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (resourceType) params.set("resource_type", resourceType);
    const qs = params.toString();
    return req<B[]>(`/edit-approvals${qs ? `?${qs}` : ""}`).then((d) => d.map(toEditApproval));
  },
  getMyActive: () =>
    req<B[]>("/edit-approvals/my-active").then((d) => d.map(toEditApproval)),
  getMine: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return req<B[]>(`/edit-approvals/mine${qs}`).then((d) => d.map(toEditApproval));
  },
  /** Clears the bell badge for this user's decided edit requests. */
  markMineSeen: (): Promise<void> =>
    req<void>("/edit-approvals/mine/mark-seen", { method: "POST" }),
  create: (payload: {
    resourceType: EditApprovalResourceType;
    resourceId: number;
    resourceName: string;
    action: EditApprovalAction;
    reason: string;
    proposedChanges?: Record<string, unknown>;
  }) =>
    req<B>("/edit-approvals", {
      method: "POST",
      body: JSON.stringify({
        resource_type: payload.resourceType,
        resource_id: payload.resourceId,
        resource_name: payload.resourceName,
        action: payload.action,
        reason: payload.reason,
        proposed_changes: payload.proposedChanges ?? null,
      }),
    }).then(toEditApproval),
  approve: (id: string, adminNote?: string) =>
    req<B>(`/edit-approvals/${id}/approve`, {
      method: "PATCH",
      body: adminNote !== undefined ? JSON.stringify({ admin_note: adminNote }) : undefined,
    }).then(toEditApproval),
  reject: (id: string) =>
    req<B>(`/edit-approvals/${id}/reject`, { method: "PATCH" }).then(toEditApproval),
  remove: (id: string) =>
    req<void>(`/edit-approvals/${id}`, { method: "DELETE" }),
  listEditEvents: (): Promise<EditApprovalEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/edit-approvals/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        staffName: String(r.staff_name ?? ""),
        resourceType: String(r.resource_type ?? ""),
        resourceName: String(r.resource_name ?? ""),
        event: String(r.event) as EditApprovalEditEventType,
        actorName: String(r.actor_name ?? ""),
        createdAt: String(r.created_at ?? ""),
      }))
    ),
};

// ---------------------------------------------------------------------------
// Notifications API (persistent, role-targeted)
// ---------------------------------------------------------------------------

export type ServerNotification = {
  id: number;
  eventType: string;
  title: string;
  message: string;
  tripIdStr: string;
  bookingRef: string;
  createdBy: string;
  createdAt: string;
};

export const notificationsApi = {
  list: (unreadOnly = true) =>
    req<B[]>(`/notifications?unread_only=${unreadOnly}`).then((rows) =>
      rows.map((r) => ({
        id: Number(r.id),
        eventType: String(r.event_type ?? ""),
        title: String(r.title ?? ""),
        message: String(r.message ?? ""),
        tripIdStr: String(r.trip_id_str ?? ""),
        bookingRef: String(r.booking_reference_no ?? ""),
        createdBy: String(r.created_by ?? ""),
        createdAt: String(r.created_at ?? ""),
      }) as ServerNotification)
    ),
  markRead: (id: number) => req<B>(`/notifications/${id}/read`, { method: "POST" }),
  /** exclude: event types to leave unread. */
  markAllRead: (exclude: string[] = []) =>
    req<{ ok: boolean }>(
      `/notifications/read-all${exclude.length ? `?exclude=${encodeURIComponent(exclude.join(","))}` : ""}`,
      { method: "POST" },
    ),
};

export type Reminder = {
  kind: string;
  severity: "overdue" | "due_soon";
  title: string;
  detail: string;
  entity: string;
  dueDate: string;
  daysLeft: number;
  href: string;
};

// ---------------------------------------------------------------------------
// Celebrations — staff birthdays, the December season, Founding Day.
// Uncached on purpose (rawReq): the persisted GET cache would keep showing
// yesterday's answer, or one from before a date of birth was corrected.
// previewQuery() adds Admin's Celebrations Management preview, if any.
// ---------------------------------------------------------------------------

export type BirthdayToday = {
  celebrating: boolean; mine: boolean; name: string | null; date: string;
  message: string; signature: string;
};
export const birthdayApi = {
  today: () =>
    rawReq<B>(`/celebrations/birthday${previewQuery()}`).then((r) => ({
      celebrating: !!r.celebrating,
      mine: !!r.mine,
      name: r.name ?? null,
      date: String(r.date ?? ""),
      message: String(r.message ?? ""),
      signature: String(r.signature ?? ""),
    }) as BirthdayToday),
};

export type FestiveSeason = {
  enabled: boolean;
  active: boolean;
  greeting: "christmas" | "newyear" | null;
  newYear: number;
  seasonKey: string;
  date: string;
  messages: { christmas: string; newyear: string; signature: string };
};
export const seasonApi = {
  get: () =>
    rawReq<B>(`/celebrations/season${previewQuery()}`).then((r) => ({
      enabled: !!r.enabled,
      active: !!r.active,
      greeting: r.greeting === "christmas" || r.greeting === "newyear" ? r.greeting : null,
      newYear: Number(r.new_year ?? 0),
      seasonKey: String(r.season_key ?? ""),
      date: String(r.date ?? ""),
      messages: {
        christmas: String(r.messages?.christmas ?? ""),
        newyear: String(r.messages?.newyear ?? ""),
        signature: String(r.messages?.signature ?? ""),
      },
    }) as FestiveSeason),
};

export type FoundingDay = {
  enabled: boolean;
  active: boolean;
  years: number;
  ordinal: string;
  milestone: boolean;
  date: string;
  stats: { tripsCompleted: number; trucks: number; customers: number } | null;
  message: string;
  signature: string;
};
export const foundingApi = {
  get: () =>
    rawReq<B>(`/celebrations/founding${previewQuery()}`).then((r) => ({
      enabled: !!r.enabled,
      active: !!r.active,
      years: Number(r.years ?? 0),
      ordinal: String(r.ordinal ?? ""),
      milestone: !!r.milestone,
      date: String(r.date ?? ""),
      stats: r.stats
        ? { tripsCompleted: Number(r.stats.trips_completed ?? 0), trucks: Number(r.stats.trucks ?? 0), customers: Number(r.stats.customers ?? 0) }
        : null,
      message: String(r.message ?? ""),
      signature: String(r.signature ?? ""),
    }) as FoundingDay),
};

export type CelebrationKey = "birthdays" | "season" | "founding";
export type CelebrationMessages = { birthday: string; christmas: string; newyear: string; founding: string; signature: string };
export type CelebrationsOverview = {
  today: string;
  switches: Record<CelebrationKey, boolean>;
  messages: CelebrationMessages;
  defaults: CelebrationMessages;
  maxMessage: number;
  upcoming: { date: string; days: number; kind: "birthday" | "season" | "founding"; title: string; detail: string }[];
  history: { event: string; actor: string | null; detail: string | null; at: string | null }[];
};
/** Celebrations Management (Admin). */
export const celebrationsApi = {
  overview: () =>
    rawReq<B>("/celebrations").then((r) => ({
      today: String(r.today ?? ""),
      switches: r.switches,
      messages: r.messages,
      defaults: r.defaults,
      maxMessage: Number(r.max_message ?? 250),
      upcoming: r.upcoming ?? [],
      history: r.history ?? [],
    }) as CelebrationsOverview),
  setSwitch: (key: CelebrationKey, enabled: boolean) =>
    rawReq<{ key: string; enabled: boolean }>("/celebrations/switch", { method: "PUT", body: JSON.stringify({ key, enabled }) }),
  setMessages: (messages: Partial<CelebrationMessages>) =>
    rawReq<CelebrationMessages>("/celebrations/messages", { method: "PUT", body: JSON.stringify(messages) }),
};

export const remindersApi = {
  list: () =>
    req<B[]>("/notifications/reminders").then((rows) =>
      rows.map((r) => ({
        kind: String(r.kind ?? ""),
        severity: (r.severity === "overdue" ? "overdue" : "due_soon") as Reminder["severity"],
        title: String(r.title ?? ""),
        detail: String(r.detail ?? ""),
        entity: String(r.entity ?? ""),
        dueDate: String(r.due_date ?? ""),
        daysLeft: Number(r.days_left ?? 0),
        href: String(r.href ?? "/"),
      }))
    ),
};

export type AuditLogEntry = {
  id: number;
  event: string;
  outcome: string;
  actorName: string | null;
  actorRole: string | null;
  resource: string | null;
  ipAddress: string | null;
  detail: string | null;
  createdAt: string | null;
};

export type LockoutEntry = {
  ipAddress: string;
  username: string;
  failedAttempts: number;
  lockedUntilSeconds: number;
};

export const securityApi = {
  getAuditLogs: (params?: { skip?: number; limit?: number; event?: string; user?: string; ip?: string; dateFrom?: string; dateTo?: string }) => {
    const qs = new URLSearchParams();
    if (params?.skip !== undefined) qs.set("skip", String(params.skip));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.event) qs.set("event", params.event);
    if (params?.user) qs.set("user", params.user);
    if (params?.ip) qs.set("ip", params.ip);
    if (params?.dateFrom) qs.set("date_from", params.dateFrom);
    if (params?.dateTo) qs.set("date_to", params.dateTo);
    return req<{ total: number; items: B[] }>(`/auth/audit-logs?${qs.toString()}`).then((r) => ({
      total: r.total,
      items: r.items.map((b) => ({
        id: Number(b.id),
        event: String(b.event ?? ""),
        outcome: String(b.outcome ?? ""),
        actorName: b.actor_name ? String(b.actor_name) : null,
        actorRole: b.actor_role ? String(b.actor_role) : null,
        resource: b.resource ? String(b.resource) : null,
        ipAddress: b.ip_address ? String(b.ip_address) : null,
        detail: b.detail ? String(b.detail) : null,
        createdAt: b.created_at ? String(b.created_at) : null,
      })) as AuditLogEntry[],
    }));
  },
  getLockouts: () =>
    req<{ items: B[] }>("/auth/lockouts").then((r) => ({
      items: r.items.map((b) => ({
        ipAddress: String(b.ip_address ?? ""),
        username: String(b.username ?? ""),
        failedAttempts: Number(b.failed_attempts ?? 0),
        lockedUntilSeconds: Number(b.locked_until_seconds ?? 0),
      })) as LockoutEntry[],
    })),
  resetLockout: (ipAddress: string, username: string) =>
    req<void>("/auth/lockouts/reset", {
      method: "POST",
      body: JSON.stringify({ ip_address: ipAddress, username }),
    }),
  // Longest a staff shift may run from check-in before it is closed automatically.
  getMaxShiftHours: () =>
    req<{ hours: number }>("/settings/max-shift-hours").then((r) => Number(r.hours)),
  updateMaxShiftHours: (hours: number) =>
    req<{ hours: number }>("/settings/max-shift-hours", {
      method: "PUT",
      body: JSON.stringify({ hours }),
    }).then((r) => Number(r.hours)),
  // Whether marking attendance is required — just the stored flag for now,
  // nothing enforces it yet (see SetWorkingHoursDialog.tsx).
  getAttendanceMandatory: () =>
    req<{ mandatory: boolean }>("/settings/attendance-mandatory").then((r) => Boolean(r.mandatory)),
  updateAttendanceMandatory: (mandatory: boolean) =>
    req<{ mandatory: boolean }>("/settings/attendance-mandatory", {
      method: "PUT",
      body: JSON.stringify({ mandatory }),
    }).then((r) => Boolean(r.mandatory)),
  // Whether the auto-close-shift background sweep runs at all. Manual
  // "Close Shift" (self or Admin) always works regardless of this flag.
  getAutoCloseEnabled: () =>
    req<{ enabled: boolean }>("/settings/auto-close-enabled").then((r) => Boolean(r.enabled)),
  updateAutoCloseEnabled: (enabled: boolean) =>
    req<{ enabled: boolean }>("/settings/auto-close-enabled", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }).then((r) => Boolean(r.enabled)),
  getDeviceLock: () =>
    req<{ enabled: boolean; admin_limit: number; staff_limit: number }>("/settings/device-lock").then((r) => ({
      enabled: Boolean(r.enabled),
      adminLimit: Number(r.admin_limit),
      staffLimit: Number(r.staff_limit),
    })),
  updateDeviceLock: (payload: { enabled?: boolean; adminLimit?: number; staffLimit?: number }) =>
    req<{ enabled: boolean; admin_limit: number; staff_limit: number }>("/settings/device-lock", {
      method: "PUT",
      body: JSON.stringify({
        enabled: payload.enabled,
        admin_limit: payload.adminLimit,
        staff_limit: payload.staffLimit,
      }),
    }).then((r) => ({ enabled: Boolean(r.enabled), adminLimit: Number(r.admin_limit), staffLimit: Number(r.staff_limit) })),
  resetAllDevices: () =>
    req<{ ok: boolean; cleared: number }>("/settings/device-lock/reset-all", {
      method: "POST",
    }),
};

// ---------------------------------------------------------------------------
// Running Cost Calculator API
// ---------------------------------------------------------------------------

type RccModeData = {
  costPerLitre: string;
  /** Tyre Cost Configuration quantities: layout → tyre type → quantity. */
  tyreCostConfigQty?: Record<string, Record<string, string>>;
  tyreEntries: Record<string, { cost: string; range: string }>;
  runEntries: Record<string, { month: string; day: string }>;
  truckMetrics: Record<string, {
    emiAmount: string;
    emiPerDay: string;
    emiPerKm: string;
    mileage: string;
    tyreType: string;
    tyrePerKm: string;
    maintenancePerKm: string;
    complianceCostPerYear: string;
  }>;
};

export type RccState = {
  Manual: RccModeData;
  Basic: RccModeData;
  Advanced: RccModeData;
};

function _parseModeData(d: Record<string, any>): RccModeData {
  return {
    costPerLitre: d.cost_per_litre ?? "",
    tyreCostConfigQty: d.tyre_cost_config_qty ?? {},
    tyreEntries: Object.fromEntries(
      Object.entries(d.tyre_entries ?? {}).map(([k, v]: [string, any]) => [k, { cost: v.cost ?? "", range: v.range ?? "" }])
    ),
    runEntries: Object.fromEntries(
      Object.entries(d.run_entries ?? {}).map(([k, v]: [string, any]) => [k, { month: v.month ?? "", day: v.day ?? "" }])
    ),
    truckMetrics: Object.fromEntries(
      Object.entries(d.truck_metrics ?? {}).map(([k, v]: [string, any]) => {
        return [k, {
          emiAmount: v.emi_amount ?? "",
          emiPerDay: v.emi_per_day ?? "",
          emiPerKm:  v.emi_per_km  ?? "",
          mileage: v.mileage ?? "",
          tyreType: v.tyre_type ?? "",
          tyrePerKm: v.tyre_per_km ?? "",
          maintenancePerKm: v.maintenance_per_km ?? "",
          complianceCostPerYear: v.compliance_cost_per_year ?? "",
        }];
      })
    ),
  };
}

function _serializeModeData(d: RccModeData) {
  return {
    cost_per_litre: d.costPerLitre,
    // Saved on the server so Manual Cost/KM can be worked out there.
    tyre_cost_config_qty: d.tyreCostConfigQty ?? {},
    tyre_entries: Object.fromEntries(
      Object.entries(d.tyreEntries).map(([k, v]) => [k, { cost: v.cost, range: v.range }])
    ),
    run_entries: Object.fromEntries(
      Object.entries(d.runEntries).map(([k, v]) => [k, { month: v.month, day: v.day }])
    ),
    truck_metrics: Object.fromEntries(
      Object.entries(d.truckMetrics).map(([k, v]) => [k, {
        emi_amount:  v.emiAmount,
        emi_per_day: v.emiPerDay,
        emi_per_km:  v.emiPerKm,
        mileage: v.mileage,
        tyre_type: v.tyreType,
        tyre_per_km: v.tyrePerKm,
        maintenance_per_km: v.maintenancePerKm,
        compliance_cost_per_year: v.complianceCostPerYear,
      }])
    ),
  };
}

const _emptyRccModeData = (): RccModeData => ({
  costPerLitre: "", tyreEntries: {}, runEntries: {}, truckMetrics: {},
});
// _emptyRccModeData is available for callers that need a typed empty state

/** "How is this calculated?" for one truck in one mode (Running Cost Calculator). */
export type CostExplanation = {
  truckId: string;
  registrationNumber: string;
  tyreLayout: string;
  mode: string;
  total: number | null;
  note: string | null;
  distance: { monthlyAvg: number; dailyAvg: number; trips: number; missingSheets: number; configuredKmPerDay: number | null };
  parts: {
    key: string;
    label: string;
    value: number | null;
    formula: string | null;
    missing: string | null;
    inputs: { label: string; value: string; detail: string | null; source: string | null; href: string | null }[];
    /** The rows behind this part (fitted tyres, documents, loans…), if any. */
    table: ExplainTable | null;
  }[];
};

export type ExplainTable = {
  title: string | null;
  columns: string[];
  rows: string[][];
  footer: string[] | null;
  /** Column indexes to right-align (numbers). */
  numeric: number[];
};

/** One truck's Cost/KM and its five parts (₹/km; null = no data). */
export type ServerCostParts = {
  total: number | null;
  emi: number | null;
  fuel: number | null;
  tyre: number | null;
  maintenance: number | null;
  compliance: number | null;
};

/** A truck's distance stats (Truck Run Record) — see backend truck_run_stats_all. */
export type TruckRunStats = {
  totalDistance: number;
  tripsWithDistance: number;
  /** Completed trips still without a trip sheet — not counted in the average. */
  missingSheets: number;
  firstTripDate: string | null;
  /** The span ends here: the latest trip entered in the whole system. */
  dataUntil: string | null;
  days: number;
  months: number;
  monthlyAvg: number;
  dailyAvg: number;
  avgPerTrip: number;
  longest: number;
  shortest: number;
};

function toRunStats(b: B): TruckRunStats {
  return {
    totalDistance: Number(b.total_distance ?? 0),
    tripsWithDistance: Number(b.trips_with_distance ?? 0),
    missingSheets: Number(b.missing_sheets ?? 0),
    firstTripDate: b.first_trip_date ?? null,
    dataUntil: b.data_until ?? null,
    days: Number(b.days ?? 0),
    months: Number(b.months ?? 0),
    monthlyAvg: Number(b.monthly_avg ?? 0),
    dailyAvg: Number(b.daily_avg ?? 0),
    avgPerTrip: Number(b.avg_per_trip ?? 0),
    longest: Number(b.longest ?? 0),
    shortest: Number(b.shortest ?? 0),
  };
}

export const runningCostApi = {
  getState: (): Promise<RccState> =>
    req<Record<string, any>>("/running-cost/state").then((d) => ({
      Manual:   _parseModeData(d.Manual   ?? {}),
      Basic:    _parseModeData(d.Basic    ?? {}),
      Advanced: _parseModeData(d.Advanced ?? {}),
    })),

  saveState: (state: RccState): Promise<void> =>
    req<void>("/running-cost/state", {
      method: "PUT",
      body: JSON.stringify({
        Manual:   _serializeModeData(state.Manual),
        Basic:    _serializeModeData(state.Basic),
        Advanced: _serializeModeData(state.Advanced),
      }),
    }),

  // Server-persisted cache of each truck's final computed Cost/Km per mode —
  // written live by this calculator, read by P&L Summary's Truck
  // Profitability tab. Replaces the old localStorage hand-off between the
  // two pages, which broke across browsers/devices and mismatched modes.
  getCostPerKm: (): Promise<Record<string, Record<string, number | null>>> =>
    req<Record<string, Record<string, number | null>>>("/running-cost/cost-per-km"),
  /** {mode: {truck fleet ID: diesel cost per km}} — the calculator's "Mileage"
   * line (diesel price ÷ km/L). Profitability's Gross Profit uses it. */
  /** {mode: {truck fleet ID: {fuel, tyre}}} — the calculator's "Mileage" and
   * "Tyre Charges" per km. Truck Profitability's Diesel and Tyres use them. */
  getCostPartsPerKm: (): Promise<Record<string, Record<string, { fuel: number | null; tyre: number | null }>>> =>
    req<Record<string, Record<string, { fuel: number | null; tyre: number | null }>>>("/running-cost/cost-parts-per-km"),
  getMileageCostPerKm: (): Promise<Record<string, Record<string, number>>> =>
    req<Record<string, Record<string, number>>>("/running-cost/mileage-cost-per-km"),
  // Every truck's monthly average km (from trip history), fetched once for the
  // whole fleet — replaces each Advanced-mode truck card independently calling
  // useTruckTripRuns (a full trips list + a per-trip sheet fetch, per card).
  /** Truck Run Record stats per truck (keyed by truck ID) — the server is the
   *  only place the Monthly Distance Average is worked out. */
  /** The server's Basic and Advanced Cost/KM, split into its five parts, per
   *  truck ID — what the calculator shows for those two modes. */
  explain: (truckBusinessId: string, mode: string): Promise<CostExplanation> =>
    req<B>(`/running-cost/explain/${encodeURIComponent(truckBusinessId)}?mode=${encodeURIComponent(mode)}`).then((d) => ({
      truckId: d.truck_id,
      registrationNumber: d.registration_number ?? "",
      tyreLayout: d.tyre_layout ?? "",
      mode: d.mode,
      total: d.total ?? null,
      note: d.note ?? null,
      distance: {
        monthlyAvg: Number(d.distance?.monthly_avg ?? 0),
        dailyAvg: Number(d.distance?.daily_avg ?? 0),
        trips: Number(d.distance?.trips ?? 0),
        missingSheets: Number(d.distance?.missing_sheets ?? 0),
        configuredKmPerDay: d.distance?.configured_km_per_day ?? null,
      },
      parts: (d.parts ?? []).map((p: B) => ({
        key: p.key, label: p.label, value: p.value ?? null, formula: p.formula ?? null, missing: p.missing ?? null,
        table: p.table ? {
          title: p.table.title ?? null, columns: p.table.columns ?? [], rows: p.table.rows ?? [],
          footer: p.table.footer ?? null, numeric: p.table.numeric ?? [],
        } : null,
        inputs: (p.inputs ?? []).map((i: B) => ({
          label: i.label, value: i.value, detail: i.detail ?? null, source: i.source ?? null, href: i.href ?? null,
        })),
      })),
    })),
  getCostBreakdownAll: (): Promise<Record<"Basic" | "Advanced", Record<string, ServerCostParts>>> =>
    req<Record<"Basic" | "Advanced", Record<string, ServerCostParts>>>("/running-cost/cost-breakdown-all"),
  getRunStatsAll: (): Promise<Record<string, TruckRunStats>> =>
    req<Record<string, B>>("/running-cost/run-stats-all").then((m) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, toRunStats(v)])),
    ),
  getRunStats: (truckBusinessId: string): Promise<TruckRunStats> =>
    req<B>(`/running-cost/run-stats/${encodeURIComponent(truckBusinessId)}`).then(toRunStats),
  saveCostPerKm: (
    mode: string,
    values: Record<string, number | null>,
    parts?: Record<string, { emi: number | null; fuel: number | null; tyre: number | null; maintenance: number | null; compliance: number | null }>,
  ): Promise<void> =>
    req<void>("/running-cost/cost-per-km", {
      method: "PUT",
      body: JSON.stringify({ mode, values, ...(parts ? { parts } : {}) }),
    }),
};


// ---------------------------------------------------------------------------
// Canaan Chat
//
// Chat deliberately bypasses the SWR layer used by every other resource. `req`
// persists GET responses to localStorage, which for chat would mean writing
// decrypted private message bodies to disk on the user's machine — undoing the
// point of encrypting them at rest on the server. `chatReq` goes straight to the
// network instead: nothing is cached, nothing is persisted. Freshness comes from
// the WebSocket push, not from polling.
// ---------------------------------------------------------------------------

function chatReq<T>(path: string, options?: RequestInit): Promise<T> {
  return rawReq<T>(path, options);
}

function toChatMember(b: B): ChatMember {
  return {
    staffId: String(b.staff_id),
    name: b.name ?? "",
    designation: b.designation ?? null,
    department: b.department ?? null,
    softwareDesignation: b.software_designation ?? null,
    photoUrl: b.photo_url ? fileUrl("staff", String(b.staff_id), "photo") : null,
    role: (b.role as ChatMember["role"]) ?? null,
  };
}

// Exported so the chat page's WebSocket handlers can decode "chat_message" /
// "chat_message_updated" / "chat_message_deleted" payloads with the exact same
// mapping as a regular API response — both are the same snake_case JSON shape
// off the wire, so hand-rolling a second parser there would just be a second
// place for this list of fields to drift out of sync.
export function toChatMessage(b: B): ChatMessage {
  return {
    id: Number(b.id),
    conversationId: Number(b.conversation_id),
    senderId: b.sender_id == null ? null : Number(b.sender_id),
    senderName: b.sender_name ?? null,
    text: b.text ?? "",
    contentType: b.content_type ?? "text",
    mediaMime: b.media_mime ?? null,
    durationMs: b.duration_ms == null ? null : Number(b.duration_ms),
    mediaFilename: b.media_filename ?? null,
    mediaSize: b.media_size == null ? null : Number(b.media_size),
    paymentStatus: b.payment_status ?? null,
    paymentDecidedBy: b.payment_decided_by == null ? null : Number(b.payment_decided_by),
    paymentDecidedByName: b.payment_decided_by_name ?? null,
    paymentDecidedAt: b.payment_decided_at ?? null,
    replyToId: b.reply_to_id == null ? null : Number(b.reply_to_id),
    createdAt: b.created_at ?? null,
    editedAt: b.edited_at ?? null,
    deleted: Boolean(b.deleted),
  };
}

function toChatConversation(b: B): ChatConversation {
  return {
    id: Number(b.id),
    kind: (b.kind as ChatConversation["kind"]) ?? "direct",
    title: b.title ?? null,
    peer: b.peer ? toChatMember(b.peer as B) : null,
    hasPhoto: Boolean(b.has_photo),
    memberCount: Number(b.member_count ?? 0),
    unreadCount: Number(b.unread_count ?? 0),
    muted: Boolean(b.muted),
    myRole: (b.my_role as ChatConversation["myRole"]) ?? "member",
    lastMessage: b.last_message ? toChatMessage(b.last_message as B) : null,
    lastMessageAt: b.last_message_at ?? null,
    createdAt: b.created_at ?? null,
    peerLastReadId: Number(b.peer_last_read_id ?? 0),
  };
}

function toChatConversationDetail(b: B): ChatConversationDetail {
  return {
    ...toChatConversation(b),
    members: Array.isArray(b.members) ? (b.members as B[]).map(toChatMember) : [],
  };
}

function toChatOwnerConversation(b: B): ChatOwnerConversation {
  return {
    id: Number(b.id),
    kind: (b.kind as ChatOwnerConversation["kind"]) ?? "direct",
    title: b.title ?? "",
    members: Array.isArray(b.members) ? (b.members as B[]).map(toChatMember) : [],
    lastMessage: b.last_message ? toChatMessage(b.last_message as B) : null,
    lastMessageAt: b.last_message_at ?? null,
    createdAt: b.created_at ?? null,
  };
}

// Canaan Chat — owner view. Admin-only, read-only, gated by a password separate
// from login (see backend/routers/chat_owner_view.py). The unlock token is sent
// as its own header, never as the normal Authorization bearer, and is kept only
// in memory on the frontend — it's never written to localStorage.
export const chatOwnerApi = {
  unlock: (password: string) =>
    req<{ token: string; expires_at: string }>("/chat/owner-view/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<void>("/chat/owner-view/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  listConversations: (token: string) =>
    req<B[]>("/chat/owner-view/conversations", {
      headers: { "X-Owner-View-Token": token },
    }).then((d) => d.map(toChatOwnerConversation)),
  listMessages: (conversationId: number, token: string, beforeId?: number) => {
    const params = new URLSearchParams();
    if (beforeId) params.set("before_id", String(beforeId));
    return req<B[]>(`/chat/owner-view/conversations/${conversationId}/messages?${params.toString()}`, {
      headers: { "X-Owner-View-Token": token },
    }).then((d) => d.map(toChatMessage));
  },
  /** Revokes the token server-side right away — called when the dialog is
   * closed, so closing it is a real lock and reopening always asks for the
   * password again, instead of silently reusing the token for the rest of
   * its 30-minute window (see backend/security.py:lock_owner_view_token). */
  lock: (token: string) =>
    req<void>("/chat/owner-view/lock", {
      method: "POST",
      headers: { "X-Owner-View-Token": token },
    }),
  /** Every unlock/change-password/view event, for any Admin — not gated by
   * the owner-view token (see backend/routers/chat_owner_view.py:list_history). */
  history: () =>
    req<B[]>("/chat/owner-view/history").then((d) =>
      d.map(
        (b): ChatOwnerHistoryEntry => ({
          id: Number(b.id),
          event: b.event,
          outcome: b.outcome,
          actorName: b.actor_name ?? null,
          resource: b.resource ?? null,
          detail: b.detail ?? null,
          createdAt: b.created_at,
        })
      )
    ),
};

export const chatApi = {
  /** Everyone the current user can start a conversation with. */
  listContacts: (): Promise<ChatMember[]> =>
    chatReq<B[]>("/chat/contacts").then((d) => d.map(toChatMember)),

  /** Sidebar: every thread the user is in, most recent activity first. */
  listConversations: (): Promise<ChatConversation[]> =>
    chatReq<B[]>("/chat/conversations").then((d) => d.map(toChatConversation)),

  getConversation: (id: number): Promise<ChatConversationDetail> =>
    chatReq<B>(`/chat/conversations/${id}`).then(toChatConversationDetail),

  /** Open (or reopen) the 1:1 thread with someone — safe to call repeatedly. */
  openDirect: (staffId: number): Promise<ChatConversationDetail> =>
    chatReq<B>("/chat/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ staff_id: staffId }),
    }).then(toChatConversationDetail),

  createGroup: (title: string, memberIds: number[]): Promise<ChatConversationDetail> =>
    chatReq<B>("/chat/conversations/group", {
      method: "POST",
      body: JSON.stringify({ title, member_ids: memberIds }),
    }).then(toChatConversationDetail),

  renameGroup: (id: number, title: string): Promise<ChatConversationDetail> =>
    chatReq<B>(`/chat/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }).then(toChatConversationDetail),

  /**
   * A plain `<img src>` for a group's icon. Served by a dedicated route (not
   * `fileUrl`'s generic `/files/...` pattern) so access stays participant-only,
   * same as every other conversation read — the token travels as `?token=`
   * since an <img> tag can't send an Authorization header.
   */
  groupPhotoUrl: (id: number): string => {
    const base = `${BASE}/chat/conversations/${id}/photo`;
    if (typeof window === "undefined") return base;
    try {
      const stored = localStorage.getItem("canaan_erp_user");
      const token = stored ? (JSON.parse(stored) as { token?: string }).token : undefined;
      return token ? `${base}?token=${encodeURIComponent(token)}` : base;
    } catch {
      return base;
    }
  },

  /** Admin-only. Raw multipart upload like `sendAttachment` — the body is file bytes, not JSON. */
  uploadGroupPhoto: async (id: number, file: File): Promise<ChatConversationDetail> => {
    const form = new FormData();
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/conversations/${id}/photo`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (res.status === 413) {
      throw new Error(await extractDetail(res, "Image is too large."));
    }
    if (res.status === 415) {
      throw new Error(await extractDetail(res, "Unsupported file type."));
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, `Could not upload photo: HTTP ${res.status}`));
    }
    return toChatConversationDetail(await res.json());
  },

  /** Admin-only. */
  removeGroupPhoto: (id: number): Promise<ChatConversationDetail> =>
    chatReq<B>(`/chat/conversations/${id}/photo`, { method: "DELETE" }).then(toChatConversationDetail),

  addMembers: (id: number, memberIds: number[]): Promise<ChatConversationDetail> =>
    chatReq<B>(`/chat/conversations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ member_ids: memberIds }),
    }).then(toChatConversationDetail),

  removeMember: (id: number, staffId: number): Promise<ChatConversationDetail> =>
    chatReq<B>(`/chat/conversations/${id}/members/${staffId}`, { method: "DELETE" })
      .then(toChatConversationDetail),

  /** One page of history. Pass `beforeId` to walk further back (keyset paging). */
  listMessages: (id: number, opts?: { beforeId?: number; limit?: number }): Promise<ChatMessage[]> => {
    const p = new URLSearchParams();
    if (opts?.beforeId) p.set("before_id", String(opts.beforeId));
    if (opts?.limit) p.set("limit", String(opts.limit));
    const qs = p.toString();
    return chatReq<B[]>(`/chat/conversations/${id}/messages${qs ? `?${qs}` : ""}`)
      .then((d) => d.map(toChatMessage));
  },

  /** Backs the Media / Links / Docs tabs on the info panel — a filtered slice
   * of the same message history, not a separate store. */
  listMedia: (
    id: number,
    kind: "image" | "file" | "link",
    opts?: { beforeId?: number; limit?: number }
  ): Promise<ChatMessage[]> => {
    const p = new URLSearchParams({ kind });
    if (opts?.beforeId) p.set("before_id", String(opts.beforeId));
    if (opts?.limit) p.set("limit", String(opts.limit));
    return chatReq<B[]>(`/chat/conversations/${id}/media?${p.toString()}`)
      .then((d) => d.map(toChatMessage));
  },

  sendMessage: (id: number, text: string, replyToId?: number): Promise<ChatMessage> =>
    chatReq<B>(`/chat/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, reply_to_id: replyToId ?? null }),
    }).then(toChatMessage),

  /**
   * Send a WhatsApp-Pay-style payment note — a formatted "₹500, for fuel" card,
   * not a real transfer. Goes through the same text-message endpoint as an
   * ordinary message, just tagged content_type "payment".
   */
  sendPayment: (id: number, amount: number, note?: string): Promise<ChatMessage> =>
    chatReq<B>(`/chat/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content_type: "payment", amount, note: note?.trim() || undefined }),
    }).then(toChatMessage),

  /** Approve or reject a payment note. The sender can't decide their own; the
   * first decision made by anyone else in the thread is terminal. */
  decidePayment: (messageId: number, status: "approved" | "rejected"): Promise<ChatMessage> =>
    chatReq<B>(`/chat/messages/${messageId}/payment-status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }).then(toChatMessage),

  editMessage: (messageId: number, text: string): Promise<ChatMessage> =>
    chatReq<B>(`/chat/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }).then(toChatMessage),

  deleteMessage: (messageId: number): Promise<ChatMessage> =>
    chatReq<B>(`/chat/messages/${messageId}`, { method: "DELETE" }).then(toChatMessage),

  markRead: (id: number, messageId: number): Promise<void> =>
    chatReq<void>(`/chat/conversations/${id}/read`, {
      method: "POST",
      body: JSON.stringify({ message_id: messageId }),
    }),

  setMuted: (id: number, muted: boolean): Promise<void> =>
    chatReq<void>(`/chat/conversations/${id}/mute`, {
      method: "POST",
      body: JSON.stringify({ muted }),
    }),

  /** Fire-and-forget "I'm typing" / "stopped" hint to the other participants. */
  sendTyping: (id: number, typing: boolean): Promise<void> =>
    chatReq<void>(`/chat/conversations/${id}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing }),
    }),

  /** Current online roster + last-seen times, for the initial presence paint. */
  getPresence: (): Promise<ChatPresence> =>
    chatReq<B>("/chat/presence").then((d) => ({
      online: Array.isArray(d.online) ? (d.online as number[]).map(Number) : [],
      lastSeen:
        d.lastSeen && typeof d.lastSeen === "object"
          ? (d.lastSeen as Record<string, number>)
          : {},
    })),

  /**
   * Send a recorded voice note. Uses a raw multipart upload (like `uploadFile`)
   * rather than `chatReq` — the body is audio bytes, not JSON, so the browser
   * must set its own multipart Content-Type boundary.
   */
  sendVoiceMessage: async (conversationId: number, blob: Blob, durationMs: number): Promise<ChatMessage> => {
    const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "audio";
    const form = new FormData();
    form.append("file", blob, `voice.${ext}`);
    form.append("duration_ms", String(Math.max(1, Math.round(durationMs))));
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/conversations/${conversationId}/voice`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (res.status === 413) {
      throw new Error(await extractDetail(res, "Voice message is too long."));
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, `Could not send voice message: HTTP ${res.status}`));
    }
    return toChatMessage(await res.json());
  },

  /**
   * Fetch a voice note's decrypted audio as a same-origin blob: URL. Never a
   * plain `<audio src>` to the API — the endpoint requires the same Bearer auth
   * as every other chat route, so the bytes are pulled via fetch() first.
   * Caller is responsible for URL.revokeObjectURL() when done with it.
   */
  getVoiceBlobUrl: async (messageId: number): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/messages/${messageId}/voice`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, "Could not load this voice message."));
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  /**
   * Send a file — photo or any other document (the "paperclip" attach button).
   * Raw multipart upload like `sendVoiceMessage`, not `chatReq` — the body is
   * file bytes, not JSON.
   */
  sendAttachment: async (conversationId: number, file: File): Promise<ChatMessage> => {
    const form = new FormData();
    form.append("file", file, file.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/conversations/${conversationId}/attachment`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (res.status === 413) {
      throw new Error(await extractDetail(res, "File is too large."));
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, `Could not send file: HTTP ${res.status}`));
    }
    return toChatMessage(await res.json());
  },

  /**
   * Fetch an image/file attachment's decrypted bytes as a same-origin blob:
   * URL — same reasoning as `getVoiceBlobUrl`: the file is encrypted at rest,
   * so it's never a plain `<img src>`/`<a href>` to the API. Caller is
   * responsible for URL.revokeObjectURL() when done with it.
   */
  getAttachmentBlobUrl: async (messageId: number): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/messages/${messageId}/attachment`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, "Could not load this attachment."));
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// ---------------------------------------------------------------------------
// Payment Requests (Accounts/Admin) — finance's second-stage view of chat
// payment notes a colleague has already peer-approved. Unlike chatApi, this
// goes through the normal cached `req()` — the data here is already
// decrypted server-side for this specific narrow purpose, not the general
// chat content that api-cache.ts's localStorage persistence was a concern for.
// ---------------------------------------------------------------------------

function toPaymentRequest(b: B): PaymentRequest {
  return {
    id: Number(b.id),
    conversationId: Number(b.conversation_id),
    amount: b.amount ?? "0",
    description: b.description ?? "",
    askedById: b.asked_by_id == null ? null : Number(b.asked_by_id),
    askedByName: b.asked_by_name ?? null,
    askedAt: b.asked_at ?? null,
    paymentStatus: (b.payment_status as PaymentRequest["paymentStatus"]) ?? "approved",
    approvedById: b.approved_by_id == null ? null : Number(b.approved_by_id),
    approvedByName: b.approved_by_name ?? null,
    approvedAt: b.approved_at ?? null,
    financeStatus: (b.finance_status as PaymentRequest["financeStatus"]) ?? null,
    financeDecidedById: b.finance_decided_by_id == null ? null : Number(b.finance_decided_by_id),
    financeDecidedByName: b.finance_decided_by_name ?? null,
    financeDecidedAt: b.finance_decided_at ?? null,
    paidById: b.paid_by_id == null ? null : Number(b.paid_by_id),
    paidByName: b.paid_by_name ?? null,
    paidAt: b.paid_at ?? null,
    hasProof: b.has_proof === true,
  };
}

export type PaymentRequestEditEventType = "Approved for Payment" | "Rejected by Accounts" | "Marked as Paid";

export type PaymentRequestEditEventRow = {
  id: string;
  description: string;
  amount: string;
  event: PaymentRequestEditEventType;
  actorName: string;
  createdAt: string;
};

export const paymentRequestsApi = {
  list: (): Promise<PaymentRequest[]> =>
    req<B[]>("/payment-requests").then((d) => d.map(toPaymentRequest)),
  listEditEvents: (): Promise<PaymentRequestEditEventRow[]> =>
    req<Record<string, unknown>[]>(`/payment-requests/edit-events`).then((rows) =>
      rows.map((r) => ({
        id: String(r.id),
        description: String(r.description ?? ""),
        amount: String(r.amount ?? "0"),
        event: String(r.event) as PaymentRequestEditEventType,
        actorName: String(r.actor_name ?? ""),
        createdAt: String(r.created_at ?? ""),
      }))
    ),

  /** "Approve for Payment" (-> "approved", i.e. Unpaid) or "Reject" (terminal).
   * Once decided, the same request can't be decided again here. */
  decide: (id: number, status: "approved" | "rejected"): Promise<PaymentRequest> =>
    req<B>(`/payment-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }).then(toPaymentRequest),

  /** Mark an already-approved (Unpaid) request as actually paid — a separate,
   * later action from `decide`, often performed by a different person. A
   * proof-of-payment photo is mandatory, so this is a raw multipart upload
   * like `chatApi.sendAttachment`, not the JSON-only `req()` helper. */
  markPaid: async (id: number, proof: File): Promise<PaymentRequest> => {
    const form = new FormData();
    form.append("proof", proof, proof.name);
    let res: Response;
    try {
      res = await fetch(`${BASE}/payment-requests/${id}/mark-paid`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, `Could not mark this as paid: HTTP ${res.status}`));
    }
    return toPaymentRequest(await res.json());
  },

  /** Fetch the decrypted proof-of-payment photo as a same-origin blob: URL —
   * same reasoning as `chatApi.getAttachmentBlobUrl`: the file is encrypted at
   * rest. Caller is responsible for URL.revokeObjectURL() when done with it. */
  getProofBlobUrl: async (id: number): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/payment-requests/${id}/proof`, { headers: authHeaders() });
    } catch {
      throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (!res.ok) {
      throw new Error(await extractDetail(res, "Could not load the proof photo."));
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// ---------------------------------------------------------------------------
// SW Usage Analytics API
// ---------------------------------------------------------------------------

export type ModuleUsageRow = {
  module: string;
  activeSeconds: number;
  idleSeconds: number;
  visitCount: number;
};

export type UsageSessionRow = {
  id: number;
  loginAt: string;
  logoutAt: string | null;
  endedReason: "logout" | "timeout" | null;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
};

export type ActionLogRow = {
  source: string;
  event: string;
  actorName: string;
  actorRole: string | null;
  createdAt: string;
};

export type UsageOverviewRow = {
  staffId: number;
  staffName: string;
  staffRole: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalLoginSeconds: number;
  actionCount: number;
};

export type UsageDetail = {
  staffId: number;
  staffName: string;
  staffRole: string | null;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalLoginSeconds: number;
  actionCount: number;
  modules: ModuleUsageRow[];
  sessions: UsageSessionRow[];
  recentActions: ActionLogRow[];
};

export const usageApi = {
  /** Fire-and-forget: posted every ~5 minutes (+ on tab-hide/unload/module
   * change) by useUsageHeartbeat.ts. Never throws into the caller's render
   * path — the hook itself swallows failures, same as every other
   * best-effort background ping in this app. */
  heartbeat: (module: string, activeSeconds: number, idleSeconds: number) =>
    req<void>("/usage/heartbeat", {
      method: "POST",
      body: JSON.stringify({ module, active_seconds: activeSeconds, idle_seconds: idleSeconds }),
    }),
  /** Real worked time per day (genuine active seconds, idle-filtered,
   * summed across every login session that day) — see Mark Attendance's
   * "Total Working Time". Self-or-Admin only. */
  dailyActive: (staffId: number, dateFrom: string, dateTo: string) =>
    req<{ date: string; active_seconds: number }[]>(
      `/usage/daily-active/${staffId}?date_from=${dateFrom}&date_to=${dateTo}`
    ).then((rows) => new Map(rows.map((r) => [r.date, r.active_seconds]))),
  getOverview: (dateFrom?: string, dateTo?: string): Promise<UsageOverviewRow[]> => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return req<Record<string, unknown>[]>(`/usage/overview${qs ? `?${qs}` : ""}`).then((rows) =>
      rows.map((r) => ({
        staffId: Number(r.staff_id),
        staffName: String(r.staff_name ?? ""),
        staffRole: (r.staff_role as string | null) ?? null,
        isOnline: Boolean(r.is_online),
        lastSeenAt: (r.last_seen_at as string | null) ?? null,
        totalActiveSeconds: Number(r.total_active_seconds ?? 0),
        totalIdleSeconds: Number(r.total_idle_seconds ?? 0),
        totalLoginSeconds: Number(r.total_login_seconds ?? 0),
        actionCount: Number(r.action_count ?? 0),
      }))
    );
  },
  getDetail: (staffId: number, dateFrom?: string, dateTo?: string): Promise<UsageDetail> => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return req<Record<string, unknown>>(`/usage/detail/${staffId}${qs ? `?${qs}` : ""}`).then((r) => ({
      staffId: Number(r.staff_id),
      staffName: String(r.staff_name ?? ""),
      staffRole: (r.staff_role as string | null) ?? null,
      totalActiveSeconds: Number(r.total_active_seconds ?? 0),
      totalIdleSeconds: Number(r.total_idle_seconds ?? 0),
      totalLoginSeconds: Number(r.total_login_seconds ?? 0),
      actionCount: Number(r.action_count ?? 0),
      modules: ((r.modules as Record<string, unknown>[]) ?? []).map((m) => ({
        module: String(m.module ?? ""),
        activeSeconds: Number(m.active_seconds ?? 0),
        idleSeconds: Number(m.idle_seconds ?? 0),
        visitCount: Number(m.visit_count ?? 0),
      })),
      sessions: ((r.sessions as Record<string, unknown>[]) ?? []).map((s) => ({
        id: Number(s.id),
        loginAt: String(s.login_at ?? ""),
        logoutAt: (s.logout_at as string | null) ?? null,
        endedReason: (s.ended_reason as "logout" | "timeout" | null) ?? null,
        totalActiveSeconds: Number(s.total_active_seconds ?? 0),
        totalIdleSeconds: Number(s.total_idle_seconds ?? 0),
      })),
      recentActions: ((r.recent_actions as Record<string, unknown>[]) ?? []).map((a) => ({
        source: String(a.source ?? ""),
        event: String(a.event ?? ""),
        actorName: String(a.actor_name ?? ""),
        actorRole: (a.actor_role as string | null) ?? null,
        createdAt: String(a.created_at ?? ""),
      })),
    }));
  },
};

// ---------------------------------------------------------------------------
// Room Summon — Admin-only "come to my room" push (Topbar's BellRing button)
// ---------------------------------------------------------------------------

export type RoomSummon = {
  id: number;
  summonedBy: number | null;
  summonedByName: string | null;
  targetType: "user" | "group";
  targetId: number;
  targetLabel: string;
  recipientIds: number[];
  recipientNames: string[];
  createdAt: string | null;
};

function toRoomSummon(b: B): RoomSummon {
  return {
    id: Number(b.id),
    summonedBy: b.summoned_by != null ? Number(b.summoned_by) : null,
    summonedByName: b.summoned_by_name ?? null,
    targetType: (b.target_type as RoomSummon["targetType"]) ?? "user",
    targetId: Number(b.target_id),
    targetLabel: b.target_label ?? "",
    recipientIds: Array.isArray(b.recipient_ids) ? b.recipient_ids.map(Number) : [],
    recipientNames: Array.isArray(b.recipient_names) ? b.recipient_names.map(String) : [],
    createdAt: b.created_at ?? null,
  };
}

export const roomSummonApi = {
  send: (targetType: "user" | "group", targetId: number): Promise<RoomSummon> =>
    req<B>("/room-summon", {
      method: "POST",
      body: JSON.stringify({ target_type: targetType, target_id: targetId }),
    }).then(toRoomSummon),

  list: (limit = 50): Promise<RoomSummon[]> =>
    req<B[]>(`/room-summon?limit=${limit}`).then((d) => d.map(toRoomSummon)),

  /** Invites addressed to me that I haven't seen — polled, since the WebSocket
   * push can't reach browsers in production. rawReq: must never be cached. */
  inbox: (afterId: number | null): Promise<{ items: { id: number; summonedByName: string; createdAt: string | null }[]; latestId: number }> =>
    rawReq<B>(`/room-summon/inbox${afterId != null ? `?after_id=${afterId}` : ""}`).then((d) => ({
      items: (Array.isArray(d.items) ? d.items : []).map((r: B) => ({
        id: Number(r.id),
        summonedByName: String(r.summoned_by_name ?? "The owner"),
        createdAt: r.created_at ?? null,
      })),
      latestId: Number(d.latest_id ?? 0),
    })),
};

// ---------------------------------------------------------------------------
// Events — Admin-scheduled meetings (Topbar's Event button)
// ---------------------------------------------------------------------------

export type CanaanEvent = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  participantNames: string[];
  createdAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
};

function toEvent(b: B): CanaanEvent {
  return {
    id: Number(b.id),
    title: b.title ?? "",
    description: b.description ?? null,
    location: b.location ?? null,
    startsAt: b.starts_at ?? null,
    endsAt: b.ends_at ?? null,
    createdBy: b.created_by != null ? Number(b.created_by) : null,
    createdByName: b.created_by_name ?? null,
    participantNames: Array.isArray(b.participant_names) ? b.participant_names.map(String) : [],
    createdAt: b.created_at ?? null,
    completedAt: b.completed_at ?? null,
    completedByName: b.completed_by_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Notes — private per-user notepad (Topbar's Notes button)
// ---------------------------------------------------------------------------

export type Note = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** List entry — the server never sends note bodies in the list. */
export type NoteSummary = {
  id: number;
  title: string;
  preview: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NoteUsage = {
  count: number;
  maxNotes: number;
  bytesUsed: number;
  noteMaxBytes: number;
  writtenToday: number;
  dailyWriteLimit: number;
};

export type NoteAdminUsageRow = {
  staffId: number;
  name: string;
  count: number;
  bytesUsed: number;
  writesToday: number;
  writtenToday: number;
  blockedToday: number;
};

function toNote(b: B): Note {
  return {
    id: Number(b.id),
    title: b.title ?? "",
    body: b.body ?? "",
    pinned: Boolean(b.pinned),
    createdAt: b.created_at ?? null,
    updatedAt: b.updated_at ?? null,
  };
}

function toNoteSummary(b: B): NoteSummary {
  return {
    id: Number(b.id),
    title: b.title ?? "",
    preview: b.preview ?? "",
    sizeBytes: Number(b.size_bytes ?? 0),
    pinned: Boolean(b.pinned),
    createdAt: b.created_at ?? null,
    updatedAt: b.updated_at ?? null,
  };
}

function toNoteUsage(b: B): NoteUsage {
  return {
    count: Number(b.count ?? 0),
    maxNotes: Number(b.max_notes ?? 0),
    bytesUsed: Number(b.bytes_used ?? 0),
    noteMaxBytes: Number(b.note_max_bytes ?? 0),
    writtenToday: Number(b.written_today ?? 0),
    dailyWriteLimit: Number(b.daily_write_limit ?? 0),
  };
}

// rawReq (not the cached req): a note just saved must never come back stale.
export const notesApi = {
  list: (): Promise<{ items: NoteSummary[]; usage: NoteUsage }> =>
    rawReq<B>("/notes").then((d) => ({ items: (d.items ?? []).map(toNoteSummary), usage: toNoteUsage(d.usage ?? {}) })),
  get: (id: number): Promise<Note> => rawReq<B>(`/notes/${id}`).then(toNote),
  create: (payload: { title?: string; body?: string } = {}): Promise<Note> =>
    rawReq<B>("/notes", { method: "POST", body: JSON.stringify(payload) }).then(toNote),
  update: (
    id: number,
    patch: { title?: string; body?: string; pinned?: boolean },
    keepalive = false,
  ): Promise<{ note: NoteSummary; usage: NoteUsage }> =>
    rawReq<B>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(patch), keepalive }).then((d) => ({
      note: toNoteSummary(d.note ?? {}),
      usage: toNoteUsage(d.usage ?? {}),
    })),
  remove: (id: number): Promise<NoteUsage> => rawReq<B>(`/notes/${id}`, { method: "DELETE" }).then(toNoteUsage),
  /** Admin only — counts and sizes per person, never note content. */
  adminUsage: (): Promise<NoteAdminUsageRow[]> =>
    rawReq<B[]>("/notes/admin/usage").then((rows) =>
      rows.map((r) => ({
        staffId: Number(r.staff_id),
        name: String(r.name ?? ""),
        count: Number(r.count ?? 0),
        bytesUsed: Number(r.bytes_used ?? 0),
        writesToday: Number(r.writes_today ?? 0),
        writtenToday: Number(r.written_today ?? 0),
        blockedToday: Number(r.blocked_today ?? 0),
      })),
    ),
};

export type Todo = {
  id: number;
  title: string;
  done: boolean;
  important: boolean;
  /** YYYY-MM-DD (IST day), or null for no due date. */
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TodoUsage = { count: number; maxTodos: number };

function toTodo(b: B): Todo {
  return {
    id: Number(b.id),
    title: String(b.title ?? ""),
    done: Boolean(b.done),
    important: Boolean(b.important),
    dueDate: (b.due_date as string | null) ?? null,
    doneAt: (b.done_at as string | null) ?? null,
    createdAt: (b.created_at as string | null) ?? null,
    updatedAt: (b.updated_at as string | null) ?? null,
  };
}

function toTodoUsage(b: B): TodoUsage {
  return { count: Number(b.count ?? 0), maxTodos: Number(b.max_todos ?? 0) };
}

// Private per person (see routers/todos.py). rawReq, not the cached req():
// a task list must never show a stale tick.
export const todosApi = {
  list: (): Promise<{ items: Todo[]; usage: TodoUsage }> =>
    rawReq<B>("/todos").then((d) => ({ items: (d.items ?? []).map(toTodo), usage: toTodoUsage(d.usage ?? {}) })),
  create: (payload: { title: string; dueDate?: string | null; important?: boolean }): Promise<Todo> =>
    rawReq<B>("/todos", {
      method: "POST",
      body: JSON.stringify({ title: payload.title, due_date: payload.dueDate || null, important: !!payload.important }),
    }).then(toTodo),
  /** Only the fields given are changed; dueDate: null clears the due date. */
  update: (id: number, patch: { title?: string; done?: boolean; important?: boolean; dueDate?: string | null }): Promise<Todo> => {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.done !== undefined) body.done = patch.done;
    if (patch.important !== undefined) body.important = patch.important;
    if (patch.dueDate !== undefined) body.due_date = patch.dueDate || null;
    return rawReq<B>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(toTodo);
  },
  remove: (id: number): Promise<TodoUsage> => rawReq<B>(`/todos/${id}`, { method: "DELETE" }).then(toTodoUsage),
  clearCompleted: (): Promise<TodoUsage> => rawReq<B>("/todos/completed", { method: "DELETE" }).then(toTodoUsage),
};

export const eventsApi = {
  create: (payload: {
    title: string;
    description?: string;
    location?: string;
    startsAt: string;
    endsAt?: string;
    targets: { type: "user" | "group"; id: number }[];
  }): Promise<CanaanEvent> =>
    req<B>("/events", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        description: payload.description || undefined,
        location: payload.location || undefined,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt || undefined,
        targets: payload.targets.map((t) => ({ target_type: t.type, target_id: t.id })),
      }),
    }).then(toEvent),

  listUpcoming: (): Promise<CanaanEvent[]> =>
    req<B[]>("/events/upcoming").then((d) => d.map(toEvent)),

  listHistory: (): Promise<CanaanEvent[]> =>
    req<B[]>("/events/history").then((d) => d.map(toEvent)),

  complete: (id: number): Promise<CanaanEvent> =>
    req<B>(`/events/${id}/complete`, { method: "POST" }).then(toEvent),

  cancel: (id: number): Promise<void> => req<void>(`/events/${id}`, { method: "DELETE" }),
};
