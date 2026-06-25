from datetime import datetime, date
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey,
    Integer, LargeBinary, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from database import Base


# ---------------------------------------------------------------------------
# Resource Hub
# ---------------------------------------------------------------------------

class Truck(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(String(20), unique=True, nullable=False)          # CGI-T001
    branch_registered_to = Column(Enum("Chennai", "Tuticorin"))
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
    odometer_during_purchase = Column(Numeric(10, 2), default=0)
    odometer = Column(Numeric(10, 2), default=0)
    rc_date = Column(Date)
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
    photo_blob = Column(LargeBinary(length=16777215))
    rc_document_blob = Column(LargeBinary(length=16777215))
    fc_document_blob = Column(LargeBinary(length=16777215))
    road_tax_document_blob = Column(LargeBinary(length=16777215))
    insurance_document_proof_blob = Column(LargeBinary(length=16777215))
    national_permit_proof_blob = Column(LargeBinary(length=16777215))
    local_permit_proof_blob = Column(LargeBinary(length=16777215))
    pollution_certificate_blob = Column(LargeBinary(length=16777215))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    maintenance_records = relationship("MaintenanceRecord", back_populates="truck", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", back_populates="truck", cascade="all, delete-orphan")
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
    branch = Column(String(100))
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
    photo_blob = Column(LargeBinary(length=16777215))        # MEDIUMBLOB ~16 MB
    aadhaar_blob = Column(LargeBinary(length=16777215))
    license_blob = Column(LargeBinary(length=16777215))
    username = Column(String(100), unique=True)
    password_hash = Column(String(255))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

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
        Enum("Admin", "Fleet Manager", "Finance Manager", "Tyre Manager", "Staff"),
        nullable=False,
        default="Staff",
    )
    date_of_birth = Column(Date)
    date_of_joining = Column(Date)
    email = Column(String(100), unique=True)
    contact_number = Column(String(20))
    address = Column(Text)
    branch = Column(String(100))
    aadhar_file_name = Column(String(255))
    photo_url = Column(Text(length=16777215))
    photo_blob = Column(LargeBinary(length=16777215))
    aadhar_document_blob = Column(LargeBinary(length=16777215))
    username = Column(String(100), unique=True)
    password_hash = Column(String(255))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    attendance_records = relationship("StaffAttendance", back_populates="staff", cascade="all, delete-orphan")


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
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")
    photo_url = Column(Text(length=16777215))
    photo_blob = Column(LargeBinary(length=16777215))
    # Additional Fields
    is_gta = Column(Enum("Yes", "No"))
    applicable_for_e_invoice = Column(Enum("Yes", "No"))
    tds_exemption_applicable = Column(Enum("Yes", "No"))
    msme_declaration_submitted = Column(Enum("Yes", "No"))
    gst_exempted_customer = Column(Enum("Yes", "No"))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    destinations = relationship("CustomerDestination", back_populates="customer", cascade="all, delete-orphan")
    pricing = relationship("CustomerPricing", back_populates="customer", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="customer")


class CustomerDestination(Base):
    __tablename__ = "customer_destinations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    destination_name = Column(String(200), nullable=False)
    destination_state = Column(String(100))
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")

    customer = relationship("Customer", back_populates="destinations")


class CustomerPricing(Base):
    __tablename__ = "customer_pricing"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    customer_destination = Column(String(200))
    load_type = Column(Enum("IMPORT", "EXPORT", "OPEN LOAD"))
    container_type = Column(Enum("20 FEET", "40 FEET", "2 X 20 FEET", "OPEN LOAD"))
    weight_in_tons = Column(Enum("NORMAL", "Up to 20 Tons", "Between 20 - 25 Tons", "Between 25-28 Tons", "Between 28-30 Tons"))
    rate = Column(Numeric(10, 2))
    valid_from = Column(Date)
    valid_to = Column(Date)
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")

    customer = relationship("Customer", back_populates="pricing")


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
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


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
    trip_id = Column(String(20), unique=True, nullable=False)           # TRP-1050
    status = Column(
        Enum("Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded", "Completed", "Cancelled"),
        nullable=False,
        default="Assigned",
    )
    assigned_date = Column(Date)
    # Booking Information
    booking_reference_no = Column(String(50), unique=True, nullable=False)
    booking_created_date = Column(Date, nullable=False)
    trip_category = Column(Enum("LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"))
    movement_category = Column(Enum("self", "third party"))
    # Customer Information
    customer_id = Column(Integer, ForeignKey("customers.id"))
    shipper_consignee = Column(String(200))
    # Cargo Information
    cargo_classification = Column(Enum("IMPORT", "EXPORT", "EMPTY", "CFS LADEN", "OPEN LOAD", "COASTAL"))
    container_specification = Column(
        Enum("20 FT CONTAINER", "40 FT CONTAINER", "2 X 20 FEET CONTAINERS", "OPEN LOAD CARGO")
    )
    container_number = Column(String(100))
    container_number_1 = Column(String(100))
    container_number_2 = Column(String(100))
    cargo_reference = Column(String(100))
    release_order_reference = Column(String(100))
    cargo_weight = Column(Numeric(10, 2))
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
    bill_to = Column(Enum("CUSTOMER", "CONSIGNEE"))
    payment_type = Column(Enum("Credit", "Cash", "Fuel"))
    customer_cash_advance = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_amount = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_litres = Column(Numeric(10, 2), default=0)
    # Driver Compensation
    driver_advance_amount = Column(Numeric(10, 2), default=0)
    driver_advance_payment_method = Column(Enum("None", "CASH", "NEFT/IMPS/UPI", "Both"))
    driver_compensation_type = Column(Enum("Normal", "FIXED"))
    # Transport Cost
    transport_hire_amount = Column(Numeric(10, 2), default=0)
    transport_crossing_amount = Column(Numeric(10, 2), default=0)
    final_settlement_amount = Column(Numeric(10, 2), default=0)
    # Operational Notes
    internal_remarks = Column(Text)
    booking_instructions = Column(Text)
    # Workflow state
    verification_status = Column(Enum("pending", "verified", "flagged"), default="pending")
    is_invoiced = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    customer = relationship("Customer", back_populates="trips")
    closure = relationship("TripClosure", back_populates="trip", uselist=False, cascade="all, delete-orphan")
    sheet = relationship("TripSheet", back_populates="trip", uselist=False, cascade="all, delete-orphan")


class TripClosure(Base):
    __tablename__ = "trip_closures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Edit Booking Section
    booking_reference_no = Column(String(50))
    trip_category = Column(String(50))
    movement_category = Column(String(50))
    customer_name = Column(String(200))
    container_specification = Column(String(50))
    cargo_classification = Column(String(50))
    container_number = Column(String(50))
    container_number_1 = Column(String(50))
    container_number_2 = Column(String(50))
    cargo_reference = Column(String(100))
    booking_date = Column(Date)
    origin_location = Column(String(200))
    destination_location = Column(String(200))
    rate_type = Column(String(100))
    release_order_reference = Column(String(50))
    shipping_line = Column(String(100))
    vessel_name = Column(String(100))
    shipper_consignee_name = Column(String(200))

    # Transporter Details Section
    transport_method = Column(String(50))
    transporter = Column(String(200))
    trip_date = Column(Date)
    assigned_truck_details = Column(String(200))
    payment_type = Column(String(50))
    customer_advance = Column(Numeric(10, 2), default=0)
    diesel_advance = Column(Numeric(10, 2), default=0)
    driver_advance_amount = Column(Numeric(10, 2), default=0)
    driver_advance_payment_method = Column(String(50))
    bill_to = Column(String(200))

    # Transporter Price Details Section
    transport_hire_amount = Column(Numeric(10, 2), default=0)
    transport_crossing_amount = Column(Numeric(10, 2), default=0)
    transport_halt = Column(Numeric(10, 2), default=0)
    transport_unloading = Column(Numeric(10, 2), default=0)
    transport_lifting_charges = Column(Numeric(10, 2), default=0)
    transport_weighment = Column(Numeric(10, 2), default=0)
    total_transport_amount = Column(Numeric(10, 2), default=0)

    # Billing Price Details Section
    billing_hire_amount = Column(Numeric(10, 2), default=0)
    billing_halt = Column(Numeric(10, 2), default=0)
    billing_unloading = Column(Numeric(10, 2), default=0)
    billing_lifting_charges = Column(Numeric(10, 2), default=0)
    billing_weighment = Column(Numeric(10, 2), default=0)
    total_billing_amount = Column(Numeric(10, 2), default=0)

    # Trip Completion
    trip_completed_date = Column(Date)
    trip_closing_date = Column(Date)
    payment_mode = Column(Enum("Cash", "UPI", "Bank Transfer", "Cheque", "NEFT / RTGS"))

    # Trip Distance Details
    starting_odometer = Column(Numeric(10, 2), default=0)
    ending_odometer = Column(Numeric(10, 2), default=0)
    total_distance = Column(Numeric(10, 2), default=0)

    # Cargo Weight Details
    gross_weight = Column(Numeric(10, 2), default=0)
    tare_weight = Column(Numeric(10, 2), default=0)
    net_weight = Column(Numeric(10, 2), default=0)

    # Trip Fuel Details
    bunk_name = Column(String(200))
    diesel_quantity = Column(Numeric(10, 2), default=0)
    fuel_total_cost = Column(Numeric(10, 2), default=0)

    # Trip Expenses
    total_halt_days = Column(Integer, default=0)
    halt_remarks = Column(Text)
    drivers_compensation = Column(Numeric(10, 2), default=0)
    halt_compensation = Column(Numeric(10, 2), default=0)
    port_pass_expense = Column(Numeric(10, 2), default=0)
    weight_sheet_expense = Column(Numeric(10, 2), default=0)
    mamol_expense = Column(Numeric(10, 2), default=0)
    claimable_mamol_expense = Column(Numeric(10, 2), default=0)
    traffic_rto_police_expense = Column(Numeric(10, 2), default=0)
    lift_on_off_expense = Column(Numeric(10, 2), default=0)
    crane_operator_expense = Column(Numeric(10, 2), default=0)
    parking_expenses = Column(Numeric(10, 2), default=0)
    puncture_expense = Column(Numeric(10, 2), default=0)
    spare_parts_expense = Column(Numeric(10, 2), default=0)
    other_expenses = Column(Numeric(10, 2), default=0)
    toll_expenses = Column(Numeric(10, 2), default=0)

    # Halt Information (kept for backward compatibility)
    additional_driver_advance_amount = Column(Numeric(10, 2), default=0)
    company_halt_days = Column(Integer, default=0)
    party_halt_days = Column(Integer, default=0)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    trip = relationship("Trip", back_populates="closure")


class TripSheet(Base):
    __tablename__ = "trip_sheets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), unique=True, nullable=False)
    trip_sheet_no = Column(String(50))
    serial_no = Column(String(50))
    container_no = Column(String(50))
    container_type = Column(String(50))
    line = Column(String(100))
    trip_type = Column(String(50))
    vehicle_id = Column(String(20))
    date = Column(Date)
    driver_id = Column(String(20))
    from_location = Column(String(200))
    to_location = Column(String(200))
    # Hire & Driver Advance
    hire_amount = Column(Numeric(10, 2), default=0)
    driver_advance = Column(Numeric(10, 2), default=0)
    driver_advance_additional = Column(Numeric(10, 2), default=0)
    # Distance & Cargo
    mileage = Column(Numeric(10, 2), default=0)
    start_km = Column(Numeric(10, 2), default=0)
    end_km = Column(Numeric(10, 2), default=0)
    total_km = Column(Numeric(10, 2), default=0)
    cargo_weight = Column(Numeric(10, 2), default=0)
    gross_weight = Column(Numeric(10, 2), default=0)
    tare_weight = Column(Numeric(10, 2), default=0)
    net_weight = Column(Numeric(10, 2), default=0)
    # Diesel
    total_diesel = Column(Numeric(10, 2), default=0)
    diesel_rate = Column(Numeric(10, 2), default=0)
    diesel_expense = Column(Numeric(10, 2), default=0)
    diesel_mileage = Column(Numeric(10, 2), default=0)
    # Driver Settlement
    driver_pay = Column(Numeric(10, 2), default=0)
    driver_settlement_advance = Column(Numeric(10, 2), default=0)
    driver_settlement_advance_additional = Column(Numeric(10, 2), default=0)
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
    other_expenses = Column(Numeric(10, 2), default=0)
    # Totals
    trip_expenses_total = Column(Numeric(10, 2), default=0)
    driver_expenses_total = Column(Numeric(10, 2), default=0)
    total_expense = Column(Numeric(10, 2), default=0)
    # Toll
    toll_charges = Column(Numeric(10, 2), default=0)
    toll_count = Column(Integer, default=0)
    remarks = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    trip = relationship("Trip", back_populates="sheet")
    diesel_entries = relationship("TripSheetDieselEntry", back_populates="trip_sheet", cascade="all, delete-orphan")


class TripSheetDieselEntry(Base):
    __tablename__ = "trip_sheet_diesel_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_sheet_id = Column(Integer, ForeignKey("trip_sheets.id", ondelete="CASCADE"), nullable=False)
    bunk_name = Column(String(200))
    quantity = Column(Numeric(10, 2), default=0)
    price = Column(Numeric(10, 2), default=0)
    amount = Column(Numeric(10, 2), default=0)
    km = Column(Numeric(10, 2), default=0)
    bill_no = Column(String(50))

    trip_sheet = relationship("TripSheet", back_populates="diesel_entries")


# ---------------------------------------------------------------------------
# Attendance & HR
# ---------------------------------------------------------------------------

class DriverAttendance(Base):
    __tablename__ = "driver_attendance"
    __table_args__ = (UniqueConstraint("driver_id", "date", name="uq_driver_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), ForeignKey("drivers.driver_id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum("Present", "Absent", "On Leave", "Not Marked"), nullable=False, default="Not Marked")
    check_in_time = Column(String(20))
    marked_at = Column(DateTime)

    driver = relationship("Driver", back_populates="attendance_records")


class StaffAttendance(Base):
    __tablename__ = "staff_attendance"
    __table_args__ = (UniqueConstraint("staff_id", "date", name="uq_staff_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(Enum("Present", "Absent", "On Leave", "Not Marked"), nullable=False, default="Not Marked")
    check_in_time = Column(String(20))
    marked_at = Column(DateTime)
    source = Column(Enum("Web", "App"), default="Web")

    staff = relationship("Staff", back_populates="attendance_records")


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(Enum("Driver", "Fleet Manager", "Tyre Manager", "Staff"), nullable=False)
    applicant_id = Column(Integer, nullable=False)                      # driver.id or staff.id
    applicant_name = Column(String(100), nullable=False)
    applicant_code = Column(String(20))                                 # CGI-D001 / STF-1001
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(Text)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    applied_at = Column(DateTime, default=func.now())
    created_at = Column(DateTime, default=func.now())


# ---------------------------------------------------------------------------
# Maintenance & Care
# ---------------------------------------------------------------------------

class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=False)
    maintenance_type = Column(String(200), nullable=False)
    description = Column(Text)
    cost = Column(Numeric(10, 2), default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

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
    fuel_station = Column(String(200))
    logged_by = Column(String(100))
    created_at = Column(DateTime, default=func.now())

    truck = relationship("Truck", back_populates="fuel_logs")


class TyreInventory(Base):
    __tablename__ = "tyre_inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand = Column(String(100), nullable=False)
    pattern = Column(String(200))
    tyre_type = Column(String(50))
    tyre_number = Column(String(100), unique=True, nullable=False)
    size = Column(String(50))
    range_km = Column(Integer, default=0)
    cost = Column(Numeric(10, 2), default=0)
    condition = Column(Enum("New", "Rethreaded"), default="New")
    purchase_date = Column(Date)
    repair_cost = Column(Numeric(10, 2), default=0)
    retread_cost = Column(Numeric(10, 2), default=0)
    retread_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    fitment_records = relationship("TyreFitmentRecord", back_populates="tyre", cascade="all, delete-orphan")


class TyreFitmentRecord(Base):
    __tablename__ = "tyre_fitment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_id = Column(Integer, ForeignKey("tyre_inventory.id", ondelete="CASCADE"), nullable=False)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    position = Column(String(20), nullable=False)                       # "F1", "R1L", "S1" etc.
    fitted_odometer = Column(Integer, nullable=False)
    fitted_date = Column(Date, nullable=False)
    removed_odometer = Column(Integer)
    removed_date = Column(Date)
    created_at = Column(DateTime, default=func.now())

    tyre = relationship("TyreInventory", back_populates="fitment_records")
    truck = relationship("Truck", back_populates="tyre_fitments")


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
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class RecurringPayment(Base):
    __tablename__ = "recurring_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    category = Column(String(100))
    amount = Column(Numeric(10, 2), default=0)
    frequency = Column(Enum("Monthly", "Quarterly", "Yearly"), nullable=False)
    next_due_date = Column(Date)
    status = Column(Enum("Active", "Paused"), default="Active")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


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
    created_at = Column(DateTime, default=func.now())
