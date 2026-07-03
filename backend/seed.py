from database import SessionLocal
import models
from datetime import date, datetime
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
dummy_hash = pwd_ctx.hash("password123")


def seed():
    db = SessionLocal()
    try:
        # -------------------------------------------------------------------
        # 0. BRANCHES
        # -------------------------------------------------------------------
        branches = [
            models.Branch(name="CHENNAI",   halt_day_fee_20ft=500, halt_day_fee_40ft=700, driver_halt_day_percentage=5),
            models.Branch(name="TUTICORIN", halt_day_fee_20ft=450, halt_day_fee_40ft=650, driver_halt_day_percentage=5),
        ]
        db.add_all(branches)
        db.commit()

        # -------------------------------------------------------------------
        # 1. TRUCKS
        # -------------------------------------------------------------------
        trucks = [
            models.Truck(
                truck_id="CGI-T001", branch_registered_to="CHENNAI",
                registration_number="TN 01 AB 1234", manufacturer="Tata", model_name="Signa 4018.S",
                truck_type="40 FT ARTICULATED", chassis_number="MAT448930MH100212",
                year_of_manufacture="2021", tyre_layout="10+1", fuel_capacity=400,
                odometer_during_purchase=120, odometer=38450,
                rc_date=date(2021, 3, 15), rc_validity_date=date(2036, 3, 14), rc_expenses=8500,
                fc_date=date(2021, 3, 15), fc_expiry_date=date(2027, 3, 14), fc_expenses=4500,
                road_tax_date=date(2021, 3, 15), road_tax_number="RTTNCHN2021001234", road_tax_expenses=18000,
                insurance_expiry_date=date(2026, 3, 14), insurance_expenses=42000,
                national_permit_number="NPTNCHN2021001", national_permit_date=date(2021, 4, 1), national_permit_expenses=3500,
                local_permit_number="LPTNCHN2021001", local_permit_date=date(2021, 4, 1), local_permit_expenses=1200,
                pollution_certificate_date=date(2025, 9, 1), pollution_certificate_number="PCTN202500234", pollution_certificate_expenses=800,
            ),
            models.Truck(
                truck_id="CGI-T002", branch_registered_to="TUTICORIN",
                registration_number="TN 69 XY 9876", manufacturer="Ashok Leyland", model_name="3520",
                truck_type="20 FT RIGID", chassis_number="MBAJ42FT5ML231045",
                year_of_manufacture="2020", tyre_layout="6+1", fuel_capacity=300,
                odometer_during_purchase=80, odometer=52300,
                rc_date=date(2020, 6, 10), rc_validity_date=date(2035, 6, 9), rc_expenses=7500,
                fc_date=date(2020, 6, 10), fc_expiry_date=date(2026, 6, 9), fc_expenses=3800,
                road_tax_date=date(2020, 6, 10), road_tax_number="RTTNTUT2020005678", road_tax_expenses=15000,
                insurance_expiry_date=date(2025, 6, 9), insurance_expenses=38000,
                national_permit_number="NPTNTUT2020002", national_permit_date=date(2020, 7, 1), national_permit_expenses=3200,
                local_permit_number="LPTNTUT2020002", local_permit_date=date(2020, 7, 1), local_permit_expenses=1000,
                pollution_certificate_date=date(2025, 12, 1), pollution_certificate_number="PCTN202500455", pollution_certificate_expenses=700,
            ),
            models.Truck(
                truck_id="CGI-T003", branch_registered_to="CHENNAI",
                registration_number="TN 01 CD 5678", manufacturer="BharatBenz", model_name="4028R",
                chassis_number="MBAJ48FT9ML310078", year_of_manufacture="2022",
                truck_type="40 FT ARTICULATED", tyre_layout="10+1", fuel_capacity=420,
                odometer_during_purchase=200, odometer=21800,
                rc_date=date(2022, 1, 20), rc_validity_date=date(2037, 1, 19), rc_expenses=9000,
                fc_date=date(2022, 1, 20), fc_expiry_date=date(2028, 1, 19), fc_expenses=4800,
                road_tax_date=date(2022, 1, 20), road_tax_number="RTTNCHN2022002345", road_tax_expenses=19500,
                insurance_expiry_date=date(2027, 1, 19), insurance_expenses=45000,
                national_permit_number="NPTNCHN2022003", national_permit_date=date(2022, 2, 10), national_permit_expenses=3600,
                local_permit_number="LPTNCHN2022003", local_permit_date=date(2022, 2, 10), local_permit_expenses=1300,
                pollution_certificate_date=date(2026, 1, 19), pollution_certificate_number="PCTN202600102", pollution_certificate_expenses=800,
            ),
            models.Truck(
                truck_id="CGI-T004", branch_registered_to="TUTICORIN",
                registration_number="TN 69 GH 4321", manufacturer="Tata", model_name="Signa 3518.T",
                chassis_number="MAT448930NJ112034", year_of_manufacture="2021",
                truck_type="20 FT ARTICULATED", tyre_layout="6+1", fuel_capacity=320,
                odometer_during_purchase=50, odometer=44100,
                rc_date=date(2021, 8, 5), rc_validity_date=date(2036, 8, 4), rc_expenses=8000,
                fc_date=date(2021, 8, 5), fc_expiry_date=date(2027, 8, 4), fc_expenses=4000,
                road_tax_date=date(2021, 8, 5), road_tax_number="RTTNTUT2021006789", road_tax_expenses=14500,
                insurance_expiry_date=date(2026, 8, 4), insurance_expenses=36000,
                national_permit_number="NPTNTUT2021004", national_permit_date=date(2021, 9, 1), national_permit_expenses=3300,
                local_permit_number="LPTNTUT2021004", local_permit_date=date(2021, 9, 1), local_permit_expenses=1100,
                pollution_certificate_date=date(2025, 8, 1), pollution_certificate_number="PCTN202500677", pollution_certificate_expenses=750,
            ),
            models.Truck(
                truck_id="CGI-T005", branch_registered_to="CHENNAI",
                registration_number="TN 01 EF 7890", manufacturer="Ashok Leyland", model_name="4220",
                chassis_number="MBAJ48FT3MK290156", year_of_manufacture="2022",
                truck_type="40 FT ARTICULATED", tyre_layout="10+1", fuel_capacity=430,
                odometer_during_purchase=300, odometer=18600,
                rc_date=date(2022, 5, 12), rc_validity_date=date(2037, 5, 11), rc_expenses=9000,
                fc_date=date(2022, 5, 12), fc_expiry_date=date(2028, 5, 11), fc_expenses=5000,
                road_tax_date=date(2022, 5, 12), road_tax_number="RTTNCHN2022003901", road_tax_expenses=20000,
                insurance_expiry_date=date(2027, 5, 11), insurance_expenses=46000,
                national_permit_number="NPTNCHN2022005", national_permit_date=date(2022, 6, 1), national_permit_expenses=3700,
                local_permit_number="LPTNCHN2022005", local_permit_date=date(2022, 6, 1), local_permit_expenses=1350,
                pollution_certificate_date=date(2026, 5, 11), pollution_certificate_number="PCTN202600289", pollution_certificate_expenses=850,
            ),
            models.Truck(
                truck_id="CGI-T006", branch_registered_to="TUTICORIN",
                registration_number="TN 69 MN 2468", manufacturer="Tata", model_name="LPT 3118",
                chassis_number="MAT443050NK234567", year_of_manufacture="2019",
                truck_type="20 FT RIGID", tyre_layout="6+1", fuel_capacity=290,
                odometer_during_purchase=100, odometer=78200,
                rc_date=date(2019, 11, 20), rc_validity_date=date(2034, 11, 19), rc_expenses=7000,
                fc_date=date(2019, 11, 20), fc_expiry_date=date(2025, 11, 19), fc_expenses=3500,
                road_tax_date=date(2019, 11, 20), road_tax_number="RTTNTUT2019007890", road_tax_expenses=13000,
                insurance_expiry_date=date(2025, 11, 19), insurance_expenses=32000,
                national_permit_number="NPTNTUT2019006", national_permit_date=date(2019, 12, 10), national_permit_expenses=3000,
                local_permit_number="LPTNTUT2019006", local_permit_date=date(2019, 12, 10), local_permit_expenses=950,
                pollution_certificate_date=date(2025, 11, 1), pollution_certificate_number="PCTN202500812", pollution_certificate_expenses=700,
            ),
            models.Truck(
                truck_id="CGI-T007", branch_registered_to="CHENNAI",
                registration_number="TN 01 PQ 3579", manufacturer="BharatBenz", model_name="3528R",
                chassis_number="MBAJ48FT8ML340090", year_of_manufacture="2023",
                truck_type="40 FT RIGID", tyre_layout="10+1", fuel_capacity=410,
                odometer_during_purchase=150, odometer=9400,
                rc_date=date(2023, 3, 8), rc_validity_date=date(2038, 3, 7), rc_expenses=9500,
                fc_date=date(2023, 3, 8), fc_expiry_date=date(2029, 3, 7), fc_expenses=5200,
                road_tax_date=date(2023, 3, 8), road_tax_number="RTTNCHN2023004012", road_tax_expenses=22000,
                insurance_expiry_date=date(2028, 3, 7), insurance_expenses=48000,
                national_permit_number="NPTNCHN2023007", national_permit_date=date(2023, 3, 25), national_permit_expenses=3800,
                local_permit_number="LPTNCHN2023007", local_permit_date=date(2023, 3, 25), local_permit_expenses=1400,
                pollution_certificate_date=date(2027, 3, 7), pollution_certificate_number="PCTN202700045", pollution_certificate_expenses=900,
            ),
            models.Truck(
                truck_id="CGI-T008", branch_registered_to="TUTICORIN",
                registration_number="TN 69 RS 1357", manufacturer="Mahindra", model_name="Blazo X 40",
                chassis_number="MAZMK14RCNK100312", year_of_manufacture="2023",
                truck_type="40 FT ARTICULATED", tyre_layout="10+1", fuel_capacity=425,
                odometer_during_purchase=180, odometer=11200,
                rc_date=date(2023, 7, 14), rc_validity_date=date(2038, 7, 13), rc_expenses=9500,
                fc_date=date(2023, 7, 14), fc_expiry_date=date(2029, 7, 13), fc_expenses=5000,
                road_tax_date=date(2023, 7, 14), road_tax_number="RTTNTUT2023008345", road_tax_expenses=21000,
                insurance_expiry_date=date(2028, 7, 13), insurance_expenses=47000,
                national_permit_number="NPTNTUT2023008", national_permit_date=date(2023, 8, 1), national_permit_expenses=3700,
                local_permit_number="LPTNTUT2023008", local_permit_date=date(2023, 8, 1), local_permit_expenses=1250,
                pollution_certificate_date=date(2027, 7, 13), pollution_certificate_number="PCTN202700167", pollution_certificate_expenses=850,
            ),
        ]
        db.add_all(trucks)

        # -------------------------------------------------------------------
        # 2. DRIVERS
        # -------------------------------------------------------------------
        drivers = [
            models.Driver(
                driver_id="CGI-D001", name="Murugan Selvam", aadhaar_number="4521 6738 9012",
                date_of_birth=date(1985, 4, 12), date_of_joining=date(2019, 6, 1),
                email="murugan.selvam@canaanglobal.in", contact_number="9944112233",
                address="14, Gandhi Nagar, Royapuram, Chennai - 600013", branch="CHENNAI",
                license_number="TN01-2013-0034521", license_expiry_date=date(2027, 9, 30),
                form_11="Yes", esi_number="3110023456789", pan_number="BCDMS8765F",
                agreement_signed="Yes", bank_name="State Bank of India",
                bank_branch_name="Royapuram Branch", account_number="31245678901234",
                ifsc_code="SBIN0001234", username="murugan.selvam", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D002", name="Kannan Raju", aadhaar_number="8834 5601 2345",
                date_of_birth=date(1988, 7, 22), date_of_joining=date(2020, 1, 15),
                email="kannan.raju@canaanglobal.in", contact_number="9500334455",
                address="7, Sivakami Street, Thoothukudi, Tuticorin - 628002", branch="TUTICORIN",
                license_number="TN69-2016-0012389", license_expiry_date=date(2028, 3, 15),
                form_11="Yes", esi_number="3160034567890", pan_number="CDFKR9876G",
                agreement_signed="Yes", bank_name="Indian Bank",
                bank_branch_name="Tuticorin Main Branch", account_number="6234567890012",
                ifsc_code="IDIB000T001", username="kannan.raju", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D003", name="Arumugam Pillai", aadhaar_number="2213 4456 7890",
                date_of_birth=date(1982, 11, 3), date_of_joining=date(2018, 3, 10),
                email="arumugam.pillai@canaanglobal.in", contact_number="9789556677",
                address="22, Kamaraj Avenue, Perambur, Chennai - 600011", branch="CHENNAI",
                license_number="TN01-2011-0056789", license_expiry_date=date(2026, 5, 20),
                form_11="Yes", esi_number="3110045678901", pan_number="DEGAP7654H",
                agreement_signed="Yes", bank_name="Canara Bank",
                bank_branch_name="Perambur Branch", account_number="0789012345678",
                ifsc_code="CNRB0001567", username="arumugam.pillai", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D004", name="Senthil Kumar", aadhaar_number="5567 8901 2346",
                date_of_birth=date(1990, 2, 18), date_of_joining=date(2021, 7, 5),
                email="senthil.kumar@canaanglobal.in", contact_number="9443778899",
                address="3B, Port Road, Thoothukudi, Tuticorin - 628001", branch="TUTICORIN",
                license_number="TN69-2018-0078901", license_expiry_date=date(2029, 11, 10),
                form_11="Yes", esi_number="3160056789012", pan_number="EFGSK4321I",
                agreement_signed="Yes", bank_name="Union Bank of India",
                bank_branch_name="Tuticorin Port Branch", account_number="5123456789023",
                ifsc_code="UBIN0549876", username="senthil.kumar", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D005", name="Balasubramanian Krishnan", aadhaar_number="3344 5567 8901",
                date_of_birth=date(1979, 9, 25), date_of_joining=date(2017, 11, 20),
                email="bala.krishnan@canaanglobal.in", contact_number="9840990011",
                address="45, Poonamallee High Road, Padi, Chennai - 600050", branch="CHENNAI",
                license_number="TN01-2009-0089012", license_expiry_date=date(2025, 8, 14),
                form_11="Yes", esi_number="3110067890123", pan_number="FGHBK3210J",
                agreement_signed="Yes", bank_name="Bank of Baroda",
                bank_branch_name="Padi Chennai Branch", account_number="19280200001234",
                ifsc_code="BARB0PADINX", username="bala.krishnan", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D006", name="Thangavel Natarajan", aadhaar_number="6678 9012 3457",
                date_of_birth=date(1986, 5, 7), date_of_joining=date(2019, 9, 12),
                email="thangavel.n@canaanglobal.in", contact_number="9361122334",
                address="18, Ambalam Street, Kamarajnagar, Tuticorin - 628003", branch="TUTICORIN",
                license_number="TN69-2014-0090123", license_expiry_date=date(2026, 2, 28),
                form_11="No", esi_number="3160078901234", pan_number="GHITN2109K",
                agreement_signed="Yes", bank_name="Indian Overseas Bank",
                bank_branch_name="Tuticorin Branch", account_number="028602000009876",
                ifsc_code="IOBA0000286", username="thangavel.n", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D007", name="Palani Swamy", aadhaar_number="9901 2345 6789",
                date_of_birth=date(1992, 8, 14), date_of_joining=date(2022, 4, 18),
                email="palani.swamy@canaanglobal.in", contact_number="9566233445",
                address="9, Abirami Nagar, Ambattur, Chennai - 600053", branch="CHENNAI",
                license_number="TN01-2019-0101234", license_expiry_date=date(2030, 4, 18),
                form_11="Yes", esi_number="3110089012345", pan_number="HIJPS1098L",
                agreement_signed="Yes", bank_name="UCO Bank",
                bank_branch_name="Ambattur Branch", account_number="04220110234567",
                ifsc_code="UCBA0000422", username="palani.swamy", password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D008", name="Rajasekaran Dharmalingam", aadhaar_number="1122 3344 5678",
                date_of_birth=date(1984, 12, 30), date_of_joining=date(2020, 10, 3),
                email="raja.dharmalingam@canaanglobal.in", contact_number="9787344556",
                address="6, Harbour View Colony, Thoothukudi, Tuticorin - 628004", branch="TUTICORIN",
                license_number="TN69-2012-0112345", license_expiry_date=date(2026, 9, 5),
                form_11="Yes", esi_number="3160090123456", pan_number="IJKRD0987M",
                agreement_signed="Yes", bank_name="Punjab National Bank",
                bank_branch_name="Tuticorin Branch", account_number="4012345678901",
                ifsc_code="PUNB0405800", username="raja.dharmalingam", password_hash=dummy_hash,
            ),
        ]
        db.add_all(drivers)

        # -------------------------------------------------------------------
        # 3. STAFF
        # -------------------------------------------------------------------
        staff = [
            models.Staff(
                staff_id="STF-1001", name="Admin User", department="Administration",
                designation="System Administrator", software_designation="Admin",
                date_of_birth=date(1985, 6, 15), date_of_joining=date(2017, 1, 2),
                email="admin@canaan.com", contact_number="9988776655",
                address="Canaan Global HQ, Anna Salai, Chennai - 600002", branch="CHENNAI",
                aadhar_number="1100 2200 3300", username="admin", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1002", name="Karthik Subramaniam", department="Operations",
                designation="Fleet Operations Manager", software_designation="Fleet Manager",
                date_of_birth=date(1987, 3, 22), date_of_joining=date(2018, 4, 10),
                email="karthik.s@canaan.com", contact_number="9876543210",
                address="23, Nandanam Extension, Chennai - 600035", branch="CHENNAI",
                aadhar_number="4400 5500 6600", username="karthik.subramaniam", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1003", name="Priyanka Venkatesh", department="Finance",
                designation="Finance Manager", software_designation="Finance Manager",
                date_of_birth=date(1990, 9, 5), date_of_joining=date(2019, 7, 15),
                email="priyanka.v@canaan.com", contact_number="9443221100",
                address="14, Besant Nagar, 2nd Street, Chennai - 600090", branch="CHENNAI",
                aadhar_number="7700 8800 9900", username="priyanka.venkatesh", password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1004", name="Saravanan Murugesan", department="Maintenance",
                designation="Tyre Manager", software_designation="Tyre Manager",
                date_of_birth=date(1983, 12, 18), date_of_joining=date(2018, 11, 1),
                email="saravanan.m@canaan.com", contact_number="9362554433",
                address="5, Raja Street, Tuticorin - 628001", branch="TUTICORIN",
                aadhar_number="1122 3344 5566", username="saravanan.murugesan", password_hash=dummy_hash,
            ),
        ]
        db.add_all(staff)

        # -------------------------------------------------------------------
        # 4. CUSTOMERS
        # -------------------------------------------------------------------
        customers = [
            models.Customer(name="Maersk India Pvt Ltd", gstin="33AABCM5678F1Z3",
                contact_personnel_name="Vikram Nair", phone="04428456789",
                email="chennai@maersk.com",
                address="8th Floor, Prestige Tower, RK Salai, Mylapore, Chennai - 600004",
                customer_type="Shipping", is_gta="No", applicable_for_e_invoice="Yes"),
            models.Customer(name="VRL Logistics Ltd", gstin="29AABCV4321H1Z7",
                contact_personnel_name="Suresh Patil", phone="04428123456",
                email="operations@vrl.in",
                address="Plot 14, SIDCO Industrial Estate, Ambattur, Chennai - 600098",
                customer_type="Transports", is_gta="Yes", applicable_for_e_invoice="Yes"),
            models.Customer(name="CMA CGM India Pvt Ltd", gstin="33AABCC1122G1Z8",
                contact_personnel_name="Deepa Krishnamurthy", phone="04443214567",
                email="chennai.ops@cma-cgm.com",
                address="2nd Floor, Ceebros Centre, Montieth Road, Egmore, Chennai - 600008",
                customer_type="Shipping", is_gta="No", applicable_for_e_invoice="Yes"),
            models.Customer(name="TVS Supply Chain Solutions Ltd", gstin="33AABCT3344H1Z6",
                contact_personnel_name="Arvind Shankar", phone="04422334455",
                email="scm.chennai@tvs.in",
                address="TVS Building, 7th Floor, Anna Salai, Chennai - 600002",
                customer_type="Transports", is_gta="Yes", applicable_for_e_invoice="Yes"),
            models.Customer(name="Mediterranean Shipping Co India Pvt Ltd", gstin="33AABCM7788I1Z4",
                contact_personnel_name="Rajan Menon", phone="04428901234",
                email="chennai@msc.com",
                address="3rd Floor, Kences Towers, Nungambakkam, Chennai - 600034",
                customer_type="Shipping", is_gta="No", applicable_for_e_invoice="Yes"),
            models.Customer(name="SPIC India Limited", gstin="33AABCS9900J1Z5",
                contact_personnel_name="Anand Ramasamy", phone="04612345678",
                email="logistics@spic.in",
                address="SPIC House, 88, Mount Road, Guindy, Chennai - 600032",
                customer_type="Transports", is_gta="No", applicable_for_e_invoice="Yes"),
            models.Customer(name="Evergreen Marine India Pvt Ltd", gstin="33AABCE2233K1Z2",
                contact_personnel_name="Priya Venkataraman", phone="04428765432",
                email="chennai@evergreen-marine.com",
                address="Parsn Manere, 7th Floor, Anna Salai, Chennai - 600006",
                customer_type="Shipping", is_gta="No", applicable_for_e_invoice="Yes"),
            models.Customer(name="Ramco Cements Ltd", gstin="33AABCR4455L1Z1",
                contact_personnel_name="Mahesh Venkatraman", phone="04428234567",
                email="logistics@ramcocements.com",
                address="Ramco Industries Building, Arunachalam Road, Rajapalayam - 626117",
                customer_type="Transports", is_gta="No", applicable_for_e_invoice="Yes"),
        ]
        db.add_all(customers)

        # -------------------------------------------------------------------
        # 5. VENDORS
        # -------------------------------------------------------------------
        vendors = [
            models.Vendor(name="Apollo Tyres Ltd", category="Tyre Supplier", contact_number="04428991100",
                gstin="32AABCA0472N1ZP", pan="AABCA0472N", email="sales.chennai@apollotyres.com",
                address="Apollo House, 7 Rajiv Gandhi Salai, OMR, Chennai - 600119", status="ACTIVE"),
            models.Vendor(name="MRF Limited", category="Tyre Supplier", contact_number="04428852200",
                gstin="33AABCM4449J1Z8", pan="AABCM4449J", email="tyresales@mrf.com",
                address="114, Greams Road, Chennai - 600006", status="ACTIVE"),
            models.Vendor(name="CEAT Tyres", category="Tyre Supplier", contact_number="04428763300",
                gstin="33AABCC2786P1Z4", pan="AABCC2786P", email="dealer.chennai@ceat.com",
                address="Plot 45, Kodambakkam High Road, Chennai - 600024", status="ACTIVE"),
            models.Vendor(name="JK Tyre Industries Ltd", category="Tyre Supplier", contact_number="04428674400",
                gstin="33AABCJ1879Q1Z2", pan="AABCJ1879Q", email="fleet.chennai@jktyre.com",
                address="46, Greams Road, Thousand Lights, Chennai - 600006", status="ACTIVE"),
            models.Vendor(name="Madras Auto Works", category="Maintenance", contact_number="9884512367",
                gstin="33AABCM9823R1Z6", pan="AABCM9823R", email="service@madrasautoworks.com",
                address="12, Kamarajar Salai, Koyambedu, Chennai - 600107", status="ACTIVE"),
            models.Vendor(name="Sri Murugan Fleet Services", category="Maintenance", contact_number="9444678901",
                gstin="33AABCS8812S1Z3", pan="AABCS8812S", email="info@srimuruganfleet.com",
                address="Survey No. 23, VOC Port Road, Tuticorin - 628001", status="ACTIVE"),
            models.Vendor(name="IOC Petrol Bunk - Royapuram", category="Fuel Station", contact_number="9840234567",
                gstin="33AABCI3371T1Z9", pan="AABCI3371T", email="royapuram.bunk@iocl.com",
                address="65, Royapuram High Road, Royapuram, Chennai - 600013", status="ACTIVE"),
            models.Vendor(name="BPCL Auto Fuels - Tuticorin Port", category="Fuel Station", contact_number="9361890123",
                gstin="33AABCB5521U1Z7", pan="AABCB5521U", email="tut.port@bpcl.in",
                address="Port Gate No.2, VOC Port, Tuticorin - 628004", status="ACTIVE"),
            models.Vendor(name="National Insurance Co Ltd", category="Insurance", contact_number="04428512345",
                gstin="33AABCN8234V1Z1", pan="AABCN8234V",
                email="claims.chennai@nationalinsurance.nic.co.in",
                address="National Insurance Building, 8 Whites Road, Chennai - 600014", status="ACTIVE"),
            models.Vendor(name="Bosch Car Service Chennai", category="Spare Parts", contact_number="04428998765",
                gstin="33AABCB6678W1Z5", pan="AABCB6678W", email="spares@boschservicechennai.com",
                address="18, Purasaiwalkam High Road, Kilpauk, Chennai - 600010", status="ACTIVE"),
        ]
        db.add_all(vendors)

        # -------------------------------------------------------------------
        # 6. TYRE INVENTORY
        # -------------------------------------------------------------------
        tyres = [
            models.TyreInventory(brand="Apollo",     tyre_type="Tubeless Radial",  tyre_number="APO-R225-001",  size="11R22.5",     range_km=80000, cost=18500, condition="New",        purchase_date=date(2024, 8, 10)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tubeless Radial",  tyre_number="APO-R225-002",  size="11R22.5",     range_km=80000, cost=18500, condition="New",        purchase_date=date(2024, 8, 10)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tubeless Radial",  tyre_number="APO-R225-003",  size="11R22.5",     range_km=80000, cost=18500, condition="New",        purchase_date=date(2024, 10, 5)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tubeless Radial",  tyre_number="APO-R225-004",  size="11R22.5",     range_km=80000, cost=18500, condition="New",        purchase_date=date(2024, 10, 5)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tube Type Radial", tyre_number="APO-R20-001",   size="10.00 R20",   range_km=70000, cost=14200, condition="New",        purchase_date=date(2024, 7, 20)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tube Type Radial", tyre_number="APO-R20-002",   size="10.00 R20",   range_km=70000, cost=14200, condition="New",        purchase_date=date(2024, 7, 20)),
            models.TyreInventory(brand="MRF",        tyre_type="Tubeless Radial",  tyre_number="MRF-R225-001",  size="11R22.5",     range_km=85000, cost=19800, condition="New",        purchase_date=date(2024, 9, 15)),
            models.TyreInventory(brand="MRF",        tyre_type="Tubeless Radial",  tyre_number="MRF-R225-002",  size="11R22.5",     range_km=85000, cost=19800, condition="New",        purchase_date=date(2024, 9, 15)),
            models.TyreInventory(brand="MRF",        tyre_type="Tubeless Radial",  tyre_number="MRF-R225-003",  size="11R22.5",     range_km=85000, cost=19800, condition="New",        purchase_date=date(2025, 1, 8)),
            models.TyreInventory(brand="MRF",        tyre_type="Tube Type Radial", tyre_number="MRF-R20-001",   size="10.00 R20",   range_km=72000, cost=15000, condition="New",        purchase_date=date(2024, 11, 25)),
            models.TyreInventory(brand="MRF",        tyre_type="Tube Type Radial", tyre_number="MRF-R20-002",   size="10.00 R20",   range_km=72000, cost=15000, condition="New",        purchase_date=date(2024, 11, 25)),
            models.TyreInventory(brand="CEAT",       tyre_type="Tubeless Radial",  tyre_number="CEAT-2958-001", size="295/80 R22.5",range_km=75000, cost=17500, condition="New",        purchase_date=date(2025, 2, 14)),
            models.TyreInventory(brand="CEAT",       tyre_type="Tubeless Radial",  tyre_number="CEAT-2958-002", size="295/80 R22.5",range_km=75000, cost=17500, condition="New",        purchase_date=date(2025, 2, 14)),
            models.TyreInventory(brand="JK Tyre",    tyre_type="Tubeless Radial",  tyre_number="JKT-R225-001",  size="11R22.5",     range_km=78000, cost=18000, condition="New",        purchase_date=date(2025, 3, 20)),
            models.TyreInventory(brand="JK Tyre",    tyre_type="Tubeless Radial",  tyre_number="JKT-R225-002",  size="11R22.5",     range_km=78000, cost=18000, condition="New",        purchase_date=date(2025, 3, 20)),
            models.TyreInventory(brand="Birla",      tyre_type="Tube Type Radial", tyre_number="BIR-R20-001",   size="10.00 R20",   range_km=40000, cost=7800,  condition="Rethreaded", purchase_date=date(2024, 6, 5), retread_cost=3500, retread_count=1),
            models.TyreInventory(brand="Birla",      tyre_type="Tube Type Radial", tyre_number="BIR-R20-002",   size="10.00 R20",   range_km=40000, cost=7800,  condition="Rethreaded", purchase_date=date(2024, 6, 5), retread_cost=3500, retread_count=1),
            models.TyreInventory(brand="Bridgestone", tyre_type="Tubeless Radial", tyre_number="BRDG-R225-001", size="11R22.5",     range_km=90000, cost=22000, condition="New",        purchase_date=date(2025, 4, 12)),
            models.TyreInventory(brand="Bridgestone", tyre_type="Tubeless Radial", tyre_number="BRDG-R225-002", size="11R22.5",     range_km=90000, cost=22000, condition="New",        purchase_date=date(2025, 4, 12)),
            models.TyreInventory(brand="Apollo",     tyre_type="Tube Type Radial", tyre_number="APO-R20-003",   size="10.00 R20",   range_km=70000, cost=14200, condition="New",        purchase_date=date(2025, 5, 2)),
        ]
        db.add_all(tyres)

        # -------------------------------------------------------------------
        # 7. SAC CODES
        # -------------------------------------------------------------------
        sac_codes = [
            models.SacCode(code="996511", description="Road transport services for goods including containers by road", gst_rate=5.00),
            models.SacCode(code="996512", description="Transport of goods by refrigerated vehicles", gst_rate=5.00),
            models.SacCode(code="996521", description="Coastal and inland water transport services of goods", gst_rate=5.00),
            models.SacCode(code="996719", description="Other cargo handling services including container handling", gst_rate=18.00),
            models.SacCode(code="996731", description="Customs clearance services", gst_rate=18.00),
            models.SacCode(code="996799", description="Other supporting transport services", gst_rate=18.00),
            models.SacCode(code="9965",   description="Goods transport services (GTA)", gst_rate=12.00),
        ]
        db.add_all(sac_codes)

        # -------------------------------------------------------------------
        # 8. REPAIR TYPES
        # -------------------------------------------------------------------
        repair_types = [
            models.RepairType(name="Tyre Puncture Repair",      default_cost=500),
            models.RepairType(name="Engine Oil Change",         default_cost=4500),
            models.RepairType(name="Air Filter Replacement",    default_cost=1200),
            models.RepairType(name="Brake Pad Replacement",     default_cost=3500),
            models.RepairType(name="Clutch Plate Replacement",  default_cost=12000),
            models.RepairType(name="Fuel Filter Replacement",   default_cost=800),
            models.RepairType(name="Battery Replacement",       default_cost=8000),
            models.RepairType(name="Radiator Flush & Service",  default_cost=2500),
            models.RepairType(name="Suspension Repair",         default_cost=7500),
            models.RepairType(name="Alternator Repair",         default_cost=5500),
            models.RepairType(name="Gear Box Service",          default_cost=18000),
            models.RepairType(name="Differential Service",      default_cost=6000),
        ]
        db.add_all(repair_types)

        # Commit 1 — all master data
        db.commit()

        for obj in trucks + drivers + staff + customers + tyres:
            db.refresh(obj)

        # -------------------------------------------------------------------
        # 9. CUSTOMER DESTINATIONS
        # -------------------------------------------------------------------
        destinations = [
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Sriperumbudur Industrial Zone",       destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Oragadam Logistics Hub",              destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Mahindra World City, Chengalpattu",   destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Bengaluru Bommasandra Industrial Area",destination_state="Karnataka",   status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Hyderabad Patancheru",                destination_state="Telangana",   status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Coimbatore Ganapathy",                destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Irungattukottai SIPCOT",              destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Ambattur Industrial Estate",          destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Manali Petrochemical Zone",           destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Hosur Industrial Area",               destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Ennore Port CFS",                     destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Singaperumalkoil",                    destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[4].id, destination_name="Kattupalli Port",                     destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[4].id, destination_name="JNPT Nhava Sheva",                    destination_state="Maharashtra", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[4].id, destination_name="Ennore CFS",                          destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[5].id, destination_name="Tuticorin Port Trust",                destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[5].id, destination_name="SPIC Complex Manapad",                destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[5].id, destination_name="Tirunelveli Industrial Estate",       destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[6].id, destination_name="Ennore CFS",                          destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[6].id, destination_name="Mundra Port",                         destination_state="Gujarat",     status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[6].id, destination_name="JNPT Nhava Sheva",                    destination_state="Maharashtra", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Cuddalore Industrial Area",           destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Salem Cement Depot",                  destination_state="Tamil Nadu",  status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Tiruchirappalli Distribution Hub",    destination_state="Tamil Nadu",  status="ACTIVE"),
        ]
        db.add_all(destinations)

        # -------------------------------------------------------------------
        # 10. CUSTOMER PRICING
        # -------------------------------------------------------------------
        pricing = [
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",    cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=16500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",    cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=10500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",    cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="Between 20 - 25 Tons",   rate=19000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Oragadam Logistics Hub",           cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=14000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Oragadam Logistics Hub",           cargo_classification="EXPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=9000,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Mahindra World City, Chengalpattu",cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="Between 20 - 25 Tons",   rate=18500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Bengaluru Bommasandra Industrial Area", cargo_classification="IMPORT", container_type="40 FEET",  weight_in_tons="NORMAL",                 rate=32000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Bengaluru Bommasandra Industrial Area", cargo_classification="IMPORT", container_type="20 FEET",  weight_in_tons="NORMAL",                 rate=21000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Hyderabad Patancheru",             cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=42000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Coimbatore Ganapathy",             cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=16500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Coimbatore Ganapathy",             cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=24000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",           cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=13500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",           cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=12000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",           cargo_classification="EXPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=8000,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Ambattur Industrial Estate",       cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=8500,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Manali Petrochemical Zone",        cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="Between 20 - 25 Tons",   rate=11000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Hosur Industrial Area",            cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=28000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Hosur Industrial Area",            cargo_classification="EXPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=18000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Ennore Port CFS",                  cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=7500,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Singaperumalkoil",                 cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=15000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Kattupalli Port",                  cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=8000,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Kattupalli Port",                  cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=12500, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="JNPT Nhava Sheva",                 cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=55000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Ennore CFS",                       cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=9500,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tuticorin Port Trust",             cargo_classification="IMPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=5000,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tuticorin Port Trust",             cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=8500,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tirunelveli Industrial Estate",    cargo_classification="OPEN LOAD", container_type="OPEN LOAD",  weight_in_tons="Between 25-28 Tons",     rate=12000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="Ennore CFS",                       cargo_classification="IMPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=11000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="Mundra Port",                      cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=68000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="JNPT Nhava Sheva",                 cargo_classification="EXPORT",    container_type="20 FEET",    weight_in_tons="NORMAL",                 rate=38000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="JNPT Nhava Sheva",                 cargo_classification="EXPORT",    container_type="40 FEET",    weight_in_tons="NORMAL",                 rate=58000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Cuddalore Industrial Area",        cargo_classification="OPEN LOAD", container_type="OPEN LOAD",  weight_in_tons="Between 28-30 Tons",     rate=9500,  status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Salem Cement Depot",               cargo_classification="OPEN LOAD", container_type="OPEN LOAD",  weight_in_tons="Between 25-28 Tons",     rate=14000, status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Tiruchirappalli Distribution Hub", cargo_classification="OPEN LOAD", container_type="OPEN LOAD",  weight_in_tons="Between 20 - 25 Tons",   rate=11500, status="ACTIVE"),
        ]
        db.add_all(pricing)

        # -------------------------------------------------------------------
        # 11. DRIVER ASSIGNMENTS
        # -------------------------------------------------------------------
        assignments = [
            models.DriverAssignment(driver_id="CGI-D001", vehicle_id="CGI-T001"),
            models.DriverAssignment(driver_id="CGI-D002", vehicle_id="CGI-T002"),
            models.DriverAssignment(driver_id="CGI-D003", vehicle_id="CGI-T003"),
            models.DriverAssignment(driver_id="CGI-D004", vehicle_id="CGI-T004"),
            models.DriverAssignment(driver_id="CGI-D005", vehicle_id="CGI-T005"),
            models.DriverAssignment(driver_id="CGI-D006", vehicle_id="CGI-T006"),
            models.DriverAssignment(driver_id="CGI-D007", vehicle_id="CGI-T007"),
            models.DriverAssignment(driver_id="CGI-D008", vehicle_id="CGI-T008"),
        ]
        db.add_all(assignments)

        # -------------------------------------------------------------------
        # 12. MAINTENANCE RECORDS
        # -------------------------------------------------------------------
        maintenance_records = [
            # CGI-T001
            models.MaintenanceRecord(truck_id=trucks[0].id, date=date(2025, 2, 10), odometer=28000, maintenance_type="Engine Oil Change",       description="Full synthetic oil change + oil filter", cost=4800),
            models.MaintenanceRecord(truck_id=trucks[0].id, date=date(2025, 6, 18), odometer=35000, maintenance_type="Brake Pad Replacement",    description="Front and rear brake pads replaced",     cost=7200),
            models.MaintenanceRecord(truck_id=trucks[0].id, date=date(2026, 1, 5),  odometer=37800, maintenance_type="Air Filter Replacement",   description="Air filter and cabin filter replaced",    cost=1500),
            # CGI-T002
            models.MaintenanceRecord(truck_id=trucks[1].id, date=date(2025, 3, 22), odometer=44000, maintenance_type="Engine Oil Change",        description="Oil change with filter",                 cost=4500),
            models.MaintenanceRecord(truck_id=trucks[1].id, date=date(2025, 8, 14), odometer=49000, maintenance_type="Clutch Plate Replacement", description="Clutch plate and pressure plate replaced",cost=13500),
            models.MaintenanceRecord(truck_id=trucks[1].id, date=date(2026, 2, 28), odometer=51800, maintenance_type="Radiator Flush & Service", description="Radiator flush and coolant replacement",  cost=2800),
            # CGI-T003
            models.MaintenanceRecord(truck_id=trucks[2].id, date=date(2025, 5, 10), odometer=15000, maintenance_type="Engine Oil Change",        description="First scheduled oil change",              cost=5200),
            models.MaintenanceRecord(truck_id=trucks[2].id, date=date(2025, 11, 20),odometer=20000, maintenance_type="Fuel Filter Replacement",  description="Fuel and oil filter replaced",            cost=1200),
            # CGI-T004
            models.MaintenanceRecord(truck_id=trucks[3].id, date=date(2025, 4, 8),  odometer=36000, maintenance_type="Engine Oil Change",        description="Oil change with filter",                 cost=4500),
            models.MaintenanceRecord(truck_id=trucks[3].id, date=date(2025, 10, 15),odometer=42000, maintenance_type="Suspension Repair",        description="Front leaf spring replacement",           cost=8500),
            # CGI-T005
            models.MaintenanceRecord(truck_id=trucks[4].id, date=date(2025, 9, 3),  odometer=14000, maintenance_type="Engine Oil Change",        description="Scheduled oil change",                   cost=5000),
            models.MaintenanceRecord(truck_id=trucks[4].id, date=date(2026, 3, 12), odometer=17500, maintenance_type="Air Filter Replacement",   description="Air filter replaced",                    cost=1200),
            # CGI-T006
            models.MaintenanceRecord(truck_id=trucks[5].id, date=date(2025, 1, 20), odometer=68000, maintenance_type="Gear Box Service",         description="Gear box oil change and inspection",     cost=6500),
            models.MaintenanceRecord(truck_id=trucks[5].id, date=date(2025, 7, 5),  odometer=74000, maintenance_type="Engine Oil Change",        description="Oil change with filter",                 cost=4500),
            models.MaintenanceRecord(truck_id=trucks[5].id, date=date(2026, 1, 30), odometer=77500, maintenance_type="Battery Replacement",      description="Battery replaced - old battery dead",    cost=8200),
            # CGI-T007
            models.MaintenanceRecord(truck_id=trucks[6].id, date=date(2025, 12, 10),odometer=7000,  maintenance_type="Engine Oil Change",        description="First scheduled oil change",              cost=5500),
            # CGI-T008
            models.MaintenanceRecord(truck_id=trucks[7].id, date=date(2026, 2, 14), odometer=9000,  maintenance_type="Engine Oil Change",        description="Scheduled oil change",                   cost=5200),
            models.MaintenanceRecord(truck_id=trucks[7].id, date=date(2026, 5, 20), odometer=10800, maintenance_type="Air Filter Replacement",   description="Air and fuel filter replaced",            cost=1400),
        ]
        db.add_all(maintenance_records)

        # -------------------------------------------------------------------
        # 13. FUEL LOGS
        # -------------------------------------------------------------------
        fuel_logs = [
            # CGI-T001
            models.FuelLog(truck_id=trucks[0].id, date=date(2026, 5, 10), odometer=37200, litres=320, price_per_litre=96.50, total_cost=30880, distance=480, mileage=1.50, fuel_station="IOC Petrol Bunk - Royapuram",         logged_by="Murugan Selvam"),
            models.FuelLog(truck_id=trucks[0].id, date=date(2026, 6, 2),  odometer=37900, litres=280, price_per_litre=96.80, total_cost=27104, distance=420, mileage=1.50, fuel_station="HP Fuel Station - Poonamallee",       logged_by="Murugan Selvam"),
            models.FuelLog(truck_id=trucks[0].id, date=date(2026, 6, 20), odometer=38450, litres=340, price_per_litre=97.00, total_cost=32980, distance=510, mileage=1.50, fuel_station="IOC Petrol Bunk - Royapuram",         logged_by="Murugan Selvam"),
            # CGI-T002
            models.FuelLog(truck_id=trucks[1].id, date=date(2026, 4, 15), odometer=51200, litres=220, price_per_litre=96.50, total_cost=21230, distance=330, mileage=1.50, fuel_station="BPCL Auto Fuels - Tuticorin Port",   logged_by="Kannan Raju"),
            models.FuelLog(truck_id=trucks[1].id, date=date(2026, 5, 28), odometer=51800, litres=200, price_per_litre=96.80, total_cost=19360, distance=310, mileage=1.55, fuel_station="IOC Fuel Station - Tuticorin",        logged_by="Kannan Raju"),
            models.FuelLog(truck_id=trucks[1].id, date=date(2026, 6, 18), odometer=52300, litres=240, price_per_litre=97.00, total_cost=23280, distance=360, mileage=1.50, fuel_station="BPCL Auto Fuels - Tuticorin Port",   logged_by="Kannan Raju"),
            # CGI-T003
            models.FuelLog(truck_id=trucks[2].id, date=date(2026, 5, 5),  odometer=20800, litres=310, price_per_litre=96.50, total_cost=29915, distance=465, mileage=1.50, fuel_station="IOC Petrol Bunk - Royapuram",         logged_by="Arumugam Pillai"),
            models.FuelLog(truck_id=trucks[2].id, date=date(2026, 6, 12), odometer=21800, litres=330, price_per_litre=97.00, total_cost=32010, distance=480, mileage=1.45, fuel_station="HP Fuel Station - Ambattur",           logged_by="Arumugam Pillai"),
            # CGI-T004
            models.FuelLog(truck_id=trucks[3].id, date=date(2026, 5, 20), odometer=43200, litres=210, price_per_litre=96.50, total_cost=20265, distance=315, mileage=1.50, fuel_station="BPCL Auto Fuels - Tuticorin Port",   logged_by="Senthil Kumar"),
            models.FuelLog(truck_id=trucks[3].id, date=date(2026, 6, 22), odometer=44100, litres=230, price_per_litre=97.00, total_cost=22310, distance=345, mileage=1.50, fuel_station="IOC Fuel Station - Tuticorin",        logged_by="Senthil Kumar"),
            # CGI-T005
            models.FuelLog(truck_id=trucks[4].id, date=date(2026, 5, 15), odometer=17800, litres=330, price_per_litre=96.50, total_cost=31845, distance=495, mileage=1.50, fuel_station="HP Fuel Station - Poonamallee",       logged_by="Balasubramanian Krishnan"),
            models.FuelLog(truck_id=trucks[4].id, date=date(2026, 6, 10), odometer=18600, litres=300, price_per_litre=97.00, total_cost=29100, distance=450, mileage=1.50, fuel_station="IOC Petrol Bunk - Royapuram",         logged_by="Balasubramanian Krishnan"),
            # CGI-T006
            models.FuelLog(truck_id=trucks[5].id, date=date(2026, 5, 25), odometer=77400, litres=190, price_per_litre=96.50, total_cost=18335, distance=285, mileage=1.50, fuel_station="BPCL Auto Fuels - Tuticorin Port",   logged_by="Thangavel Natarajan"),
            models.FuelLog(truck_id=trucks[5].id, date=date(2026, 6, 24), odometer=78200, litres=210, price_per_litre=97.00, total_cost=20370, distance=310, mileage=1.48, fuel_station="IOC Fuel Station - Tuticorin",        logged_by="Thangavel Natarajan"),
            # CGI-T007
            models.FuelLog(truck_id=trucks[6].id, date=date(2026, 6, 5),  odometer=8900,  litres=320, price_per_litre=97.00, total_cost=31040, distance=480, mileage=1.50, fuel_station="IOC Petrol Bunk - Royapuram",         logged_by="Palani Swamy"),
            models.FuelLog(truck_id=trucks[6].id, date=date(2026, 6, 25), odometer=9400,  litres=340, price_per_litre=97.00, total_cost=32980, distance=510, mileage=1.50, fuel_station="HP Fuel Station - Ambattur",           logged_by="Palani Swamy"),
            # CGI-T008
            models.FuelLog(truck_id=trucks[7].id, date=date(2026, 6, 8),  odometer=10700, litres=310, price_per_litre=97.00, total_cost=30070, distance=465, mileage=1.50, fuel_station="BPCL Auto Fuels - Tuticorin Port",   logged_by="Rajasekaran Dharmalingam"),
            models.FuelLog(truck_id=trucks[7].id, date=date(2026, 6, 26), odometer=11200, litres=280, price_per_litre=97.00, total_cost=27160, distance=420, mileage=1.50, fuel_station="IOC Fuel Station - Tuticorin",        logged_by="Rajasekaran Dharmalingam"),
        ]
        db.add_all(fuel_logs)

        # -------------------------------------------------------------------
        # 14. TYRE FITMENT RECORDS
        # -------------------------------------------------------------------
        # CGI-T001 (10+1 articulated): fit Apollo 11R22.5 on drive axles
        # CGI-T002 (6+1 rigid): fit MRF 10.00 R20 on axles
        tyre_fitments = [
            # CGI-T001 — 4 tyres fitted (front + two drive positions)
            models.TyreFitmentRecord(tyre_id=tyres[0].id,  truck_id=trucks[0].id, position="F1",  fitted_odometer=25000, fitted_date=date(2024, 8, 15)),
            models.TyreFitmentRecord(tyre_id=tyres[1].id,  truck_id=trucks[0].id, position="F2",  fitted_odometer=25000, fitted_date=date(2024, 8, 15)),
            models.TyreFitmentRecord(tyre_id=tyres[6].id,  truck_id=trucks[0].id, position="R1L", fitted_odometer=25000, fitted_date=date(2024, 9, 20)),
            models.TyreFitmentRecord(tyre_id=tyres[7].id,  truck_id=trucks[0].id, position="R1R", fitted_odometer=25000, fitted_date=date(2024, 9, 20)),
            models.TyreFitmentRecord(tyre_id=tyres[2].id,  truck_id=trucks[0].id, position="R2L", fitted_odometer=25000, fitted_date=date(2024, 10, 10)),
            models.TyreFitmentRecord(tyre_id=tyres[3].id,  truck_id=trucks[0].id, position="R2R", fitted_odometer=25000, fitted_date=date(2024, 10, 10)),
            # CGI-T002 — 4 tyres fitted
            models.TyreFitmentRecord(tyre_id=tyres[4].id,  truck_id=trucks[1].id, position="F1",  fitted_odometer=43000, fitted_date=date(2024, 7, 25)),
            models.TyreFitmentRecord(tyre_id=tyres[5].id,  truck_id=trucks[1].id, position="F2",  fitted_odometer=43000, fitted_date=date(2024, 7, 25)),
            models.TyreFitmentRecord(tyre_id=tyres[9].id,  truck_id=trucks[1].id, position="R1L", fitted_odometer=43000, fitted_date=date(2024, 11, 28)),
            models.TyreFitmentRecord(tyre_id=tyres[10].id, truck_id=trucks[1].id, position="R1R", fitted_odometer=43000, fitted_date=date(2024, 11, 28)),
            # CGI-T007 — 2 Bridgestone tyres (new truck)
            models.TyreFitmentRecord(tyre_id=tyres[17].id, truck_id=trucks[6].id, position="F1",  fitted_odometer=5000,  fitted_date=date(2025, 4, 15)),
            models.TyreFitmentRecord(tyre_id=tyres[18].id, truck_id=trucks[6].id, position="F2",  fitted_odometer=5000,  fitted_date=date(2025, 4, 15)),
        ]
        db.add_all(tyre_fitments)

        # -------------------------------------------------------------------
        # 15. EMI RECORDS
        # -------------------------------------------------------------------
        emi_records = [
            models.EmiRecord(
                emi_name="CGI-T007 BharatBenz Loan",
                truck_registration="TN 01 PQ 3579",
                loan_number="HDFC/CV/2023/TN/00451",
                bank_name="HDFC Bank Ltd",
                loan_amount=2800000,
                emi_start_date=date(2023, 5, 1),
                emi_end_date=date(2028, 4, 30),
                emi_amount=55200,
                tenure_months=60,
                emi_payment_date=date(2026, 7, 1),
            ),
            models.EmiRecord(
                emi_name="CGI-T008 Mahindra Blazo Loan",
                truck_registration="TN 69 RS 1357",
                loan_number="AXIS/CV/2023/TN/00789",
                bank_name="Axis Bank Ltd",
                loan_amount=3200000,
                emi_start_date=date(2023, 9, 1),
                emi_end_date=date(2028, 8, 31),
                emi_amount=63500,
                tenure_months=60,
                emi_payment_date=date(2026, 7, 1),
            ),
            models.EmiRecord(
                emi_name="CGI-T003 BharatBenz Loan",
                truck_registration="TN 01 CD 5678",
                loan_number="ICICI/CV/2022/TN/00312",
                bank_name="ICICI Bank Ltd",
                loan_amount=2600000,
                emi_start_date=date(2022, 3, 1),
                emi_end_date=date(2027, 2, 28),
                emi_amount=51800,
                tenure_months=60,
                emi_payment_date=date(2026, 7, 1),
            ),
        ]
        db.add_all(emi_records)

        # -------------------------------------------------------------------
        # 16. RECURRING PAYMENTS
        # -------------------------------------------------------------------
        recurring_payments = [
            models.RecurringPayment(title="Fleet Insurance Premium - Chennai Trucks",       category="Insurance",         amount=126000, frequency="Yearly",     next_due_date=date(2027, 1, 19), status="Active"),
            models.RecurringPayment(title="Fleet Insurance Premium - Tuticorin Trucks",    category="Insurance",         amount=118000, frequency="Yearly",     next_due_date=date(2026, 8, 4),  status="Active"),
            models.RecurringPayment(title="National Permit Renewal - All Trucks",          category="Permits",           amount=29900,  frequency="Yearly",     next_due_date=date(2027, 4, 1),  status="Active"),
            models.RecurringPayment(title="ERP Software Subscription",                     category="Software",          amount=12000,  frequency="Monthly",    next_due_date=date(2026, 7, 1),  status="Active"),
            models.RecurringPayment(title="Office Rent - Chennai HQ",                      category="Office Expenses",   amount=45000,  frequency="Monthly",    next_due_date=date(2026, 7, 1),  status="Active"),
            models.RecurringPayment(title="GST Filing Professional Fees",                  category="Professional Fees", amount=8500,   frequency="Monthly",    next_due_date=date(2026, 7, 5),  status="Active"),
            models.RecurringPayment(title="Vehicle Fitness Certificate Renewal - Q3",      category="Compliance",        amount=32000,  frequency="Quarterly",  next_due_date=date(2026, 9, 30), status="Active"),
        ]
        db.add_all(recurring_payments)

        # -------------------------------------------------------------------
        # 17. DRIVER ATTENDANCE — June 23–28, 2026 (Mon–Sat)
        # -------------------------------------------------------------------
        attendance_dates = [date(2026, 6, 23), date(2026, 6, 24), date(2026, 6, 25),
                            date(2026, 6, 26), date(2026, 6, 27), date(2026, 6, 28)]
        driver_statuses = [
            # D001–D008, each row is [Mon, Tue, Wed, Thu, Fri, Sat]
            ["Present", "Present", "Present", "Present", "Present", "Absent"],
            ["Present", "Present", "Absent",  "Present", "Present", "Present"],
            ["Present", "Present", "Present", "On Leave","On Leave","Absent"],
            ["Present", "Absent",  "Present", "Present", "Present", "Present"],
            ["Present", "Present", "Present", "Present", "Absent",  "Absent"],
            ["Absent",  "Present", "Present", "Present", "Present", "Present"],
            ["Present", "Present", "Present", "Present", "Present", "Absent"],
            ["Present", "Present", "Present", "Absent",  "Present", "Present"],
        ]
        driver_attendance = []
        for di, driver in enumerate(drivers):
            for di2, att_date in enumerate(attendance_dates):
                driver_attendance.append(models.DriverAttendance(
                    driver_id=driver.driver_id,
                    date=att_date,
                    status=driver_statuses[di][di2],
                    check_in_time="06:30" if driver_statuses[di][di2] == "Present" else None,
                    marked_at=datetime(2026, att_date.month, att_date.day, 7, 0, 0),
                ))
        db.add_all(driver_attendance)

        # -------------------------------------------------------------------
        # 18. STAFF ATTENDANCE — June 23–28, 2026
        # -------------------------------------------------------------------
        staff_statuses = [
            ["Present", "Present", "Present", "Present", "Present", "Absent"],
            ["Present", "Present", "Present", "Present", "Absent",  "Absent"],
            ["Present", "Present", "Present", "Present", "Present", "Present"],
            ["Present", "Absent",  "Present", "Present", "Present", "Absent"],
        ]
        staff_attendance = []
        for si, s in enumerate(staff):
            for di2, att_date in enumerate(attendance_dates):
                staff_attendance.append(models.StaffAttendance(
                    staff_id=s.id,
                    date=att_date,
                    status=staff_statuses[si][di2],
                    check_in_time="09:00" if staff_statuses[si][di2] == "Present" else None,
                    marked_at=datetime(2026, att_date.month, att_date.day, 9, 15, 0),
                    source="Web",
                ))
        db.add_all(staff_attendance)

        # -------------------------------------------------------------------
        # 19. LEAVE REQUESTS
        # -------------------------------------------------------------------
        leave_requests = [
            models.LeaveRequest(
                category="Driver", applicant_id=drivers[2].id,
                applicant_name="Arumugam Pillai", applicant_code="CGI-D003",
                from_date=date(2026, 6, 25), to_date=date(2026, 6, 26),
                reason="Family function - daughter's marriage ceremony",
                status="Approved",
                applied_at=datetime(2026, 6, 20, 10, 30, 0),
            ),
            models.LeaveRequest(
                category="Driver", applicant_id=drivers[0].id,
                applicant_name="Murugan Selvam", applicant_code="CGI-D001",
                from_date=date(2026, 7, 7), to_date=date(2026, 7, 9),
                reason="Medical treatment - knee surgery follow-up",
                status="Pending",
                applied_at=datetime(2026, 6, 28, 14, 0, 0),
            ),
            models.LeaveRequest(
                category="Staff", applicant_id=staff[1].id,
                applicant_name="Karthik Subramaniam", applicant_code="STF-1002",
                from_date=date(2026, 7, 14), to_date=date(2026, 7, 16),
                reason="Personal travel - annual family trip",
                status="Pending",
                applied_at=datetime(2026, 6, 29, 11, 0, 0),
            ),
        ]
        db.add_all(leave_requests)

        # -------------------------------------------------------------------
        # 20. COMPENSATION TRANSACTIONS
        # -------------------------------------------------------------------
        compensation = [
            # Driver advances on trips
            models.CompensationTransaction(person_type="driver", person_id=drivers[0].id, type="Advance", amount=2000,  date=date(2025, 10, 7),  note="Trip advance for TRP-1050", trip_number="TRP-1050"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[2].id, type="Advance", amount=1500,  date=date(2025, 11, 3),  note="Trip advance for TRP-1051", trip_number="TRP-1051"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[1].id, type="Advance", amount=1200,  date=date(2025, 12, 8),  note="Trip advance for TRP-1052", trip_number="TRP-1052"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[4].id, type="Advance", amount=2500,  date=date(2026, 1, 12),  note="Trip advance for TRP-1053", trip_number="TRP-1053"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[3].id, type="Advance", amount=1500,  date=date(2026, 6, 15),  note="Trip advance for TRP-1054", trip_number="TRP-1054"),
            # Monthly salaries — June 2026
            models.CompensationTransaction(person_type="driver", person_id=drivers[0].id, type="Salary",  amount=22000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[1].id, type="Salary",  amount=20000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[2].id, type="Salary",  amount=21000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[3].id, type="Salary",  amount=20000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[4].id, type="Salary",  amount=23000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[5].id, type="Salary",  amount=20000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[6].id, type="Salary",  amount=19000, date=date(2026, 6, 1),   note="June 2026 salary"),
            models.CompensationTransaction(person_type="driver", person_id=drivers[7].id, type="Salary",  amount=20500, date=date(2026, 6, 1),   note="June 2026 salary"),
            # Staff salaries — June 2026
            models.CompensationTransaction(person_type="staff",  person_id=staff[0].id,   type="Salary",  amount=55000, date=date(2026, 6, 1),   note="June 2026 salary - Admin"),
            models.CompensationTransaction(person_type="staff",  person_id=staff[1].id,   type="Salary",  amount=48000, date=date(2026, 6, 1),   note="June 2026 salary - Fleet Manager"),
            models.CompensationTransaction(person_type="staff",  person_id=staff[2].id,   type="Salary",  amount=52000, date=date(2026, 6, 1),   note="June 2026 salary - Finance Manager"),
            models.CompensationTransaction(person_type="staff",  person_id=staff[3].id,   type="Salary",  amount=38000, date=date(2026, 6, 1),   note="June 2026 salary - Tyre Manager"),
            # Staff advance
            models.CompensationTransaction(person_type="staff",  person_id=staff[2].id,   type="Advance", amount=15000, date=date(2026, 6, 10),  note="Personal advance request"),
        ]
        db.add_all(compensation)

        # Commit 2 — all dependent / transactional data
        db.commit()

        # -------------------------------------------------------------------
        # 21. TRIPS
        # -------------------------------------------------------------------
        trips = [
            # TRP-1050: Completed, Maersk, IMPORT 40FT, Chennai Port → Sriperumbudur
            models.Trip(
                trip_id="TRP-1050", status="Completed",
                booking_reference_no="BKG-2025-10234", booking_created_date=date(2025, 10, 5),
                assigned_date=date(2025, 10, 6), trip_category="OUTSTATION", movement_category="Own Fleet",
                customer_id=customers[0].id, shipper_consignee="Samsung India Electronics Pvt Ltd",
                cargo_classification="IMPORT", container_specification="40 FT CONTAINER",
                container_number="MSCU4512890", cargo_weight="26.5 Tons",
                origin="Chennai Port (INNSA)", destination="Sriperumbudur Industrial Zone",
                shipping_line="Maersk", vessel_name="Maersk Sentosa",
                transport_method="Own Fleet", scheduled_date=date(2025, 10, 7),
                driver_id="CGI-D001", vehicle_id="CGI-T001",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=2000, driver_advance_payment_method="CASH", driver_advance=2000,
                driver_compensation_type="Normal",
                transport_hire_amount=16500, transport_crossing_amount=0,
                verification_status="verified", is_invoiced=True,
            ),
            # TRP-1051: Completed, VRL Logistics, EXPORT 40FT, Chennai Port → Bengaluru
            models.Trip(
                trip_id="TRP-1051", status="Completed",
                booking_reference_no="BKG-2025-11089", booking_created_date=date(2025, 11, 2),
                assigned_date=date(2025, 11, 3), trip_category="OUTSTATION", movement_category="Own Fleet",
                customer_id=customers[1].id, shipper_consignee="Bosch Ltd Bengaluru",
                cargo_classification="EXPORT", container_specification="40 FT CONTAINER",
                container_number="HLXU7834521", cargo_weight="22.0 Tons",
                origin="Bengaluru Bommasandra Industrial Area", destination="Chennai Port (INNSA)",
                shipping_line="Hapag-Lloyd", vessel_name="HL Colombo",
                transport_method="Own Fleet", scheduled_date=date(2025, 11, 4),
                driver_id="CGI-D003", vehicle_id="CGI-T003",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=1500, driver_advance_payment_method="CASH", driver_advance=1500,
                driver_compensation_type="Normal",
                transport_hire_amount=32000, transport_crossing_amount=0,
                verification_status="verified", is_invoiced=True,
            ),
            # TRP-1052: Completed, CMA CGM, IMPORT 20FT, Chennai Port → Ambattur
            models.Trip(
                trip_id="TRP-1052", status="Completed",
                booking_reference_no="BKG-2025-12001", booking_created_date=date(2025, 12, 7),
                assigned_date=date(2025, 12, 8), trip_category="LOCAL", movement_category="Own Fleet",
                customer_id=customers[2].id, shipper_consignee="Hyundai Motor India Ltd",
                cargo_classification="IMPORT", container_specification="20 FT CONTAINER",
                container_number="CMAU2341567", cargo_weight="18.0 Tons",
                origin="Chennai Port (INNSA)", destination="Ambattur Industrial Estate",
                shipping_line="CMA CGM", vessel_name="CMA CGM Thalassa",
                transport_method="Own Fleet", scheduled_date=date(2025, 12, 9),
                driver_id="CGI-D002", vehicle_id="CGI-T002",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=1200, driver_advance_payment_method="CASH", driver_advance=1200,
                driver_compensation_type="Normal",
                transport_hire_amount=8500, transport_crossing_amount=0,
                verification_status="verified", is_invoiced=True,
            ),
            # TRP-1053: Completed, Maersk, EXPORT 40FT, Oragadam → Chennai Port
            models.Trip(
                trip_id="TRP-1053", status="Completed",
                booking_reference_no="BKG-2026-01045", booking_created_date=date(2026, 1, 10),
                assigned_date=date(2026, 1, 11), trip_category="LOCAL", movement_category="Own Fleet",
                customer_id=customers[0].id, shipper_consignee="Renault Nissan India Pvt Ltd",
                cargo_classification="EXPORT", container_specification="40 FT CONTAINER",
                container_number="MSKU8901234", cargo_weight="20.0 Tons",
                origin="Oragadam Logistics Hub", destination="Chennai Port (INNSA)",
                shipping_line="Maersk", vessel_name="Maersk Kimi",
                transport_method="Own Fleet", scheduled_date=date(2026, 1, 12),
                driver_id="CGI-D005", vehicle_id="CGI-T005",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=2500, driver_advance_payment_method="CASH", driver_advance=2500,
                driver_compensation_type="Normal",
                transport_hire_amount=14000, transport_crossing_amount=0,
                verification_status="verified", is_invoiced=False,
            ),
            # TRP-1054: On-Transit, Mediterranean Shipping, IMPORT 40FT, Chennai → Kattupalli
            models.Trip(
                trip_id="TRP-1054", status="On-Transit",
                booking_reference_no="BKG-2026-06112", booking_created_date=date(2026, 6, 12),
                assigned_date=date(2026, 6, 13), trip_category="LOCAL", movement_category="Own Fleet",
                customer_id=customers[4].id, shipper_consignee="Ashok Leyland Ltd",
                cargo_classification="IMPORT", container_specification="40 FT CONTAINER",
                container_number="MEDU9012345", cargo_weight="24.0 Tons",
                origin="Chennai Port (INNSA)", destination="Kattupalli Port",
                shipping_line="MSC", vessel_name="MSC Loreto",
                transport_method="Own Fleet", scheduled_date=date(2026, 6, 14),
                driver_id="CGI-D004", vehicle_id="CGI-T004",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=1500, driver_advance_payment_method="CASH", driver_advance=1500,
                driver_compensation_type="Normal",
                transport_hire_amount=12500, transport_crossing_amount=0,
                verification_status="pending", is_invoiced=False,
            ),
            # TRP-1055: Loaded, TVS Supply Chain, EXPORT 40FT, Hosur → Chennai Port
            models.Trip(
                trip_id="TRP-1055", status="Loaded",
                booking_reference_no="BKG-2026-06198", booking_created_date=date(2026, 6, 24),
                assigned_date=date(2026, 6, 25), trip_category="OUTSTATION", movement_category="Own Fleet",
                customer_id=customers[3].id, shipper_consignee="TVS Motor Company",
                cargo_classification="EXPORT", container_specification="40 FT CONTAINER",
                container_number="TCKU3456789", cargo_weight="21.5 Tons",
                origin="Hosur Industrial Area", destination="Chennai Port (INNSA)",
                shipping_line="Evergreen", vessel_name="Ever Goods",
                transport_method="Own Fleet", scheduled_date=date(2026, 6, 26),
                driver_id="CGI-D007", vehicle_id="CGI-T007",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=1800, driver_advance_payment_method="CASH", driver_advance=1800,
                driver_compensation_type="Normal",
                transport_hire_amount=28000, transport_crossing_amount=0,
                verification_status="pending", is_invoiced=False,
            ),
            # TRP-1056: Assigned, Evergreen Marine, IMPORT 20FT, Tuticorin → SPIC
            models.Trip(
                trip_id="TRP-1056", status="Assigned",
                booking_reference_no="BKG-2026-06215", booking_created_date=date(2026, 6, 28),
                assigned_date=date(2026, 6, 29), trip_category="LOCAL", movement_category="Own Fleet",
                customer_id=customers[6].id, shipper_consignee="Indian Oil Corporation",
                cargo_classification="IMPORT", container_specification="20 FT CONTAINER",
                container_number="EISU5678901", cargo_weight="15.0 Tons",
                origin="Tuticorin Port", destination="Ennore CFS",
                shipping_line="Evergreen", vessel_name="Ever Forward",
                transport_method="Own Fleet", scheduled_date=date(2026, 6, 30),
                driver_id="CGI-D008", vehicle_id="CGI-T008",
                bill_to="CUSTOMER", payment_type="Credit",
                driver_advance_amount=1000, driver_advance_payment_method="CASH", driver_advance=1000,
                driver_compensation_type="Normal",
                transport_hire_amount=11000, transport_crossing_amount=0,
                verification_status="pending", is_invoiced=False,
            ),
            # TRP-1057: On-Transit, SPIC India, OPEN LOAD, Tuticorin → Tirunelveli
            models.Trip(
                trip_id="TRP-1057", status="On-Transit",
                booking_reference_no="BKG-2026-06223", booking_created_date=date(2026, 6, 27),
                assigned_date=date(2026, 6, 28), trip_category="OUTSTATION", movement_category="Own Fleet",
                customer_id=customers[5].id, shipper_consignee="SPIC India Ltd - Tirunelveli Plant",
                cargo_classification="OPEN LOAD", container_specification="OPEN LOAD CARGO",
                container_number=None, cargo_weight="27.0 Tons",
                origin="Tuticorin Port Trust", destination="Tirunelveli Industrial Estate",
                shipping_line=None, vessel_name=None,
                transport_method="Own Fleet", scheduled_date=date(2026, 6, 28),
                driver_id="CGI-D006", vehicle_id="CGI-T006",
                bill_to="CUSTOMER", payment_type="Cash",
                driver_advance_amount=1500, driver_advance_payment_method="CASH", driver_advance=1500,
                driver_compensation_type="Normal",
                transport_hire_amount=12000, transport_crossing_amount=0,
                verification_status="pending", is_invoiced=False,
            ),
        ]
        db.add_all(trips)
        db.commit()

        for t in trips:
            db.refresh(t)

        # -------------------------------------------------------------------
        # 22. TRIP CLOSURES — for completed trips (TRP-1050 to TRP-1053)
        # -------------------------------------------------------------------
        closures = [
            models.TripClosure(
                trip_id=trips[0].id,
                booking_no="BKG-2025-10234", container_no="MSCU4512890",
                container_type="40 FT CONTAINER", line="Maersk", load_type="IMPORT",
                movement_category="Own Fleet",
                vehicle_id="CGI-T001", driver_id="CGI-D001", assignment_date=date(2025, 10, 6),
                from_location="Chennai Port (INNSA)", to_location="Sriperumbudur Industrial Zone",
                trip_completed_date=date(2025, 10, 8),
                hire_amount=16500, transport_amount=0, billing_amount=16500,
                advance_amount=0, driver_advance=2000, additional_driver_advance=0,
                payment_mode="Bank Transfer", bill_to="CUSTOMER",
                company_halt_days=0, party_halt_days=0, driver_halt_compensation=0,
            ),
            models.TripClosure(
                trip_id=trips[1].id,
                booking_no="BKG-2025-11089", container_no="HLXU7834521",
                container_type="40 FT CONTAINER", line="Hapag-Lloyd", load_type="EXPORT",
                movement_category="Own Fleet",
                vehicle_id="CGI-T003", driver_id="CGI-D003", assignment_date=date(2025, 11, 3),
                from_location="Bengaluru Bommasandra Industrial Area", to_location="Chennai Port (INNSA)",
                trip_completed_date=date(2025, 11, 6),
                hire_amount=32000, transport_amount=0, billing_amount=32000,
                advance_amount=0, driver_advance=1500, additional_driver_advance=0,
                payment_mode="Bank Transfer", bill_to="CUSTOMER",
                company_halt_days=1, party_halt_days=0, driver_halt_compensation=500,
                halt_remarks="Delayed loading at Bengaluru factory - 1 day halt",
            ),
            models.TripClosure(
                trip_id=trips[2].id,
                booking_no="BKG-2025-12001", container_no="CMAU2341567",
                container_type="20 FT CONTAINER", line="CMA CGM", load_type="IMPORT",
                movement_category="Own Fleet",
                vehicle_id="CGI-T002", driver_id="CGI-D002", assignment_date=date(2025, 12, 8),
                from_location="Chennai Port (INNSA)", to_location="Ambattur Industrial Estate",
                trip_completed_date=date(2025, 12, 9),
                hire_amount=8500, transport_amount=0, billing_amount=8500,
                advance_amount=0, driver_advance=1200, additional_driver_advance=0,
                payment_mode="Bank Transfer", bill_to="CUSTOMER",
                company_halt_days=0, party_halt_days=0, driver_halt_compensation=0,
            ),
            models.TripClosure(
                trip_id=trips[3].id,
                booking_no="BKG-2026-01045", container_no="MSKU8901234",
                container_type="40 FT CONTAINER", line="Maersk", load_type="EXPORT",
                movement_category="Own Fleet",
                vehicle_id="CGI-T005", driver_id="CGI-D005", assignment_date=date(2026, 1, 11),
                from_location="Oragadam Logistics Hub", to_location="Chennai Port (INNSA)",
                trip_completed_date=date(2026, 1, 12),
                hire_amount=14000, transport_amount=0, billing_amount=14000,
                advance_amount=0, driver_advance=2500, additional_driver_advance=0,
                payment_mode="Bank Transfer", bill_to="CUSTOMER",
                company_halt_days=0, party_halt_days=0, driver_halt_compensation=0,
            ),
        ]
        db.add_all(closures)

        # -------------------------------------------------------------------
        # 23. TRIP SHEETS — for completed trips
        # -------------------------------------------------------------------
        sheets = [
            models.TripSheet(
                trip_id=trips[0].id,
                trip_sheet_no="TS-1050", booking_reference_no="BKG-2025-10234",
                container_number="MSCU4512890", container_type="40 FT CONTAINER",
                line="Maersk", trip_type="IMPORT", vehicle_id="CGI-T001", driver_id="CGI-D001",
                booking_date=date(2025, 10, 5), trip_scheduled_date=date(2025, 10, 7),
                trip_completed_date=date(2025, 10, 8), trip_closed_date=date(2025, 10, 10),
                trip_sheet_date=date(2025, 10, 10),
                from_location="Chennai Port (INNSA)", to_location="Sriperumbudur Industrial Zone",
                clearing_agent="Canaan Clearing & Forwarding",
                hire_amount=16500,
                start_km=37100, end_km=37258, total_km=158, cargo_weight=26.5,
                driver_pay=1800, driver_advance_amount=2000, driver_balance=-200,
                total_halt_days=0, halt_pay=0,
                port_pass_expense=250, weight_sheet_expense=150, mamol_expense=200,
                claimable_mamol_expense=200, traffic_rto_expense=100,
                lift_on_off_expense=500, crane_operator_expense=0,
                parking_expense=0, puncture_expense=0, spare_parts_expense=0,
                other_expenses=100,
                toll_charges=480, toll_count=4,
                trip_expenses_total=1780, driver_expenses_total=1800,
                total_expense=3580, fuel_cost_approx=4500,
                remarks="Smooth delivery. Customer confirmed receipt.",
            ),
            models.TripSheet(
                trip_id=trips[1].id,
                trip_sheet_no="TS-1051", booking_reference_no="BKG-2025-11089",
                container_number="HLXU7834521", container_type="40 FT CONTAINER",
                line="Hapag-Lloyd", trip_type="EXPORT", vehicle_id="CGI-T003", driver_id="CGI-D003",
                booking_date=date(2025, 11, 2), trip_scheduled_date=date(2025, 11, 4),
                trip_completed_date=date(2025, 11, 6), trip_closed_date=date(2025, 11, 8),
                trip_sheet_date=date(2025, 11, 8),
                from_location="Bengaluru Bommasandra Industrial Area", to_location="Chennai Port (INNSA)",
                clearing_agent="Global Freight Solutions",
                hire_amount=32000,
                start_km=20900, end_km=21250, total_km=350, cargo_weight=22.0,
                driver_pay=3200, driver_advance_amount=1500, driver_balance=1700,
                total_halt_days=1, halt_pay=500, halt_remarks="Factory gate closed - waited overnight",
                port_pass_expense=250, weight_sheet_expense=200, mamol_expense=300,
                claimable_mamol_expense=300, traffic_rto_expense=200,
                lift_on_off_expense=600, crane_operator_expense=0,
                parking_expense=200, puncture_expense=0, spare_parts_expense=0,
                other_expenses=150,
                toll_charges=1200, toll_count=8,
                trip_expenses_total=3100, driver_expenses_total=3200,
                total_expense=6300, fuel_cost_approx=9800,
                remarks="1 day halt at Bommasandra - factory delayed stuffing.",
            ),
            models.TripSheet(
                trip_id=trips[2].id,
                trip_sheet_no="TS-1052", booking_reference_no="BKG-2025-12001",
                container_number="CMAU2341567", container_type="20 FT CONTAINER",
                line="CMA CGM", trip_type="IMPORT", vehicle_id="CGI-T002", driver_id="CGI-D002",
                booking_date=date(2025, 12, 7), trip_scheduled_date=date(2025, 12, 9),
                trip_completed_date=date(2025, 12, 9), trip_closed_date=date(2025, 12, 10),
                trip_sheet_date=date(2025, 12, 10),
                from_location="Chennai Port (INNSA)", to_location="Ambattur Industrial Estate",
                clearing_agent="Canaan Clearing & Forwarding",
                hire_amount=8500,
                start_km=50900, end_km=51025, total_km=125, cargo_weight=18.0,
                driver_pay=900, driver_advance_amount=1200, driver_balance=-300,
                total_halt_days=0, halt_pay=0,
                port_pass_expense=250, weight_sheet_expense=100, mamol_expense=150,
                claimable_mamol_expense=150, traffic_rto_expense=100,
                lift_on_off_expense=400, crane_operator_expense=0,
                parking_expense=0, puncture_expense=0, spare_parts_expense=0,
                other_expenses=50,
                toll_charges=300, toll_count=3,
                trip_expenses_total=1350, driver_expenses_total=900,
                total_expense=2250, fuel_cost_approx=3500,
                remarks="Quick delivery, no delays.",
            ),
            models.TripSheet(
                trip_id=trips[3].id,
                trip_sheet_no="TS-1053", booking_reference_no="BKG-2026-01045",
                container_number="MSKU8901234", container_type="40 FT CONTAINER",
                line="Maersk", trip_type="EXPORT", vehicle_id="CGI-T005", driver_id="CGI-D005",
                booking_date=date(2026, 1, 10), trip_scheduled_date=date(2026, 1, 12),
                trip_completed_date=date(2026, 1, 12), trip_closed_date=date(2026, 1, 14),
                trip_sheet_date=date(2026, 1, 14),
                from_location="Oragadam Logistics Hub", to_location="Chennai Port (INNSA)",
                clearing_agent="Canaan Clearing & Forwarding",
                hire_amount=14000,
                start_km=17600, end_km=17740, total_km=140, cargo_weight=20.0,
                driver_pay=1500, driver_advance_amount=2500, driver_balance=-1000,
                total_halt_days=0, halt_pay=0,
                port_pass_expense=250, weight_sheet_expense=150, mamol_expense=200,
                claimable_mamol_expense=200, traffic_rto_expense=100,
                lift_on_off_expense=500, crane_operator_expense=0,
                parking_expense=0, puncture_expense=500, spare_parts_expense=0,
                other_expenses=100,
                toll_charges=420, toll_count=3,
                trip_expenses_total=2220, driver_expenses_total=1500,
                total_expense=3720, fuel_cost_approx=4000,
                remarks="Minor puncture repaired on NH32. No major delays.",
            ),
        ]
        db.add_all(sheets)

        # -------------------------------------------------------------------
        # 24. TRIP INVOICES — for trips 0, 1, 2 (invoiced)
        # -------------------------------------------------------------------
        invoices = [
            models.TripInvoice(
                trip_id=trips[0].id,
                invoice_no="CGI/2025-26/001", invoice_date=date(2025, 10, 12),
                invoice_type="Tax Invoice",
                bill_to="Maersk India Pvt Ltd",
                gst_number="33AABCM5678F1Z3",
                mode_of_shipment="Sea", container_type="40 FT CONTAINER",
                shipping_line="Maersk", vessel_name="Maersk Sentosa",
                origin="Chennai Port (INNSA)", destination="Sriperumbudur Industrial Zone",
                container_no="MSCU4512890", consignee="Samsung India Electronics Pvt Ltd",
                services=[
                    {"description": "Road Transport - Chennai Port to Sriperumbudur", "sac_code": "996511", "amount": 16500, "gst_rate": 5}
                ],
                bank_name="State Bank of India", branch_name="Anna Salai Branch",
                account_number="10234567890", ifsc_code="SBIN0000001",
                contact_person="Admin User", email="admin@canaan.com", contact="9988776655",
                narration="Transport of IMPORT cargo from Chennai Port to Sriperumbudur.",
                gst_applicable="Yes", igst_applicable="No",
            ),
            models.TripInvoice(
                trip_id=trips[1].id,
                invoice_no="CGI/2025-26/002", invoice_date=date(2025, 11, 10),
                invoice_type="Tax Invoice",
                bill_to="VRL Logistics Ltd",
                gst_number="29AABCV4321H1Z7",
                mode_of_shipment="Sea", container_type="40 FT CONTAINER",
                shipping_line="Hapag-Lloyd", vessel_name="HL Colombo",
                origin="Bengaluru Bommasandra Industrial Area", destination="Chennai Port (INNSA)",
                container_no="HLXU7834521", consignee="Bosch Ltd Bengaluru",
                services=[
                    {"description": "Road Transport - Bengaluru to Chennai Port (EXPORT)", "sac_code": "996511", "amount": 32000, "gst_rate": 5},
                    {"description": "Halt Charges (1 Day)", "sac_code": "996719", "amount": 500, "gst_rate": 18}
                ],
                bank_name="State Bank of India", branch_name="Anna Salai Branch",
                account_number="10234567890", ifsc_code="SBIN0000001",
                contact_person="Admin User", email="admin@canaan.com", contact="9988776655",
                narration="Transport of EXPORT cargo Bengaluru to Chennai Port including halt charges.",
                gst_applicable="Yes", igst_applicable="Yes",
            ),
            models.TripInvoice(
                trip_id=trips[2].id,
                invoice_no="CGI/2025-26/003", invoice_date=date(2025, 12, 12),
                invoice_type="Tax Invoice",
                bill_to="CMA CGM India Pvt Ltd",
                gst_number="33AABCC1122G1Z8",
                mode_of_shipment="Sea", container_type="20 FT CONTAINER",
                shipping_line="CMA CGM", vessel_name="CMA CGM Thalassa",
                origin="Chennai Port (INNSA)", destination="Ambattur Industrial Estate",
                container_no="CMAU2341567", consignee="Hyundai Motor India Ltd",
                services=[
                    {"description": "Road Transport - Chennai Port to Ambattur (IMPORT 20FT)", "sac_code": "996511", "amount": 8500, "gst_rate": 5}
                ],
                bank_name="State Bank of India", branch_name="Anna Salai Branch",
                account_number="10234567890", ifsc_code="SBIN0000001",
                contact_person="Admin User", email="admin@canaan.com", contact="9988776655",
                narration="Transport of IMPORT cargo from Chennai Port to Ambattur Industrial Estate.",
                gst_applicable="Yes", igst_applicable="No",
            ),
        ]
        db.add_all(invoices)

        db.commit()

        # -------------------------------------------------------------------
        # Summary
        # -------------------------------------------------------------------
        print("=" * 65)
        print("  Canaan ERP — Seed data inserted successfully!")
        print("=" * 65)
        print(f"  Branches:                 {len(branches)}")
        print(f"  Trucks:                   {len(trucks)}")
        print(f"  Drivers:                  {len(drivers)}")
        print(f"  Staff:                    {len(staff)}")
        print(f"  Customers:                {len(customers)}")
        print(f"  Customer Destinations:    {len(destinations)}")
        print(f"  Customer Pricing:         {len(pricing)}")
        print(f"  Vendors:                  {len(vendors)}")
        print(f"  SAC Codes:                {len(sac_codes)}")
        print(f"  Repair Types:             {len(repair_types)}")
        print(f"  Tyre Inventory:           {len(tyres)}")
        print(f"  Tyre Fitment Records:     {len(tyre_fitments)}")
        print(f"  Driver Assignments:       {len(assignments)}")
        print(f"  Maintenance Records:      {len(maintenance_records)}")
        print(f"  Fuel Logs:                {len(fuel_logs)}")
        print(f"  EMI Records:              {len(emi_records)}")
        print(f"  Recurring Payments:       {len(recurring_payments)}")
        print(f"  Driver Attendance:        {len(driver_attendance)}")
        print(f"  Staff Attendance:         {len(staff_attendance)}")
        print(f"  Leave Requests:           {len(leave_requests)}")
        print(f"  Compensation Txns:        {len(compensation)}")
        print(f"  Trips:                    {len(trips)}")
        print(f"  Trip Closures:            {len(closures)}")
        print(f"  Trip Sheets:              {len(sheets)}")
        print(f"  Trip Invoices:            {len(invoices)}")
        print("=" * 65)

    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
