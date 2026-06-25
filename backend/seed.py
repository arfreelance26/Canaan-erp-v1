import base64
from database import SessionLocal
import models
from datetime import date
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
dummy_hash = pwd_ctx.hash("password123")

def get_file_bytes(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except Exception as e:
        print(f"Warning: could not read {path}: {e}")
        return None

def get_base64_data_uri(path, mime_type):
    try:
        with open(path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
            return f"data:{mime_type};base64,{encoded}"
    except Exception as e:
        print(f"Warning: could not encode {path}: {e}")
        return None

def seed():
    db = SessionLocal()
    
    photo_path = "/Users/alanjoshua/Downloads/canaan_erp/backend/profile.jpg"
    pdf_path = "/Users/alanjoshua/Downloads/canaan_erp/backend/sample.pdf"
    
    photo_bytes = get_file_bytes(photo_path)
    pdf_bytes = get_file_bytes(pdf_path)
    photo_data_url = get_base64_data_uri(photo_path, "image/jpeg")
    
    # 1. Trucks (Fleet)
    truck1 = models.Truck(
        truck_id="CGI-T001",
        branch_registered_to="Chennai",
        registration_number="TN 01 AB 1234",
        manufacturer="Tata",
        model_name="Signa 4018.S",
        truck_type="40 FT ARTICULATED",
        tyre_layout="10+1",
        odometer=15000,
        photo_blob=photo_bytes,
        truck_photos_file_name="profile.jpg",
        rc_document_blob=pdf_bytes,
        rc_document_url="sample.pdf",
        fc_document_blob=pdf_bytes,
        fc_document_file_name="sample.pdf"
    )
    truck2 = models.Truck(
        truck_id="CGI-T002",
        branch_registered_to="Tuticorin",
        registration_number="TN 69 XY 9876",
        manufacturer="Ashok Leyland",
        model_name="3520",
        truck_type="20 FT RIGID",
        tyre_layout="6+1",
        odometer=25000,
        photo_blob=photo_bytes,
        truck_photos_file_name="profile.jpg",
        rc_document_blob=pdf_bytes,
        rc_document_url="sample.pdf",
    )
    db.add_all([truck1, truck2])
    
    # 2. Drivers
    driver1 = models.Driver(
        driver_id="CGI-D001",
        name="Ramesh Kumar",
        email="ramesh@example.com",
        contact_number="9876543210",
        branch="Chennai",
        username="ramesh",
        password_hash=dummy_hash,
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
        aadhaar_blob=pdf_bytes,
        aadhaar_file_name="sample.pdf",
        license_blob=pdf_bytes,
        license_file_name="sample.pdf"
    )
    driver2 = models.Driver(
        driver_id="CGI-D002",
        name="Suresh Singh",
        email="suresh@example.com",
        contact_number="8765432109",
        branch="Tuticorin",
        username="suresh",
        password_hash=dummy_hash,
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
        aadhaar_blob=pdf_bytes,
        aadhaar_file_name="sample.pdf",
        license_blob=pdf_bytes,
        license_file_name="sample.pdf"
    )
    db.add_all([driver1, driver2])
    
    # 3. Staff
    staff1 = models.Staff(
        staff_id="STF-1001",
        name="Admin User",
        email="admin@canaan.com",
        contact_number="9988776655",
        software_designation="Admin",
        username="admin",
        password_hash=dummy_hash,
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
        aadhar_document_blob=pdf_bytes,
        aadhar_file_name="sample.pdf",
    )
    staff2 = models.Staff(
        staff_id="STF-1002",
        name="Manager User",
        email="manager@canaan.com",
        contact_number="8877665544",
        software_designation="Fleet Manager",
        username="fleet_manager",
        password_hash=dummy_hash,
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
        aadhar_document_blob=pdf_bytes,
        aadhar_file_name="sample.pdf",
    )
    db.add_all([staff1, staff2])
    
    # 4. Customers
    customer1 = models.Customer(
        name="Acme Shipping Co",
        email="contact@acme.com",
        phone="1234567890",
        customer_type="Shipping",
        status="ACTIVE",
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
    )
    customer2 = models.Customer(
        name="Fast Transports",
        email="hello@fasttransports.com",
        phone="0987654321",
        customer_type="Transports",
        status="ACTIVE",
        photo_blob=photo_bytes,
        photo_url=photo_data_url,
    )
    db.add_all([customer1, customer2])
    
    # 5. Vendors
    vendor1 = models.Vendor(
        name="Reliable Tyres",
        category="Tyres",
        email="sales@reliabletyres.com",
        contact_number="1122334455",
        status="ACTIVE"
    )
    vendor2 = models.Vendor(
        name="Quick Fix Garage",
        category="Maintenance",
        email="support@quickfix.com",
        contact_number="5544332211",
        status="ACTIVE"
    )
    db.add_all([vendor1, vendor2])
    
    try:
        db.commit()
        db.refresh(customer1)
        
        # 6. Driver Assignments
        da1 = models.DriverAssignment(
            driver_id="CGI-D001",
            vehicle_id="CGI-T001"
        )
        da2 = models.DriverAssignment(
            driver_id="CGI-D002",
            vehicle_id="CGI-T002"
        )
        db.add_all([da1, da2])
        
        # 7. Trips
        trip1 = models.Trip(
            trip_id="TRP-1050",
            status="Assigned",
            booking_reference_no="BKG-101",
            booking_created_date=date.today(),
            trip_category="LOCAL",
            movement_category="self",
            customer_id=customer1.id,
            shipper_consignee="Acme Shipping Co",
            cargo_classification="IMPORT",
            container_specification="20 FT CONTAINER",
            container_number="CONT-001",
            cargo_reference="REF-001",
            release_order_reference="RO-001",
            cargo_weight=18.5,
            origin="Chennai Port",
            destination="Sriperumbudur",
            shipping_line="Maersk",
            vessel_name="Vessel A",
            transport_method="Own Fleet",
            scheduled_date=date.today(),
            driver_id="CGI-D001",
            vehicle_id="CGI-T001",
            bill_to="CUSTOMER",
            payment_type="Credit"
        )
        db.add(trip1)
        
        db.commit()
        print("Seed data with driver assignments and trips inserted successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
