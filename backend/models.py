from datetime import datetime, date, timezone
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey, Index,
    Integer, JSON, LargeBinary, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import deferred, relationship
from database import Base


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------

class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    # Per-day halt pay to the driver. halt_day_fee_* = Company halt (company-
    # caused days); party_halt_fee_* = Customer halt (customer-caused days —
    # billed to the customer at the same amount).
    halt_day_fee_20ft = Column(Numeric(10, 2), default=0)
    halt_day_fee_40ft = Column(Numeric(10, 2), default=0)
    party_halt_fee_20ft = Column(Numeric(10, 2), nullable=True)
    party_halt_fee_40ft = Column(Numeric(10, 2), nullable=True)
    # The other two container types (2 X 20 FEET CONTAINERS, OPEN LOAD CARGO).
    halt_day_fee_2x20 = Column(Numeric(10, 2), nullable=True)
    halt_day_fee_open_load = Column(Numeric(10, 2), nullable=True)
    party_halt_fee_2x20 = Column(Numeric(10, 2), nullable=True)
    party_halt_fee_open_load = Column(Numeric(10, 2), nullable=True)
    driver_halt_day_percentage = Column(Numeric(5, 2), default=0)
    cleaner_batta_fee = Column(Numeric(10, 2), default=0)
    # Per day the driver is marked "On Workshop" (Driver Compensation → Workshop Batta Record).
    workshop_batta_fee = Column(Numeric(10, 2), default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class BranchEditEvent(Base):
    """Who created/edited/deleted a Branch and when. Branch is hard-deleted,
    so branch_id is a plain reference and name is snapshotted at log time."""
    __tablename__ = "branch_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    event = Column(Enum("Branch Created", "Branch Edited", "Branch Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Resource Hub
# ---------------------------------------------------------------------------

class Truck(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(String(20), unique=True, nullable=False)          # CGI-T001
    branch_registered_to = Column(String(200))
    # Set only while a "This Trip Only" branch change is in effect — the branch
    # to snap back to, and which trip's completion (invoiced/waived) triggers
    # that snap-back. Both NULL for a normal/permanent assignment. See
    # routers/trucks.py branch-change endpoint and the revert hook in
    # routers/trips.py (verify/waive-invoice/generate-invoice).
    temp_branch_original = Column(String(200), nullable=True)
    temp_branch_trip_id = Column(String(100), nullable=True)
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
    # Vehicle Images (Truck form → top section). photo_blob above is the
    # "Vehicle Identity Image" shown on the Our Fleet card. The four views are
    # deferred so the truck list never pulls their bytes.
    front_view_file_name = Column(String(255))
    rear_view_file_name = Column(String(255))
    left_view_file_name = Column(String(255))
    right_view_file_name = Column(String(255))
    front_view_blob = deferred(Column(LargeBinary(length=26214400)))
    rear_view_blob = deferred(Column(LargeBinary(length=26214400)))
    left_view_blob = deferred(Column(LargeBinary(length=26214400)))
    right_view_blob = deferred(Column(LargeBinary(length=26214400)))
    version = Column(Integer, default=1, nullable=False)
    # Soft delete — "Our Fleet" -> Delete sets this instead of removing the row,
    # so fuel/adblue/maintenance logs, tyre fitments, compliance history, and
    # branch history (all FK'd to trucks.id) keep resolving the truck instead
    # of being cascade-destroyed. See routers/trucks.py delete_truck.
    deleted_at = Column(DateTime, nullable=True)
    # How the truck left the fleet: "Sold" (Our Fleet → Sold Trucks) or
    # "Deleted" (Archive). Both also set deleted_at, so every "active trucks"
    # filter keeps working; NULL on trucks deleted before this existed (= Deleted).
    disposal_type = Column(String(10), nullable=True)
    sold_date = Column(Date, nullable=True)
    sold_odometer = Column(Integer, nullable=True)
    sold_note = Column(Text, nullable=True)
    sold_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    maintenance_records = relationship("MaintenanceRecord", back_populates="truck", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", back_populates="truck", cascade="all, delete-orphan")
    adblue_logs = relationship("AdBlueLog", back_populates="truck", cascade="all, delete-orphan")
    tyre_fitments = relationship("TyreFitmentRecord", back_populates="truck", cascade="all, delete-orphan")


class TruckEditEvent(Base):
    """Who edited a Truck record and when — same pattern as DriverEditEvent/
    StaffEditEvent. Logs the action only (not a field-level diff). Does NOT
    log the automatic odometer sync triggered by every Trip Sheet save (see
    update_truck's skip_edit_log) — only deliberate edits from "Our Fleet"
    and the Update Document dialog, plus branch reassignments."""
    __tablename__ = "truck_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Truck Created", "Truck Edited", "Truck Deleted", "Truck Restored", "Truck Sold"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    # Soft delete — "Our Drivers" -> Delete sets this instead of removing the row,
    # so trip history, attendance, and compensation/batta records (none of which
    # carry their own name snapshot) keep resolving the driver's name via this
    # row indefinitely. See routers/drivers.py delete_driver.
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    assignment = relationship("DriverAssignment", back_populates="driver", uselist=False, cascade="all, delete-orphan")
    attendance_records = relationship("DriverAttendance", back_populates="driver", cascade="all, delete-orphan")
    # No delete-orphan here (unlike the two relationships above): a driver's
    # Advance/Salary ("batta") history must never be destroyed even if some other
    # code path ever hard-deletes a Driver row directly instead of going through
    # the soft-delete endpoint.
    compensation_transactions = relationship(
        "CompensationTransaction",
        primaryjoin="and_(CompensationTransaction.person_type=='driver', foreign(CompensationTransaction.person_id)==Driver.id)",
        viewonly=True,
    )


class DriverEditEvent(Base):
    """Who edited a Driver record and when — same pattern as TripEditEvent.
    Logs the action only (not a field-level diff). The only edit surface for
    Driver fields is the "Our Drivers" page's Add/Edit Driver dialog."""
    __tablename__ = "driver_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Driver Created", "Driver Edited", "Driver Deleted", "Driver Restored"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(String(20), unique=True, nullable=False)          # STF-1001
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    designation = Column(String(100))
    software_designation = Column(
        Enum("Admin", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"),
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
    # Dedicated passport-size identity photo — distinct from photo_blob (the
    # profile/avatar picture used everywhere else in the app).
    identity_image_url = Column(Text(length=16777215))
    identity_image_blob = Column(LargeBinary(length=26214400))
    username = Column(String(100), unique=True)
    password_hash = Column(String(255))
    device_hash = Column(String(1024), nullable=True, default=None)  # comma-separated SHA-256(s) of bound devices; NULL = unbound
    token_version = Column(Integer, default=0, nullable=False, server_default="0")  # bump to invalidate all of this user's JWTs (force logout)
    version = Column(Integer, default=1, nullable=False)
    # Soft delete — "Our Staff" -> Delete sets this instead of removing the row, so
    # attendance, payment/compensation history, chat messages, and anything else
    # FK'd to staff.id keep resolving this person's name instead of being
    # cascade-destroyed or orphaned to NULL. See routers/staff.py delete_staff.
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # No delete-orphan cascade here (unlike Driver.attendance_records above):
    # attendance history must survive a staff member being hard-deleted from
    # "Our Staff", not be destroyed along with them. The DB-level FK
    # (staff_attendance.staff_id, ON DELETE SET NULL) is what actually
    # preserves the rows; an ORM cascade would delete them in Python before
    # that constraint ever got a say.
    attendance_records = relationship("StaffAttendance", back_populates="staff")

    @property
    def device_bound(self) -> bool:
        """True when this account is locked to a device (has a stored device_hash)."""
        return bool(self.device_hash)


class StaffEditEvent(Base):
    """Who edited a Staff record and when — same pattern as DriverEditEvent.
    Logs the action only (not a field-level diff). The only edit surface for
    Staff fields is the "Our Staff" page's Add/Edit Staff dialog."""
    __tablename__ = "staff_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Staff Created", "Staff Edited", "Staff Deleted", "Staff Restored"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

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
    # Soft delete — "Our Customers" -> Delete sets this instead of removing the row,
    # so origins/destinations/pricing/final-pricing (all FK'd to customers.id, with
    # ON DELETE CASCADE) and every trip billed to this customer keep resolving it
    # instead of being cascade-destroyed. See routers/customers.py delete_customer.
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    destinations = relationship("CustomerDestination", back_populates="customer", cascade="all, delete-orphan")
    origins = relationship("CustomerOrigin", back_populates="customer", cascade="all, delete-orphan")
    pricing = relationship("CustomerPricing", back_populates="customer", cascade="all, delete-orphan")
    final_pricing = relationship("FinalCustomerPricing", back_populates="customer", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="customer")


class CustomerEditEvent(Base):
    """Who edited a Customer record and when — same pattern as
    DriverEditEvent/StaffEditEvent. Logs the action only (not a field-level
    diff). Scoped to the core Customer record only (name, GSTIN, contact,
    etc.) — edits to a customer's Origins/Destinations/Pricing sub-resources
    are a separate editing surface and out of scope here."""
    __tablename__ = "customer_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Customer Created", "Customer Edited", "Customer Deleted", "Customer Restored"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    # Moved here from CustomerPricing — a destination is now 1:1 with a single
    # cargo/container/weight combo (create a separate destination row per
    # combo instead of multiple pricing rows per destination). This makes the
    # destination <-> pricing match in routers/trips.py / TripFormDialog.tsx
    # unambiguous instead of picking an arbitrary first match.
    cargo_classification = Column(Enum("IMPORT", "EXPORT", "CFS LADEN", "EMPTY", "OPEN LOAD", "COASTAL"), nullable=True)
    container_type = Column(Enum("20 FEET", "40 FEET", "2 X 20 FEET", "OPEN LOAD"), nullable=True)
    weight_in_tons = Column(Enum("NORMAL", "Up to 20 Tons", "Between 20 - 25 Tons", "Between 25-28 Tons", "Between 28-30 Tons"), nullable=True)

    customer = relationship("Customer", back_populates="destinations")


class CustomerPricing(Base):
    __tablename__ = "customer_pricing"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    # The actual match key — a specific CustomerDestination row (which carries
    # its own cargo/container/weight combo, so two routes with identical
    # destination text but different container types are distinct here).
    # Nullable only for legacy rows created before this column existed; those
    # still fall back to matching by the customer_destination text below.
    customer_destination_id = Column(Integer, ForeignKey("customer_destinations.id", ondelete="SET NULL"), nullable=True)
    # Denormalized label snapshot for display/legacy matching — kept in sync
    # with the linked destination's name/address whenever customer_destination_id
    # is set (see routers/customers.py create_pricing/update_pricing).
    customer_destination = Column(String(200))
    rate = Column(Numeric(10, 2))
    commission_amount = Column(Numeric(10, 2), nullable=True)
    status = Column(Enum("ACTIVE", "INACTIVE", "BLACKLISTED"), default="ACTIVE")

    customer = relationship("Customer", back_populates="pricing")
    destination = relationship("CustomerDestination")


class FinalCustomerPricing(Base):
    __tablename__ = "final_customer_pricing"
    __table_args__ = (
        # One final price per customer+route, keyed by the actual destination
        # row (see CustomerPricing.customer_destination_id above — same reason).
        # Nullable, so MySQL treats every legacy NULL-route row (from before
        # this column existed) as distinct rather than colliding with each other.
        UniqueConstraint("customer_id", "customer_destination_id", name="uq_final_pricing_customer_destination_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    customer_destination_id = Column(Integer, ForeignKey("customer_destinations.id", ondelete="SET NULL"), nullable=True)
    # The route (customer_destination label) this final price applies to —
    # matches CustomerPricing.customer_destination. Required for new rows;
    # nullable only so pre-existing rows created before this column existed
    # keep loading.
    customer_destination = Column(String(200), nullable=True)
    actual_hire_amount = Column(Numeric(10, 2), nullable=True)
    accounts_hire_amount = Column(Numeric(10, 2), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer = relationship("Customer", back_populates="final_pricing")
    destination = relationship("CustomerDestination")


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
    # Soft delete — "Our Vendors" -> Delete sets this instead of removing the row,
    # so any historical reference to this vendor keeps resolving it. See
    # routers/vendors.py delete_vendor.
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class VendorEditEvent(Base):
    """Who edited a Vendor record and when — same pattern as
    CustomerEditEvent/DriverEditEvent/StaffEditEvent. Logs the action only
    (not a field-level diff)."""
    __tablename__ = "vendor_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Vendor Created", "Vendor Edited", "Vendor Deleted", "Vendor Restored"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Trip & Driver Management
# ---------------------------------------------------------------------------

class DriverAssignment(Base):
    __tablename__ = "driver_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), ForeignKey("drivers.driver_id", ondelete="CASCADE"), unique=True, nullable=False)
    vehicle_id = Column(String(20), nullable=False)                     # truck_id string e.g. CGI-T001

    driver = relationship("Driver", back_populates="assignment")


class DriverAssignmentEditEvent(Base):
    __tablename__ = "driver_assignment_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), nullable=False)
    driver_name = Column(String(100), nullable=False)
    vehicle_id = Column(String(20), nullable=True)  # NULL on "Assignment Removed"
    event = Column(Enum("Driver Assigned", "Assignment Removed"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    payment_type = Column(Enum("Credit", "Cash", "Fuel", "To Be Paid"))
    customer_cash_advance = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_amount = Column(Numeric(10, 2), default=0)
    customer_fuel_advance_litres = Column(Numeric(10, 2), default=0)
    # Driver Compensation
    driver_advance_amount = Column(Numeric(10, 2), default=0)
    driver_advance_payment_method = Column(Enum("None", "CASH", "NEFT/IMPS/UPI", "Both"))
    driver_advance = Column(Numeric(10, 2), nullable=True)
    initial_disbursed_advance = Column(Numeric(10, 2), nullable=True)
    driver_compensation_type = Column(Enum("Normal", "DEFAULT", "CUSTOM"))
    # RETURN TRIP only: a return trip's driver batta is normally paid beforehand
    # (rides along with the outbound trip), so it's excluded from Net Payable by
    # default. This flag lets the Commercial Manager mark it as still owed for a
    # specific return trip, so it counts toward Net Payable after all.
    is_batta_applicable = Column(Boolean, nullable=False, default=False, server_default="0")
    # SHIFTING only: shifting trips are internal relocations and aren't billed
    # to a customer by default, so the Payment & Advances section stays locked.
    # This flag lets it be marked billable for a specific shifting trip instead
    # (e.g. a billed relocation), unlocking that section. Always true outside
    # of SHIFTING, where billing is never blocked in the first place.
    is_billing_applicable = Column(Boolean, nullable=False, default=True, server_default="1")
    # Transport Cost
    open_load_hire_type = Column(Enum("Ton Based", "Fixed"), nullable=True)
    rate_per_ton = Column(Numeric(10, 2), nullable=True)
    transport_hire_amount = Column(Numeric(10, 2), default=0)
    transport_crossing_amount = Column(Numeric(10, 2), default=0)
    # Commission owed to whoever brokered this route, fetched from the matching
    # CustomerPricing.commission_amount when a route card is selected in the trip form.
    transport_commission_amount = Column(Numeric(10, 2), nullable=True)
    # Commercial Manager inputs at assignment
    approx_km = Column(Numeric(10, 2), nullable=True)
    approx_trip_distance = Column(Numeric(8, 2), nullable=True)
    lift_on_amount = Column(Numeric(10, 2), nullable=True)
    lift_on_remarks = Column(Text, nullable=True)
    cha_name = Column(String(200), nullable=True)
    # Auditor recheck workflow (see TripRecheckEvent for the full history):
    # flagged_for_recheck=True + recheck_returned=False → "Under Review": the
    # Auditor flagged this trip's Booking Sheet / Trip Sheet data as suspect;
    # both the Flag and Verify actions are blocked for it on Driver Record
    # until someone corrects the data (via Edit Approval) and returns it.
    # flagged_for_recheck=True + recheck_returned=True → "Returned for
    # Review": corrected, waiting on the Auditor's fresh Verify/Flag decision.
    # Both False → normal, not under any review.
    flagged_for_recheck = Column(Boolean, default=False, nullable=False)
    flagged_remark = Column(Text, nullable=True)
    recheck_returned = Column(Boolean, default=False, nullable=False)
    # Set True by a Verify action (see verify_trip_recheck) — a closed,
    # terminal state: the trip stays visibly "Verified" and both the Flag and
    # Verify actions are disabled for it on Driver Record. Cleared back to
    # False the moment the trip is flagged again (a new flag supersedes a
    # past verification).
    audit_verified = Column(Boolean, default=False, nullable=False)
    # Yard Supervisor: advance paid to driver verification
    advance_verified = Column(Boolean, nullable=True)
    advance_verification_remark = Column(Text, nullable=True)
    advance_corrected_amount = Column(Numeric(10, 2), nullable=True)
    # Operational Notes
    internal_remarks = Column(Text)
    driver_change_remark = Column(Text)
    driver_name = Column(String(200), nullable=True)
    booking_instructions = Column(Text)
    # When on, Route Information's "View All CFS" / "View All Yard" reference
    # buttons are available (see lib/lane-places.ts for the lists) — the trip
    # is being routed via a known Tuticorin CFS/yard rather than picked from
    # the customer's configured Available Routes.
    use_yard_cfs = Column(Boolean, default=False, nullable=False, server_default="0")
    # When on, Origin/Destination Location in Route Information become free-text
    # instead of being locked to a selected Available Route (or the Shifting/
    # Export restricted dropdowns) — for one-off routes with no customer route
    # configured. Noted here so TripFormDialog re-opens in the same mode.
    use_custom_route = Column(Boolean, default=False, nullable=False, server_default="0")
    # Customer Information → "Use Custom Input": the customer is typed, not
    # picked from Our Customers — customer_id stays NULL and the typed name is
    # kept here. Noted so TripFormDialog re-opens in the same mode.
    use_custom_customer = Column(Boolean, default=False, nullable=False, server_default="0")
    custom_customer_name = Column(String(200), nullable=True)
    # The customer route (Our Customers → destination) this trip was booked on,
    # when picked from Available Routes. origin/destination above stay as a
    # text snapshot for documents; this id is what links the trip to the route
    # (so renames and same-named routes don't break the link). NULL for custom
    # routes, return trips, and old trips that couldn't be matched unambiguously.
    customer_destination_id = Column(Integer, ForeignKey("customer_destinations.id", ondelete="SET NULL"), nullable=True, index=True)
    # Workflow state
    verification_status = Column(Enum("pending", "verified", "flagged", "rejected"), default="pending")
    verification_rejection_reason = Column(Text, nullable=True)
    is_invoiced = Column(Boolean, default=False)
    invoice_required = Column(Boolean, default=True, nullable=False)
    invoice_waived = Column(Boolean, default=False, nullable=False, server_default="0")
    # Soft delete — set when a trip is deleted (directly by Admin, or via an approved
    # deletion request). The row and all its related data (closure/sheet/invoice) are
    # kept intact so it can be restored from the "Deleted Trips" page; a NULL row is
    # excluded from every normal trip listing. Only "Permanently Delete" on that page
    # does a real DELETE.
    deleted_at = Column(DateTime, nullable=True)
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
    driver_halt_compensation = Column(Numeric(10, 2), default=0)   # total (company + party)
    # Each part at its own branch rate. NULL on trips closed before the rates
    # were split — those are split by days (equal rate) instead.
    company_halt_pay = Column(Numeric(10, 2), nullable=True)
    party_halt_pay = Column(Numeric(10, 2), nullable=True)
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

    @property
    def party_halt_pay(self):
        """Read-only: the customer-caused (party) part of the trip's halt pay,
        from its closure — party days × (halt compensation ÷ total halt days),
        the same split the Trip Sheet makes. This is what an invoice's "Halt
        Pay" line bills the customer; halt_pay above is the company's own part
        (a trip expense, never billed)."""
        closure = self.trip.closure if self.trip is not None else None
        if closure is None:
            return None
        if closure.party_halt_pay is not None:
            return round(float(closure.party_halt_pay), 2)
        party = int(closure.party_halt_days or 0)
        total = int(closure.company_halt_days or 0) + party
        if party <= 0 or total <= 0:
            return 0.0
        return round(float(closure.driver_halt_compensation or 0) * party / total, 2)


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
    # True only for rows written by generate_combined_invoice — the source of
    # truth for "is this a combined invoice", NOT invoice_no equality (some
    # legacy rows share an old-format invoice_no by accident).
    is_combined = Column(Boolean, default=False, nullable=False, server_default="0")
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


class DriverAttendanceEditEvent(Base):
    """Driver Attendance has no actor column of its own (status is set by
    Commercial Manager/Assistant Commercial Manager on a driver's behalf), so
    unlike the other Edit History tables this is the only record of who
    actually marked or remarked a given day."""
    __tablename__ = "driver_attendance_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(20), nullable=False)
    driver_name = Column(String(100), nullable=False)
    date = Column(Date, nullable=False)
    event = Column(Enum(
        "Attendance Marked", "Attendance Updated",
        "Remark Added", "Remark Edited", "Remark Deleted",
    ), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    # SET NULL (not CASCADE) — attendance history must survive a staff member
    # being hard-deleted from "Our Staff", not vanish with them. staff_name is
    # a snapshot taken when the record was created, so "who" stays readable
    # even after staff_id goes NULL.
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    staff_name = Column(String(100), nullable=True)
    date = Column(Date, nullable=False)
    status = Column(Enum("Present", "Absent", "On Leave", "Not Marked"), nullable=False, default="Not Marked")
    check_in_time = Column(String(20))
    check_out_time = Column(String(20))
    # True when the shift was closed automatically at the working-hours limit, not by the staff member.
    auto_closed = Column(Boolean, nullable=False, default=False, server_default="0")
    marked_at = Column(DateTime)
    source = Column(Enum("Web", "App"), default="Web")
    admin_override = Column(Boolean, default=False, nullable=False)
    # Who ended this shift — "self" | "admin" | "auto" | NULL (still open).
    # Only a "self" close is the person's own deliberate "I'm done for the
    # day" — "admin" and "auto" are both guesses on their behalf, so those
    # (and only those) are resumable. See routers/attendance.py resume_shift.
    closed_by = Column(String(10), nullable=True)

    staff = relationship("Staff", back_populates="attendance_records")


class StaffAttendanceEditEvent(Base):
    """Only the Admin-override path (mark_staff_attendance/update_staff_attendance
    on the Staff Attendance page) is logged here — a self-mark/close-shift is
    always the staff member acting on their own record, so there's no "who did
    this to someone else" question to answer there."""
    __tablename__ = "staff_attendance_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, nullable=False)
    staff_name = Column(String(100), nullable=False)
    date = Column(Date, nullable=False)
    event = Column(Enum("Attendance Marked", "Attendance Updated"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(Enum("Driver", "Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"), nullable=False)
    applicant_id = Column(Integer, nullable=False)                      # driver.id or staff.id
    applicant_name = Column(String(100), nullable=False)
    applicant_code = Column(String(20))                                 # CGI-D001 / STF-1001
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(Text)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    applied_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Who filed the request (staff.id). NULL on rows created before this column
    # existed — those fall back to matching the applicant.
    submitted_by = Column(Integer, nullable=True)
    # Who decided it and when (set by Leave Approvals) — shown to the applicant as the status indicator.
    decided_at = Column(DateTime, nullable=True)
    decided_by_name = Column(String(100), nullable=True)


class Holiday(Base):
    """Non-working calendar dates for STAFF attendance (government/company holidays).
    Sundays are treated as holidays automatically and are NOT stored here."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    type = Column(Enum("Government", "Company"), nullable=False, default="Government")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class HolidayEditEvent(Base):
    __tablename__ = "holiday_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    holiday_date = Column(Date, nullable=False)
    name = Column(String(200), nullable=False)
    event = Column(Enum("Holiday Created", "Holiday Updated", "Holiday Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Maintenance & Care
# ---------------------------------------------------------------------------

class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)                      # Maintenance Start Date
    maintenance_end_date = Column(Date, nullable=True)
    odometer = Column(Integer, nullable=False)
    maintenance_type = Column(String(200), nullable=False)
    # One or more of the category's repair types, ", "-separated (a single
    # maintenance can cover several repairs). Names can't contain a comma —
    # see routers/maintenance_categories.py.
    repair_type = Column(String(1000), nullable=True)
    compliant = Column(Text, nullable=True)
    maintenance_location = Column(String(200), nullable=True)
    maintenance_by = Column(String(200), nullable=True)      # name snapshot (vendor or individual)
    # "Vendor" | "Individual" (the form's toggle). For "Vendor", vendor_id is
    # the real link — what Our Vendors → View Record lists by — while
    # maintenance_by keeps the name as it was when the record was saved.
    maintenance_by_type = Column(String(12), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    invoice_number = Column(String(100), nullable=True)      # given by the vendor / individual
    invoice_date = Column(Date, nullable=True)
    description = Column(Text)                               # Remarks
    cost = Column(Numeric(10, 2), default=0)
    entered_by_name = Column(String(100), nullable=True)
    source = Column(String(200), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # "Notify me when this is due again" — see maintenance_reminders.py.
    remind_at_odometer = Column(Integer, nullable=True)
    remind_soon_sent_at = Column(DateTime, nullable=True)
    remind_due_sent_at = Column(DateTime, nullable=True)

    truck = relationship("Truck", back_populates="maintenance_records")


class MaintenanceProof(Base):
    """"Proof of Payment" files on a maintenance record (Update Maintenance
    Record form) — up to 5 JPGs and 3 PDFs per record, see
    routers/maintenance.py. Its own table because the generic /files router
    holds exactly one file per column. Deleted with its record (FK cascade;
    maintenance records are hard-deleted)."""
    __tablename__ = "maintenance_proofs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("maintenance_records.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(8), nullable=False)          # "image" | "pdf"
    file_name = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    data = deferred(Column(LargeBinary(length=26214400), nullable=False))  # LONGBLOB; never loaded for listings
    uploaded_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_maintenance_proof_record", "record_id"),)


class MaintenanceRequest(Base):
    """A new maintenance record waiting on Maintenance Approvals (Admin or
    Accounts). Nothing reads these but that page and the truck's "Pending
    approval" list — the real MaintenanceRecord (costs, P&L, vendor records,
    reminders) is only created when the request is approved.

    Two sources: the Update Maintenance Record form ("Web", payload is the
    form) and a Trip Sheet's Major Repairs ("Trip Sheet", one request per
    repair line; line_sig lets a re-save of the sheet tell unchanged lines
    from new or edited ones — see routers/maintenance_requests.sync_trip_repairs)."""
    __tablename__ = "maintenance_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String(20), nullable=False, default="Web")      # "Web" | "Trip Sheet"
    line_sig = Column(String(64), nullable=True)                    # trip-sheet repair line fingerprint
    payload = Column(JSON, nullable=False)                          # MaintenanceRecordCreate fields
    # Pending → Approved | Rejected; Cancelled when its trip-sheet line was
    # removed or changed before anyone decided.
    status = Column(String(12), nullable=False, default="Pending", index=True)
    submitted_by_id = Column(Integer, nullable=True)                # staff id (None = staff-less admin login)
    submitted_by_name = Column(String(100), nullable=False)
    submitted_by_role = Column(String(50), nullable=True)
    decided_by_name = Column(String(100), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)
    record_id = Column(Integer, ForeignKey("maintenance_records.id", ondelete="SET NULL"), nullable=True)
    requester_seen_at = Column(DateTime, nullable=True)             # decision shown to the submitter
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MaintenanceRequestProof(Base):
    """Proof of Payment files attached to a pending request — moved onto the
    record's MaintenanceProof rows when it's approved."""
    __tablename__ = "maintenance_request_proofs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, ForeignKey("maintenance_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(8), nullable=False)          # "image" | "pdf"
    file_name = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    data = deferred(Column(LargeBinary(length=26214400), nullable=False))
    uploaded_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MaintenanceRecordEditEvent(Base):
    """Who created/edited/deleted a Maintenance Record and when — same
    pattern as the other *EditEvent tables, with one difference: a deleted
    MaintenanceRecord is hard-deleted (no soft-delete/restore here), so
    record_id is a plain reference (not an FK) and maintenance_type/
    record_date are snapshotted at log time — the only way this row stays
    meaningful once the record itself is gone. truck_id IS an FK (trucks are
    soft-deleted, so it survives) and drives the join for display."""
    __tablename__ = "maintenance_record_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    record_id = Column(Integer, nullable=False)
    maintenance_type = Column(String(200), nullable=False)
    record_date = Column(Date, nullable=True)
    event = Column(Enum("Record Created", "Record Edited", "Record Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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


class FuelLogEditEvent(Base):
    """Who created/edited/deleted a Fuel Log entry and when. FuelLog is
    hard-deleted (no soft-delete here), so log_id is a plain reference (not
    an FK) and log_date/litres are snapshotted at log time — the only way
    this row stays meaningful once the log itself is gone. truck_id IS an
    FK (trucks are soft-deleted, so it survives)."""
    __tablename__ = "fuel_log_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    log_id = Column(Integer, nullable=False)
    log_date = Column(Date, nullable=True)
    litres = Column(Numeric(10, 2), nullable=True)
    event = Column(Enum("Log Created", "Log Edited", "Log Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class FuelBaseConfig(Base):
    __tablename__ = "fuel_base_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cost_per_litre = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AdBlueLog(Base):
    """One AdBlue fill on Truck's Adblue History — a record only; it feeds no
    calculator or cost figure."""
    __tablename__ = "adblue_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    odometer = Column(Integer, nullable=False)
    litres = Column(Numeric(10, 2), nullable=False)
    price_per_litre = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(10, 2), nullable=False)
    supplier = Column(String(200), nullable=True)  # shown as "Filling Location"
    remarks = Column(Text, nullable=True)
    entered_by_name = Column(String(100), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    truck = relationship("Truck", back_populates="adblue_logs")


class AdBlueLogEditEvent(Base):
    """Who created/edited/deleted an AdBlue Log entry and when — same
    hard-delete snapshot pattern as FuelLogEditEvent."""
    __tablename__ = "adblue_log_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    log_id = Column(Integer, nullable=False)
    log_date = Column(Date, nullable=True)
    litres = Column(Numeric(10, 2), nullable=True)
    event = Column(Enum("Log Created", "Log Edited", "Log Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# Truck manufacturers (TATA, Ashok Leyland…) — the Manufacturer list on Our
# Fleet's truck form, managed from Our Fleet → Manufacturers. The table keeps
# its original "adblue" name from when it lived on the AdBlue page;
# default_price_per_litre is no longer used.
class AdBlueManufacturer(Base):
    __tablename__ = "adblue_manufacturers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    default_price_per_litre = Column(Numeric(10, 2), default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AdBlueManufacturerEditEvent(Base):
    """Who created/edited/deleted an AdBlue Manufacturer entry and when.
    AdBlueManufacturer is hard-deleted and has no parent to key off, so
    manufacturer_id is a plain reference (not an FK) and name is
    snapshotted at log time."""
    __tablename__ = "adblue_manufacturer_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manufacturer_id = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    event = Column(Enum("Manufacturer Created", "Manufacturer Edited", "Manufacturer Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    # Who supplied the tyre — same "Maintenance By" toggle as maintenance
    # records: "Vendor" links vendor_id (name snapshot in maintenance_by),
    # "Individual" is just a typed name.
    maintenance_by = Column(String(200), nullable=True)
    maintenance_by_type = Column(String(12), nullable=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    invoice_number = Column(String(100), nullable=True)   # given by the vendor / individual
    invoice_date = Column(Date, nullable=True)
    # "Proof of Payment/Invoice" — one PDF or image, 15 MB max (see
    # routers/maintenance.py). The bytes are deferred so listings never load them.
    proof_file_name = Column(String(255), nullable=True)
    proof_size_bytes = Column(Integer, nullable=True)
    proof_data = deferred(Column(LargeBinary(length=26214400), nullable=True))  # LONGBLOB
    version = Column(Integer, default=1, nullable=False)
    # Soft delete — "Tyre Inventory" -> Delete sets this instead of removing the row,
    # so it can be recovered from the "Tyre Archive" page. Same pattern as
    # Driver/Truck/Staff/Customer/Vendor.deleted_at.
    deleted_at = Column(DateTime, nullable=True)
    # "Flag for Retreading" — the tyre leaves Tyre Inventory and appears on the
    # Retread Queue page with its full record. Set once, by the flag endpoint.
    retread_flagged_at = Column(DateTime, nullable=True)
    retread_flagged_by = Column(String(100), nullable=True)
    # "Flag as Discarded" - the tyre leaves inventory and the retread queue and
    # appears on the Discarded Tyres page with the reason it was written off.
    discarded_at = Column(DateTime, nullable=True)
    discarded_by = Column(String(100), nullable=True)
    discard_reason = Column(Text, nullable=True)
    # Set when the tyre left the business with a truck that was sold or
    # deleted ("Sold with the truck" in the truck's tyre step). Such a tyre is
    # also marked discarded (so it leaves stock everywhere) but can't be
    # restored from Discarded Tyres — it's physically gone.
    sold_with_truck_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    fitment_records = relationship("TyreFitmentRecord", back_populates="tyre", cascade="all, delete-orphan")


class ActivityEvent(Base):
    """One row per saved, deleted, exported or logged-in action, plus page views and
    clicks sent by the browser. GET reads are counted in ActivityMinute instead."""
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_user_time", "user_key", "created_at"),
        Index("ix_activity_time", "created_at"),
        Index("ix_activity_name_time", "user_name", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, nullable=False)
    user_key = Column(String(64), nullable=False)
    user_name = Column(String(100), nullable=False, default="")
    user_id = Column(Integer, nullable=True)
    role = Column(String(60), nullable=True)
    kind = Column(String(16), nullable=False)
    method = Column(String(8), nullable=True)
    route = Column(String(200), nullable=False)
    label = Column(String(120), nullable=True)
    status = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    ip = Column(String(45), nullable=True)


class ActivityMinute(Base):
    """Read counts: how many times a person loaded a route in a given minute."""
    __tablename__ = "activity_minutes"
    __table_args__ = (Index("ix_activity_minute_time", "minute"),)

    user_key = Column(String(64), primary_key=True)
    route = Column(String(200), primary_key=True)
    minute = Column(DateTime, primary_key=True)
    user_name = Column(String(100), nullable=False, default="")
    count = Column(Integer, nullable=False, default=0)
    first_at = Column(DateTime, nullable=True)
    last_at = Column(DateTime, nullable=True)


class TyreRemarkPreset(Base):
    """Shared quick-pick remarks for the Manage Tyres dialog. Each scenario
    (Attachment, Removal, Swap) has its own list; the pills under the remark
    field are read from here."""
    __tablename__ = "tyre_remark_presets"
    __table_args__ = (UniqueConstraint("scenario", "text", name="uq_tyre_remark_scenario_text"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    scenario = Column(Enum("Attachment", "Removal", "Swap"), nullable=False)
    text = Column(String(200), nullable=False)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TyreMovementEvent(Base):
    """One row per move of a tyre between Tyre Inventory, the Retread Queue and
    Discarded Tyres, with the details of that move. The "View Tyre Data" dialog
    reads this to show the full movement history of a tyre."""
    __tablename__ = "tyre_movement_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_id = Column(Integer, ForeignKey("tyre_inventory.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(Enum(
        "Flagged for Retreading", "Moved to Inventory",
        "Flagged as Discarded", "Restored from Discard",
        "Sold with Truck",
    ), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    retread_cost = Column(Numeric(10, 2), nullable=True)
    expected_range = Column(Integer, nullable=True)
    retread_count = Column(Integer, nullable=True)
    # Vendor that did the retreading (picked from Our Vendors when the tyre comes back).
    retread_done_by = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TyreInventoryEditEvent(Base):
    """Who created/edited/deleted/restored a Tyre Inventory record and when —
    same pattern as the other *EditEvent tables (CustomerEditEvent etc.)."""
    __tablename__ = "tyre_inventory_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_id = Column(Integer, ForeignKey("tyre_inventory.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Tyre Created", "Tyre Edited", "Tyre Deleted", "Tyre Restored"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TyreFitmentRecord(Base):
    __tablename__ = "tyre_fitment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_id = Column(Integer, ForeignKey("tyre_inventory.id", ondelete="CASCADE"), nullable=False)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    position = Column(String(60), nullable=False)
    fitted_odometer = Column(Integer, nullable=False)
    fitted_date = Column(Date, nullable=False)
    fitted_by_name = Column(String(100), nullable=True)
    fitted_remark = Column(String(500), nullable=True)
    removed_odometer = Column(Integer)
    removed_date = Column(Date)
    removal_remark = Column(String(500), nullable=True)
    removed_by_name = Column(String(100), nullable=True)
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


class SacCodeEditEvent(Base):
    """Who created/edited/deleted a SAC Code and when. SacCode is
    hard-deleted, so sac_code_id is a plain reference and code/description
    are snapshotted at log time. Linking an expense or setting
    auto-populate also counts as "SAC Code Edited" — they modify the
    record, just through dedicated PATCH endpoints."""
    __tablename__ = "sac_code_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sac_code_id = Column(Integer, nullable=False)
    code = Column(String(20), nullable=False)
    description = Column(String(500), nullable=False)
    event = Column(Enum("SAC Code Created", "SAC Code Edited", "SAC Code Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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


class TripExpenseRateEditEvent(Base):
    __tablename__ = "trip_expense_rate_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(Enum("Trip Expense Rates Updated"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class RepairType(Base):
    __tablename__ = "repair_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    default_cost = Column(Numeric(10, 2), default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RepairTypeEditEvent(Base):
    """Who created/edited/deleted a Repair Type and when. RepairType is
    hard-deleted, so repair_type_id is a plain reference and name is
    snapshotted at log time."""
    __tablename__ = "repair_type_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repair_type_id = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    event = Column(Enum("Repair Type Created", "Repair Type Edited", "Repair Type Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class VendorCategory(Base):
    __tablename__ = "vendor_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MaintenanceCategory(Base):
    """Categories shown on the "Maintenance Management" admin page, each
    grouping several repair types underneath it. Distinct from RepairType
    (the flat list used by the "Repairs Management" page / Trip Sheet's
    "Major Repairs" quick-pick) — this is its own, separate grouping feature.
    """
    __tablename__ = "maintenance_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    repairs = relationship("MaintenanceCategoryRepair", back_populates="category", cascade="all, delete-orphan", order_by="MaintenanceCategoryRepair.name")


class MaintenanceCategoryRepair(Base):
    """A single repair type nested under a MaintenanceCategory."""
    __tablename__ = "maintenance_category_repairs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("maintenance_categories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    category = relationship("MaintenanceCategory", back_populates="repairs")

    __table_args__ = (UniqueConstraint("category_id", "name", name="uq_category_repair_name"),)


class MaintenanceCategoryEditEvent(Base):
    """Who created/edited/deleted a Maintenance Category OR a repair nested
    under one, and when — merged into one page-wide log on Maintenance
    Management. Both levels are hard-deleted (and repairs cascade-delete
    with their category), so category_id/repair_id are plain references,
    not FKs — snapshots are the only way these rows stay meaningful once
    the category/repair is gone."""
    __tablename__ = "maintenance_category_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, nullable=False)
    category_name = Column(String(200), nullable=False)
    repair_id = Column(Integer, nullable=True)  # NULL when the event is about the category itself
    repair_name = Column(String(200), nullable=True)
    event = Column(Enum(
        "Category Created", "Category Edited", "Category Deleted",
        "Repair Created", "Repair Edited", "Repair Deleted",
    ), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class CfsYardEntry(Base):
    """A known Tuticorin CFS depot or container yard — the directory behind
    TripFormDialog's "View All CFS" / "View All Yard" (seeded once from the
    lists that used to be hardcoded in lib/lane-places.ts, now Admin-editable
    ). Deletion goes through the same soft-delete +
    Archive-page restore flow as Driver/Truck/Staff/Customer/Vendor — no DB-
    level unique constraint on (kind, name) since a deleted name must be
    re-usable (see main.py's migration dropping uq_cfs_yard_kind_name)."""
    __tablename__ = "cfs_yard_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(Enum("CFS", "YARD"), nullable=False)
    name = Column(String(200), nullable=False)
    version = Column(Integer, default=1, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


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
    auto_debit_date = Column(Date)
    cost_per_month = Column(Numeric(10, 2), default=0)
    monthly_finance_cost = Column(Numeric(10, 2), default=0, server_default="0")
    daily_finance_cost = Column(Numeric(10, 4), default=0, server_default="0")
    emi_cost_per_km = Column(Numeric(10, 6), default=0, server_default="0")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class EmiRecordEditEvent(Base):
    """Who created/edited/deleted an EMI record and when. EmiRecord is
    hard-deleted (no soft-delete here) and isn't FK'd to Truck (just a free-
    text truck_registration string), so emi_id is a plain reference and
    emi_name/truck_registration are snapshotted at log time."""
    __tablename__ = "emi_record_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    emi_id = Column(Integer, nullable=False)
    emi_name = Column(String(200), nullable=False)
    truck_registration = Column(String(30), nullable=True)
    event = Column(Enum("EMI Created", "EMI Edited", "EMI Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class CompensationEditEvent(Base):
    """Who added/deleted a Driver/Staff Compensation transaction and when.
    CompensationTransaction is hard-deleted and person_id has no FK (shared
    between drivers and staff, by design — see CompensationTransaction), so
    this snapshots person_name/tx_type/amount/date at log time. No "Edited"
    event — there's no update endpoint for compensation transactions."""
    __tablename__ = "compensation_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    person_type = Column(Enum("driver", "staff"), nullable=False)
    person_id = Column(Integer, nullable=False)
    person_name = Column(String(100), nullable=True)
    tx_type = Column(Enum("Advance", "Salary"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    tx_date = Column(Date, nullable=True)
    event = Column(Enum("Transaction Added", "Transaction Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TruckRunConfig(Base):
    __tablename__ = "truck_run_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False, unique=True)
    km_per_month = Column(Numeric(10, 2), nullable=True)
    km_per_day = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TruckRunConfigEditEvent(Base):
    __tablename__ = "truck_run_config_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(Enum("Run Configuration Saved"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TyreLayoutCostConfig(Base):
    __tablename__ = "tyre_layout_cost_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False, unique=True)
    cost = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TruckComplianceRecord(Base):
    """One document a truck has held — its first entry, then one row per
    renewal — so renewing never erases the old date, cost or file (Our Fleet
    → Compliance History). The truck's own compliance columns always mirror
    the LATEST row per document.

    The latest row's file lives on the truck (trucks.<doc>_blob, as before);
    a row's own file_blob is filled when a renewal supersedes it, so the
    current file is never stored twice."""
    __tablename__ = "truck_compliance_records"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    truck_id          = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type          = Column(String(30), nullable=False)       # rc / fc / road_tax / insurance / national_permit / local_permit / pollution_cert
    kind              = Column(String(20), nullable=False)       # "First entry" / "Renewal"
    doc_number        = Column(String(50), nullable=True)
    valid_from        = Column(Date, nullable=True)
    valid_until       = Column(Date, nullable=True)
    expense           = Column(Numeric(12, 2), nullable=True)
    file_name         = Column(String(500), nullable=True)
    file_blob         = deferred(Column(LargeBinary(length=26214400), nullable=True))
    created_by_name   = Column(String(200), nullable=False, default="")
    created_at        = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Set when a mistake on this row was corrected (never for a renewal).
    corrected_by_name = Column(String(200), nullable=True)
    corrected_at      = Column(DateTime, nullable=True)
    correction_note   = Column(Text, nullable=True)


class ComplianceUpdateHistory(Base):
    __tablename__ = "compliance_update_history"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    truck_id        = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    document_type   = Column(String(100), nullable=False)
    updated_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_by_name = Column(String(200), nullable=False, default="")
    # NULL = a document was set / renewed (Running Cost's issue-date anchor).
    # "Corrected" / "Renewal undone" are log-only entries for Compliance &
    # Renewals → Edit History and are never used as an anchor.
    action          = Column(String(30), nullable=True)
    note            = Column(Text, nullable=True)


class BranchCleanerBattaFeeHistory(Base):
    """Every Cleaner Batta Fee a branch has had, and from when. Driver
    Compensation → Cleaner Batta Record prices each day at the fee that
    applied on that day, so a later change never reprices past days.
    Branches existing before this table were seeded with their fee at the time
    as effective from the start (their earlier history isn't known)."""
    __tablename__ = "branch_cleaner_batta_fee_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    cleaner_batta_fee = Column(Numeric(10, 2), nullable=False, default=0)
    effective_from = Column(DateTime, nullable=False)
    changed_by_name = Column(String(200), nullable=True)


class BranchWorkshopBattaFeeHistory(Base):
    """Every On Workshop Batta Fee a branch has had, and from when — same idea
    as BranchCleanerBattaFeeHistory, for Driver Compensation → Workshop Batta
    Record. Branches existing before this table were seeded with their fee at
    the time as effective from the start."""
    __tablename__ = "branch_workshop_batta_fee_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    workshop_batta_fee = Column(Numeric(10, 2), nullable=False, default=0)
    effective_from = Column(DateTime, nullable=False)
    changed_by_name = Column(String(200), nullable=True)


class TruckOdometerCorrection(Base):
    """Admin's "Correct Odometer" (Our Fleet) — the only way a truck's current
    odometer is set by hand or goes down. One row per correction, kept forever."""
    __tablename__ = "truck_odometer_corrections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False, index=True)
    old_odometer = Column(Integer, nullable=False)
    new_odometer = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TruckBranchHistory(Base):
    """One row per branch reassignment — a plain note, not an approval workflow."""
    __tablename__ = "truck_branch_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    from_branch = Column(String(200), nullable=True)
    to_branch = Column(String(200), nullable=False)
    note = Column(Text, nullable=False)
    changed_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    changed_by_name = Column(String(200), nullable=False, default="")
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_truck_branch_history_truck", "truck_id", "changed_at"),
    )


class TyreRangeConfig(Base):
    __tablename__ = "tyre_range_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_type = Column(String(50), nullable=False, unique=True)
    range_km = Column(Integer, nullable=True)
    base_tyre_cost = Column(Numeric(12, 2), nullable=True)
    base_cost_per_km = Column(Numeric(10, 4), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreRangeConfigEditEvent(Base):
    __tablename__ = "tyre_range_config_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_type = Column(String(50), nullable=True)  # set only on a delete; a bulk save touches the whole page
    event = Column(Enum("Tyre Range Config Saved", "Tyre Type Deleted"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class TyreLayoutTypeConfig(Base):
    __tablename__ = "tyre_layout_type_configs"
    __table_args__ = (UniqueConstraint("tyre_layout", "tyre_type", name="uq_layout_type"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyre_layout = Column(String(100), nullable=False)
    tyre_type = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TyreLayoutTypeConfigEditEvent(Base):
    __tablename__ = "tyre_layout_type_config_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(Enum("Tyre Quantity Configuration Updated"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


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
    resource_type = Column(Enum("FuelLog", "MaintenanceRecord", "Trip", "Driver", "Truck", "Staff", "Customer", "Vendor", "TyreInventory", "CfsYardEntry"), nullable=False)
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
    # Set once the requester has actually seen this decision (Topbar bell
    # opened, or the "Edit & Delete Requests" page visited) — null means a
    # decided request is still unseen, which is what the bell badge counts.
    # Deliberately separate from created_at/approved_at: those are audit
    # timestamps that never change; this one is purely "has the requester
    # been told yet", set by POST /deletion-approvals/mine/mark-seen.
    requester_seen_at = Column(DateTime, nullable=True)


class EditApprovalRequest(Base):
    __tablename__ = "edit_approval_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_db_id = Column(Integer, nullable=False)        # staff.id (numeric)
    staff_name = Column(String(100), nullable=False)
    staff_code = Column(String(20))                      # STF-1001
    resource_type = Column(Enum("Customer", "Vendor", "BookingSheet", "TripSheet", "TripData", "Trip", "FuelLog", "Driver", "Truck", "MaintenanceRecord"), nullable=False)
    resource_id = Column(Integer, nullable=False)
    resource_name = Column(String(200), nullable=False)
    action = Column(Enum("Edit", "Delete"), nullable=False)
    proposed_changes = Column(JSON, nullable=True)       # new field values for FuelLog edits
    reason = Column(Text, nullable=False)
    status = Column(Enum("Pending", "Approved", "Rejected"), default="Pending")
    admin_note = Column(Text, nullable=True)
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)         # approved_at + 8 hours (Edit action only)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Set the moment the staff member actually saves an edit under this
    # approval (see routers/trips.py's _mark_edit_approval_used). Distinguishes
    # an approval that's been acted on from one that's just sitting approved
    # but unused — powers the Trip Reconciliation "Completed"/"Pending" split.
    used_at = Column(DateTime, nullable=True)
    # Same "has the requester been told yet" marker as
    # DeletionApprovalRequest.requester_seen_at — see that column's comment.
    requester_seen_at = Column(DateTime, nullable=True)


class CompensationTransaction(Base):
    __tablename__ = "compensation_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    person_type = Column(Enum("driver", "staff"), nullable=False)
    person_id = Column(Integer, nullable=False)                         # driver.id or staff.id
    # Snapshot taken at creation — person_id has no FK (by design, it's shared
    # between drivers and staff), so without this the name becomes unrecoverable
    # once that driver/staff record is deleted.
    person_name = Column(String(100), nullable=True)
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
    # Legacy shared read flag — read state is per person now (NotificationRead);
    # rows marked read before that stay read for everyone.
    is_read = Column(Boolean, default=False, nullable=False)
    # Python-side UTC default (not func.now()): the DB server clock may be in any
    # timezone, but the API serializer stamps naive datetimes as UTC — they must match.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class NotificationRead(Base):
    """One person has read one notification. reader_key is "staff:<id>", or
    "admin:<name>" for the staff-less admin login."""
    __tablename__ = "notification_reads"
    __table_args__ = (UniqueConstraint("notification_id", "reader_key", name="uq_notification_reader"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False)
    reader_key = Column(String(120), nullable=False, index=True)
    read_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


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
# SW Usage Analytics — one row per login session, updated incrementally by a
# heartbeat the frontend posts every ~5 minutes (see useUsageHeartbeat.ts),
# plus a flush on tab-hide/unload. login_at/logout_at come from the existing
# /auth/login and /auth/logout calls; total_active_seconds/total_idle_seconds
# accumulate from heartbeats in between — NOT one row per heartbeat, which
# would make this table grow without bound. A session with no heartbeat for
# USAGE_STALE_MINUTES (see routers/usage_analytics.py) is treated as ended at
# its last heartbeat the next time that staff member's heartbeat is handled
# (covers a closed tab/laptop that never called /auth/logout).
# ---------------------------------------------------------------------------

class UsageSession(Base):
    __tablename__ = "usage_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_name = Column(String(100), nullable=False)
    staff_role = Column(String(50), nullable=True)
    login_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_heartbeat_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    logout_at = Column(DateTime, nullable=True)
    # "logout" (explicit /auth/logout), "timeout" (no heartbeat for
    # USAGE_STALE_MINUTES — tab/laptop closed without logging out), or NULL
    # while still open.
    ended_reason = Column(Enum("logout", "timeout"), nullable=True)
    total_active_seconds = Column(Integer, nullable=False, default=0)
    total_idle_seconds = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_usage_sessions_staff_login", "staff_id", "login_at"),
    )


class ModuleUsage(Base):
    """Per-session, per-sidebar-section (module) accumulated time — the module
    name is whatever the frontend's nav-config section title is (e.g. "Trip
    and Driver Management", "Finance Hub"), sent as-is in the heartbeat so the
    mapping only has to live in one place (lib/usage-modules.ts)."""
    __tablename__ = "module_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("usage_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    module = Column(String(100), nullable=False)
    active_seconds = Column(Integer, nullable=False, default=0)
    idle_seconds = Column(Integer, nullable=False, default=0)
    visit_count = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("session_id", "module", name="uq_module_usage_session_module"),
    )


# ---------------------------------------------------------------------------
# Auditor recheck history — one row per Flag / Return for Review / Verify
# action on a trip. The trip's own flagged_for_recheck / recheck_returned
# columns are the live state; this table is the durable trail behind it, so
# re-flagging a trip doesn't erase the record of what was found and fixed
# the first time around.
# ---------------------------------------------------------------------------

class TripRecheckEvent(Base):
    __tablename__ = "trip_recheck_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum("Flagged", "Returned for Review", "Verified"), nullable=False)
    remark = Column(Text, nullable=True)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------------------------------------------------------------------------
# Trip Edit History — who edited what and when, across the Booking Sheet,
# Trip Sheet, Closure, and Verification dialogs. Logs the action only (not a
# field-level diff) — see TripRecheckEvent above for the same pattern used
# for the Auditor recheck workflow.
# ---------------------------------------------------------------------------

class TripEditEvent(Base):
    __tablename__ = "trip_edit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    event = Column(Enum(
        "Booking Created", "Booking Edited", "Trip Sheet Saved", "Trip Updated",
        "Trip Closed", "Verification Confirmed", "Verification Rejected",
        "Trip Deleted", "Trip Restored",
    ), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
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
    # Tyre Cost Configuration quantities {tyre_layout: {tyre_type: "qty"}} —
    # NULL until the calculator first saves them (they used to live only in
    # the browser). Manual Cost/KM is worked out on the server once set.
    tyre_cost_config_qty = Column(JSON, nullable=True)
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



class RunningCostTruckCostPerKm(Base):
    """Server-persisted cache of each truck's final computed Cost/Km per
    calculator mode — written live by the Running Cost Calculator whenever it
    recomputes a truck's total, and read by P&L Summary's Truck Profitability
    tab for "Total Truck Expenses". Keyed by the truck's business ID (not the
    numeric FK) since that's the natural key both pages already share.
    Replaces the old localStorage-based hand-off, which broke across
    browsers/devices and whenever the two pages' selected modes didn't match.
    """
    __tablename__ = "running_cost_truck_cost_per_km"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False)
    truck_business_id = Column(String(50), nullable=False)
    cost_per_km = Column(Numeric(12, 6), nullable=True)
    # The five parts that add up to cost_per_km, saved by the calculator so
    # Profitability's Trip Breakdown can show the split (Manual mode can't be
    # re-derived server-side). Null on rows saved before they were stored.
    emi_per_km = Column(Numeric(12, 6), nullable=True)
    fuel_per_km = Column(Numeric(12, 6), nullable=True)
    tyre_per_km = Column(Numeric(12, 6), nullable=True)
    maintenance_per_km = Column(Numeric(12, 6), nullable=True)
    compliance_per_km = Column(Numeric(12, 6), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "truck_business_id", name="uq_rcc_costkm_mode_truck"),)


class RunningCostTruckMetrics(Base):
    """Per-mode, per-truck calculator inputs (EMI, mileage, tyre type, maintenance)."""
    __tablename__ = "running_cost_truck_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(20), nullable=False, default="Manual")
    truck_id = Column(Integer, ForeignKey("trucks.id", ondelete="CASCADE"), nullable=False)
    emi_amount = Column(Numeric(12, 2), nullable=True)
    mileage = Column(Numeric(8, 4), nullable=True)
    tyre_type = Column(String(50), nullable=True)
    tyre_per_km = Column(Numeric(10, 6), nullable=True)  # manual override; when set, auto-calc from tyre type is ignored
    emi_per_day = Column(Numeric(10, 4), nullable=True)  # manual override; used in Basic mode
    emi_per_km  = Column(Numeric(10, 6), nullable=True)  # manual override; used in Basic mode
    maintenance_per_km = Column(Numeric(10, 6), nullable=True)
    compliance_cost_per_year = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("mode", "truck_id", name="uq_rcc_truck_mode"),)


# ---------------------------------------------------------------------------
# Canaan Chat
#
# Message bodies are never stored in plaintext: `ChatMessage.ciphertext` holds an
# AES-256-GCM envelope produced by chat_crypto.py, bound to its conversation and
# sender. See that module for the key configuration and rotation procedure.
# ---------------------------------------------------------------------------

class ChatConversation(Base):
    """A direct (1:1) thread or a named group."""
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(Enum("direct", "group"), nullable=False, default="direct")
    title = Column(String(150))                       # groups only; direct threads render the peer's name
    # Group icon — groups only. Original filename kept purely for a sane
    # Content-Disposition; MIME is always re-derived from magic bytes on read.
    photo_url = Column(String(255), nullable=True)
    # Deferred: the conversation list is a hot, tightly-bounded-query path (see
    # module docstring) that loads full ChatConversation rows in bulk — an eager
    # LONGBLOB here would drag every group's icon bytes over the wire on every
    # list refresh. Only the dedicated photo endpoint (which queries it directly)
    # ever touches this column.
    photo_blob = deferred(Column(LargeBinary(length=26214400), nullable=True))
    # Canonical "<lowId>:<highId>" for direct threads, NULL for groups. The unique
    # index is what makes "open a DM with X" idempotent even if two requests race:
    # the loser gets an IntegrityError and re-reads the winner's row.
    direct_key = Column(String(64), unique=True)
    created_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"))
    # Snapshot taken at creation — created_by goes NULL if that staff member is
    # later hard-deleted, but this keeps "who created it" readable regardless.
    created_by_name = Column(String(100), nullable=True)
    # Denormalised from the newest message so the conversation list can sort
    # without touching chat_messages at all.
    last_message_at = Column(DateTime, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    participants = relationship("ChatParticipant", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan")


class ChatParticipant(Base):
    """Membership row — also the read-cursor, which is what keeps unread counts cheap."""
    __tablename__ = "chat_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum("member", "admin"), nullable=False, default="member")   # group admin may rename/add/remove
    # Highest message id this person has read. Unread is a counted range scan on
    # (conversation_id, id) — no per-message receipt rows, so the cost is O(unread)
    # instead of O(participants x messages).
    last_read_message_id = Column(Integer, nullable=False, default=0)
    muted = Column(Boolean, nullable=False, default=False)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    left_at = Column(DateTime, nullable=True)          # set on leave/remove; history is retained

    conversation = relationship("ChatConversation", back_populates="participants")

    __table_args__ = (
        UniqueConstraint("conversation_id", "staff_id", name="uq_chat_participant"),
        # Drives "every conversation I'm in", the first query of every chat page load.
        Index("ix_chat_participant_staff", "staff_id", "conversation_id"),
    )


class ChatMessage(Base):
    """One encrypted message. Edits and deletes are soft so threads stay consistent."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"))
    # Snapshot of the sender's name at send time. sender_id goes NULL if that
    # staff member is later hard-deleted (see below); this is what keeps
    # "who sent this" readable in history regardless.
    sender_name = Column(String(100), nullable=True)
    # AES-256-GCM envelope (see chat_crypto.py) — never plaintext. LONGBLOB (not
    # MEDIUMBLOB) so a 25 MB attachment — the same standard cap used for every
    # other upload in this app (see files.py) — comfortably fits envelope and all.
    ciphertext = Column(LargeBinary(length=26214400), nullable=False)   # LONGBLOB, app-capped at 25 MB
    content_type = Column(String(20), nullable=False, default="text")   # "text" | "voice" | "image" | "file" | "payment"
    # Payment notes only — the recipient's approve/reject decision. This is plain
    # workflow metadata (comparable to last_read_message_id / muted elsewhere in
    # this schema), not message content, so unlike the amount/note it is not
    # part of the encrypted envelope — it's queryable and never needs re-encryption.
    payment_status = Column(String(20), nullable=True)   # "pending" | "approved" | "rejected"
    payment_decided_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    payment_decided_by_name = Column(String(100), nullable=True)   # snapshot, same reasoning as sender_name
    payment_decided_at = Column(DateTime, nullable=True)
    # Second-stage decision, made on the Payment Requests page (Accounts/Admin
    # only) — separate from payment_status above, which is the peer's chat-level
    # decision. A note only becomes actionable here once payment_status is
    # "approved". finance_status is NULL (awaiting) until Accounts/Admin acts:
    #   NULL -> "approved" (Unpaid — authorized, money not yet moved)
    #        -> "paid"     (actually disbursed; only reachable from "approved")
    #   NULL -> "rejected" (terminal, finance overrode the peer approval)
    # finance_decided_by/at record the "approved"/"rejected" call; paid_by/at
    # separately record who actually marked it paid, since that's often a
    # different action at a different time (sometimes a different person).
    finance_status = Column(String(20), nullable=True)
    finance_decided_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    finance_decided_by_name = Column(String(100), nullable=True)   # snapshot, same reasoning as sender_name
    finance_decided_at = Column(DateTime, nullable=True)
    paid_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    paid_by_name = Column(String(100), nullable=True)   # snapshot, same reasoning as sender_name
    paid_at = Column(DateTime, nullable=True)
    # Proof-of-payment photo, required to mark a request paid. Encrypted the
    # same way as every other binary in this app (see chat_crypto.py) — this
    # is often a screenshot of a bank/UPI transfer, not something to leave in
    # the clear just because it lives in a different column than the note itself.
    paid_proof_ciphertext = Column(LargeBinary(length=26214400), nullable=True)   # LONGBLOB, capped at 25 MB
    paid_proof_mime = Column(String(100), nullable=True)
    # Voice notes: the sniffed MIME (e.g. "audio/webm") and recorded length, so
    # the player can show a duration before the audio itself is fetched.
    # Images/files: sniffed/declared MIME, original filename, and byte size, so
    # the bubble can render a preview or file card before downloading anything.
    media_mime = Column(String(100), nullable=True)
    media_duration_ms = Column(Integer, nullable=True)
    media_filename = Column(String(255), nullable=True)
    media_size = Column(Integer, nullable=True)
    reply_to_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    edited_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    conversation = relationship("ChatConversation", back_populates="messages")

    __table_args__ = (
        # Covers both history paging (WHERE conversation_id = ? AND id < ? ORDER BY id DESC)
        # and the unread count (WHERE conversation_id = ? AND id > ?).
        Index("ix_chat_message_conv_id", "conversation_id", "id"),
    )


class RoomSummon(Base):
    """Audit trail for the Admin-only "summon" alert (Topbar's BellRing button):
    pushes a live "the owner has requested your presence" dialog straight to a
    staff member's screen, or to every member of a Canaan Chat group at once.
    The push itself is a pure WebSocket event (see routers/room_summon.py) —
    this row exists only so there's a record of who was summoned, when, and by
    whom, since nothing else about it touches the database.
    """
    __tablename__ = "room_summons"

    id = Column(Integer, primary_key=True, autoincrement=True)
    summoned_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    summoned_by_name = Column(String(100), nullable=True)   # snapshot, same reasoning as ChatMessage.sender_name
    target_type = Column(String(10), nullable=False)        # "user" | "group"
    # The picked Staff.id, or the Canaan Chat group's ChatConversation.id —
    # not a FK: the target can be a staff member OR a conversation, and either
    # one may later be deleted without this historical row needing to follow.
    target_id = Column(Integer, nullable=False)
    target_label = Column(String(150), nullable=False)      # staff name, or group title, at summon time
    # Snapshots of who the push actually reached — a group's membership can
    # change afterwards, so re-deriving "who" from target_id later would give
    # a wrong answer for an old row.
    recipient_ids = Column(JSON, nullable=False, default=list)
    recipient_names = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Every logged-in browser polls /room-summon/inbox for the last few minutes.
    __table_args__ = (Index("ix_room_summon_created", "created_at"),)


class Event(Base):
    """Admin-scheduled meeting (Topbar's Event button — sits between Invite and
    Calculator). Participants are picked the same way as a RoomSummon (a
    Canaan Chat user or group); the creator is always added as a participant
    too, so their own "upcoming meetings" list and the live start-time
    reminder both cover them without needing a separate "my events" query.
    """
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(150), nullable=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String(100), nullable=True)   # snapshot, same reasoning as ChatMessage.sender_name
    # Set once event_reminder_worker.py has pushed the live "starting now"
    # dialog to every participant, so a later poll tick never re-sends it.
    reminded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Marked by any participant via "Mark as Completed" — NULL means it still
    # shows in Upcoming Meetings (even past its starts_at, until someone
    # closes it out); once set it moves to the History tab instead.
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    completed_by_name = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_event_starts_at", "starts_at"),
        Index("ix_event_completed_at", "completed_at"),
    )


class EventParticipant(Base):
    """One invited staff member for an Event — a plain join table (same shape
    as ChatParticipant) so "my upcoming meetings" is an ordinary indexed join
    instead of scanning a JSON blob."""
    __tablename__ = "event_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    staff_name = Column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint("event_id", "staff_id", name="uq_event_participant"),
        Index("ix_event_participant_staff", "staff_id"),
    )


class Note(Base):
    """Topbar Notes — a private notepad per staff member. Strictly owner-only:
    every query in routers/notes.py is scoped to the caller, Admin included.
    Kept until the owner deletes it."""
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False, default="")
    # length > 65535 makes MySQL use MEDIUMTEXT instead of the 64 KB TEXT.
    body = Column(Text(length=1_000_000), nullable=False, default="")
    pinned = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_note_owner_updated", "staff_id", "updated_at"),
    )


class NoteWriteUsage(Base):
    """Per-person, per-day tally of note writes (routers/notes.py). Caps how
    much any one person can push through autosave in a day — every save
    rewrites the whole note into MySQL's binary log, so without this a
    script re-saving one note in a loop could fill the disk even though the
    notes table itself never grows. Stored in the DB (not memory) so the cap
    holds across every server worker process."""
    __tablename__ = "note_write_usage"

    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), primary_key=True)
    day = Column(Date, primary_key=True)          # IST calendar day
    bytes_written = Column(Integer, nullable=False, default=0, server_default="0")
    writes = Column(Integer, nullable=False, default=0, server_default="0")
    blocked = Column(Integer, nullable=False, default=0, server_default="0")  # writes refused by a limit


class Todo(Base):
    """Topbar To-do — a private task list per staff member, like Notes:
    every query in routers/todos.py is scoped to the caller, Admin included.
    Kept until the owner deletes it (or clears completed tasks)."""
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(300), nullable=False)
    done = Column(Boolean, nullable=False, default=False, server_default="0")
    important = Column(Boolean, nullable=False, default=False, server_default="0")
    due_date = Column(Date, nullable=True)                 # IST calendar day, optional
    done_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_todo_owner_done", "staff_id", "done"),
    )


DEFAULT_BATTA_TRIP_TYPES = ("LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING", "RETURN TRIP")
DEFAULT_BATTA_CARGO_TYPES = ("20FT CONTAINER", "40FT CONTAINER", "2X20 FEET CONTAINERS", "OPEN LOAD CARGO")


class DefaultBattaRate(Base):
    """Default batta (allowance) amount for one branch x trip type x cargo type cell.

    One row per combination that has ever been set — missing combinations simply
    have no row (the UI treats that as blank/unset), so a new branch or a trip
    type nobody has priced yet costs nothing here rather than needing to be
    pre-seeded across every branch.
    """
    __tablename__ = "default_batta_rates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    trip_type = Column(Enum(*DEFAULT_BATTA_TRIP_TYPES), nullable=False)
    cargo_type = Column(Enum(*DEFAULT_BATTA_CARGO_TYPES), nullable=False)
    amount = Column(Numeric(10, 2), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    branch = relationship("Branch")

    __table_args__ = (
        # One cell per branch/trip type/cargo type — also the lookup path for
        # both "load everything for this branch" and the per-cell upsert.
        UniqueConstraint("branch_id", "trip_type", "cargo_type", name="uq_default_batta_cell"),
        Index("ix_default_batta_branch", "branch_id"),
    )


class DefaultBattaEditEvent(Base):
    __tablename__ = "default_batta_edit_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, nullable=False)
    branch_name = Column(String(200), nullable=False)
    trip_type = Column(String(50), nullable=False)
    cargo_type = Column(String(50), nullable=False)
    amount = Column(Numeric(10, 2), nullable=True)
    event = Column(Enum("Default Batta Rate Updated"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
