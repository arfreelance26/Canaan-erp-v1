from __future__ import annotations
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

_CONTAINER_RE = re.compile(r'^[A-Z]{4}[0-9]{7}$')

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    def model_post_init(self, __context: object) -> None:
        # MySQL DATETIME columns return naive datetimes — stamp them UTC so the
        # JSON serialiser emits "+00:00" and clients can parse them unambiguously.
        for name, value in self.__dict__.items():
            if isinstance(value, datetime) and value.tzinfo is None:
                object.__setattr__(self, name, value.replace(tzinfo=timezone.utc))


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
    adblue_consumption: Optional[Decimal] = None
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
    client_version: Optional[int] = None
    truck_id: Optional[str] = None
    registration_number: Optional[str] = None
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    truck_type: Optional[TruckType] = None
    tyre_layout: Optional[str] = None


class TruckOut(TruckBase):
    id: int
    version: int = 1
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
    client_version: Optional[int] = None
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
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------

SoftwareDesignation = Literal["Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"]


VALID_DESIGNATIONS = {"Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"}


class StaffBase(OrmBase):
    staff_id: str
    name: str
    department: Optional[str] = None
    designation: Optional[str] = None
    software_designation: SoftwareDesignation = "Trip Sheet Register"

    @field_validator("software_designation", mode="before")
    @classmethod
    def coerce_designation(cls, v: object) -> object:
        if not v or v not in VALID_DESIGNATIONS:
            return "Trip Sheet Register"
        return v
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
    client_version: Optional[int] = None
    name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    software_designation: Optional[SoftwareDesignation] = None

    @field_validator("software_designation", mode="before")
    @classmethod
    def coerce_designation(cls, v: object) -> object:
        if v is None:
            return None  # unset = don't update
        if not v or v not in VALID_DESIGNATIONS:
            return "Trip Sheet Register"
        return v
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

    aadhar_number: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class DeviceInfo(BaseModel):
    id: str
    kind: str = "unknown"
    os: Optional[str] = None
    label: str = ""
    bound_at: Optional[str] = None


class StaffOut(StaffBase):
    id: int
    version: int = 1
    device_bound: bool = False
    devices: list[DeviceInfo] = []
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
    client_version: Optional[int] = None
    name: Optional[str] = None


class CustomerOut(CustomerBase):
    id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CustomerOriginBase(OrmBase):
    origin_name: str


class CustomerOriginCreate(CustomerOriginBase):
    pass


class CustomerOriginOut(CustomerOriginBase):
    id: int
    customer_id: int
    created_at: Optional[datetime] = None


class CustomerDestinationBase(OrmBase):
    destination_name: Optional[str] = None
    destination_state: Optional[str] = None
    destination_address: Optional[str] = None
    origin_state: Optional[str] = None
    origin_address: Optional[str] = None
    status: Optional[EntityStatus] = "ACTIVE"
    approx_distance_km: Optional[Decimal] = None


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


class FinalCustomerPricingBase(OrmBase):
    actual_hire_amount: Optional[Decimal] = None
    accounts_hire_amount: Optional[Decimal] = None


class FinalCustomerPricingCreate(FinalCustomerPricingBase):
    pass


class FinalCustomerPricingUpdate(FinalCustomerPricingBase):
    client_version: Optional[int] = None


class FinalCustomerPricingOut(FinalCustomerPricingBase):
    id: int
    customer_id: int
    version: int = 1
    created_at: Optional[datetime] = None


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
    client_version: Optional[int] = None
    name: Optional[str] = None


class VendorOut(VendorBase):
    id: int
    version: int = 1
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
TripCategory = Literal["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING", "RETURN TRIP"]
MovementCategory = Literal["Own Fleet", "Third-Party Transporter"]
CargoClassification = Literal["IMPORT", "EXPORT", "EMPTY", "CFS LADEN", "OPEN LOAD", "COASTAL", "RETURN TRIP"]
ContainerSpecification = Literal["20 FT CONTAINER", "40 FT CONTAINER", "2 X 20 FEET CONTAINERS", "OPEN LOAD CARGO"]
BillTo = Literal["CUSTOMER", "CONSIGNEE", "SELF/CGI"]
PaymentType = Literal["Credit", "Cash", "Fuel"]
DriverAdvancePaymentMethod = Literal["None", "CASH", "NEFT/IMPS/UPI", "Both"]
DriverCompensationType = Literal["Normal", "FIXED"]
VerificationStatus = Literal["pending", "verified", "flagged", "rejected"]


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
    initial_disbursed_advance: Optional[Decimal] = None
    driver_compensation_type: Optional[DriverCompensationType] = None
    is_batta_applicable: bool = False
    open_load_hire_type: Optional[Literal["Ton Based", "Fixed"]] = None
    rate_per_ton: Optional[Decimal] = None
    transport_hire_amount: Optional[Decimal] = None
    transport_crossing_amount: Optional[Decimal] = None
    approx_km: Optional[Decimal] = None
    approx_trip_distance: Optional[Decimal] = None
    lift_on_amount: Optional[Decimal] = None
    lift_on_remarks: Optional[str] = None
    cha_name: Optional[str] = None
    flagged_for_recheck: bool = False
    flagged_remark: Optional[str] = None
    advance_verified: Optional[bool] = None
    advance_verification_remark: Optional[str] = None
    advance_corrected_amount: Optional[Decimal] = None
    internal_remarks: Optional[str] = None
    driver_change_remark: Optional[str] = None
    booking_instructions: Optional[str] = None
    invoice_required: bool = True


    @model_validator(mode="after")
    def _clear_billing_for_shifting(self) -> "TripBase":
        if self.trip_category == "SHIFTING":
            self.bill_to = None
            self.payment_type = None
            self.customer_cash_advance = None
            self.customer_fuel_advance_amount = None
            self.customer_fuel_advance_litres = None
        # "Is Batta Applicable" only means anything on a RETURN TRIP; force it off
        # anywhere else so it can never accidentally flip a non-return trip's batta
        # out of Net Payable.
        if self.trip_category != "RETURN TRIP":
            self.is_batta_applicable = False
        return self


class TripCreate(TripBase):
    @field_validator("container_number", "container_number_1", "container_number_2", mode="before")
    @classmethod
    def validate_container_number(cls, v: object) -> object:
        if v is None or v == "":
            return v
        normalized = str(v).strip().upper().replace(" ", "")
        if not _CONTAINER_RE.match(normalized):
            raise ValueError(
                f"Container number must be 4 uppercase letters followed by 7 digits "
                f"(e.g. TWCU2081370), got: {v!r}"
            )
        return normalized


class TripStatusUpdate(OrmBase):
    status: TripStatus


class LRDataSave(OrmBase):
    lr_consignor: Optional[str] = None
    lr_consignee: Optional[str] = None
    lr_ref_no: Optional[str] = None
    lr_description_of_goods: Optional[str] = None
    lr_invoice_no: Optional[str] = None
    lr_sb_be_no: Optional[str] = None
    lr_seal_no_packages: Optional[str] = None
    lr_tare: Optional[str] = None
    lr_weight: Optional[str] = None
    lr_value: Optional[str] = None
    lr_to_pay: bool = False
    lr_to_be_billed: bool = False


class TripOut(TripBase):
    id: int
    verification_status: VerificationStatus = "pending"
    verification_rejection_reason: Optional[str] = None
    is_invoiced: bool = False
    invoice_waived: bool = False
    has_closure: bool = False
    has_sheet: bool = False
    trip_sheet_collected: bool = False
    trip_sheet_collected_at: Optional[datetime] = None
    trip_sheet_received: bool = False
    trip_sheet_received_at: Optional[datetime] = None
    trip_sheet_date: Optional[date] = None
    sheet_hire_amount: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    driver_name: Optional[str] = None
    truck_registration: Optional[str] = None
    # LR fields
    lr_consignor: Optional[str] = None
    lr_consignee: Optional[str] = None
    lr_ref_no: Optional[str] = None
    lr_description_of_goods: Optional[str] = None
    lr_invoice_no: Optional[str] = None
    lr_sb_be_no: Optional[str] = None
    lr_seal_no_packages: Optional[str] = None
    lr_tare: Optional[str] = None
    lr_weight: Optional[str] = None
    lr_value: Optional[str] = None
    lr_to_pay: bool = False
    lr_to_be_billed: bool = False
    lr_saved_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Trip Closure
# ---------------------------------------------------------------------------

PaymentMode = Literal["Cash", "UPI", "Bank Transfer", "Cheque", "NEFT / RTGS"]
BillTo = Literal["CUSTOMER", "CONSIGNEE", "SELF/CGI"]


class TripClosureCreate(OrmBase):
    # Optimistic locking — client echoes back the version it last saw
    client_version: Optional[int] = None

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
    closure_remarks: Optional[str] = None


class TripClosureOut(TripClosureCreate):
    id: int
    trip_id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None



# ---------------------------------------------------------------------------
# Trip Sheet
# ---------------------------------------------------------------------------

class TripSheetCreate(OrmBase):
    # Optimistic locking — client echoes back the version it last saw
    client_version: Optional[int] = None

    trip_sheet_no: Optional[str] = None
    booking_reference_no: Optional[str] = None
    container_number: Optional[str] = None
    container_number_1: Optional[str] = None
    container_number_2: Optional[str] = None
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
    open_load_hire_type: Optional[Literal["Ton Based", "Fixed"]] = None
    rate_per_ton: Optional[Decimal] = None
    start_km: Optional[Decimal] = None
    end_km: Optional[Decimal] = None
    total_km: Optional[Decimal] = None
    cargo_weight: Optional[Decimal] = None
    driver_compensation_type: Optional[str] = None
    driver_pay: Optional[Decimal] = None
    driver_advance: Optional[Decimal] = None
    additional_driver_advance: Optional[Decimal] = None
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
    diesel_litres: Optional[Decimal] = None
    diesel_rate: Optional[Decimal] = None
    diesel_total: Optional[Decimal] = None
    diesel_remarks: Optional[str] = None
    diesel_entries: Optional[list] = None  # [{date, odometer, litres, costPerLitre, totalCost, fuelStation}]
    km_variance_remark: Optional[str] = None
    toll_charges: Optional[Decimal] = None
    toll_count: Optional[int] = 0
    remarks: Optional[str] = None


class TripSheetOut(TripSheetCreate):
    id: int
    trip_id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Trip Invoice
# ---------------------------------------------------------------------------

class ServiceLineSchema(OrmBase):
    descriptionOfService: Optional[str] = None
    sacCode: Optional[str] = None
    gstRate: Optional[str] = None
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
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

AttendanceStatus = Literal["Present", "Absent", "On Leave", "Not Marked", "On Trip", "On Halt", "Leave", "On Workshop"]


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


class DriverAttendanceRemarkCreate(OrmBase):
    driver_id: str
    date: date
    remark: str
    is_late_entry: bool = False


class DriverAttendanceRemarkUpdate(OrmBase):
    remark: str


class DriverAttendanceRemarkOut(OrmBase):
    id: int
    driver_id: str
    date: date
    remark: str
    is_late_entry: bool = False
    created_at: Optional[datetime] = None


class DriverLateEntryLogCreate(OrmBase):
    date: date
    remark: str


class DriverLateEntryLogOut(OrmBase):
    id: int
    date: date
    remark: str
    created_at: Optional[datetime] = None


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
    staff_id: Optional[int] = None   # NULL once that staff member is hard-deleted
    staff_name: Optional[str] = None   # snapshot at creation — survives staff_id going NULL
    date: date
    status: AttendanceStatus
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    marked_at: Optional[datetime] = None
    source: Literal["Web", "App"] = "Web"
    admin_override: bool = False


class AttendanceSummaryOut(BaseModel):
    id: str
    code: str
    name: str
    present: int = 0
    absent: int = 0
    on_leave: int = 0
    on_trip: int = 0
    on_halt: int = 0
    leave: int = 0
    on_workshop: int = 0
    not_marked: int
    total_days: int


# Self-service mark attendance (today only — no date field accepted from client)
class StaffSelfMarkCreate(BaseModel):
    staff_id: int
    status: Literal["Present", "Absent", "On Leave"]


# Monthly summary returned by GET /attendance/staff/self-summary
class StaffSelfSummaryOut(BaseModel):
    present: int
    absent: int
    on_leave: int
    not_marked: int
    holidays: int = 0          # Sundays + government/company holidays elapsed this month
    days_elapsed: int
    working_days: int
    percentage: float


# ---------------------------------------------------------------------------
# Holidays (staff attendance only — Sundays are automatic and not stored)
# ---------------------------------------------------------------------------

class HolidayCreate(BaseModel):
    date: date
    name: str
    type: Literal["Government", "Company"] = "Government"


class HolidayOut(OrmBase):
    id: int
    date: date
    name: str
    type: Literal["Government", "Company"] = "Government"
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Edit Approval Requests
# ---------------------------------------------------------------------------

EditApprovalAction = Literal["Edit", "Delete"]
EditApprovalResourceType = Literal["Customer", "Vendor", "BookingSheet", "TripSheet", "TripData", "Trip", "FuelLog"]
EditApprovalStatus = Literal["Pending", "Approved", "Rejected"]


class DeletionApprovalRequestCreate(OrmBase):
    resource_type: str          # "FuelLog"
    resource_id: int
    resource_name: str
    log_details: Optional[dict] = None
    reason: str


class DeletionApprovalRequestOut(OrmBase):
    id: int
    resource_type: str
    resource_id: int
    resource_name: str
    log_details: Optional[dict] = None
    requested_by_staff_id: int
    requested_by_name: str
    reason: str
    status: str
    admin_note: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class DeletionApprovalActionPayload(OrmBase):
    admin_note: Optional[str] = None


class EditApprovalRequestCreate(OrmBase):
    resource_type: EditApprovalResourceType
    resource_id: int
    resource_name: str
    action: EditApprovalAction
    reason: str
    proposed_changes: Optional[dict] = None


class EditApprovalRequestOut(OrmBase):
    id: int
    staff_db_id: int
    staff_name: str
    staff_code: Optional[str] = None
    resource_type: EditApprovalResourceType
    resource_id: int
    resource_name: str
    action: EditApprovalAction
    reason: str
    proposed_changes: Optional[dict] = None
    admin_note: Optional[str] = None
    approved_by_name: Optional[str] = None
    status: EditApprovalStatus
    approved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class ApproveDeletePayload(OrmBase):
    admin_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Leave Requests
# ---------------------------------------------------------------------------

LeaveCategory = Literal["Driver", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"]
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
    date: date                                    # Maintenance Start Date
    maintenance_end_date: Optional[date] = None
    odometer: int
    maintenance_type: str
    compliant: Optional[str] = None               # "Yes" | "No"
    maintenance_location: Optional[str] = None
    maintenance_by: Optional[str] = None
    description: Optional[str] = None             # Remarks
    cost: Optional[Decimal] = None


class MaintenanceRecordUpdate(OrmBase):
    client_version: Optional[int] = None
    date: Optional[date] = None
    maintenance_end_date: Optional[date] = None
    odometer: Optional[int] = None
    maintenance_type: Optional[str] = None
    compliant: Optional[str] = None
    maintenance_location: Optional[str] = None
    maintenance_by: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[Decimal] = None


class MaintenanceRecordOut(OrmBase):
    id: int
    truck_id: int
    date: date
    maintenance_end_date: Optional[date] = None
    odometer: int
    maintenance_type: str
    compliant: Optional[str] = None
    maintenance_location: Optional[str] = None
    maintenance_by: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[Decimal] = None
    entered_by_name: Optional[str] = None
    source: Optional[str] = None
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AirFilterRecordCreate(OrmBase):
    truck_id: int
    date: date
    odometer_during_change: int
    current_odometer: int
    remarks: Optional[str] = None


class AirFilterRecordOut(OrmBase):
    id: int
    truck_id: int
    date: date
    odometer_during_change: int
    current_odometer: int
    remarks: Optional[str] = None
    entered_by_name: Optional[str] = None
    version: int = 1
    created_at: Optional[datetime] = None


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
    entered_by_name: Optional[str] = None
    source: Optional[str] = None


class FuelLogUpdate(OrmBase):
    client_version: Optional[int] = None
    date: Optional[date] = None
    odometer: Optional[int] = None
    litres: Optional[Decimal] = None
    price_per_litre: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    fuel_station: Optional[str] = None
    logged_by: Optional[str] = None
    entered_by_name: Optional[str] = None
    source: Optional[str] = None


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
    entered_by_name: Optional[str] = None
    source: Optional[str] = None
    version: int = 1
    created_at: Optional[datetime] = None


class FuelBaseConfigOut(OrmBase):
    id: int
    cost_per_litre: Optional[Decimal] = None
    updated_at: Optional[datetime] = None


class FuelBaseConfigUpdate(OrmBase):
    cost_per_litre: Optional[Decimal] = None


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
# AdBlue Logs
# ---------------------------------------------------------------------------

class AdBlueLogCreate(OrmBase):
    truck_id: int
    date: date
    odometer: int
    litres: Decimal
    price_per_litre: Decimal
    total_cost: Decimal
    supplier: Optional[str] = None
    remarks: Optional[str] = None


class AdBlueLogUpdate(OrmBase):
    client_version: Optional[int] = None
    date: Optional[date] = None
    odometer: Optional[int] = None
    litres: Optional[Decimal] = None
    price_per_litre: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    supplier: Optional[str] = None
    remarks: Optional[str] = None


class AdBlueLogOut(OrmBase):
    id: int
    truck_id: int
    date: date
    odometer: int
    litres: Decimal
    price_per_litre: Decimal
    total_cost: Decimal
    supplier: Optional[str] = None
    remarks: Optional[str] = None
    entered_by_name: Optional[str] = None
    version: int = 1
    created_at: Optional[datetime] = None


class AdBlueManufacturerCreate(OrmBase):
    name: str
    default_price_per_litre: Optional[Decimal] = None


class AdBlueManufacturerUpdate(OrmBase):
    name: Optional[str] = None
    default_price_per_litre: Optional[Decimal] = None


class AdBlueManufacturerOut(OrmBase):
    id: int
    name: str
    default_price_per_litre: Optional[Decimal] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
# ---------------------------------------------------------------------------
# Tyre Inventory
# ---------------------------------------------------------------------------



class TyreInventoryBase(OrmBase):
    brand: str
    tyre_type: Optional[str] = None
    tyre_number: str
    size: Optional[str] = None
    range_km: Optional[int] = 0
    cost: Optional[Decimal] = None
    cost_per_km: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    retread_cost: Optional[Decimal] = None
    retread_count: Optional[int] = 0
    condition: Optional[str] = "New"


class TyreInventoryCreate(TyreInventoryBase):
    pass


class TyreInventoryUpdate(OrmBase):
    client_version: Optional[int] = None
    brand: Optional[str] = None
    tyre_type: Optional[str] = None
    size: Optional[str] = None
    range_km: Optional[int] = None
    cost: Optional[Decimal] = None
    cost_per_km: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    retread_cost: Optional[Decimal] = None
    retread_count: Optional[int] = None
    condition: Optional[str] = None


class TyreInventoryOut(TyreInventoryBase):
    id: int
    version: int = 1
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
    removal_remark: str


class TyreFitmentOut(OrmBase):
    id: int
    tyre_id: int
    truck_id: int
    position: str
    fitted_odometer: int
    fitted_date: date
    removed_odometer: Optional[int] = None
    removed_date: Optional[date] = None
    removal_remark: Optional[str] = None
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
    monthly_finance_cost: Optional[Decimal] = None
    daily_finance_cost: Optional[Decimal] = None
    emi_cost_per_km: Optional[Decimal] = None


class EmiRecordCreate(EmiRecordBase):
    pass


class EmiRecordUpdate(OrmBase):
    client_version: Optional[int] = None
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
    monthly_finance_cost: Optional[Decimal] = None
    daily_finance_cost: Optional[Decimal] = None
    emi_cost_per_km: Optional[Decimal] = None


class EmiRecordOut(EmiRecordBase):
    id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Truck Run Configuration
# ---------------------------------------------------------------------------

class TruckRunConfigItem(OrmBase):
    tyre_layout: str
    km_per_month: Optional[Decimal] = None
    km_per_day: Optional[Decimal] = None


class TruckRunConfigOut(TruckRunConfigItem):
    id: int
    updated_at: Optional[datetime] = None


class TruckRunConfigBulkSave(OrmBase):
    configs: list[TruckRunConfigItem]


class TyreLayoutCostItem(OrmBase):
    tyre_layout: str
    cost: Optional[Decimal] = None


class TyreLayoutCostOut(TyreLayoutCostItem):
    id: int
    updated_at: Optional[datetime] = None


class TyreLayoutCostBulkSave(OrmBase):
    configs: list[TyreLayoutCostItem]


# ---------------------------------------------------------------------------
# Compliance Update History
# ---------------------------------------------------------------------------

class ComplianceUpdateHistoryOut(BaseModel):
    id:               int
    truck_id:         int
    document_type:    str
    updated_at:       datetime
    updated_by_name:  str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Compliance Cost Configuration
# ---------------------------------------------------------------------------

class ComplianceCostConfigItem(BaseModel):
    tyre_layout: str
    rc_cost: Optional[str] = ""
    fc_cost: Optional[str] = ""
    road_tax_cost: Optional[str] = ""
    national_permit_cost: Optional[str] = ""
    local_permit_cost: Optional[str] = ""
    pollution_cert_cost: Optional[str] = ""
    insurance_cost: Optional[str] = ""

    @field_validator(
        "rc_cost", "fc_cost", "road_tax_cost", "national_permit_cost",
        "local_permit_cost", "pollution_cert_cost", "insurance_cost",
        mode="before",
    )
    @classmethod
    def coerce_decimal_to_str(cls, v: object) -> str:
        if v is None:
            return ""
        s = str(v)
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s


class ComplianceCostConfigOut(ComplianceCostConfigItem):
    id: int

    class Config:
        from_attributes = True


class ComplianceCostBulkSave(BaseModel):
    configs: list[ComplianceCostConfigItem]


# ---------------------------------------------------------------------------
# Tyre Range Configuration
# ---------------------------------------------------------------------------

class TyreRangeConfigItem(OrmBase):
    tyre_type: str
    range_km: Optional[int] = None
    base_tyre_cost: Optional[float] = None
    base_cost_per_km: Optional[float] = None


class TyreRangeConfigOut(TyreRangeConfigItem):
    id: int
    updated_at: Optional[datetime] = None


class TyreRangeConfigBulkSave(OrmBase):
    configs: list[TyreRangeConfigItem]


class TyreLayoutTypeConfigItem(OrmBase):
    tyre_layout: str
    tyre_type: str
    quantity: Optional[int] = None


class TyreLayoutTypeConfigOut(TyreLayoutTypeConfigItem):
    id: int
    updated_at: Optional[datetime] = None


class TyreLayoutTypeConfigBulkSave(OrmBase):
    configs: list[TyreLayoutTypeConfigItem]


# ---------------------------------------------------------------------------
# Running Cost Calculator
# ---------------------------------------------------------------------------

class RccTyreEntryIn(BaseModel):
    cost: Optional[str] = ""
    range: Optional[str] = ""

class RccLayoutEntryIn(BaseModel):
    month: Optional[str] = ""
    day: Optional[str] = ""

class RccTruckMetricsIn(BaseModel):
    emi_amount: Optional[str] = ""
    emi_per_day: Optional[str] = ""
    emi_per_km: Optional[str] = ""
    mileage: Optional[str] = ""
    adblue_consume_l_per_km: Optional[str] = ""
    adblue_manufacturer_id: Optional[str] = ""
    adblue_per_km: Optional[str] = ""
    tyre_type: Optional[str] = ""
    tyre_per_km: Optional[str] = ""
    maintenance_per_km: Optional[str] = ""
    compliance_cost_per_year: Optional[str] = ""

class RccModeDataIn(BaseModel):
    cost_per_litre: Optional[str] = ""
    tyre_entries: dict[str, RccTyreEntryIn] = {}
    run_entries: dict[str, RccLayoutEntryIn] = {}
    adblue_prices: dict[str, str] = {}
    truck_metrics: dict[str, RccTruckMetricsIn] = {}

class RunningCostStateIn(BaseModel):
    Manual: RccModeDataIn = RccModeDataIn()
    Basic: RccModeDataIn = RccModeDataIn()
    Advanced: RccModeDataIn = RccModeDataIn()


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
    client_version: Optional[int] = None
    title: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    frequency: Optional[RecurringFrequency] = None
    next_due_date: Optional[date] = None
    status: Optional[RecurringStatus] = None


class RecurringPaymentOut(RecurringPaymentBase):
    id: int
    version: int = 1
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
    person_name: Optional[str] = None   # snapshot at creation — survives the driver/staff record being deleted
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
    halt_day_fee_20ft: Optional[Decimal] = None
    halt_day_fee_40ft: Optional[Decimal] = None
    driver_halt_day_percentage: Optional[Decimal] = None
    cleaner_batta_fee: Optional[Decimal] = None


class BranchCreate(BranchBase):
    pass


class BranchUpdate(OrmBase):
    client_version: Optional[int] = None
    name: Optional[str] = None
    halt_day_fee_20ft: Optional[Decimal] = None
    halt_day_fee_40ft: Optional[Decimal] = None
    driver_halt_day_percentage: Optional[Decimal] = None
    cleaner_batta_fee: Optional[Decimal] = None


class BranchOut(BranchBase):
    id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Trip Expense Rates
# ---------------------------------------------------------------------------

class TripExpenseRateBase(OrmBase):
    name: str
    port_pass_expense: Optional[Decimal] = None
    port_pass_expense_auto: Optional[bool] = False
    weight_sheet_expense: Optional[Decimal] = None
    weight_sheet_expense_auto: Optional[bool] = False
    mamol_expense: Optional[Decimal] = None
    mamol_expense_auto: Optional[bool] = False
    claimable_mamol_expense: Optional[Decimal] = None
    claimable_mamol_expense_auto: Optional[bool] = False
    traffic_rto_expense: Optional[Decimal] = None
    traffic_rto_expense_auto: Optional[bool] = False
    lift_on_off_expense: Optional[Decimal] = None
    lift_on_off_expense_auto: Optional[bool] = False
    crane_operator_expense: Optional[Decimal] = None
    crane_operator_expense_auto: Optional[bool] = False
    parking_expense: Optional[Decimal] = None
    parking_expense_auto: Optional[bool] = False


class TripExpenseRateCreate(TripExpenseRateBase):
    pass


class TripExpenseRateUpdate(OrmBase):
    client_version: Optional[int] = None
    name: Optional[str] = None
    port_pass_expense: Optional[Decimal] = None
    port_pass_expense_auto: Optional[bool] = None
    weight_sheet_expense: Optional[Decimal] = None
    weight_sheet_expense_auto: Optional[bool] = None
    mamol_expense: Optional[Decimal] = None
    mamol_expense_auto: Optional[bool] = None
    claimable_mamol_expense: Optional[Decimal] = None
    claimable_mamol_expense_auto: Optional[bool] = None
    traffic_rto_expense: Optional[Decimal] = None
    traffic_rto_expense_auto: Optional[bool] = None
    lift_on_off_expense: Optional[Decimal] = None
    lift_on_off_expense_auto: Optional[bool] = None
    crane_operator_expense: Optional[Decimal] = None
    crane_operator_expense_auto: Optional[bool] = None
    parking_expense: Optional[Decimal] = None
    parking_expense_auto: Optional[bool] = None


class TripExpenseRateOut(TripExpenseRateBase):
    id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Repair Types
# ---------------------------------------------------------------------------

class RepairTypeCreate(OrmBase):
    name: str
    default_cost: Optional[Decimal] = None


class RepairTypeUpdate(OrmBase):
    client_version: Optional[int] = None
    name: Optional[str] = None
    default_cost: Optional[Decimal] = None


class RepairTypeOut(OrmBase):
    id: int
    name: str
    default_cost: Optional[Decimal] = None
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Maintenance Types
# ---------------------------------------------------------------------------

class MaintenanceTypeCreate(OrmBase):
    name: str
    interval_km: int


class MaintenanceTypeUpdate(OrmBase):
    client_version: Optional[int] = None
    name: Optional[str] = None
    interval_km: Optional[int] = None


class MaintenanceTypeOut(OrmBase):
    id: int
    name: str
    interval_km: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MaintenanceBaseConfigSet(OrmBase):
    cost_per_km: Optional[Decimal] = None


class MaintenanceBaseConfigOut(OrmBase):
    cost_per_km: Optional[Decimal] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# SAC Codes
# ---------------------------------------------------------------------------

class SacCodeBase(OrmBase):
    description: str
    code: str
    gst_rate: Optional[Decimal] = Decimal("0")
    linked_expense: Optional[str] = None
    auto_populate_invoice_type: Optional[str] = None


class SacCodeCreate(SacCodeBase):
    pass


class SacCodeUpdate(OrmBase):
    client_version: Optional[int] = None
    description: Optional[str] = None
    code: Optional[str] = None
    gst_rate: Optional[Decimal] = None
    linked_expense: Optional[str] = None
    auto_populate_invoice_type: Optional[str] = None


class SacCodeOut(SacCodeBase):
    id: int
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Customer Profitability Analytics
# ---------------------------------------------------------------------------

class CustomerProfitabilityRouteOut(BaseModel):
    route: str
    trip_count: int
    revenue: float
    expense: float
    profit: float
    margin_pct: float
    avg_km: float

    class Config:
        from_attributes = True


class CustomerProfitabilityTripOut(BaseModel):
    trip_id: str
    date: Optional[str] = None
    route: str
    revenue: float
    expense: float
    profit: float
    margin_pct: float
    km: float

    class Config:
        from_attributes = True


class CustomerProfitabilityOut(BaseModel):
    customer_id: str
    customer_name: str
    trip_count: int
    total_revenue: float
    total_expense: float
    total_profit: float
    profit_margin_pct: float
    total_km: float
    routes: list[CustomerProfitabilityRouteOut]
    recent_trips: list[CustomerProfitabilityTripOut]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardOverview(OrmBase):
    total_trucks: int
    active_trips: int
    total_drivers: int
    total_staff: int
    pending_leave_requests: int
    compliance_expired: int
    compliance_expiring_soon: int
    monthly_emi_total: Decimal
    active_recurring_payments: int


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationOut(OrmBase):
    id: int
    event_type: str
    title: str
    message: Optional[str] = None
    trip_id_str: Optional[str] = None
    booking_reference_no: Optional[str] = None
    target_roles: str
    created_by: Optional[str] = None
    created_by_role: Optional[str] = None
    is_read: bool = False
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Canaan Chat
#
# Wire schemas carry plaintext `text`; the encrypted envelope never leaves the
# server. Bodies are encrypted on write and decrypted on read in routers/chat.py.
# ---------------------------------------------------------------------------

ChatConversationKind = Literal["direct", "group"]
ChatParticipantRole = Literal["member", "admin"]

# Mirrors chat_crypto.MAX_PLAINTEXT_BYTES; enforced here too so an oversized body
# is rejected by validation with a clean 422 before any crypto work happens.
CHAT_MAX_MESSAGE_CHARS = 4000


class ChatMemberOut(OrmBase):
    """Lightweight person summary — deliberately excludes contact details and blobs."""
    staff_id: int
    name: str
    designation: Optional[str] = None
    department: Optional[str] = None
    software_designation: Optional[str] = None
    photo_url: Optional[str] = None
    role: Optional[ChatParticipantRole] = None


class ChatMessageOut(OrmBase):
    id: int
    conversation_id: int
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    text: str
    content_type: str = "text"
    media_mime: Optional[str] = None
    duration_ms: Optional[int] = None
    media_filename: Optional[str] = None
    media_size: Optional[int] = None
    # Payment notes only — the recipient's decision, if any.
    payment_status: Optional[str] = None
    payment_decided_by: Optional[int] = None
    payment_decided_by_name: Optional[str] = None
    payment_decided_at: Optional[datetime] = None
    reply_to_id: Optional[int] = None
    created_at: Optional[datetime] = None
    edited_at: Optional[datetime] = None
    deleted: bool = False


CHAT_MAX_PAYMENT_AMOUNT = Decimal("10000000")   # 1 crore — a sane ceiling for a chat note, not a real transfer
CHAT_MAX_PAYMENT_NOTE_CHARS = 200


class ChatPaymentDecision(BaseModel):
    status: Literal["approved", "rejected"]


# ---------------------------------------------------------------------------
# Payment Requests (Accounts/Admin) — the second-stage, company-wide view of
# chat payment notes a colleague has already peer-approved. Deliberately a
# narrow, separate shape from ChatMessageOut: this is the only place a payment
# note is ever visible to someone who isn't a participant in that chat, so it
# surfaces exactly the fields needed for finance processing and nothing else
# (no conversation content, no ability to read/edit/delete the underlying chat
# message — those stay behind the normal participant-only chat routes).
# ---------------------------------------------------------------------------

class PaymentRequestOut(BaseModel):
    id: int
    conversation_id: int
    amount: str
    description: str
    asked_by_id: Optional[int] = None
    asked_by_name: Optional[str] = None
    asked_at: Optional[datetime] = None
    # The peer's chat-level decision: "approved" or "rejected". A "rejected"
    # note never reaches finance — approved_by/at below is who made THIS
    # decision either way, not necessarily an approval.
    payment_status: str
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    # NULL = awaiting a finance decision (only reachable when payment_status is
    # "approved"). "approved" = Unpaid (authorized, not yet disbursed). "paid"
    # (terminal, only reachable from "approved") and "rejected" (terminal) are
    # the two end states.
    finance_status: Optional[str] = None
    finance_decided_by_id: Optional[int] = None
    finance_decided_by_name: Optional[str] = None
    finance_decided_at: Optional[datetime] = None
    # Set only once "Mark as Paid" is used — a separate, later action from
    # "Approve for Payment", often performed by a different person.
    paid_by_id: Optional[int] = None
    paid_by_name: Optional[str] = None
    paid_at: Optional[datetime] = None
    # True once a proof-of-payment photo has been attached — the photo itself
    # is fetched separately (GET /payment-requests/{id}/proof), not embedded
    # here, so the list stays lightweight.
    has_proof: bool = False


class PaymentRequestDecision(BaseModel):
    status: Literal["approved", "rejected"]


class ChatMessageCreate(BaseModel):
    """A regular text message, or a WhatsApp-Pay-style "payment" card.

    A payment message is cosmetic only — it records "₹500, for fuel" as a
    distinctly-styled chat bubble for the two people to see. No money moves,
    no bank/UPI integration is involved; it's a formatted note, not a transfer.
    """
    text: str = ""
    reply_to_id: Optional[int] = None
    content_type: Literal["text", "payment"] = "text"
    amount: Optional[Decimal] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def validate_by_type(self) -> "ChatMessageCreate":
        if self.content_type == "text":
            if not self.text or not self.text.strip():
                raise ValueError("Message cannot be empty.")
            if len(self.text) > CHAT_MAX_MESSAGE_CHARS:
                raise ValueError(f"Message is too long (limit {CHAT_MAX_MESSAGE_CHARS} characters).")
        else:  # payment
            if self.amount is None or self.amount <= 0:
                raise ValueError("Enter an amount greater than zero.")
            if self.amount > CHAT_MAX_PAYMENT_AMOUNT:
                raise ValueError(f"Amount is too large (limit ₹{CHAT_MAX_PAYMENT_AMOUNT:,}).")
            if self.note and len(self.note) > CHAT_MAX_PAYMENT_NOTE_CHARS:
                raise ValueError(f"Note is too long (limit {CHAT_MAX_PAYMENT_NOTE_CHARS} characters).")
        return self


class ChatMessageEdit(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def non_empty(cls, v: str) -> str:
        if v is None or not v.strip():
            raise ValueError("Message cannot be empty.")
        if len(v) > CHAT_MAX_MESSAGE_CHARS:
            raise ValueError(f"Message is too long (limit {CHAT_MAX_MESSAGE_CHARS} characters).")
        return v


class ChatConversationOut(OrmBase):
    id: int
    kind: ChatConversationKind
    title: Optional[str] = None                  # group name, or the peer's name for a direct thread
    peer: Optional[ChatMemberOut] = None         # direct threads only
    has_photo: bool = False                       # groups only — whether a group icon has been set
    member_count: int = 0
    unread_count: int = 0
    muted: bool = False
    my_role: ChatParticipantRole = "member"
    last_message: Optional[ChatMessageOut] = None
    last_message_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class ChatConversationDetail(ChatConversationOut):
    members: list[ChatMemberOut] = []


class ChatDirectCreate(BaseModel):
    staff_id: int


class ChatGroupCreate(BaseModel):
    title: str
    member_ids: list[int] = []

    @field_validator("title")
    @classmethod
    def valid_title(cls, v: str) -> str:
        if v is None or not v.strip():
            raise ValueError("Group name cannot be empty.")
        if len(v) > 150:
            raise ValueError("Group name is too long (limit 150 characters).")
        return v.strip()


class ChatGroupUpdate(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def valid_title(cls, v: str) -> str:
        if v is None or not v.strip():
            raise ValueError("Group name cannot be empty.")
        if len(v) > 150:
            raise ValueError("Group name is too long (limit 150 characters).")
        return v.strip()


class ChatMembersAdd(BaseModel):
    member_ids: list[int]


class ChatReadPayload(BaseModel):
    message_id: int


class ChatMutePayload(BaseModel):
    muted: bool
