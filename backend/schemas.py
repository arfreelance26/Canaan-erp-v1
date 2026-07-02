from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# ---------------------------------------------------------------------------
# Trucks
# ---------------------------------------------------------------------------

TruckType = Literal["20 FT RIGID", "20 FT ARTICULATED", "40 FT RIGID", "40 FT ARTICULATED"]


class TruckBase(OrmBase):
    truck_id: str
    branch_registered_to: Optional[str] = None
    registration_number: str
    manufacturer: str
    model_name: str
    truck_type: TruckType
    truck_photos_file_name: Optional[str] = None
    chassis_number: Optional[str] = None
    year_of_manufacture: Optional[str] = None
    tyre_layout: str
    fuel_capacity: Optional[Decimal] = None
    odometer_during_purchase: Optional[Decimal] = None
    odometer: Optional[Decimal] = None
    rc_validity_date: Optional[date] = None
    rc_expenses: Optional[Decimal] = None
    rc_document_url: Optional[str] = None
    fc_expiry_date: Optional[date] = None
    fc_document_file_name: Optional[str] = None
    fc_expenses: Optional[Decimal] = None
    road_tax_date: Optional[date] = None
    road_tax_number: Optional[str] = None
    road_tax_document_file_name: Optional[str] = None
    road_tax_expenses: Optional[Decimal] = None
    insurance_expiry_date: Optional[date] = None
    insurance_expenses: Optional[Decimal] = None
    insurance_document_proof_file_name: Optional[str] = None
    national_permit_number: Optional[str] = None
    national_permit_date: Optional[date] = None
    national_permit_proof_file_name: Optional[str] = None
    national_permit_expenses: Optional[Decimal] = None
    local_permit_number: Optional[str] = None
    local_permit_date: Optional[date] = None
    local_permit_proof_file_name: Optional[str] = None
    local_permit_expenses: Optional[Decimal] = None
    pollution_certificate_date: Optional[date] = None
    pollution_certificate_number: Optional[str] = None
    pollution_certificate_proof_file_name: Optional[str] = None
    pollution_certificate_expenses: Optional[Decimal] = None


class TruckCreate(TruckBase):
    pass


class TruckUpdate(TruckBase):
    truck_id: Optional[str] = None
    registration_number: Optional[str] = None
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    truck_type: Optional[TruckType] = None
    tyre_layout: Optional[str] = None


class TruckOut(TruckBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

class DriverBase(OrmBase):
    driver_id: str
    name: str
    aadhaar_number: Optional[str] = None
    aadhaar_file_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

    license_number: Optional[str] = None
    license_expiry_date: Optional[date] = None
    license_file_name: Optional[str] = None
    form_11: Optional[str] = None
    esi_number: Optional[str] = None
    pan_number: Optional[str] = None
    agreement_signed: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    photo_url: Optional[str] = None
    username: Optional[str] = None


class DriverCreate(DriverBase):
    password: str


class DriverUpdate(OrmBase):
    name: Optional[str] = None
    aadhaar_number: Optional[str] = None
    aadhaar_file_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

    license_number: Optional[str] = None
    license_expiry_date: Optional[date] = None
    license_file_name: Optional[str] = None
    form_11: Optional[str] = None
    esi_number: Optional[str] = None
    pan_number: Optional[str] = None
    agreement_signed: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    photo_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class DriverOut(DriverBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------

SoftwareDesignation = Literal["Admin", "Fleet Manager", "Finance Manager", "Tyre Manager", "Staff"]


class StaffBase(OrmBase):
    staff_id: str
    name: str
    department: Optional[str] = None
    designation: Optional[str] = None
    software_designation: SoftwareDesignation = "Staff"
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

    aadhar_number: Optional[str] = None
    aadhar_file_name: Optional[str] = None
    photo_url: Optional[str] = None
    username: Optional[str] = None


class StaffCreate(StaffBase):
    password: str


class StaffUpdate(OrmBase):
    name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    software_designation: Optional[SoftwareDesignation] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

    aadhar_number: Optional[str] = None
    password: Optional[str] = None


class StaffOut(StaffBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

CustomerType = Literal["Transports", "Shipping"]
EntityStatus = Literal["ACTIVE", "INACTIVE", "BLACKLISTED"]


class CustomerBase(OrmBase):
    name: str
    gstin: Optional[str] = None
    contact_personnel_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customer_type: Optional[CustomerType] = None
    is_gta: Optional[str] = None
    applicable_for_e_invoice: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(CustomerBase):
    name: Optional[str] = None


class CustomerOut(CustomerBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomerDestinationBase(OrmBase):
    destination_name: Optional[str] = None
    destination_state: Optional[str] = None
    destination_address: Optional[str] = None
    status: Optional[EntityStatus] = "ACTIVE"


class CustomerDestinationCreate(CustomerDestinationBase):
    pass


class CustomerDestinationOut(CustomerDestinationBase):
    id: int
    customer_id: int


class CustomerPricingBase(OrmBase):
    customer_destination: Optional[str] = None
    cargo_classification: Optional[str] = None
    container_type: Optional[str] = None
    weight_in_tons: Optional[str] = None
    rate: Optional[Decimal] = None
    status: Optional[EntityStatus] = "ACTIVE"


class CustomerPricingCreate(CustomerPricingBase):
    pass


class CustomerPricingOut(CustomerPricingBase):
    id: int
    customer_id: int


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

class VendorBase(OrmBase):
    name: str
    category: Optional[str] = None
    contact_number: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    status: Optional[EntityStatus] = "ACTIVE"


class VendorCreate(VendorBase):
    pass


class VendorUpdate(VendorBase):
    name: Optional[str] = None


class VendorOut(VendorBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Driver Assignments
# ---------------------------------------------------------------------------

class DriverAssignmentCreate(OrmBase):
    driver_id: str
    vehicle_id: str


class DriverAssignmentOut(OrmBase):
    id: int
    driver_id: str
    vehicle_id: str


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------

TripStatus = Literal["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded", "Completed", "Cancelled"]
TripCategory = Literal["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"]
MovementCategory = Literal["Own Fleet", "Third-Party Transporter"]
CargoClassification = Literal["IMPORT", "EXPORT", "EMPTY", "CFS LADEN", "OPEN LOAD", "COASTAL"]
ContainerSpecification = Literal["20 FT CONTAINER", "40 FT CONTAINER", "2 X 20 FEET CONTAINERS", "OPEN LOAD CARGO"]
BillTo = Literal["CUSTOMER", "CONSIGNEE", "SELF/CGI"]
PaymentType = Literal["Credit", "Cash", "Fuel"]
TransportMethod = Literal["Own Fleet", "Third-Party Transporter"]
DriverAdvancePaymentMethod = Literal["None", "CASH", "NEFT/IMPS/UPI", "Both"]
DriverCompensationType = Literal["Normal", "FIXED"]
VerificationStatus = Literal["pending", "verified", "flagged"]


class TripBase(OrmBase):
    trip_id: str
    status: TripStatus = "Assigned"
    assigned_date: Optional[date] = None
    booking_reference_no: str
    booking_created_date: Optional[date] = None
    trip_category: Optional[TripCategory] = None
    movement_category: Optional[MovementCategory] = None
    customer_id: Optional[int] = None
    shipper_consignee: Optional[str] = None
    cargo_classification: Optional[CargoClassification] = None
    container_specification: Optional[ContainerSpecification] = None
    container_number: Optional[str] = None
    container_number_1: Optional[str] = None
    container_number_2: Optional[str] = None
    cargo_reference: Optional[str] = None
    release_order_reference: Optional[str] = None
    cargo_weight: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    shipping_line: Optional[str] = None
    vessel_name: Optional[str] = None
    transport_method: Optional[TransportMethod] = None
    scheduled_date: Optional[date] = None
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    bill_to: Optional[BillTo] = None
    payment_type: Optional[PaymentType] = None
    customer_cash_advance: Optional[Decimal] = None
    customer_fuel_advance_amount: Optional[Decimal] = None
    customer_fuel_advance_litres: Optional[Decimal] = None
    driver_advance_amount: Optional[Decimal] = None
    driver_advance_payment_method: Optional[DriverAdvancePaymentMethod] = None
    driver_advance: Optional[Decimal] = None
    driver_compensation_type: Optional[DriverCompensationType] = None
    transport_hire_amount: Optional[Decimal] = None
    transport_crossing_amount: Optional[Decimal] = None
    internal_remarks: Optional[str] = None
    booking_instructions: Optional[str] = None


class TripCreate(TripBase):
    pass


class TripStatusUpdate(OrmBase):
    status: TripStatus


class TripOut(TripBase):
    id: int
    verification_status: VerificationStatus = "pending"
    is_invoiced: bool = False
    has_closure: bool = False
    has_sheet: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Trip Closure
# ---------------------------------------------------------------------------

PaymentMode = Literal["Cash", "UPI", "Bank Transfer", "Cheque", "NEFT / RTGS"]
BillTo = Literal["CUSTOMER", "CONSIGNEE", "SELF/CGI"]


class TripClosureCreate(OrmBase):
    # 1. Shipment Information
    booking_no: Optional[str] = None
    container_no: Optional[str] = None
    release_order_no: Optional[str] = None
    container_type: Optional[str] = None
    line: Optional[str] = None
    load_type: Optional[str] = None
    movement_category: Optional[MovementCategory] = None

    # 2. Assignment
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    assignment_date: Optional[date] = None

    # 3. Route
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    trip_completed_date: Optional[date] = None

    # 4. Billing
    hire_amount: Optional[Decimal] = None
    transport_amount: Optional[Decimal] = None
    billing_amount: Optional[Decimal] = None
    advance_amount: Optional[Decimal] = None
    driver_advance: Optional[Decimal] = None
    additional_driver_advance: Optional[Decimal] = None
    payment_mode: Optional[PaymentMode] = None
    bill_to: Optional[BillTo] = None

    # 5. Halt Information
    company_halt_days: Optional[int] = 0
    party_halt_days: Optional[int] = 0
    halt_remarks: Optional[str] = None
    driver_halt_compensation: Optional[Decimal] = None


class TripClosureOut(TripClosureCreate):
    id: int
    trip_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None



# ---------------------------------------------------------------------------
# Trip Sheet
# ---------------------------------------------------------------------------

class TripSheetCreate(OrmBase):
    trip_sheet_no: Optional[str] = None
    booking_reference_no: Optional[str] = None
    container_number: Optional[str] = None
    container_type: Optional[str] = None
    line: Optional[str] = None
    trip_type: Optional[str] = None
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    booking_date: Optional[date] = None
    trip_scheduled_date: Optional[date] = None
    trip_completed_date: Optional[date] = None
    trip_closed_date: Optional[date] = None
    trip_sheet_date: Optional[date] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    clearing_agent: Optional[str] = None
    hire_amount: Optional[Decimal] = None
    start_km: Optional[Decimal] = None
    end_km: Optional[Decimal] = None
    total_km: Optional[Decimal] = None
    cargo_weight: Optional[Decimal] = None
    driver_pay: Optional[Decimal] = None
    driver_advance_amount: Optional[Decimal] = None
    driver_balance: Optional[Decimal] = None
    total_halt_days: Optional[int] = 0
    halt_remarks: Optional[str] = None
    halt_pay: Optional[Decimal] = None
    port_pass_expense: Optional[Decimal] = None
    weight_sheet_expense: Optional[Decimal] = None
    mamol_expense: Optional[Decimal] = None
    claimable_mamol_expense: Optional[Decimal] = None
    traffic_rto_expense: Optional[Decimal] = None
    lift_on_off_expense: Optional[Decimal] = None
    crane_operator_expense: Optional[Decimal] = None
    parking_expense: Optional[Decimal] = None
    puncture_expense: Optional[Decimal] = None
    spare_parts_expense: Optional[Decimal] = None
    major_repairs: Optional[list] = None
    other_expenses: Optional[Decimal] = None
    trip_expenses_total: Optional[Decimal] = None
    driver_expenses_total: Optional[Decimal] = None
    total_expense: Optional[Decimal] = None
    fuel_cost_approx: Optional[Decimal] = None
    toll_charges: Optional[Decimal] = None
    toll_count: Optional[int] = 0
    remarks: Optional[str] = None


class TripSheetOut(TripSheetCreate):
    id: int
    trip_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Trip Invoice
# ---------------------------------------------------------------------------

class ServiceLineSchema(OrmBase):
    descriptionOfService: Optional[str] = None
    sacCode: Optional[str] = None
    quantity: Optional[str] = None
    rate: Optional[str] = None


class TripInvoiceCreate(OrmBase):
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    invoice_type: Optional[str] = None
    bill_to: Optional[str] = None
    gst_number: Optional[str] = None
    mode_of_shipment: Optional[str] = None
    container_type: Optional[str] = None
    cfs: Optional[str] = None
    shipping_line: Optional[str] = None
    vessel_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    container_no: Optional[str] = None
    consignee: Optional[str] = None
    services: Optional[list] = None
    bank_name: Optional[str] = None
    branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    contact: Optional[str] = None
    narration: Optional[str] = None
    gst_applicable: Optional[str] = "No"
    igst_applicable: Optional[str] = "No"


class TripInvoiceOut(TripInvoiceCreate):
    id: int
    trip_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

AttendanceStatus = Literal["Present", "Absent", "On Leave", "Not Marked"]


class DriverAttendanceCreate(OrmBase):
    driver_id: str
    date: date
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None


class DriverAttendanceUpdate(OrmBase):
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None


class DriverAttendanceOut(OrmBase):
    id: int
    driver_id: str
    date: date
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None


class StaffAttendanceCreate(OrmBase):
    staff_id: int
    date: date
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None
    source: Literal["Web", "App"] = "Web"


class StaffAttendanceUpdate(OrmBase):
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None
    source: Optional[Literal["Web", "App"]] = None


class StaffAttendanceOut(OrmBase):
    id: int
    staff_id: int
    date: date
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    marked_at: Optional[datetime] = None
    source: Literal["Web", "App"] = "Web"


# ---------------------------------------------------------------------------
# Leave Requests
# ---------------------------------------------------------------------------

LeaveCategory = Literal["Driver", "Fleet Manager", "Tyre Manager", "Staff"]
LeaveStatus = Literal["Pending", "Approved", "Rejected"]

class ApplicantLookupOut(OrmBase):
    category: LeaveCategory
    applicant_id: int
    applicant_name: str
    applicant_code: str


class LeaveRequestCreate(OrmBase):
    category: LeaveCategory
    applicant_id: int
    applicant_name: str
    applicant_code: Optional[str] = None
    from_date: date
    to_date: date
    reason: Optional[str] = None


class LeaveRequestOut(OrmBase):
    id: int
    category: LeaveCategory
    applicant_id: int
    applicant_name: str
    applicant_code: Optional[str] = None
    from_date: date
    to_date: date
    reason: Optional[str] = None
    status: LeaveStatus
    applied_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Maintenance Records
# ---------------------------------------------------------------------------

class MaintenanceRecordCreate(OrmBase):
    truck_id: int
    date: date
    odometer: int
    maintenance_type: str
    description: Optional[str] = None
    cost: Optional[Decimal] = None


class MaintenanceRecordUpdate(OrmBase):
    date: Optional[date] = None
    odometer: Optional[int] = None
    maintenance_type: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[Decimal] = None


class MaintenanceRecordOut(OrmBase):
    id: int
    truck_id: int
    date: date
    odometer: int
    maintenance_type: str
    description: Optional[str] = None
    cost: Optional[Decimal] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Fuel Logs
# ---------------------------------------------------------------------------

class FuelLogCreate(OrmBase):
    truck_id: int
    date: date
    odometer: int
    litres: Decimal
    price_per_litre: Decimal
    total_cost: Decimal
    fuel_station: Optional[str] = None
    logged_by: Optional[str] = None


class FuelLogUpdate(OrmBase):
    date: Optional[date] = None
    odometer: Optional[int] = None
    litres: Optional[Decimal] = None
    price_per_litre: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    fuel_station: Optional[str] = None
    logged_by: Optional[str] = None


class FuelLogOut(OrmBase):
    id: int
    truck_id: int
    date: date
    odometer: int
    litres: Decimal
    price_per_litre: Decimal
    total_cost: Decimal
    distance: Decimal
    mileage: Decimal
    fuel_station: Optional[str] = None
    logged_by: Optional[str] = None
    created_at: Optional[datetime] = None


class FuelStats(OrmBase):
    total_distance: Decimal
    total_fuel: Decimal
    average_mileage: Decimal
    last_mileage: Decimal
    best_mileage: Decimal
    worst_mileage: Decimal
    trend_percentage: Decimal
    cost_per_km: Decimal
# ---------------------------------------------------------------------------
# Tyre Inventory
# ---------------------------------------------------------------------------

TyreCondition = Literal["New", "Rethreaded"]


class TyreInventoryBase(OrmBase):
    brand: str
    tyre_type: Optional[str] = None
    tyre_number: str
    size: Optional[str] = None
    range_km: Optional[int] = 0
    cost: Optional[Decimal] = None
    condition: Optional[TyreCondition] = "New"
    purchase_date: Optional[date] = None
    repair_cost: Optional[Decimal] = None
    retread_cost: Optional[Decimal] = None
    retread_count: Optional[int] = 0


class TyreInventoryCreate(TyreInventoryBase):
    pass


class TyreInventoryUpdate(OrmBase):
    brand: Optional[str] = None
    tyre_type: Optional[str] = None
    size: Optional[str] = None
    range_km: Optional[int] = None
    cost: Optional[Decimal] = None
    condition: Optional[TyreCondition] = None
    purchase_date: Optional[date] = None
    repair_cost: Optional[Decimal] = None
    retread_cost: Optional[Decimal] = None
    retread_count: Optional[int] = None


class TyreInventoryOut(TyreInventoryBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Tyre Fitment
# ---------------------------------------------------------------------------

class TyreFitmentCreate(OrmBase):
    tyre_id: int
    truck_id: int
    position: str
    fitted_odometer: int
    fitted_date: date


class TyreFitmentRemove(OrmBase):
    removed_odometer: int
    removed_date: date


class TyreFitmentOut(OrmBase):
    id: int
    tyre_id: int
    truck_id: int
    position: str
    fitted_odometer: int
    fitted_date: date
    removed_odometer: Optional[int] = None
    removed_date: Optional[date] = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Finance — EMI
# ---------------------------------------------------------------------------

class EmiRecordBase(OrmBase):
    emi_name: str
    truck_registration: Optional[str] = None
    loan_number: Optional[str] = None
    bank_name: Optional[str] = None
    loan_amount: Optional[Decimal] = None
    emi_start_date: Optional[date] = None
    emi_end_date: Optional[date] = None
    emi_amount: Optional[Decimal] = None
    tenure_months: Optional[int] = None
    emi_payment_date: Optional[date] = None
    cost_per_month: Optional[Decimal] = None


class EmiRecordCreate(EmiRecordBase):
    pass


class EmiRecordUpdate(OrmBase):
    emi_name: Optional[str] = None
    truck_registration: Optional[str] = None
    loan_number: Optional[str] = None
    bank_name: Optional[str] = None
    loan_amount: Optional[Decimal] = None
    emi_start_date: Optional[date] = None
    emi_end_date: Optional[date] = None
    emi_amount: Optional[Decimal] = None
    tenure_months: Optional[int] = None
    emi_payment_date: Optional[date] = None
    cost_per_month: Optional[Decimal] = None


class EmiRecordOut(EmiRecordBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Finance — Recurring Payments
# ---------------------------------------------------------------------------

RecurringFrequency = Literal["Monthly", "Quarterly", "Yearly"]
RecurringStatus = Literal["Active", "Paused"]


class RecurringPaymentBase(OrmBase):
    title: str
    category: Optional[str] = None
    amount: Decimal
    frequency: RecurringFrequency
    next_due_date: Optional[date] = None
    status: RecurringStatus = "Active"


class RecurringPaymentCreate(RecurringPaymentBase):
    pass


class RecurringPaymentUpdate(OrmBase):
    title: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    frequency: Optional[RecurringFrequency] = None
    next_due_date: Optional[date] = None
    status: Optional[RecurringStatus] = None


class RecurringPaymentOut(RecurringPaymentBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Finance — Compensation
# ---------------------------------------------------------------------------

CompensationType = Literal["Advance", "Salary"]
PersonType = Literal["driver", "staff"]


class CompensationTransactionCreate(OrmBase):
    person_type: PersonType
    person_id: int
    type: CompensationType
    amount: Decimal
    date: date
    note: Optional[str] = None
    trip_number: Optional[str] = None


class CompensationTransactionOut(OrmBase):
    id: int
    person_type: PersonType
    person_id: int
    type: CompensationType
    amount: Decimal
    date: date
    note: Optional[str] = None
    trip_number: Optional[str] = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------

class BranchBase(OrmBase):
    name: str
    driver_halt_day_fee: Optional[Decimal] = None
    driver_halt_day_percentage: Optional[Decimal] = None


class BranchCreate(BranchBase):
    pass


class BranchUpdate(OrmBase):
    name: Optional[str] = None
    driver_halt_day_fee: Optional[Decimal] = None
    driver_halt_day_percentage: Optional[Decimal] = None


class BranchOut(BranchBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Repair Types
# ---------------------------------------------------------------------------

class RepairTypeCreate(OrmBase):
    name: str
    default_cost: Optional[Decimal] = None


class RepairTypeUpdate(OrmBase):
    name: Optional[str] = None
    default_cost: Optional[Decimal] = None


class RepairTypeOut(OrmBase):
    id: int
    name: str
    default_cost: Optional[Decimal] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# SAC Codes
# ---------------------------------------------------------------------------

class SacCodeBase(OrmBase):
    description: str
    code: str
    gst_rate: Optional[Decimal] = Decimal("0")


class SacCodeCreate(SacCodeBase):
    pass


class SacCodeUpdate(OrmBase):
    description: Optional[str] = None
    code: Optional[str] = None
    gst_rate: Optional[Decimal] = None


class SacCodeOut(SacCodeBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardOverview(OrmBase):
    total_trucks: int
    active_trips: int
    total_drivers: int
    total_staff: int
    pending_leave_requests: int
    maintenance_alerts: int
    compliance_expired: int
    compliance_expiring_soon: int
    monthly_emi_total: Decimal
    active_recurring_payments: int
