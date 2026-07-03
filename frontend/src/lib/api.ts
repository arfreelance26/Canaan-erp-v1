/**
 * Centralized API client — all calls to the FastAPI backend go through here.
 * Transforms snake_case backend responses to the camelCase frontend types.
 */
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Staff } from "@/types/staff";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerOrigin } from "@/types/customer-origin";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { Vendor } from "@/types/vendor";
import type { DriverAssignment } from "@/types/driver-assignment";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { DriverAttendanceRecord, StaffAttendanceRecord, AttendanceSummaryRow } from "@/types/attendance";
import type { LeaveRequest } from "@/types/leave-request";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import type { CompensationTransaction } from "@/types/compensation";
import type { FuelLog, FuelStats } from "@/types/fuel-log";
import type { Branch } from "@/types/branch";
import type { RepairType } from "@/types/repair-type";
import type { SacCode } from "@/types/sac-code";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// Core fetch utility
// ---------------------------------------------------------------------------

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error(`Cannot reach the server at ${BASE}. Make sure the backend is running (uvicorn main:app --port 8000).`);
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

// Returns the URL to serve a stored file (photo / document)
export function fileUrl(entity: string, entityId: string, field: string): string {
  return `${BASE}/files/${entity}/${entityId}/${field}`;
}

// Requests a server-generated .xlsx export and triggers a browser download.
export async function downloadExcel(path: string, fallbackFilename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch {
    throw new Error(`Cannot reach the server at ${BASE}. Make sure the backend is running (uvicorn main:app --port 8000).`);
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
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
      body: form,
    });
  } catch {
    throw new Error("Cannot reach the server. Make sure the backend is running.");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Upload failed: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Transformers  (backend → frontend type)
// ---------------------------------------------------------------------------

 
type B = Record<string, any>;

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
  };
}

function toStaff(b: B): Staff {
  return {
    id: String(b.id),
    photoUrl: b.photo_url ? fileUrl("staff", String(b.id), "photo") : null,
    staffId: b.staff_id ?? "",
    name: b.name ?? "",
    department: b.department ?? "",
    designation: b.designation ?? "",
    softwareDesignation: b.software_designation ?? "Staff",
    dateOfBirth: b.date_of_birth ?? "",
    dateOfJoining: b.date_of_joining ?? "",
    email: b.email ?? "",
    contactNumber: b.contact_number ?? "",
    address: b.address ?? "",

    aadharNumber: b.aadhar_number ?? null,
    aadharFileName: b.aadhar_file_name ?? null,
    username: b.username ?? "",
    password: "",
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
    username: f.username || null,
    password: (password || f.password) || undefined,
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
    status: b.status ?? undefined,
  };
}

function toCustomerPricing(b: B): CustomerPricing {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    customerDestination: b.customer_destination ?? "",
    cargoClassification: b.cargo_classification ?? "",
    containerType: b.container_type ?? "",
    weightInTons: b.weight_in_tons ?? "",
    rate: String(b.rate ?? ""),
    status: b.status ?? "",
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
    transportMethod: b.transport_method ?? "",
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
    driverCompensationType: b.driver_compensation_type ?? "",
    transportHireAmount: String(b.transport_hire_amount ?? ""),
    transportCrossingAmount: String(b.transport_crossing_amount ?? ""),
    internalRemarks: b.internal_remarks ?? "",
    bookingInstructions: b.booking_instructions ?? "",
    hasClosure: b.has_closure ?? false,
    hasSheet: b.has_sheet ?? false,
    verificationStatus: b.verification_status ?? "pending",
    isInvoiced: b.is_invoiced ?? false,
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
    transport_method: f.transportMethod || null,
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
    driver_compensation_type: f.driverCompensationType || null,
    transport_hire_amount: f.transportHireAmount ? parseFloat(f.transportHireAmount) : null,
    transport_crossing_amount: f.transportCrossingAmount ? parseFloat(f.transportCrossingAmount) : null,
    internal_remarks: f.internalRemarks || null,
    booking_instructions: f.bookingInstructions || null,
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
    paymentMode: b.payment_mode ?? "",
    billTo: b.bill_to ?? "",
    // 5. Halt Information
    companyHaltDays: String(b.company_halt_days ?? "0"),
    partyHaltDays: String(b.party_halt_days ?? "0"),
    haltRemarks: b.halt_remarks ?? "",
    driverHaltCompensation: String(b.driver_halt_compensation ?? "0"),
    // Meta
    closedAt: b.created_at ? String(b.created_at).split("T")[0] : "",
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
    payment_mode: f.paymentMode || null,
    bill_to: f.billTo || null,
    // 5. Halt Information
    company_halt_days: parseInt(f.companyHaltDays) || 0,
    party_halt_days: parseInt(f.partyHaltDays) || 0,
    halt_remarks: f.haltRemarks || null,
    driver_halt_compensation: n(f.driverHaltCompensation),
  };
}

function toSheet(b: B): TripSheetData {
  return {
    tripId: String(b.trip_id),
    tripSheetNo: b.trip_sheet_no ?? "",
    bookingReferenceNo: b.booking_reference_no ?? "",
    containerNumber: b.container_number ?? "",
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
    startKm: String(b.start_km ?? ""),
    endKm: String(b.end_km ?? ""),
    totalKm: String(b.total_km ?? ""),
    cargoWeight: String(b.cargo_weight ?? ""),
    driverPay: String(b.driver_pay ?? ""),
    driverAdvanceAmount: String(b.driver_advance_amount ?? ""),
    driverBalance: String(b.driver_balance ?? ""),
    totalHaltDays: String(b.total_halt_days ?? ""),
    haltRemarks: b.halt_remarks ?? "",
    haltPay: String(b.halt_pay ?? ""),
    portPassExpense: String(b.port_pass_expense ?? ""),
    weightSheetExpense: String(b.weight_sheet_expense ?? ""),
    mamolExpense: String(b.mamol_expense ?? ""),
    claimableMamolExpense: String(b.claimable_mamol_expense ?? ""),
    trafficRtoExpense: String(b.traffic_rto_expense ?? ""),
    liftOnOffExpense: String(b.lift_on_off_expense ?? ""),
    craneOperatorExpense: String(b.crane_operator_expense ?? ""),
    parkingExpense: String(b.parking_expense ?? ""),
    majorRepairs: Array.isArray(b.major_repairs)
      ? b.major_repairs.map((r: { name?: string; cost?: number }) => ({ name: r.name ?? "", cost: String(r.cost ?? "") }))
      : [],
    otherExpenses: String(b.other_expenses ?? ""),
    tripExpensesTotal: String(b.trip_expenses_total ?? ""),
    driverExpensesTotal: String(b.driver_expenses_total ?? ""),
    totalExpense: String(b.total_expense ?? ""),
    fuelCostApprox: String(b.fuel_cost_approx ?? ""),
    tollCharges: String(b.toll_charges ?? ""),
    tollCount: String(b.toll_count ?? ""),
    remarks: b.remarks ?? "",
  };
}

function fromSheet(f: TripSheetData) {
  const n = (v: string) => parseFloat(v) || 0;
  return {
    trip_sheet_no: f.tripSheetNo || null,
    booking_reference_no: f.bookingReferenceNo || null,
    container_number: f.containerNumber || null,
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
    start_km: n(f.startKm),
    end_km: n(f.endKm),
    total_km: n(f.totalKm),
    cargo_weight: n(f.cargoWeight),
    driver_pay: n(f.driverPay),
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
    major_repairs: (f.majorRepairs || []).map(r => ({ name: r.name, cost: parseFloat(r.cost) || 0 })),
    other_expenses: n(f.otherExpenses),
    trip_expenses_total: n(f.tripExpensesTotal),
    driver_expenses_total: n(f.driverExpensesTotal),
    total_expense: n(f.totalExpense),
    fuel_cost_approx: n(f.fuelCostApprox),
    toll_charges: n(f.tollCharges),
    toll_count: parseInt(f.tollCount) || 0,
    remarks: f.remarks || null,
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
    date: b.date ?? "",
    status: b.status ?? "Not Marked",
    checkInTime: b.check_in_time ?? null,
    markedAt: b.marked_at ?? null,
    source: b.source ?? "Web",
  };
}

function toLeaveRequest(b: B): LeaveRequest {
  return {
    id: String(b.id),
    category: b.category ?? "Staff",
    applicantId: String(b.applicant_id ?? ""),
    applicantName: b.applicant_name ?? "",
    applicantCode: b.applicant_code ?? "",
    fromDate: b.from_date ?? "",
    toDate: b.to_date ?? "",
    reason: b.reason ?? "",
    status: b.status ?? "Pending",
    appliedAt: b.applied_at ?? "",
  };
}

function toMaintenanceRecord(b: B): MaintenanceRecord {
  return {
    id: String(b.id),
    truckId: String(b.truck_id),
    date: b.date ?? "",
    odometer: String(b.odometer ?? ""),
    maintenanceType: b.maintenance_type ?? "",
    description: b.description ?? "",
    cost: String(b.cost ?? ""),
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
    condition: b.condition ?? "",
    purchaseDate: b.purchase_date ?? "",
    repairCost: String(b.repair_cost ?? ""),
    retreadCost: String(b.retread_cost ?? ""),
    retreadCount: String(b.retread_count ?? ""),
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
    condition: f.condition || "New",
    purchase_date: f.purchaseDate || null,
    repair_cost: parseFloat(f.repairCost) || 0,
    retread_cost: parseFloat(f.retreadCost) || 0,
    retread_count: parseInt(f.retreadCount) || 0,
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
    removedOdometer: b.removed_odometer ?? null,
    removedDate: b.removed_date ?? null,
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
    emiPaymentDate: b.emi_payment_date ?? "",
    costPerMonth: String(b.cost_per_month ?? ""),
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
    emi_payment_date: f.emiPaymentDate || null,
    cost_per_month: parseFloat(f.costPerMonth) || 0,
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
  };
}

function toCompensationTransaction(b: B): CompensationTransaction {
  return {
    id: String(b.id),
    personId: String(b.person_id ?? ""),
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

export const trucksApi = {
  list: () => req<B[]>("/trucks").then((d) => d.map(toTruck)),
  create: (truck: Truck) =>
    req<B>("/trucks", { method: "POST", body: JSON.stringify(fromTruck(truck)) }).then(toTruck),
  update: (dbId: string, truck: Truck) =>
    req<B>(`/trucks/${dbId}`, { method: "PUT", body: JSON.stringify(fromTruck(truck)) }).then(toTruck),
  delete: (dbId: string) => req<void>(`/trucks/${dbId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Drivers API
// ---------------------------------------------------------------------------

export const driversApi = {
  list: () => req<B[]>("/drivers").then((d) => d.map(toDriver)),
  create: (driver: Driver, password: string) =>
    req<B>("/drivers", { method: "POST", body: JSON.stringify(fromDriver(driver, password)) }).then(toDriver),
  update: (dbId: string, driver: Driver, password?: string) =>
    req<B>(`/drivers/${dbId}`, { method: "PUT", body: JSON.stringify(fromDriver(driver, password)) }).then(toDriver),
  delete: (dbId: string) => req<void>(`/drivers/${dbId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Driver Assignments API
// ---------------------------------------------------------------------------

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
};

// ---------------------------------------------------------------------------
// Staff API
// ---------------------------------------------------------------------------

export const staffApi = {
  list: () => req<B[]>("/staff").then((d) => d.map(toStaff)),
  create: (member: Staff, password: string) =>
    req<B>("/staff", { method: "POST", body: JSON.stringify(fromStaff(member, password)) }).then(toStaff),
  update: (dbId: string, member: Staff, password?: string) =>
    req<B>(`/staff/${dbId}`, { method: "PUT", body: JSON.stringify(fromStaff(member, password)) }).then(toStaff),
  delete: (dbId: string) => req<void>(`/staff/${dbId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Customers API
// ---------------------------------------------------------------------------

export const customersApi = {
  list: () => req<B[]>("/customers").then((d) => d.map(toCustomer)),
  create: (customer: Customer) =>
    req<B>("/customers", { method: "POST", body: JSON.stringify(fromCustomer(customer)) }).then(toCustomer),
  update: (dbId: string, customer: Customer) =>
    req<B>(`/customers/${dbId}`, { method: "PUT", body: JSON.stringify(fromCustomer(customer)) }).then(toCustomer),
  delete: (dbId: string) => req<void>(`/customers/${dbId}`, { method: "DELETE" }),

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
  createDestination: (customerId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations`, {
      method: "POST",
      body: JSON.stringify({ destination_state: dest.destinationState, destination_address: dest.destinationAddress }),
    }).then(toCustomerDestination),
  updateDestination: (customerId: string, destId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations/${destId}`, {
      method: "PUT",
      body: JSON.stringify({ destination_state: dest.destinationState, destination_address: dest.destinationAddress }),
    }).then(toCustomerDestination),
  deleteDestination: (customerId: string, destId: string) =>
    req<void>(`/customers/${customerId}/destinations/${destId}`, { method: "DELETE" }),

  listPricing: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/pricing`).then((d) => d.map(toCustomerPricing)),
  createPricing: (customerId: string, pricing: CustomerPricing) =>
    req<B>(`/customers/${customerId}/pricing`, {
      method: "POST",
      body: JSON.stringify({
        customer_destination: pricing.customerDestination,
        cargo_classification: pricing.cargoClassification, container_type: pricing.containerType,
        weight_in_tons: pricing.weightInTons,
        rate: parseFloat(pricing.rate) || 0, status: pricing.status,
      }),
    }).then(toCustomerPricing),
  updatePricing: (customerId: string, priceId: string, pricing: CustomerPricing) =>
    req<B>(`/customers/${customerId}/pricing/${priceId}`, {
      method: "PUT",
      body: JSON.stringify({
        customer_destination: pricing.customerDestination,
        cargo_classification: pricing.cargoClassification, container_type: pricing.containerType,
        weight_in_tons: pricing.weightInTons,
        rate: parseFloat(pricing.rate) || 0, status: pricing.status,
      }),
    }).then(toCustomerPricing),
  deletePricing: (customerId: string, priceId: string) =>
    req<void>(`/customers/${customerId}/pricing/${priceId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Vendors API
// ---------------------------------------------------------------------------

export const vendorsApi = {
  list: () => req<B[]>("/vendors").then((d) => d.map(toVendor)),
  create: (vendor: Vendor) =>
    req<B>("/vendors", { method: "POST", body: JSON.stringify(fromVendor(vendor)) }).then(toVendor),
  update: (dbId: string, vendor: Vendor) =>
    req<B>(`/vendors/${dbId}`, { method: "PUT", body: JSON.stringify(fromVendor(vendor)) }).then(toVendor),
  delete: (dbId: string) => req<void>(`/vendors/${dbId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Trips API
// ---------------------------------------------------------------------------

export const tripsApi = {
  list: (status?: string) =>
    req<B[]>(`/trips${status ? `?status=${status}` : ""}`).then((d) => d.map(toTrip)),
  create: (trip: Trip) =>
    req<B>("/trips", { method: "POST", body: JSON.stringify(fromTrip(trip)) }).then(toTrip),
  update: (dbId: string, trip: Trip) =>
    req<B>(`/trips/${dbId}`, { method: "PUT", body: JSON.stringify(fromTrip(trip)) }).then(toTrip),
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

  // Workflow
  verify: (dbId: string) => req<B>(`/trips/${dbId}/verify`, { method: "POST" }).then(toTrip),
  flag: (dbId: string) => req<B>(`/trips/${dbId}/flag`, { method: "POST" }).then(toTrip),
  invoice: (dbId: string, data: Record<string, unknown>) =>
    req<B>(`/trips/${dbId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(toTrip),
  getInvoice: (dbId: string) => req<Record<string, unknown>>(`/trips/${dbId}/invoice`),
  getNextInvoiceNo: (type: string) => req<{ invoice_no: string }>(`/trips/invoices/next-seq?invoice_type=${encodeURIComponent(type)}`),
  getAutocompleteValues: () => req<{ origins: string[]; destinations: string[] }>("/trips/autocomplete-values"),
};

// ---------------------------------------------------------------------------
// Attendance API
// ---------------------------------------------------------------------------

export const attendanceApi = {
  listDrivers: (date?: string, driverId?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (driverId) params.set("driver_id", driverId);
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

  listStaff: (date?: string, staffId?: number) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (staffId) params.set("staff_id", String(staffId));
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

  lookupApplicant: (code: string) =>
    req<B>(`/attendance/lookup-applicant?code=${encodeURIComponent(code)}`),

  listLeaveRequests: (status?: string) =>
    req<B[]>(`/attendance/leave-requests${status ? `?status=${status}` : ""}`).then((d) => d.map(toLeaveRequest)),
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

  getSummary: (category: "driver" | "staff", from: string, to: string) =>
    req<B[]>(`/attendance/summary?category=${category}&from=${from}&to=${to}`).then((d) =>
      d.map((b): AttendanceSummaryRow => ({
        id: String(b.id),
        code: String(b.code),
        name: String(b.name),
        present: Number(b.present) || 0,
        absent: Number(b.absent) || 0,
        onLeave: Number(b.on_leave) || 0,
        notMarked: Number(b.not_marked) || 0,
        totalDays: Number(b.total_days) || 0,
      }))
    ),
};

// ---------------------------------------------------------------------------
// Maintenance API
// ---------------------------------------------------------------------------

export const maintenanceApi = {
  listRecords: (truckId?: string) =>
    req<B[]>(`/maintenance/records${truckId ? `?truck_id=${truckId}` : ""}`).then((d) => d.map(toMaintenanceRecord)),
  createRecord: (record: MaintenanceRecord, truckDbId: string) =>
    req<B>("/maintenance/records", {
      method: "POST",
      body: JSON.stringify({
        truck_id: parseInt(truckDbId),
        date: record.date,
        odometer: parseInt(record.odometer) || 0,
        maintenance_type: record.maintenanceType,
        description: record.description || null,
        cost: parseFloat(record.cost) || 0,
      }),
    }).then(toMaintenanceRecord),
  updateRecord: (id: string, record: Partial<MaintenanceRecord>) =>
    req<B>(`/maintenance/records/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        date: record.date,
        odometer: record.odometer ? parseInt(record.odometer) : undefined,
        maintenance_type: record.maintenanceType,
        description: record.description,
        cost: record.cost ? parseFloat(record.cost) : undefined,
      }),
    }).then(toMaintenanceRecord),
  deleteRecord: (id: string) => req<void>(`/maintenance/records/${id}`, { method: "DELETE" }),
  getStatus: () => req<B[]>("/maintenance/status"),
  getCompliance: () => req<B[]>("/maintenance/compliance"),
};

export const fuelLogsApi = {
  listFuelLogs: (truckId?: string) =>
    req<B[]>(`/maintenance/fuel-logs${truckId ? `?truck_id=${truckId}` : ""}`).then((d) => d.map(toFuelLog)),
  createFuelLog: (log: Omit<FuelLog, "id" | "distance" | "mileage" | "createdAt" | "pricePerLitre">) =>
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
  updateFuelLog: (id: string, log: Partial<Pick<FuelLog, "date" | "odometer" | "litres" | "totalCost" | "fuelStation" | "loggedBy">>) =>
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
      }),
    }).then(toFuelLog),
  deleteFuelLog: (id: string) => req<void>(`/maintenance/fuel-logs/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Tyre API
// ---------------------------------------------------------------------------

export const tyreApi = {
  listInventory: () => req<B[]>("/tyre-inventory").then((d) => d.map(toTyreInventory)),
  availableInventory: () => req<B[]>("/tyre-inventory/available").then((d) => d.map(toTyreInventory)),
  createTyre: (tyre: TyreInventoryItem) =>
    req<B>("/tyre-inventory", { method: "POST", body: JSON.stringify(fromTyreInventory(tyre)) }).then(toTyreInventory),
  updateTyre: (dbId: string, tyre: TyreInventoryItem) =>
    req<B>(`/tyre-inventory/${dbId}`, { method: "PUT", body: JSON.stringify(fromTyreInventory(tyre)) }).then(toTyreInventory),
  deleteTyre: (dbId: string) => req<void>(`/tyre-inventory/${dbId}`, { method: "DELETE" }),
  getTyreHistory: (dbId: string) => req<B[]>(`/tyre-inventory/${dbId}/history`).then((d) => d.map(toTyreFitment)),

  listFitments: (truckId?: string, activeOnly?: boolean) => {
    const params = new URLSearchParams();
    if (truckId) params.set("truck_id", truckId);
    if (activeOnly) params.set("active_only", "true");
    return req<B[]>(`/tyre-fitment?${params}`).then((d) => d.map(toTyreFitment));
  },
  fitTyre: (tyreDbId: string, truckDbId: string, position: string, fittedOdometer: number, fittedDate: string) =>
    req<B>("/tyre-fitment", {
      method: "POST",
      body: JSON.stringify({ tyre_id: parseInt(tyreDbId), truck_id: parseInt(truckDbId), position, fitted_odometer: fittedOdometer, fitted_date: fittedDate }),
    }).then(toTyreFitment),
  removeTyre: (fitmentId: string, removedOdometer: number, removedDate: string) =>
    req<B>(`/tyre-fitment/${fitmentId}/remove`, {
      method: "PATCH",
      body: JSON.stringify({ removed_odometer: removedOdometer, removed_date: removedDate }),
    }).then(toTyreFitment),
};

// ---------------------------------------------------------------------------
// Finance API
// ---------------------------------------------------------------------------

export const financeApi = {
  listEmi: () => req<B[]>("/finance/emi").then((d) => d.map(toEmiRecord)),
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
    driverHaltDayPercentage: String(b.driver_halt_day_percentage ?? "0"),
  };
}

function fromBranch(f: Branch) {
  return {
    name: f.name,
    halt_day_fee_20ft: f.haltDayFee20ft ? parseFloat(f.haltDayFee20ft) : 0,
    halt_day_fee_40ft: f.haltDayFee40ft ? parseFloat(f.haltDayFee40ft) : 0,
    driver_halt_day_percentage: f.driverHaltDayPercentage ? parseFloat(f.driverHaltDayPercentage) : 0,
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
  };
}

function toSacCode(b: B): SacCode {
  return {
    id: String(b.id ?? ""),
    description: b.description ?? "",
    code: b.code ?? "",
    gstRate: String(b.gst_rate ?? "0"),
  };
}

export const repairTypesApi = {
  list: () => req<B[]>("/repair-types").then((d) => d.map(toRepairType)),
  create: (payload: Omit<RepairType, "id">) =>
    req<B>("/repair-types", {
      method: "POST",
      body: JSON.stringify({ name: payload.name, default_cost: parseFloat(payload.defaultCost) || 0 }),
    }).then(toRepairType),
  update: (id: string, payload: Partial<Omit<RepairType, "id">>) =>
    req<B>(`/repair-types/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: payload.name, default_cost: payload.defaultCost !== undefined ? parseFloat(payload.defaultCost) || 0 : undefined }),
    }).then(toRepairType),
  delete: (id: string) => req<void>(`/repair-types/${id}`, { method: "DELETE" }),
};

export const sacCodesApi = {
  list: () => req<B[]>("/sac-codes").then((d) => d.map(toSacCode)),
  create: (payload: Omit<SacCode, "id">) =>
    req<B>("/sac-codes", {
      method: "POST",
      body: JSON.stringify({
        description: payload.description, code: payload.code,
        gst_rate: parseFloat(payload.gstRate) || 0,
      }),
    }).then(toSacCode),
  update: (id: string, payload: Partial<Omit<SacCode, "id">>) =>
    req<B>(`/sac-codes/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        description: payload.description, code: payload.code,
        gst_rate: payload.gstRate !== undefined ? parseFloat(payload.gstRate) || 0 : undefined,
      }),
    }).then(toSacCode),
  delete: (id: string) => req<void>(`/sac-codes/${id}`, { method: "DELETE" }),
};

export const branchesApi = {
  list: () => req<B[]>("/branches").then((d) => d.map(toBranch)),
  get: (id: string) => req<B>(`/branches/${id}`).then(toBranch),
  create: (branch: Branch) =>
    req<B>("/branches", { method: "POST", body: JSON.stringify(fromBranch(branch)) }).then(toBranch),
  update: (id: string, branch: Branch) =>
    req<B>(`/branches/${id}`, { method: "PUT", body: JSON.stringify(fromBranch(branch)) }).then(toBranch),
  delete: (id: string) => req<void>(`/branches/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

export const dashboardApi = {
  overview: () => req<Record<string, unknown>>("/dashboard/overview"),
};

// ---------------------------------------------------------------------------
// P&L Summary API
// ---------------------------------------------------------------------------

export type TruckPLTripRow = {
  tripSheetDate: string;
  tripSheetNo: string;
  bookingReferenceNo: string;
  fromLocation: string;
  toLocation: string;
  hireAmount: number;
  totalExpense: number;
  totalKm: number;
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
  tripCount: number;
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
  }>;
  totalCost: number;
  netPl: number;
  totalKm: number;
  revenuePerKm: number;
  maintenanceCount: number;
  tripRows: TruckPLTripRow[];
  maintenanceRows: TruckPLMaintenanceRow[];
};

export const plSummaryApi = {
  get: (startDate: string, endDate: string, truckId?: string): Promise<TruckPLEntry[]> => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (truckId) params.set("truck_id", truckId);
    return req<B[]>(`/pl-summary?${params}`).then((data) =>
      data.map((b) => ({
        truckId: String(b.truck_id ?? ""),
        registrationNumber: String(b.registration_number ?? ""),
        tripCount: Number(b.trip_count ?? 0),
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
        })),
        totalCost: Number(b.total_cost ?? 0),
        netPl: Number(b.net_pl ?? 0),
        totalKm: Number(b.total_km ?? 0),
        revenuePerKm: Number(b.revenue_per_km ?? 0),
        maintenanceCount: Number(b.maintenance_count ?? 0),
        tripRows: ((b.trip_rows as B[]) ?? []).map((t) => ({
          tripSheetDate: String(t.trip_sheet_date ?? ""),
          tripSheetNo: String(t.trip_sheet_no ?? ""),
          bookingReferenceNo: String(t.booking_reference_no ?? ""),
          fromLocation: String(t.from_location ?? ""),
          toLocation: String(t.to_location ?? ""),
          hireAmount: Number(t.hire_amount ?? 0),
          totalExpense: Number(t.total_expense ?? 0),
          totalKm: Number(t.total_km ?? 0),
        })),
        maintenanceRows: ((b.maintenance_rows as B[]) ?? []).map((m) => ({
          date: String(m.date ?? ""),
          maintenanceType: String(m.maintenance_type ?? ""),
          description: String(m.description ?? ""),
          cost: Number(m.cost ?? 0),
        })),
      }))
    );
  },
};
