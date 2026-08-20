from datetime import datetime, date, timezone
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey,
    Integer, JSON, LargeBinary, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from database import Base


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------

class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    halt_day_fee_20ft = Column(Numeric(10, 2), default=0)
    halt_day_fee_40ft = Column(Numeric(10, 2), default=0)
    driver_halt_day_percentage = Column(Numeric(5, 2), default=0)
    cleaner_batta_fee = Column(Numeric(10, 2), default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Resource Hub
# ---------------------------------------------------------------------------

class Truck(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(String(20), unique=True, nullable=False)          # CGI-T001
    branch_registered_to = Column(String(200))
    registration_number = Column(String(30), unique=True, nullable=False)
    manufacturer = Column(String(100), nullable=False)
    model_name = Column(String(100), nullable=False)
    truck_type = Column(
        Enum("20 FT RIGID", "20 FT ARTICULATED", "40 FT RIGID", "40 FT ARTICULATED"),
        nullable=False,
    )
    truck_photos_file_name = Column(String(255))
    chassis_number = Column(String(50))
    year_of_manufacture = Column(String(4))
    tyre_layout = Column(String(20), nullable=False)                    # "6+1", "10+1", etc.
    fuel_capacity = Column(Numeric(10, 2), default=0)
    adblue_consumption = Column(Numeric(8, 5), nullable=True)
    odometer_during_purchase = Column(Numeric(10, 2), default=0)
    odometer = Column(Numeric(10, 2), default=0)
    rc_date = Column(Date)
    rc_validity_date = Column(Date)
    rc_expenses = Column(Numeric(12, 2))
    rc_document_url = Column(String(500))
    fc_date = Column(Date)
    fc_expiry_date = Column(Date)
    fc_document_file_name = Column(String(255))
    fc_expenses = Column(Numeric(12, 2))
    road_tax_date = Column(Date)
    road_tax_number = Column(String(50))
    road_tax_document_file_name = Column(String(255))
    road_tax_expenses = Column(Numeric(12, 2))
    insurance_expiry_date = Column(Date)
    insurance_expenses = Column(Numeric(12, 2))
    insurance_document_proof_file_name = Column(String(255))
    national_permit_number = Column(String(50))
    national_permit_date = Column(Date)
    national_permit_proof_file_name = Column(String(255))
    national_permit_expenses = Column(Numeric(12, 2))
    local_permit_number = Column(String(50))
    local_permit_date = Column(Date)
    local_permit_proof_file_name = Column(String(255))
    local_permit_expenses = Column(Numeric(12, 2))
    pollution_certificate_date = Column(Date)
    pollution_certificate_number = Column(String(50))
    pollution_certificate_proof_file_name = Column(String(255))
    pollution_certificate_expenses = Column(Numeric(12, 2))
    # BLOB storage for photos and compliance documents
    photo_blob = Column(LargeBinary(length=26214400))
    rc_document_blob = Column(LargeBinary(length=26214400))
    fc_document_blob = Column(LargeBinary(length=26214400))
    road_tax_document_blob = Column(LargeBinary(length=26214400))
    insurance_document_proof_blob = Column(LargeBinary(length=26214400))
    national_permit_proof_blob = Column(LargeBinary(length=26214400))
    local_permit_proof_blob = Column(LargeBinary(length=26214400))
    pollution_certificate_blob = Column(LargeBinary(length=26214400))
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    maintenance_records = relationship("MaintenanceRecord", back_populates="truck", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", back_populates="truck", cascade="all, delete-orphan")
    adblue_logs = relationship("AdBlueLog", back_populates="truck", cascade="all, delete-orphan")
    tyre_fitments = relationship("TyreFitmentRecord", back_populates="truck", cascade="all, delete-orphan")


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), unique=True, nullable=False)         # CGI-D001
    name = Column(String(100), nullable=False)
    aadhaar_number = Column(String(20))
    aadhaar_file_name = Column(String(255))
    date_of_birth = Column(Date)
    date_of_joining = Column(Date)
    email = Column(String(100), unique=True)
    contact_number = Column(String(20))
    address = Column(Text)
    license_number = Column(String(50))
    license_expiry_date = Column(Date)
    license_file_name = Column(String(255))
    form_11 = Column(Enum("Yes", "No"))
    esi_number = Column(String(50))
    pan_number = Column(String(50))
    agreement_signed = Column(Enum("Yes", "No"))
    bank_name = Column(String(100))
    bank_branch_name = Column(String(100))
    account_number = Column(String(50))
    ifsc_code = Column(String(20))
    photo_url = Column(Text(length=16777215))
    photo_blob = Column(LargeBinary(length=26214400))        # LONGBLOB — app-capped at 25 MB
    aadhaar_blob = Column(LargeBinary(length=26214400))
    license_blob = Column(LargeBinary(length=26214400))
    username = Column(String(100), unique=True)
    password_hash = Column(String(255))
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assignment = relationship("DriverAssignment", back_populates="driver", uselist=False, cascade="all, delete-orphan")
    attendance_records = relationship("DriverAttendance", back_populates="driver", cascade="all, delete-orphan")
    compensation_transactions = relationship(
        "CompensationTransaction",
        primaryjoin="and_(CompensationTransaction.person_type=='driver', foreign(CompensationTransaction.person_id)==Driver.id)",
        cascade="all, delete-orphan",
    )


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(String(20), unique=True, nullable=False)          # STF-1001
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    designation = Column(String(100))
    software_designation = Column(
        Enum("Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor"),
        nullable=False,
        default="Trip Sheet Register",
    )
    date_of_birth = Column(Date)
    date_of_joining = Column(Date)
    email = Column(String(100), unique=True)
    contact_number = Column(String(20))
    address = Column(Text)
    branch = Column(String(100))
    aadhar_number = Column(String(20))
    aadhar_file_name = Column(String(255))
    photo_url = Column(Text(length=16777215))
    photo_blob = Column(LargeBinary(length=26214400))
    aadhar_document_blob = Column(LargeBinary(length=26214400))
    username = Column(String(100), unique=True)
    password_hash = Column(String(255))
    device_hash = Column(String(1024), nullable=True, default=None)  # comma-separated SHA-256(s) of bound devices; NULL = unbound
    token_version = Column(Integer, default=0, nullable=False, server_default="0")  # bump to invalidate all of this user's JWTs (force logout)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    attendance_records = relationship("StaffAttendance", back_populates="staff", cascade="all, delete-orphan")

    @property
    def device_bound(self) -> bool:
        """True when this account is locked to a device (has a stored device_hash)."""
        return bool(self.device_hash)

    @property
    def devices(self) -> list:
        """Bound devices for display: id (hash), kind label, and bind date."""
        from security import parse_devices
        kinds = {"web": "Web browser", "mobile": "Mobile app"}
        out = []
        for idx, d in enumerate(parse_devices(self.device_hash), start=1):
            kind = d.get("kind") or "unknown"
            os_name = d.get("os")
            base = kinds.get(kind, f"Device {idx}")
            out.append({
                "id": d["h"],
                "kind": kind,
                "os": os_name,
                "label": f"{os_name} · {base}" if os_name else base,
                "bound_at": d.get("at"),
            })
        return out


class AppSetting(Base):
    """Runtime-editable key/value settings (Admin-managed from the UI).

    Overrides the corresponding .env default when a row is present; if no row
    exists the .env value is used. Currently backs the device-lock controls
    (enabled flag + admin device limit)."""
    __tablename__ = "app_settings"

    key = Column(String(64), primary_key=True)
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    gstin = Column(String(20), unique=True)
    contact_personnel_name = Column(String(100))
    phone = Column(String(20))
    email = Column(String(100))
    address = Column(Text)
    customer_type = Column(Enum("Transports", "Shipping"))
    photo_url = Column(Text(length=16777215))
    photo_blob = Column(LargeBinary(length=26214400))
    is_gta = Column(Enum("Yes", "No"))
    applicable_for_e_invoice = Column(Enum("Yes", "No"))
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    destinations = relationship("CustomerDestination", back_populates="customer", cascade="all, delete-orphan")
    origins = relationship("CustomerOrigin", back_populates="customer", cascade="all, delete-orphan")
    pricing = relationship("CustomerPricing", back_populates="customer", cascade="all, delete-orphan")
    final_pricing = relationship("FinalCustomerPricing", back_populates="customer", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="customer")


class CustomerOrigin(Base):
    __tablename__ = "customer_origins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    origin_name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="origins")


class CustomerDestination(Base):
    __tablename__ = "customer_destinations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    destination_name = Column(String(200), nullable=True)
    destination_state = Column(String(100))
    destination_address = Column(String(500))
    origin_state = Column(String(100), nullable=True)
    origin_address = Column(String(500), nullable=True)
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")
    approx_distance_km = Column(Numeric(8, 2), nullable=True)

    customer = relationship("Customer", back_populates="destinations")


class CustomerPricing(Base):
    __tablename__ = "customer_pricing"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    customer_destination = Column(String(200))
    cargo_classification = Column(Enum("IMPORT", "EXPORT", "CFS LADEN", "EMPTY", "OPEN LOAD", "COASTAL"))
    container_type = Column(Enum("20 FEET", "40 FEET", "2 X 20 FEET", "OPEN LOAD"))
    weight_in_tons = Column(Enum("NORMAL", "Up to 20 Tons", "Between 20 - 25 Tons", "Between 25-28 Tons", "Between 28-30 Tons"))
    rate = Column(Numeric(10, 2))
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")

    customer = relationship("Customer", back_populates="pricing")


class FinalCustomerPricing(Base):
    __tablename__ = "final_customer_pricing"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    actual_hire_amount = Column(Numeric(10, 2), nullable=True)
    accounts_hire_amount = Column(Numeric(10, 2), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="final_pricing")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    category = Column(String(100))
    contact_number = Column(String(20))
    gstin = Column(String(20))
    pan = Column(String(20))
    email = Column(String(100))
    address = Column(Text)
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Trip & Driver Management
# ---------------------------------------------------------------------------

class DriverAssignment(Base):
    __tablename__ = "driver_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), ForeignKey("drivers.driver_id", ondelete="CASCADE"), unique=True, nullable=False)
    vehicle_id = Column(String(20), nullable=False)                     # truck_id string e.g. CGI-T001

    driver = relationship("Driver", back_populates="assignment")


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String(100), unique=True, nullable=False)          # TRP-1050
    status = Column(
        Enum("Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded", "Completed", "Cancelled"),
        nullable=False,
        default="Assigned",
    )
    assigned_date = Column(Date)
    # Booking Information
    booking_reference_no = Column(String(50), unique=True, nullable=False)
    booking_created_date = Column(Date, nullable=False)
    trip_category = Column(Enum("LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING", "RETURN TRIP"))
    movement_category = Column(Enum("Own Fleet", "Third-Party Transporter"))
    # Customer Information
    customer_id = Column(Integer, ForeignKey("customers.id"))
    shipper_consignee = Column(String(200))
    # Cargo Information
    cargo_classification = Column(Enum("IMPORT", "EXPORT", "EMPTY", "CFS LADEN", "OPEN LOAD", "COASTAL", "RETURN TRIP"))
    container_specification = Column(
        Enum("20 FT CONTAINER", "40 FT CONTAINER", "2 X 20 FEET CONTAINERS", "OPEN LOAD CARGO")
    )
    container_number = Column(String(11))   # format: 4 letters + 7 digits (e.g. TWCU2081370)
    container_number_1 = Column(String(11))
    container_number_2 = Column(String(11))
    cargo_reference = Column(String(100))
    release_order_reference = Column(String(100))
    cargo_weight = Column(String(100))
    # Route Information
    origin = Column(String(200))
    destination = Column(String(200))
    # Shipping Information
    shipping_line = Column(String(200))
    vessel_name = Column(String(200))
    # Vehicle & Assignment
    transport_method = Column(Enum("Own Fleet", "Third-Party Transporter"))
    scheduled_date = Column(Date)
    driver_id = Column(String(20))                                      # ref drivers.driver_id
    vehicle_id = Column(String(20))                                     # ref trucks.truck_id
    # Payment & Advances
    bill_to = Column(Enum("CUSTOMER", "CONSIGNEE", "SELF/CGI"))
    payment_type = Column(Enum("Credit", "Cash", "Fuel"))
    customer_cash_advance = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_amount = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_litres = Column(Numeric(10, 2), default=0)
    # Driver Compensation
    driver_advance_amount = Column(Numeric(10, 2), default=0)
    driver_advance_payment_method = Column(Enum("None", "CASH", "NEFT/IMPS/UPI", "Both"))
    driver_advance = Column(Numeric(10, 2), nullable=True)
    initial_disbursed_advance = Column(Numeric(10, 2), nullable=True)
    driver_compensation_type = Column(Enum("Normal", "FIXED"))
    # Transport Cost
    open_load_hire_type = Column(Enum("Ton Based", "Fixed"), nullable=True)
    rate_per_ton = Column(Numeric(10, 2), nullable=True)
    transport_hire_amount = Column(Numeric(10, 2), default=0)
    transport_crossing_amount = Column(Numeric(10, 2), default=0)
    # Commercial Manager inputs at assignment
    approx_km = Column(Numeric(10, 2), nullable=True)
    approx_trip_distance = Column(Numeric(8, 2), nullable=True)
    lift_on_amount = Column(Numeric(10, 2), nullable=True)
    lift_on_remarks = Column(Text, nullable=True)
    cha_name = Column(String(200), nullable=True)
    # Docs staff flagging
    flagged_for_recheck = Column(Boolean, default=False, nullable=False)
    flagged_remark = Column(Text, nullable=True)
    # Yard Supervisor: advance paid to driver verification
    advance_verified = Column(Boolean, nullable=True)
    advance_verification_remark = Column(Text, nullable=True)
    advance_corrected_amount = Column(Numeric(10, 2), nullable=True)
    # Operational Notes
    internal_remarks = Column(Text)
    driver_change_remark = Column(Text)
    driver_name = Column(String(200), nullable=True)
    booking_instructions = Column(Text)
    # Workflow state
    verification_status = Column(Enum("pending", "verified", "flagged", "rejected"), default="pending")
    verification_rejection_reason = Column(Text, nullable=True)
    is_invoiced = Column(Boolean, default=False)
    invoice_required = Column(Boolean, default=True, nullable=False)
    invoice_waived = Column(Boolean, default=False, nullable=False, server_default="0")
    trip_sheet_collected = Column(Boolean, default=False, nullable=False)
    trip_sheet_collected_at = Column(DateTime, nullable=True)
    trip_sheet_received = Column(Boolean, default=False, nullable=False)
    trip_sheet_received_at = Column(DateTime, nullable=True)
    # Lorry Receipt / Consignment Note
    lr_consignor = Column(Text, nullable=True)
    lr_consignee = Column(Text, nullable=True)
    lr_ref_no = Column(String(100), nullable=True)
    lr_description_of_goods = Column(Text, nullable=True)
    lr_invoice_no = Column(String(100), nullable=True)
    lr_sb_be_no = Column(String(100), nullable=True)
    lr_seal_no_packages = Column(String(100), nullable=True)
    lr_tare = Column(String(50), nullable=True)
    lr_weight = Column(String(50), nullable=True)
    lr_value = Column(String(100), nullable=True)
    lr_to_pay = Column(Boolean, default=False, nullable=True)
    lr_to_be_billed = Column(Boolean, default=False, nullable=True)
    lr_saved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="trips")
    closure = relationship("TripClosure", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    sheet = relationship("TripSheet", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    invoice = relationship("TripInvoice", back_populates="trip", uselist=False, cascade="all, delete-orphan")


class TripClosure(Base):
    __tablename__ = "trip_closures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)
    version = Column(Integer, default=1, nullable=False)

    # 1. Shipment Information
    booking_no = Column(String(50))
    container_no = Column(String(100))
    release_order_no = Column(String(100))
    container_type = Column(String(100))
    line = Column(String(200))
    load_type = Column(String(100))
    movement_category = Column(Enum("Own Fleet", "Third-Party Transporter"))

    # 2. Assignment
    vehicle_id = Column(String(20))
    driver_id = Column(String(20))
    assignment_date = Column(Date)

    # 3. Route
    from_location = Column(String(200))
    to_location = Column(String(200))
    trip_completed_date = Column(Date)

    # 4. Billing
    hire_amount = Column(Numeric(10, 2), default=0)
    transport_amount = Column(Numeric(10, 2), default=0)
    billing_amount = Column(Numeric(10, 2), default=0)
    advance_amount = Column(Numeric(10, 2), default=0)
    driver_advance = Column(Numeric(10, 2), nullable=True)
    additional_driver_advance = Column(Numeric(10, 2), nullable=True)
    payment_mode = Column(Enum("Cash", "UPI", "Bank Transfer", "Cheque", "NEFT / RTGS"))
    bill_to = Column(Enum("CUSTOMER", "CONSIGNEE", "SELF/CGI"))

    # 5. Halt Information
    company_halt_days = Column(Integer, default=0)
    party_halt_days = Column(Integer, default=0)
    halt_remarks = Column(Text)
    driver_halt_compensation = Column(Numeric(10, 2), default=0)
    closure_remarks = Column(Text)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    trip = relationship("Trip", back_populates="closure")


class TripSheet(Base):
    __tablename__ = "trip_sheets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    # Trip Information
    trip_sheet_no = Column(String(50))
    booking_reference_no = Column(String(100))
    container_number = Column(String(100))
    container_number_1 = Column(String(100))
    container_number_2 = Column(String(100))
    container_type = Column(String(100))
    line = Column(String(200))
    trip_type = Column(String(100))
    vehicle_id = Column(String(20))
    driver_id = Column(String(20))
    booking_date = Column(Date)
    trip_scheduled_date = Column(Date)
    trip_completed_date = Column(Date)
    trip_closed_date = Column(Date)
    trip_sheet_date = Column(Date)
    # Route
    from_location = Column(String(200))
    to_location = Column(String(200))
    clearing_agent = Column(String(200))
    # Hire
    hire_amount = Column(Numeric(10, 2), default=0)
    open_load_hire_type = Column(Enum("Ton Based", "Fixed"), nullable=True)
    rate_per_ton = Column(Numeric(10, 2), nullable=True)
    # Distance & Cargo
    start_km = Column(Numeric(10, 2), default=0)
    end_km = Column(Numeric(10, 2), default=0)
    total_km = Column(Numeric(10, 2), default=0)
    cargo_weight = Column(Numeric(10, 2), default=0)
    # Driver Settlement
    driver_compensation_type = Column(String(50), nullable=True)
    driver_pay = Column(Numeric(10, 2), default=0)
    driver_advance = Column(Numeric(10, 2), nullable=True)
    additional_driver_advance = Column(Numeric(10, 2), nullable=True)
    driver_advance_amount = Column(Numeric(10, 2), default=0)
    driver_balance = Column(Numeric(10, 2), default=0)
    # Expenses
    total_halt_days = Column(Integer, default=0)
    halt_remarks = Column(Text)
    halt_pay = Column(Numeric(10, 2), default=0)
    port_pass_expense = Column(Numeric(10, 2), default=0)
    weight_sheet_expense = Column(Numeric(10, 2), default=0)
    mamol_expense = Column(Numeric(10, 2), default=0)
    claimable_mamol_expense = Column(Numeric(10, 2), default=0)
    traffic_rto_expense = Column(Numeric(10, 2), default=0)
    lift_on_off_expense = Column(Numeric(10, 2), default=0)
    crane_operator_expense = Column(Numeric(10, 2), default=0)
    parking_expense = Column(Numeric(10, 2), default=0)
    puncture_expense = Column(Numeric(10, 2), default=0)
    spare_parts_expense = Column(Numeric(10, 2), default=0)
    major_repairs = Column(JSON, nullable=True)
    other_expenses = Column(Numeric(10, 2), default=0)
    # Totals
    trip_expenses_total = Column(Numeric(10, 2), default=0)
    driver_expenses_total = Column(Numeric(10, 2), default=0)
    total_expense = Column(Numeric(10, 2), default=0)
    fuel_cost_approx = Column(Numeric(10, 2), default=0)
    # Diesel entry (Docs staff) — syncs to FuelLog on save
    diesel_litres = Column(Numeric(10, 2), nullable=True)
    diesel_rate = Column(Numeric(10, 2), nullable=True)
    diesel_total = Column(Numeric(10, 2), nullable=True)
    diesel_remarks = Column(Text, nullable=True)
    diesel_entries = Column(JSON, nullable=True)  # [{date, odometer, litres, costPerLitre, totalCost, fuelStation}]
    km_variance_remark = Column(Text, nullable=True)
    # Toll
    toll_charges = Column(Numeric(10, 2), default=0)
    toll_count = Column(Integer, default=0)
    remarks = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    trip = relationship("Trip", back_populates="sheet")


class TripInvoice(Base):
    __tablename__ = "trip_invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    invoice_no = Column(String(100))
    invoice_date = Column(Date)
    invoice_type = Column(String(50))
    bill_to = Column(String(255))
    gst_number = Column(String(50))
    mode_of_shipment = Column(String(100))
    container_type = Column(String(100))
    cfs = Column(String(100))
    shipping_line = Column(String(100))
    vessel_name = Column(String(200))
    origin = Column(String(255))
    destination = Column(String(255))
    container_no = Column(String(255))
    consignee = Column(String(255))
    services = Column(JSON, nullable=True)
    bank_name = Column(String(100))
    branch_name = Column(String(100))
    account_number = Column(String(50))
    ifsc_code = Column(String(20))
    contact_person = Column(String(100))
    email = Column(String(100))
    contact = Column(String(50))
    narration = Column(Text)
    gst_applicable = Column(Enum("Yes", "No"), default="No")
    igst_applicable = Column(Enum("Yes", "No"), default="No")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    trip = relationship("Trip", back_populates="invoice")


# ---------------------------------------------------------------------------
# Attendance & HR
# ---------------------------------------------------------------------------

class DriverAttendance(Base):
    __tablename__ = "driver_attendance"
    __table_args__ = (UniqueConstraint("driver_id", "date", name="uq_driver_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum("Present", "Absent", "On Leave", "Not Marked", "On Trip", "On Halt", "Leave", "On Workshop"), nullable=False, default="Not Marked")
    check_in_time = Column(String(20))
    marked_at = Column(DateTime)

    driver = relationship("Driver", back_populates="attendance_records")


class DriverAttendanceRemark(Base):
    __tablename__ = "driver_attendance_remarks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    remark = Column(String(1000), nullable=False)
    is_late_entry = Column(Boolean, default=False, nullable=False, server_default="0")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DriverAttendanceLateEntryLog(Base):
    """One record per date — stores the reason a non-admin submitted attendance past the 2-day lock.
    Presence of this record also serves as the backend bypass key for that date."""
    __tablename__ = "driver_attendance_late_entry_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    remark = Column(String(1000), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class StaffAttendance(Base):
    __tablename__ = "staff_attendance"
    __table_args__ = (UniqueConstraint("staff_id", "date", name="uq_staff_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum("Present", "Absent", "On Leave", "Not Marked"), nullable=False, default="Not Marked")
    check_in_time = Column(String(20))
    check_out_time = Column(String(20))
    marked_at = Column(DateTime)
    source = Column(Enum("Web", "App"), default="Web")
    admin_override = Column(Boolean, default=False, nullable=False)

    staff = relationship("Staff", back_populates="attendance_records")


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(Enum("Driver", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor"), nullable=False)
    applicant_id = Column(Integer, nullable=False)                      # driver.id or staff.id
    applicant_name = Column(String(100), nullable=False)
    applicant_code = Column(String(20))                                 # CGI-D001 / STF-1001
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(Text)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    applied_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Holiday(Base):
    """Non-working calendar dates for STAFF attendance (government/company holidays).
    Sundays are treated as holidays automatically and are NOT stored here."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    type = Column(Enum("Government", "Company"), nullable=False, default="Government")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Maintenance & Care
# ---------------------------------------------------------------------------

class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=False)
    maintenance_type = Column(String(200), nullable=False)
    description = Column(Text)
    cost = Column(Numeric(10, 2), default=0)
    entered_by_name = Column(String(100), nullable=True)
    source = Column(String(200), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    truck = relationship("Truck", back_populates="maintenance_records")


class FuelLog(Base):
    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=False)
    litres = Column(Numeric(10, 2), nullable=False)
    price_per_litre = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(10, 2), nullable=False)
    distance = Column(Numeric(10, 2), default=0)
    mileage = Column(Numeric(10, 2), default=0)
    fuel_station = Column(String(200))
    logged_by = Column(String(100))
    entered_by_name = Column(String(100), nullable=True)
    source = Column(String(200), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    truck = relationship("Truck", back_populates="fuel_logs")


class FuelBaseConfig(Base):
    __tablename__ = "fuel_base_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cost_per_litre = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AdBlueLog(Base):
    __tablename__ = "adblue_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=False)
    litres = Column(Numeric(10, 2), nullable=False)
    price_per_litre = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(10, 2), nullable=False)
    supplier = Column(String(200), nullable=True)
    remarks = Column(Text, nullable=True)
    entered_by_name = Column(String(100), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    truck = relationship("Truck", back_populates="adblue_logs")


class AdBlueManufacturer(Base):
    __tablename__ = "adblue_manufacturers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    default_price_per_litre = Column(Numeric(10, 2), default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreInventory(Base):
    __tablename__ = "tyre_inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand = Column(String(100), nullable=False)
    tyre_type = Column(String(50))
    tyre_number = Column(String(100), unique=True, nullable=False)
    size = Column(String(50))
    range_km = Column(Integer, default=0)
    cost = Column(Numeric(10, 2), default=0)
    cost_per_km = Column(Numeric(10, 6), nullable=True)
    purchase_date = Column(Date)
    retread_cost = Column(Numeric(10, 2), default=0)
    retread_count = Column(Integer, default=0)
    condition = Column(String(50), nullable=True, default="New")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    fitment_records = relationship("TyreFitmentRecord", back_populates="tyre", cascade="all, delete-orphan")


class TyreFitmentRecord(Base):
    __tablename__ = "tyre_fitment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_id = Column(Integer, ForeignKey("tyre_inventory.id", ondelete="CASCADE"), nullable=False)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    position = Column(String(60), nullable=False)
    fitted_odometer = Column(Integer, nullable=False)
    fitted_date = Column(Date, nullable=False)
    removed_odometer = Column(Integer)
    removed_date = Column(Date)
    removal_remark = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tyre = relationship("TyreInventory", back_populates="fitment_records")
    truck = relationship("Truck", back_populates="tyre_fitments")


# ---------------------------------------------------------------------------
# Repair Types
# ---------------------------------------------------------------------------

class SacCode(Base):
    __tablename__ = "sac_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    description = Column(String(500), nullable=False)
    code = Column(String(20), nullable=False)
    gst_rate = Column(Numeric(5, 2), default=0)
    linked_expense = Column(String(200), nullable=True)
    auto_populate_invoice_type = Column(String(50), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TripExpenseRate(Base):
    __tablename__ = "trip_expense_rates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)  # e.g. "Standard Rates"
    # Section 1 — Port & Operational Charges
    port_pass_expense = Column(Numeric(10, 2), default=0)
    port_pass_expense_auto = Column(Boolean, default=False, nullable=False)
    weight_sheet_expense = Column(Numeric(10, 2), default=0)
    weight_sheet_expense_auto = Column(Boolean, default=False, nullable=False)
    mamol_expense = Column(Numeric(10, 2), default=0)
    mamol_expense_auto = Column(Boolean, default=False, nullable=False)
    claimable_mamol_expense = Column(Numeric(10, 2), default=0)
    claimable_mamol_expense_auto = Column(Boolean, default=False, nullable=False)
    # Section 2 — Government & Compliance
    traffic_rto_expense = Column(Numeric(10, 2), default=0)
    traffic_rto_expense_auto = Column(Boolean, default=False, nullable=False)
    # Section 3 — Loading & Handling
    lift_on_off_expense = Column(Numeric(10, 2), default=0)
    lift_on_off_expense_auto = Column(Boolean, default=False, nullable=False)
    crane_operator_expense = Column(Numeric(10, 2), default=0)
    crane_operator_expense_auto = Column(Boolean, default=False, nullable=False)
    parking_expense = Column(Numeric(10, 2), default=0)
    parking_expense_auto = Column(Boolean, default=False, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RepairType(Base):
    __tablename__ = "repair_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    default_cost = Column(Numeric(10, 2), default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MaintenanceType(Base):
    __tablename__ = "maintenance_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    interval_km = Column(Integer, nullable=False, default=5000)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MaintenanceBaseConfig(Base):
    __tablename__ = "maintenance_base_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cost_per_km = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Finance Hub
# ---------------------------------------------------------------------------

class EmiRecord(Base):
    __tablename__ = "emi_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    emi_name = Column(String(200), nullable=False)
    truck_registration = Column(String(30))
    loan_number = Column(String(100))
    bank_name = Column(String(200))
    loan_amount = Column(Numeric(12, 2), default=0)
    emi_start_date = Column(Date)
    emi_end_date = Column(Date)
    emi_amount = Column(Numeric(10, 2), default=0)
    tenure_months = Column(Integer)
    emi_payment_date = Column(Date)
    cost_per_month = Column(Numeric(10, 2), default=0)
    monthly_finance_cost = Column(Numeric(10, 2), default=0, server_default="0")
    daily_finance_cost = Column(Numeric(10, 4), default=0, server_default="0")
    emi_cost_per_km = Column(Numeric(10, 6), default=0, server_default="0")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TruckRunConfig(Base):
    __tablename__ = "truck_run_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False, unique=True)
    km_per_month = Column(Numeric(10, 2), nullable=True)
    km_per_day = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreLayoutCostConfig(Base):
    __tablename__ = "tyre_layout_cost_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False, unique=True)
    cost = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ComplianceUpdateHistory(Base):
    __tablename__ = "compliance_update_history"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    truck_id        = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    document_type   = Column(String(100), nullable=False)
    updated_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_by_name = Column(String(200), nullable=False, default="")


class ComplianceCostConfig(Base):
    __tablename__ = "compliance_cost_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False, unique=True)
    rc_cost = Column(Numeric(12, 2), nullable=True)
    fc_cost = Column(Numeric(12, 2), nullable=True)
    road_tax_cost = Column(Numeric(12, 2), nullable=True)
    national_permit_cost = Column(Numeric(12, 2), nullable=True)
    local_permit_cost = Column(Numeric(12, 2), nullable=True)
    pollution_cert_cost = Column(Numeric(12, 2), nullable=True)
    insurance_cost = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreRangeConfig(Base):
    __tablename__ = "tyre_range_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_type = Column(String(50), nullable=False, unique=True)
    range_km = Column(Integer, nullable=True)
    base_tyre_cost = Column(Numeric(12, 2), nullable=True)
    base_cost_per_km = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreLayoutTypeConfig(Base):
    __tablename__ = "tyre_layout_type_configs"
    __table_args__ = (UniqueConstraint("tyre_layout", "tyre_type", name="uq_layout_type"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False)
    tyre_type = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RecurringPayment(Base):
    __tablename__ = "recurring_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    category = Column(String(100))
    amount = Column(Numeric(10, 2), default=0)
    frequency = Column(Enum("Monthly", "Quarterly", "Yearly"), nullable=False)
    next_due_date = Column(Date)
    status = Column(Enum("Active", "Paused"), default="Active")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DeletionApprovalRequest(Base):
    __tablename__ = "deletion_approval_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_type = Column(Enum("FuelLog", "MaintenanceRecord"), nullable=False)
    resource_id = Column(Integer, nullable=False)
    resource_name = Column(String(300), nullable=False)    # e.g. "Fuel Log — CGI-T001 · 2024-01-15 · 150L"
    log_details = Column(JSON, nullable=True)              # snapshot of the record at time of request
    requested_by_staff_id = Column(Integer, nullable=False)
    requested_by_name = Column(String(100), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    admin_note = Column(Text, nullable=True)
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EditApprovalRequest(Base):
    __tablename__ = "edit_approval_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_db_id = Column(Integer, nullable=False)        # staff.id (numeric)
    staff_name = Column(String(100), nullable=False)
    staff_code = Column(String(20))                      # STF-1001
    resource_type = Column(Enum("Customer", "Vendor", "BookingSheet", "TripSheet", "TripData", "Trip", "FuelLog"), nullable=False)
    resource_id = Column(Integer, nullable=False)
    resource_name = Column(String(200), nullable=False)
    action = Column(Enum("Edit", "Delete"), nullable=False)
    proposed_changes = Column(JSON, nullable=True)       # new field values for FuelLog edits
    reason = Column(Text, nullable=False)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    admin_note = Column(Text, nullable=True)
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)         # approved_at + 1 hour
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CompensationTransaction(Base):
    __tablename__ = "compensation_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    person_type = Column(Enum("driver", "staff"), nullable=False)
    person_id = Column(Integer, nullable=False)                         # driver.id or staff.id
    type = Column(Enum("Advance", "Salary"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    date = Column(Date, nullable=False)
    note = Column(Text)
    trip_number = Column(String(20))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False)        # e.g. "sheet_not_received"
    title = Column(String(200), nullable=False)
    message = Column(Text)
    trip_id_str = Column(String(30))                       # TRP-xxxx (display)
    booking_reference_no = Column(String(100))
    target_roles = Column(String(200), nullable=False)     # comma-separated, e.g. "Admin,Fleet Manager"
    created_by = Column(String(100))                       # reporter's name
    created_by_role = Column(String(50))
    is_read = Column(Boolean, default=False, nullable=False)
    # Python-side UTC default (not func.now()): the DB server clock may be in any
    # timezone, but the API serializer stamps naive datetimes as UTC — they must match.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Security audit trail (append-only). One row per security-relevant event:
# logins, failed logins, privileged actions, document access, deletes, backups.
# Never UPDATE or DELETE rows here — required for DPDP breach investigation.
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(String(60), nullable=False)             # e.g. "login.success", "file.download", "record.delete"
    outcome = Column(String(20), nullable=False, default="success")  # success | failure | denied
    actor_id = Column(Integer)                             # staff.id (null for anonymous/admin backdoor)
    actor_name = Column(String(120))
    actor_role = Column(String(50))
    resource = Column(String(120))                         # e.g. "drivers/12/aadhaar"
    ip_address = Column(String(64))
    user_agent = Column(String(300))
    detail = Column(Text)                                  # short human context (no secrets/PII values)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Running Cost Calculator — persisted state
# ---------------------------------------------------------------------------

class RunningCostConfig(Base):
    """One row per calculator mode — stores cost_per_litre for that mode."""
    __tablename__ = "running_cost_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, unique=True, default="Manual")
    cost_per_litre = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RunningCostTyreEntry(Base):
    """Per-mode, per-tyre-type cost and expected range entered in the calculator."""
    __tablename__ = "running_cost_tyre_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, default="Manual")
    tyre_type = Column(String(50), nullable=False)
    cost_per_tyre = Column(Numeric(12, 2), nullable=True)
    expected_range_km = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "tyre_type", name="uq_rcc_tyre_mode"),)


class RunningCostLayoutEntry(Base):
    """Per-mode, per-tyre-layout km/month and km/day entered in the calculator."""
    __tablename__ = "running_cost_layout_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, default="Manual")
    tyre_layout = Column(String(50), nullable=False)
    km_per_month = Column(Numeric(10, 2), nullable=True)
    km_per_day = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "tyre_layout", name="uq_rcc_layout_mode"),)


class RunningCostAdblueEntry(Base):
    """Per-mode, per-AdBlue-manufacturer price entered in the calculator."""
    __tablename__ = "running_cost_adblue_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, default="Manual")
    manufacturer_id = Column(Integer, nullable=False)
    price_per_litre = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "manufacturer_id", name="uq_rcc_adblue_mode"),)


class RunningCostTruckMetrics(Base):
    """Per-mode, per-truck calculator inputs (EMI, mileage, adblue consumption, tyre type, maintenance)."""
    __tablename__ = "running_cost_truck_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, default="Manual")
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    emi_amount = Column(Numeric(12, 2), nullable=True)
    mileage = Column(Numeric(8, 4), nullable=True)
    adblue_consume_l_per_km = Column(Numeric(10, 6), nullable=True)
    adblue_manufacturer_id = Column(Integer, nullable=True)
    adblue_per_km = Column(Numeric(10, 6), nullable=True)  # manual override; when set, L/km inputs are hidden
    tyre_type = Column(String(50), nullable=True)
    tyre_per_km = Column(Numeric(10, 6), nullable=True)  # manual override; when set, auto-calc from tyre type is ignored
    emi_per_day = Column(Numeric(10, 4), nullable=True)  # manual override; used in Basic mode
    emi_per_km  = Column(Numeric(10, 6), nullable=True)  # manual override; used in Basic mode
    maintenance_per_km = Column(Numeric(10, 6), nullable=True)
    compliance_cost_per_year = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "truck_id", name="uq_rcc_truck_mode"),)
