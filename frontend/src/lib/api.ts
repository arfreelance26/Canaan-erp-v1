/**
 * Centralized API client — all calls to the FastAPI backend go through here.
 * Transforms snake_case backend responses to the camelCase frontend types.
 */
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Staff } from "@/types/staff";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { Vendor } from "@/types/vendor";
import type { DriverAssignment } from "@/types/driver-assignment";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { DriverAttendanceRecord, StaffAttendanceRecord } from "@/types/attendance";
import type { LeaveRequest } from "@/types/leave-request";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { EmiRecord, RecurringPayment } from "@/types/finance";
import type { CompensationTransaction } from "@/types/compensation";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  if (!res.ok) throw new Error(data?.detail ?? `HTTP ${res.status}`);
  return data as T;
}

// Returns the URL to serve a stored file (photo / document)
export function fileUrl(entity: string, entityId: string, field: string): string {
  return `${BASE}/files/${entity}/${entityId}/${field}`;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    odometerDuringPurchase: String(b.odometer_during_purchase ?? "0"),
    odometer: String(b.odometer ?? "0"),
    rcDate: b.rc_date ?? "",
    rcDocumentUrl: b.rc_document_url ?? null,
    fcDate: b.fc_date ?? "",
    fcExpiryDate: b.fc_expiry_date ?? "",
    fcDocumentFileName: b.fc_document_file_name ?? null,
    fcExpenses: String(b.fc_expenses ?? ""),
    roadTaxDate: b.road_tax_date ?? "",
    roadTaxNumber: b.road_tax_number ?? "",
    roadTaxDocumentFileName: b.road_tax_document_file_name ?? null,
    roadTaxExpenses: String(b.road_tax_expenses ?? ""),
    insuranceExpiryDate: b.insurance_expiry_date ?? "",
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
    odometer_during_purchase: f.odometerDuringPurchase ? parseFloat(f.odometerDuringPurchase) : 0,
    odometer: f.odometer ? parseFloat(f.odometer) : 0,
    rc_date: f.rcDate || null,
    rc_document_url: f.rcDocumentUrl ?? null,
    fc_date: f.fcDate || null,
    fc_expiry_date: f.fcExpiryDate || null,
    fc_document_file_name: f.fcDocumentFileName ?? null,
    fc_expenses: f.fcExpenses ? parseFloat(f.fcExpenses) : null,
    road_tax_date: f.roadTaxDate || null,
    road_tax_number: f.roadTaxNumber || null,
    road_tax_document_file_name: f.roadTaxDocumentFileName ?? null,
    road_tax_expenses: f.roadTaxExpenses ? parseFloat(f.roadTaxExpenses) : null,
    insurance_expiry_date: f.insuranceExpiryDate || null,
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
    photoUrl: b.photo_url ?? null,
    driverId: b.driver_id ?? "",
    name: b.name ?? "",
    aadhaarNumber: b.aadhaar_number ?? "",
    aadhaarFileName: b.aadhaar_file_name ?? null,
    dateOfBirth: b.date_of_birth ?? "",
    dateOfJoining: b.date_of_joining ?? "",
    email: b.email ?? "",
    contactNumber: b.contact_number ?? "",
    address: b.address ?? "",
    branch: b.branch ?? "",
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
    branch: f.branch || null,
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
    photo_url: f.photoUrl ?? null,
    username: f.username || null,
    password: password ?? f.password,
  };
}

function toStaff(b: B): Staff {
  return {
    id: String(b.id),
    photoUrl: b.photo_url ?? null,
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
    branch: b.branch ?? "",
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
    branch: f.branch || null,
    aadhar_file_name: f.aadharFileName ?? null,
    photo_url: f.photoUrl ?? null,
    username: f.username || null,
    password: password ?? f.password,
  };
}

function toCustomer(b: B): Customer {
  return {
    id: String(b.id),
    photoUrl: b.photo_url ?? null,
    name: b.name ?? "",
    gstin: b.gstin ?? "",
    contactPersonnelName: b.contact_personnel_name ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    address: b.address ?? "",
    customerType: b.customer_type ?? "",
    status: b.status ?? "",
    isGta: b.is_gta ?? "",
    applicableForEInvoice: b.applicable_for_e_invoice ?? "",
    tdsExemptionApplicable: b.tds_exemption_applicable ?? "",
    msmeDeclarationSubmitted: b.msme_declaration_submitted ?? "",
    gstExemptedCustomer: b.gst_exempted_customer ?? "",
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
    status: f.status || "ACTIVE",
    photo_url: f.photoUrl ?? null,
    is_gta: f.isGta || null,
    applicable_for_e_invoice: f.applicableForEInvoice || null,
    tds_exemption_applicable: f.tdsExemptionApplicable || null,
    msme_declaration_submitted: f.msmeDeclarationSubmitted || null,
    gst_exempted_customer: f.gstExemptedCustomer || null,
  };
}

function toCustomerDestination(b: B): CustomerDestination {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    destinationName: b.destination_name ?? "",
    destinationState: b.destination_state ?? "",
    status: b.status ?? "",
  };
}

function toCustomerPricing(b: B): CustomerPricing {
  return {
    id: String(b.id),
    customerId: String(b.customer_id),
    customerDestination: b.customer_destination ?? "",
    loadType: b.load_type ?? "",
    containerType: b.container_type ?? "",
    weightInTons: b.weight_in_tons ?? "",
    rate: String(b.rate ?? ""),
    validFrom: b.valid_from ?? "",
    validTo: b.valid_to ?? "",
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
function toTrip(b: B): Trip & { _dbId: number; hasClosure: boolean; hasSheet: boolean } {
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
    driverCompensationType: b.driver_compensation_type ?? "",
    transportHireAmount: String(b.transport_hire_amount ?? ""),
    transportCrossingAmount: String(b.transport_crossing_amount ?? ""),
    finalSettlementAmount: String(b.final_settlement_amount ?? ""),
    internalRemarks: b.internal_remarks ?? "",
    bookingInstructions: b.booking_instructions ?? "",
    hasClosure: b.has_closure ?? false,
    hasSheet: b.has_sheet ?? false,
    verificationStatus: b.verification_status ?? "pending",
    isInvoiced: b.is_invoiced ?? false,
  } as Trip & { _dbId: number; hasClosure: boolean; hasSheet: boolean };
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
    cargo_weight: f.cargoWeight ? parseFloat(f.cargoWeight) : null,
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
    driver_compensation_type: f.driverCompensationType || null,
    transport_hire_amount: f.transportHireAmount ? parseFloat(f.transportHireAmount) : null,
    transport_crossing_amount: f.transportCrossingAmount ? parseFloat(f.transportCrossingAmount) : null,
    final_settlement_amount: f.finalSettlementAmount ? parseFloat(f.finalSettlementAmount) : null,
    internal_remarks: f.internalRemarks || null,
    booking_instructions: f.bookingInstructions || null,
  };
}

function toClosure(b: B): TripClosureData {
  return {
    tripId: String(b.trip_id),
    // Edit Booking
    bookingReferenceNo: b.booking_reference_no ?? "",
    tripCategory: b.trip_category ?? "",
    movementCategory: b.movement_category ?? "",
    customerName: b.customer_name ?? "",
    containerSpecification: b.container_specification ?? "",
    cargoClassification: b.cargo_classification ?? "",
    containerNumber: b.container_number ?? "",
    containerNumber1: b.container_number_1 ?? "",
    containerNumber2: b.container_number_2 ?? "",
    cargoReference: b.cargo_reference ?? "",
    bookingDate: b.booking_date ?? "",
    originLocation: b.origin_location ?? "",
    destinationLocation: b.destination_location ?? "",
    rateType: b.rate_type ?? "",
    releaseOrderReference: b.release_order_reference ?? "",
    shippingLine: b.shipping_line ?? "",
    vesselName: b.vessel_name ?? "",
    shipperConsigneeName: b.shipper_consignee_name ?? "",
    // Transporter Details
    transportMethod: b.transport_method ?? "",
    transporter: b.transporter ?? "",
    tripDate: b.trip_date ?? "",
    assignedTruckDetails: b.assigned_truck_details ?? "",
    paymentType: b.payment_type ?? "",
    customerAdvance: String(b.customer_advance ?? ""),
    dieselAdvance: String(b.diesel_advance ?? ""),
    driverAdvanceAmount: String(b.driver_advance_amount ?? ""),
    driverAdvancePaymentMethod: b.driver_advance_payment_method ?? "",
    billTo: b.bill_to ?? "",
    // Transporter Price Details
    transportHireAmount: String(b.transport_hire_amount ?? ""),
    transportCrossingAmount: String(b.transport_crossing_amount ?? ""),
    transportHalt: String(b.transport_halt ?? ""),
    transportUnloading: String(b.transport_unloading ?? ""),
    transportLiftingCharges: String(b.transport_lifting_charges ?? ""),
    transportWeighment: String(b.transport_weighment ?? ""),
    totalTransportAmount: String(b.total_transport_amount ?? ""),
    // Billing Price Details
    billingHireAmount: String(b.billing_hire_amount ?? ""),
    billingHalt: String(b.billing_halt ?? ""),
    billingUnloading: String(b.billing_unloading ?? ""),
    billingLiftingCharges: String(b.billing_lifting_charges ?? ""),
    billingWeighment: String(b.billing_weighment ?? ""),
    totalBillingAmount: String(b.total_billing_amount ?? ""),
    // Trip Completion
    tripCompletedDate: b.trip_completed_date ?? "",
    tripClosingDate: b.trip_closing_date ?? "",
    paymentMode: b.payment_mode ?? "",
    // Trip Distance Details
    startingOdometer: String(b.starting_odometer ?? ""),
    endingOdometer: String(b.ending_odometer ?? ""),
    totalDistance: String(b.total_distance ?? ""),
    // Cargo Weight Details
    grossWeight: String(b.gross_weight ?? ""),
    tareWeight: String(b.tare_weight ?? ""),
    netWeight: String(b.net_weight ?? ""),
    // Trip Fuel Details
    bunkName: b.bunk_name ?? "",
    dieselQuantity: String(b.diesel_quantity ?? ""),
    fuelTotalCost: String(b.fuel_total_cost ?? ""),
    // Trip Expenses
    totalHaltDays: String(b.total_halt_days ?? ""),
    haltRemarks: b.halt_remarks ?? "",
    driversCompensation: String(b.drivers_compensation ?? ""),
    haltCompensation: String(b.halt_compensation ?? ""),
    portPassExpense: String(b.port_pass_expense ?? ""),
    weightSheetExpense: String(b.weight_sheet_expense ?? ""),
    mamolExpense: String(b.mamol_expense ?? ""),
    claimableMamolExpense: String(b.claimable_mamol_expense ?? ""),
    trafficRtoPoliceExpense: String(b.traffic_rto_police_expense ?? ""),
    liftOnOffExpense: String(b.lift_on_off_expense ?? ""),
    craneOperatorExpense: String(b.crane_operator_expense ?? ""),
    parkingExpenses: String(b.parking_expenses ?? ""),
    punctureExpense: String(b.puncture_expense ?? ""),
    sparePartsExpense: String(b.spare_parts_expense ?? ""),
    otherExpenses: String(b.other_expenses ?? ""),
    tollExpenses: String(b.toll_expenses ?? ""),
    // Halt Information
    additionalDriverAdvanceAmount: String(b.additional_driver_advance_amount ?? ""),
    companyHaltDays: String(b.company_halt_days ?? "0"),
    partyHaltDays: String(b.party_halt_days ?? "0"),
  };
}

function fromClosure(f: TripClosureData) {
  return {
    // Edit Booking
    booking_reference_no: f.bookingReferenceNo || null,
    trip_category: f.tripCategory || null,
    movement_category: f.movementCategory || null,
    customer_name: f.customerName || null,
    container_specification: f.containerSpecification || null,
    cargo_classification: f.cargoClassification || null,
    container_number: f.containerNumber || null,
    container_number_1: f.containerNumber1 || null,
    container_number_2: f.containerNumber2 || null,
    cargo_reference: f.cargoReference || null,
    booking_date: f.bookingDate || null,
    origin_location: f.originLocation || null,
    destination_location: f.destinationLocation || null,
    rate_type: f.rateType || null,
    release_order_reference: f.releaseOrderReference || null,
    shipping_line: f.shippingLine || null,
    vessel_name: f.vesselName || null,
    shipper_consignee_name: f.shipperConsigneeName || null,
    // Transporter Details
    transport_method: f.transportMethod || null,
    transporter: f.transporter || null,
    trip_date: f.tripDate || null,
    assigned_truck_details: f.assignedTruckDetails || null,
    payment_type: f.paymentType || null,
    customer_advance: parseFloat(f.customerAdvance) || 0,
    diesel_advance: parseFloat(f.dieselAdvance) || 0,
    driver_advance_amount: parseFloat(f.driverAdvanceAmount) || 0,
    driver_advance_payment_method: f.driverAdvancePaymentMethod || null,
    bill_to: f.billTo || null,
    // Transporter Price Details
    transport_hire_amount: parseFloat(f.transportHireAmount) || 0,
    transport_crossing_amount: parseFloat(f.transportCrossingAmount) || 0,
    transport_halt: parseFloat(f.transportHalt) || 0,
    transport_unloading: parseFloat(f.transportUnloading) || 0,
    transport_lifting_charges: parseFloat(f.transportLiftingCharges) || 0,
    transport_weighment: parseFloat(f.transportWeighment) || 0,
    total_transport_amount: parseFloat(f.totalTransportAmount) || 0,
    // Billing Price Details
    billing_hire_amount: parseFloat(f.billingHireAmount) || 0,
    billing_halt: parseFloat(f.billingHalt) || 0,
    billing_unloading: parseFloat(f.billingUnloading) || 0,
    billing_lifting_charges: parseFloat(f.billingLiftingCharges) || 0,
    billing_weighment: parseFloat(f.billingWeighment) || 0,
    total_billing_amount: parseFloat(f.totalBillingAmount) || 0,
    // Trip Completion
    trip_completed_date: f.tripCompletedDate || null,
    trip_closing_date: f.tripClosingDate || null,
    payment_mode: f.paymentMode || null,
    // Trip Distance Details
    starting_odometer: parseFloat(f.startingOdometer) || 0,
    ending_odometer: parseFloat(f.endingOdometer) || 0,
    total_distance: parseFloat(f.totalDistance) || 0,
    // Cargo Weight Details
    gross_weight: parseFloat(f.grossWeight) || 0,
    tare_weight: parseFloat(f.tareWeight) || 0,
    net_weight: parseFloat(f.netWeight) || 0,
    // Trip Fuel Details
    bunk_name: f.bunkName || null,
    diesel_quantity: parseFloat(f.dieselQuantity) || 0,
    fuel_total_cost: parseFloat(f.fuelTotalCost) || 0,
    // Trip Expenses
    total_halt_days: parseInt(f.totalHaltDays) || 0,
    halt_remarks: f.haltRemarks || null,
    drivers_compensation: parseFloat(f.driversCompensation) || 0,
    halt_compensation: parseFloat(f.haltCompensation) || 0,
    port_pass_expense: parseFloat(f.portPassExpense) || 0,
    weight_sheet_expense: parseFloat(f.weightSheetExpense) || 0,
    mamol_expense: parseFloat(f.mamolExpense) || 0,
    claimable_mamol_expense: parseFloat(f.claimableMamolExpense) || 0,
    traffic_rto_police_expense: parseFloat(f.trafficRtoPoliceExpense) || 0,
    lift_on_off_expense: parseFloat(f.liftOnOffExpense) || 0,
    crane_operator_expense: parseFloat(f.craneOperatorExpense) || 0,
    parking_expenses: parseFloat(f.parkingExpenses) || 0,
    puncture_expense: parseFloat(f.punctureExpense) || 0,
    spare_parts_expense: parseFloat(f.sparePartsExpense) || 0,
    other_expenses: parseFloat(f.otherExpenses) || 0,
    toll_expenses: parseFloat(f.tollExpenses) || 0,
    // Halt Information
    additional_driver_advance_amount: parseFloat(f.additionalDriverAdvanceAmount) || 0,
    company_halt_days: parseInt(f.companyHaltDays) || 0,
    party_halt_days: parseInt(f.partyHaltDays) || 0,
  };
}

function toSheet(b: B): TripSheetData {
  return {
    tripId: String(b.trip_id),
    tripSheetNo: b.trip_sheet_no ?? "",
    serialNo: b.serial_no ?? "",
    containerNo: b.container_no ?? "",
    containerType: b.container_type ?? "",
    line: b.line ?? "",
    tripType: b.trip_type ?? "",
    vehicleId: b.vehicle_id ?? "",
    date: b.date ?? "",
    driverId: b.driver_id ?? "",
    from: b.from_location ?? "",
    to: b.to_location ?? "",
    hireAmount: String(b.hire_amount ?? ""),
    driverAdvance: String(b.driver_advance ?? ""),
    driverAdvanceAdditional: String(b.driver_advance_additional ?? ""),
    startKm: String(b.start_km ?? ""),
    endKm: String(b.end_km ?? ""),
    totalKm: String(b.total_km ?? ""),
    cargoWeight: String(b.cargo_weight ?? ""),
    grossWeight: String(b.gross_weight ?? ""),
    tareWeight: String(b.tare_weight ?? ""),
    netWeight: String(b.net_weight ?? ""),
    dieselEntries: (b.diesel_entries ?? []).map((e: B) => ({
      id: String(e.id),
      bunkName: e.bunk_name ?? "",
      quantity: String(e.quantity ?? ""),
      price: String(e.price ?? ""),
      amount: String(e.amount ?? ""),
      km: String(e.km ?? ""),
      billNo: e.bill_no ?? "",
    })),
    totalDiesel: String(b.total_diesel ?? ""),
    dieselRate: String(b.diesel_rate ?? ""),
    dieselExpense: String(b.diesel_expense ?? ""),
    driverPay: String(b.driver_pay ?? ""),
    driverSettlementAdvance: String(b.driver_settlement_advance ?? ""),
    driverSettlementAdvanceAdditional: String(b.driver_settlement_advance_additional ?? ""),
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
    punctureExpense: String(b.puncture_expense ?? ""),
    sparePartsExpense: String(b.spare_parts_expense ?? ""),
    otherExpenses: String(b.other_expenses ?? ""),
    tripExpensesTotal: String(b.trip_expenses_total ?? ""),
    driverExpensesTotal: String(b.driver_expenses_total ?? ""),
    totalExpense: String(b.total_expense ?? ""),
    tollCharges: String(b.toll_charges ?? ""),
    tollCount: String(b.toll_count ?? ""),
    remarks: b.remarks ?? "",
  };
}

function fromSheet(f: TripSheetData) {
  const n = (v: string) => parseFloat(v) || 0;
  return {
    trip_sheet_no: f.tripSheetNo || null,
    serial_no: f.serialNo || null,
    container_no: f.containerNo || null,
    container_type: f.containerType || null,
    line: f.line || null,
    trip_type: f.tripType || null,
    vehicle_id: f.vehicleId || null,
    date: f.date || null,
    driver_id: f.driverId || null,
    from_location: f.from || null,
    to_location: f.to || null,
    hire_amount: n(f.hireAmount),
    driver_advance: n(f.driverAdvance),
    driver_advance_additional: n(f.driverAdvanceAdditional),
    start_km: n(f.startKm),
    end_km: n(f.endKm),
    total_km: n(f.totalKm),
    cargo_weight: n(f.cargoWeight),
    gross_weight: n(f.grossWeight),
    tare_weight: n(f.tareWeight),
    net_weight: n(f.netWeight),
    total_diesel: n(f.totalDiesel),
    diesel_rate: n(f.dieselRate),
    diesel_expense: n(f.dieselExpense),
    driver_pay: n(f.driverPay),
    driver_settlement_advance: n(f.driverSettlementAdvance),
    driver_settlement_advance_additional: n(f.driverSettlementAdvanceAdditional),
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
    puncture_expense: n(f.punctureExpense),
    spare_parts_expense: n(f.sparePartsExpense),
    other_expenses: n(f.otherExpenses),
    trip_expenses_total: n(f.tripExpensesTotal),
    driver_expenses_total: n(f.driverExpensesTotal),
    total_expense: n(f.totalExpense),
    toll_charges: n(f.tollCharges),
    toll_count: parseInt(f.tollCount) || 0,
    remarks: f.remarks || null,
    diesel_entries: (f.dieselEntries ?? []).map((e) => ({
      bunk_name: e.bunkName || null,
      quantity: n(e.quantity),
      price: n(e.price),
      amount: n(e.amount),
      km: n(e.km),
      bill_no: e.billNo || null,
    })),
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
    truckId: String(b.truck_id ?? ""),
    date: b.date ?? "",
    odometer: String(b.odometer ?? ""),
    maintenanceType: b.maintenance_type ?? "",
    description: b.description ?? "",
    cost: String(b.cost ?? ""),
  };
}

function toTyreInventory(b: B): TyreInventoryItem {
  return {
    id: String(b.id),
    brand: b.brand ?? "",
    pattern: b.pattern ?? "",
    tyreType: b.tyre_type ?? "",
    tyreNumber: b.tyre_number ?? "",
    size: b.size ?? "",
    range: String(b.range_km ?? ""),
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
    pattern: f.pattern || null,
    tyre_type: f.tyreType || null,
    tyre_number: f.tyreNumber,
    size: f.size || null,
    range_km: parseInt(f.range) || 0,
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

  listDestinations: (customerId: string) =>
    req<B[]>(`/customers/${customerId}/destinations`).then((d) => d.map(toCustomerDestination)),
  createDestination: (customerId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations`, {
      method: "POST",
      body: JSON.stringify({ destination_name: dest.destinationName, destination_state: dest.destinationState, status: dest.status }),
    }).then(toCustomerDestination),
  updateDestination: (customerId: string, destId: string, dest: CustomerDestination) =>
    req<B>(`/customers/${customerId}/destinations/${destId}`, {
      method: "PUT",
      body: JSON.stringify({ destination_name: dest.destinationName, destination_state: dest.destinationState, status: dest.status }),
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
        load_type: pricing.loadType, container_type: pricing.containerType,
        weight_in_tons: pricing.weightInTons,
        rate: parseFloat(pricing.rate) || 0, valid_from: pricing.validFrom || null,
        valid_to: pricing.validTo || null, status: pricing.status,
      }),
    }).then(toCustomerPricing),
  updatePricing: (customerId: string, priceId: string, pricing: CustomerPricing) =>
    req<B>(`/customers/${customerId}/pricing/${priceId}`, {
      method: "PUT",
      body: JSON.stringify({
        customer_destination: pricing.customerDestination,
        load_type: pricing.loadType, container_type: pricing.containerType,
        weight_in_tons: pricing.weightInTons,
        rate: parseFloat(pricing.rate) || 0, valid_from: pricing.validFrom || null,
        valid_to: pricing.validTo || null, status: pricing.status,
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
    req<B>(`/trips/${dbId}/sheet`).then(toSheet),

  // Workflow
  verify: (dbId: string) => req<B>(`/trips/${dbId}/verify`, { method: "POST" }).then(toTrip),
  flag: (dbId: string) => req<B>(`/trips/${dbId}/flag`, { method: "POST" }).then(toTrip),
  invoice: (dbId: string) => req<B>(`/trips/${dbId}/invoice`, { method: "POST" }).then(toTrip),
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

  listFuelLogs: (truckId?: string) =>
    req<B[]>(`/fuel-logs${truckId ? `?truck_id=${truckId}` : ""}`),
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
};

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

export const dashboardApi = {
  overview: () => req<Record<string, unknown>>("/dashboard/overview"),
};
