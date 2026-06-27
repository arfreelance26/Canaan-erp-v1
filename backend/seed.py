from database import SessionLocal
import models
from datetime import date
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
dummy_hash = pwd_ctx.hash("password123")


def seed():
    db = SessionLocal()
    try:
        # -------------------------------------------------------------------
        # 0. BRANCHES — seed before trucks/drivers/staff
        # -------------------------------------------------------------------
        branches = [
            models.Branch(
                name="CHENNAI",
                driver_halt_day_fee=500,
                driver_halt_day_percentage=5,
            ),
            models.Branch(
                name="TUTICORIN",
                driver_halt_day_fee=450,
                driver_halt_day_percentage=5,
            ),
        ]
        db.add_all(branches)
        db.commit()

        # -------------------------------------------------------------------
        # 1. FLEET (TRUCKS) — 8 trucks across Chennai and Tuticorin branches
        # -------------------------------------------------------------------
        trucks = [
            models.Truck(
                truck_id="CGI-T001",
                branch_registered_to="CHENNAI",
                registration_number="TN 01 AB 1234",
                manufacturer="Tata",
                model_name="Signa 4018.S",
                truck_type="40 FT ARTICULATED",
                chassis_number="MAT448930MH100212",
                year_of_manufacture="2021",
                tyre_layout="10+1",
                fuel_capacity=400,
                odometer_during_purchase=120,
                odometer=38450,
                rc_date=date(2021, 3, 15),
                fc_date=date(2021, 3, 15),
                fc_expiry_date=date(2027, 3, 14),
                fc_expenses=4500,
                road_tax_date=date(2021, 3, 15),
                road_tax_number="RTTNCHN2021001234",
                road_tax_expenses=18000,
                insurance_expiry_date=date(2026, 3, 14),
                national_permit_number="NPTNCHN2021001",
                national_permit_date=date(2021, 4, 1),
                national_permit_expenses=3500,
                local_permit_number="LPTNCHN2021001",
                local_permit_date=date(2021, 4, 1),
                local_permit_expenses=1200,
                pollution_certificate_date=date(2025, 9, 1),
                pollution_certificate_number="PCTN202500234",
                pollution_certificate_expenses=800,
            ),
            models.Truck(
                truck_id="CGI-T002",
                branch_registered_to="TUTICORIN",
                registration_number="TN 69 XY 9876",
                manufacturer="Ashok Leyland",
                model_name="3520",
                truck_type="20 FT RIGID",
                chassis_number="MBAJ42FT5ML231045",
                year_of_manufacture="2020",
                tyre_layout="6+1",
                fuel_capacity=300,
                odometer_during_purchase=80,
                odometer=52300,
                rc_date=date(2020, 6, 10),
                fc_date=date(2020, 6, 10),
                fc_expiry_date=date(2026, 6, 9),
                fc_expenses=3800,
                road_tax_date=date(2020, 6, 10),
                road_tax_number="RTTNTUT2020005678",
                road_tax_expenses=15000,
                insurance_expiry_date=date(2025, 6, 9),
                national_permit_number="NPTNTUT2020002",
                national_permit_date=date(2020, 7, 1),
                national_permit_expenses=3200,
                local_permit_number="LPTNTUT2020002",
                local_permit_date=date(2020, 7, 1),
                local_permit_expenses=1000,
                pollution_certificate_date=date(2025, 12, 1),
                pollution_certificate_number="PCTN202500455",
                pollution_certificate_expenses=700,
            ),
            models.Truck(
                truck_id="CGI-T003",
                branch_registered_to="CHENNAI",
                registration_number="TN 01 CD 5678",
                manufacturer="BharatBenz",
                model_name="4028R",
                chassis_number="MBAJ48FT9ML310078",
                year_of_manufacture="2022",
                truck_type="40 FT ARTICULATED",
                tyre_layout="10+1",
                fuel_capacity=420,
                odometer_during_purchase=200,
                odometer=21800,
                rc_date=date(2022, 1, 20),
                fc_date=date(2022, 1, 20),
                fc_expiry_date=date(2028, 1, 19),
                fc_expenses=4800,
                road_tax_date=date(2022, 1, 20),
                road_tax_number="RTTNCHN2022002345",
                road_tax_expenses=19500,
                insurance_expiry_date=date(2027, 1, 19),
                national_permit_number="NPTNCHN2022003",
                national_permit_date=date(2022, 2, 10),
                national_permit_expenses=3600,
                local_permit_number="LPTNCHN2022003",
                local_permit_date=date(2022, 2, 10),
                local_permit_expenses=1300,
                pollution_certificate_date=date(2026, 1, 19),
                pollution_certificate_number="PCTN202600102",
                pollution_certificate_expenses=800,
            ),
            models.Truck(
                truck_id="CGI-T004",
                branch_registered_to="TUTICORIN",
                registration_number="TN 69 GH 4321",
                manufacturer="Tata",
                model_name="Signa 3518.T",
                chassis_number="MAT448930NJ112034",
                year_of_manufacture="2021",
                truck_type="20 FT ARTICULATED",
                tyre_layout="6+1",
                fuel_capacity=320,
                odometer_during_purchase=50,
                odometer=44100,
                rc_date=date(2021, 8, 5),
                fc_date=date(2021, 8, 5),
                fc_expiry_date=date(2027, 8, 4),
                fc_expenses=4000,
                road_tax_date=date(2021, 8, 5),
                road_tax_number="RTTNTUT2021006789",
                road_tax_expenses=14500,
                insurance_expiry_date=date(2026, 8, 4),
                national_permit_number="NPTNTUT2021004",
                national_permit_date=date(2021, 9, 1),
                national_permit_expenses=3300,
                local_permit_number="LPTNTUT2021004",
                local_permit_date=date(2021, 9, 1),
                local_permit_expenses=1100,
                pollution_certificate_date=date(2025, 8, 1),
                pollution_certificate_number="PCTN202500677",
                pollution_certificate_expenses=750,
            ),
            models.Truck(
                truck_id="CGI-T005",
                branch_registered_to="CHENNAI",
                registration_number="TN 01 EF 7890",
                manufacturer="Ashok Leyland",
                model_name="4220",
                chassis_number="MBAJ48FT3MK290156",
                year_of_manufacture="2022",
                truck_type="40 FT ARTICULATED",
                tyre_layout="10+1",
                fuel_capacity=430,
                odometer_during_purchase=300,
                odometer=18600,
                rc_date=date(2022, 5, 12),
                fc_date=date(2022, 5, 12),
                fc_expiry_date=date(2028, 5, 11),
                fc_expenses=5000,
                road_tax_date=date(2022, 5, 12),
                road_tax_number="RTTNCHN2022003901",
                road_tax_expenses=20000,
                insurance_expiry_date=date(2027, 5, 11),
                national_permit_number="NPTNCHN2022005",
                national_permit_date=date(2022, 6, 1),
                national_permit_expenses=3700,
                local_permit_number="LPTNCHN2022005",
                local_permit_date=date(2022, 6, 1),
                local_permit_expenses=1350,
                pollution_certificate_date=date(2026, 5, 11),
                pollution_certificate_number="PCTN202600289",
                pollution_certificate_expenses=850,
            ),
            models.Truck(
                truck_id="CGI-T006",
                branch_registered_to="TUTICORIN",
                registration_number="TN 69 MN 2468",
                manufacturer="Tata",
                model_name="LPT 3118",
                chassis_number="MAT443050NK234567",
                year_of_manufacture="2019",
                truck_type="20 FT RIGID",
                tyre_layout="6+1",
                fuel_capacity=290,
                odometer_during_purchase=100,
                odometer=78200,
                rc_date=date(2019, 11, 20),
                fc_date=date(2019, 11, 20),
                fc_expiry_date=date(2025, 11, 19),
                fc_expenses=3500,
                road_tax_date=date(2019, 11, 20),
                road_tax_number="RTTNTUT2019007890",
                road_tax_expenses=13000,
                insurance_expiry_date=date(2025, 11, 19),
                national_permit_number="NPTNTUT2019006",
                national_permit_date=date(2019, 12, 10),
                national_permit_expenses=3000,
                local_permit_number="LPTNTUT2019006",
                local_permit_date=date(2019, 12, 10),
                local_permit_expenses=950,
                pollution_certificate_date=date(2025, 11, 1),
                pollution_certificate_number="PCTN202500812",
                pollution_certificate_expenses=700,
            ),
            models.Truck(
                truck_id="CGI-T007",
                branch_registered_to="CHENNAI",
                registration_number="TN 01 PQ 3579",
                manufacturer="BharatBenz",
                model_name="3528R",
                chassis_number="MBAJ48FT8ML340090",
                year_of_manufacture="2023",
                truck_type="40 FT RIGID",
                tyre_layout="10+1",
                fuel_capacity=410,
                odometer_during_purchase=150,
                odometer=9400,
                rc_date=date(2023, 3, 8),
                fc_date=date(2023, 3, 8),
                fc_expiry_date=date(2029, 3, 7),
                fc_expenses=5200,
                road_tax_date=date(2023, 3, 8),
                road_tax_number="RTTNCHN2023004012",
                road_tax_expenses=22000,
                insurance_expiry_date=date(2028, 3, 7),
                national_permit_number="NPTNCHN2023007",
                national_permit_date=date(2023, 3, 25),
                national_permit_expenses=3800,
                local_permit_number="LPTNCHN2023007",
                local_permit_date=date(2023, 3, 25),
                local_permit_expenses=1400,
                pollution_certificate_date=date(2027, 3, 7),
                pollution_certificate_number="PCTN202700045",
                pollution_certificate_expenses=900,
            ),
            models.Truck(
                truck_id="CGI-T008",
                branch_registered_to="TUTICORIN",
                registration_number="TN 69 RS 1357",
                manufacturer="Mahindra",
                model_name="Blazo X 40",
                chassis_number="MAZMK14RCNK100312",
                year_of_manufacture="2023",
                truck_type="40 FT ARTICULATED",
                tyre_layout="10+1",
                fuel_capacity=425,
                odometer_during_purchase=180,
                odometer=11200,
                rc_date=date(2023, 7, 14),
                fc_date=date(2023, 7, 14),
                fc_expiry_date=date(2029, 7, 13),
                fc_expenses=5000,
                road_tax_date=date(2023, 7, 14),
                road_tax_number="RTTNTUT2023008345",
                road_tax_expenses=21000,
                insurance_expiry_date=date(2028, 7, 13),
                national_permit_number="NPTNTUT2023008",
                national_permit_date=date(2023, 8, 1),
                national_permit_expenses=3700,
                local_permit_number="LPTNTUT2023008",
                local_permit_date=date(2023, 8, 1),
                local_permit_expenses=1250,
                pollution_certificate_date=date(2027, 7, 13),
                pollution_certificate_number="PCTN202700167",
                pollution_certificate_expenses=850,
            ),
        ]
        db.add_all(trucks)

        # -------------------------------------------------------------------
        # 2. DRIVERS — 8 drivers, mix of Chennai and Tuticorin branches
        # -------------------------------------------------------------------
        drivers = [
            models.Driver(
                driver_id="CGI-D001",
                name="Murugan Selvam",
                aadhaar_number="4521 6738 9012",
                date_of_birth=date(1985, 4, 12),
                date_of_joining=date(2019, 6, 1),
                email="murugan.selvam@canaanglobal.in",
                contact_number="9944112233",
                address="14, Gandhi Nagar, Royapuram, Chennai - 600013",
                branch="CHENNAI",
                license_number="TN01-2013-0034521",
                license_expiry_date=date(2027, 9, 30),
                form_11="Yes",
                esi_number="3110023456789",
                pan_number="BCDMS8765F",
                agreement_signed="Yes",
                bank_name="State Bank of India",
                bank_branch_name="Royapuram Branch",
                account_number="31245678901234",
                ifsc_code="SBIN0001234",
                username="murugan.selvam",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D002",
                name="Kannan Raju",
                aadhaar_number="8834 5601 2345",
                date_of_birth=date(1988, 7, 22),
                date_of_joining=date(2020, 1, 15),
                email="kannan.raju@canaanglobal.in",
                contact_number="9500334455",
                address="7, Sivakami Street, Thoothukudi, Tuticorin - 628002",
                branch="TUTICORIN",
                license_number="TN69-2016-0012389",
                license_expiry_date=date(2028, 3, 15),
                form_11="Yes",
                esi_number="3160034567890",
                pan_number="CDFKR9876G",
                agreement_signed="Yes",
                bank_name="Indian Bank",
                bank_branch_name="Tuticorin Main Branch",
                account_number="6234567890012",
                ifsc_code="IDIB000T001",
                username="kannan.raju",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D003",
                name="Arumugam Pillai",
                aadhaar_number="2213 4456 7890",
                date_of_birth=date(1982, 11, 3),
                date_of_joining=date(2018, 3, 10),
                email="arumugam.pillai@canaanglobal.in",
                contact_number="9789556677",
                address="22, Kamaraj Avenue, Perambur, Chennai - 600011",
                branch="CHENNAI",
                license_number="TN01-2011-0056789",
                license_expiry_date=date(2026, 5, 20),
                form_11="Yes",
                esi_number="3110045678901",
                pan_number="DEGAP7654H",
                agreement_signed="Yes",
                bank_name="Canara Bank",
                bank_branch_name="Perambur Branch",
                account_number="0789012345678",
                ifsc_code="CNRB0001567",
                username="arumugam.pillai",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D004",
                name="Senthil Kumar",
                aadhaar_number="5567 8901 2346",
                date_of_birth=date(1990, 2, 18),
                date_of_joining=date(2021, 7, 5),
                email="senthil.kumar@canaanglobal.in",
                contact_number="9443778899",
                address="3B, Port Road, Thoothukudi, Tuticorin - 628001",
                branch="TUTICORIN",
                license_number="TN69-2018-0078901",
                license_expiry_date=date(2029, 11, 10),
                form_11="Yes",
                esi_number="3160056789012",
                pan_number="EFGSK4321I",
                agreement_signed="Yes",
                bank_name="Union Bank of India",
                bank_branch_name="Tuticorin Port Branch",
                account_number="5123456789023",
                ifsc_code="UBIN0549876",
                username="senthil.kumar",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D005",
                name="Balasubramanian Krishnan",
                aadhaar_number="3344 5567 8901",
                date_of_birth=date(1979, 9, 25),
                date_of_joining=date(2017, 11, 20),
                email="bala.krishnan@canaanglobal.in",
                contact_number="9840990011",
                address="45, Poonamallee High Road, Padi, Chennai - 600050",
                branch="CHENNAI",
                license_number="TN01-2009-0089012",
                license_expiry_date=date(2025, 8, 14),
                form_11="Yes",
                esi_number="3110067890123",
                pan_number="FGHBK3210J",
                agreement_signed="Yes",
                bank_name="Bank of Baroda",
                bank_branch_name="Padi Chennai Branch",
                account_number="19280200001234",
                ifsc_code="BARB0PADINX",
                username="bala.krishnan",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D006",
                name="Thangavel Natarajan",
                aadhaar_number="6678 9012 3457",
                date_of_birth=date(1986, 5, 7),
                date_of_joining=date(2019, 9, 12),
                email="thangavel.n@canaanglobal.in",
                contact_number="9361122334",
                address="18, Ambalam Street, Kamarajnagar, Tuticorin - 628003",
                branch="TUTICORIN",
                license_number="TN69-2014-0090123",
                license_expiry_date=date(2026, 2, 28),
                form_11="No",
                esi_number="3160078901234",
                pan_number="GHITN2109K",
                agreement_signed="Yes",
                bank_name="Indian Overseas Bank",
                bank_branch_name="Tuticorin Branch",
                account_number="028602000009876",
                ifsc_code="IOBA0000286",
                username="thangavel.n",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D007",
                name="Palani Swamy",
                aadhaar_number="9901 2345 6789",
                date_of_birth=date(1992, 8, 14),
                date_of_joining=date(2022, 4, 18),
                email="palani.swamy@canaanglobal.in",
                contact_number="9566233445",
                address="9, Abirami Nagar, Ambattur, Chennai - 600053",
                branch="CHENNAI",
                license_number="TN01-2019-0101234",
                license_expiry_date=date(2030, 4, 18),
                form_11="Yes",
                esi_number="3110089012345",
                pan_number="HIJPS1098L",
                agreement_signed="Yes",
                bank_name="UCO Bank",
                bank_branch_name="Ambattur Branch",
                account_number="04220110234567",
                ifsc_code="UCBA0000422",
                username="palani.swamy",
                password_hash=dummy_hash,
            ),
            models.Driver(
                driver_id="CGI-D008",
                name="Rajasekaran Dharmalingam",
                aadhaar_number="1122 3344 5678",
                date_of_birth=date(1984, 12, 30),
                date_of_joining=date(2020, 10, 3),
                email="raja.dharmalingam@canaanglobal.in",
                contact_number="9787344556",
                address="6, Harbour View Colony, Thoothukudi, Tuticorin - 628004",
                branch="TUTICORIN",
                license_number="TN69-2012-0112345",
                license_expiry_date=date(2026, 9, 5),
                form_11="Yes",
                esi_number="3160090123456",
                pan_number="IJKRD0987M",
                agreement_signed="Yes",
                bank_name="Punjab National Bank",
                bank_branch_name="Tuticorin Branch",
                account_number="4012345678901",
                ifsc_code="PUNB0405800",
                username="raja.dharmalingam",
                password_hash=dummy_hash,
            ),
        ]
        db.add_all(drivers)

        # -------------------------------------------------------------------
        # 3. STAFF — Admin + Fleet Manager + Finance Manager + Tyre Manager
        # -------------------------------------------------------------------
        staff = [
            models.Staff(
                staff_id="STF-1001",
                name="Admin User",
                department="Administration",
                designation="System Administrator",
                software_designation="Admin",
                date_of_birth=date(1985, 6, 15),
                date_of_joining=date(2017, 1, 2),
                email="admin@canaan.com",
                contact_number="9988776655",
                address="Canaan Global HQ, Anna Salai, Chennai - 600002",
                branch="CHENNAI",
                aadhar_number="1100 2200 3300",
                username="admin",
                password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1002",
                name="Karthik Subramaniam",
                department="Operations",
                designation="Fleet Operations Manager",
                software_designation="Fleet Manager",
                date_of_birth=date(1987, 3, 22),
                date_of_joining=date(2018, 4, 10),
                email="karthik.s@canaan.com",
                contact_number="9876543210",
                address="23, Nandanam Extension, Chennai - 600035",
                branch="CHENNAI",
                aadhar_number="4400 5500 6600",
                username="karthik.subramaniam",
                password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1003",
                name="Priyanka Venkatesh",
                department="Finance",
                designation="Finance Manager",
                software_designation="Finance Manager",
                date_of_birth=date(1990, 9, 5),
                date_of_joining=date(2019, 7, 15),
                email="priyanka.v@canaan.com",
                contact_number="9443221100",
                address="14, Besant Nagar, 2nd Street, Chennai - 600090",
                branch="CHENNAI",
                aadhar_number="7700 8800 9900",
                username="priyanka.venkatesh",
                password_hash=dummy_hash,
            ),
            models.Staff(
                staff_id="STF-1004",
                name="Saravanan Murugesan",
                department="Maintenance",
                designation="Tyre Manager",
                software_designation="Tyre Manager",
                date_of_birth=date(1983, 12, 18),
                date_of_joining=date(2018, 11, 1),
                email="saravanan.m@canaan.com",
                contact_number="9362554433",
                address="5, Raja Street, Tuticorin - 628001",
                branch="TUTICORIN",
                aadhar_number="1122 3344 5566",
                username="saravanan.murugesan",
                password_hash=dummy_hash,
            ),
        ]
        db.add_all(staff)

        # -------------------------------------------------------------------
        # 4. CUSTOMERS — 8 shipping and transport companies
        # -------------------------------------------------------------------
        customers = [
            models.Customer(
                name="Maersk India Pvt Ltd",
                gstin="33AABCM5678F1Z3",
                contact_personnel_name="Vikram Nair",
                phone="04428456789",
                email="chennai@maersk.com",
                address="8th Floor, Prestige Tower, RK Salai, Mylapore, Chennai - 600004",
                customer_type="Shipping",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="VRL Logistics Ltd",
                gstin="29AABCV4321H1Z7",
                contact_personnel_name="Suresh Patil",
                phone="04428123456",
                email="operations@vrl.in",
                address="Plot 14, SIDCO Industrial Estate, Ambattur, Chennai - 600098",
                customer_type="Transports",
                status="ACTIVE",
                is_gta="Yes",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="CMA CGM India Pvt Ltd",
                gstin="33AABCC1122G1Z8",
                contact_personnel_name="Deepa Krishnamurthy",
                phone="04443214567",
                email="chennai.ops@cma-cgm.com",
                address="2nd Floor, Ceebros Centre, Montieth Road, Egmore, Chennai - 600008",
                customer_type="Shipping",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="TVS Supply Chain Solutions Ltd",
                gstin="33AABCT3344H1Z6",
                contact_personnel_name="Arvind Shankar",
                phone="04422334455",
                email="scm.chennai@tvs.in",
                address="TVS Building, 7th Floor, Anna Salai, Chennai - 600002",
                customer_type="Transports",
                status="ACTIVE",
                is_gta="Yes",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="Yes",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="Mediterranean Shipping Co India Pvt Ltd",
                gstin="33AABCM7788I1Z4",
                contact_personnel_name="Rajan Menon",
                phone="04428901234",
                email="chennai@msc.com",
                address="3rd Floor, Kences Towers, Nungambakkam, Chennai - 600034",
                customer_type="Shipping",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="SPIC India Limited",
                gstin="33AABCS9900J1Z5",
                contact_personnel_name="Anand Ramasamy",
                phone="04612345678",
                email="logistics@spic.in",
                address="SPIC House, 88, Mount Road, Guindy, Chennai - 600032",
                customer_type="Transports",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="Yes",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="Evergreen Marine India Pvt Ltd",
                gstin="33AABCE2233K1Z2",
                contact_personnel_name="Priya Venkataraman",
                phone="04428765432",
                email="chennai@evergreen-marine.com",
                address="Parsn Manere, 7th Floor, Anna Salai, Chennai - 600006",
                customer_type="Shipping",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
            models.Customer(
                name="Ramco Cements Ltd",
                gstin="33AABCR4455L1Z1",
                contact_personnel_name="Mahesh Venkatraman",
                phone="04428234567",
                email="logistics@ramcocements.com",
                address="Ramco Industries Building, Arunachalam Road, Rajapalayam - 626117",
                customer_type="Transports",
                status="ACTIVE",
                is_gta="No",
                applicable_for_e_invoice="Yes",
                tds_exemption_applicable="No",
                msme_declaration_submitted="No",
                gst_exempted_customer="No",
            ),
        ]
        db.add_all(customers)

        # -------------------------------------------------------------------
        # 5. VENDORS — 10 vendors covering tyres, maintenance, fuel, insurance
        # -------------------------------------------------------------------
        vendors = [
            models.Vendor(
                name="Apollo Tyres Ltd",
                category="Tyre Supplier",
                contact_number="04428991100",
                gstin="32AABCA0472N1ZP",
                pan="AABCA0472N",
                email="sales.chennai@apollotyres.com",
                address="Apollo House, 7 Rajiv Gandhi Salai, OMR, Chennai - 600119",
                status="ACTIVE",
            ),
            models.Vendor(
                name="MRF Limited",
                category="Tyre Supplier",
                contact_number="04428852200",
                gstin="33AABCM4449J1Z8",
                pan="AABCM4449J",
                email="tyresales@mrf.com",
                address="114, Greams Road, Chennai - 600006",
                status="ACTIVE",
            ),
            models.Vendor(
                name="CEAT Tyres",
                category="Tyre Supplier",
                contact_number="04428763300",
                gstin="33AABCC2786P1Z4",
                pan="AABCC2786P",
                email="dealer.chennai@ceat.com",
                address="Plot 45, Kodambakkam High Road, Chennai - 600024",
                status="ACTIVE",
            ),
            models.Vendor(
                name="JK Tyre Industries Ltd",
                category="Tyre Supplier",
                contact_number="04428674400",
                gstin="33AABCJ1879Q1Z2",
                pan="AABCJ1879Q",
                email="fleet.chennai@jktyre.com",
                address="46, Greams Road, Thousand Lights, Chennai - 600006",
                status="ACTIVE",
            ),
            models.Vendor(
                name="Madras Auto Works",
                category="Maintenance",
                contact_number="9884512367",
                gstin="33AABCM9823R1Z6",
                pan="AABCM9823R",
                email="service@madrasautoworks.com",
                address="12, Kamarajar Salai, Koyambedu, Chennai - 600107",
                status="ACTIVE",
            ),
            models.Vendor(
                name="Sri Murugan Fleet Services",
                category="Maintenance",
                contact_number="9444678901",
                gstin="33AABCS8812S1Z3",
                pan="AABCS8812S",
                email="info@srimuruganfleet.com",
                address="Survey No. 23, VOC Port Road, Tuticorin - 628001",
                status="ACTIVE",
            ),
            models.Vendor(
                name="IOC Petrol Bunk - Royapuram",
                category="Fuel Station",
                contact_number="9840234567",
                gstin="33AABCI3371T1Z9",
                pan="AABCI3371T",
                email="royapuram.bunk@iocl.com",
                address="65, Royapuram High Road, Royapuram, Chennai - 600013",
                status="ACTIVE",
            ),
            models.Vendor(
                name="BPCL Auto Fuels - Tuticorin Port",
                category="Fuel Station",
                contact_number="9361890123",
                gstin="33AABCB5521U1Z7",
                pan="AABCB5521U",
                email="tut.port@bpcl.in",
                address="Port Gate No.2, VOC Port, Tuticorin - 628004",
                status="ACTIVE",
            ),
            models.Vendor(
                name="National Insurance Co Ltd",
                category="Insurance",
                contact_number="04428512345",
                gstin="33AABCN8234V1Z1",
                pan="AABCN8234V",
                email="claims.chennai@nationalinsurance.nic.co.in",
                address="National Insurance Building, 8 Whites Road, Chennai - 600014",
                status="ACTIVE",
            ),
            models.Vendor(
                name="Bosch Car Service Chennai",
                category="Spare Parts",
                contact_number="04428998765",
                gstin="33AABCB6678W1Z5",
                pan="AABCB6678W",
                email="spares@boschservicechennai.com",
                address="18, Purasaiwalkam High Road, Kilpauk, Chennai - 600010",
                status="ACTIVE",
            ),
        ]
        db.add_all(vendors)

        # -------------------------------------------------------------------
        # 6. TYRE INVENTORY — 20 tyres across brands and sizes
        # -------------------------------------------------------------------
        tyres = [
            # Apollo Tyres — 11R22.5 for articulated trucks
            models.TyreInventory(brand="Apollo", tyre_type="Tubeless Radial", tyre_number="APO-R225-001", size="11R22.5", range_km=80000, cost=18500, condition="New", purchase_date=date(2024, 8, 10)),
            models.TyreInventory(brand="Apollo", tyre_type="Tubeless Radial", tyre_number="APO-R225-002", size="11R22.5", range_km=80000, cost=18500, condition="New", purchase_date=date(2024, 8, 10)),
            models.TyreInventory(brand="Apollo", tyre_type="Tubeless Radial", tyre_number="APO-R225-003", size="11R22.5", range_km=80000, cost=18500, condition="New", purchase_date=date(2024, 10, 5)),
            models.TyreInventory(brand="Apollo", tyre_type="Tubeless Radial", tyre_number="APO-R225-004", size="11R22.5", range_km=80000, cost=18500, condition="New", purchase_date=date(2024, 10, 5)),
            # Apollo — 10.00 R20 for rigid trucks
            models.TyreInventory(brand="Apollo", tyre_type="Tube Type Radial", tyre_number="APO-R20-001", size="10.00 R20", range_km=70000, cost=14200, condition="New", purchase_date=date(2024, 7, 20)),
            models.TyreInventory(brand="Apollo", tyre_type="Tube Type Radial", tyre_number="APO-R20-002", size="10.00 R20", range_km=70000, cost=14200, condition="New", purchase_date=date(2024, 7, 20)),
            # MRF Tyres — 11R22.5
            models.TyreInventory(brand="MRF", tyre_type="Tubeless Radial", tyre_number="MRF-R225-001", size="11R22.5", range_km=85000, cost=19800, condition="New", purchase_date=date(2024, 9, 15)),
            models.TyreInventory(brand="MRF", tyre_type="Tubeless Radial", tyre_number="MRF-R225-002", size="11R22.5", range_km=85000, cost=19800, condition="New", purchase_date=date(2024, 9, 15)),
            models.TyreInventory(brand="MRF", tyre_type="Tubeless Radial", tyre_number="MRF-R225-003", size="11R22.5", range_km=85000, cost=19800, condition="New", purchase_date=date(2025, 1, 8)),
            # MRF — 10.00 R20
            models.TyreInventory(brand="MRF", tyre_type="Tube Type Radial", tyre_number="MRF-R20-001", size="10.00 R20", range_km=72000, cost=15000, condition="New", purchase_date=date(2024, 11, 25)),
            models.TyreInventory(brand="MRF", tyre_type="Tube Type Radial", tyre_number="MRF-R20-002", size="10.00 R20", range_km=72000, cost=15000, condition="New", purchase_date=date(2024, 11, 25)),
            # CEAT Tyres — 295/80 R22.5
            models.TyreInventory(brand="CEAT", tyre_type="Tubeless Radial", tyre_number="CEAT-2958-001", size="295/80 R22.5", range_km=75000, cost=17500, condition="New", purchase_date=date(2025, 2, 14)),
            models.TyreInventory(brand="CEAT", tyre_type="Tubeless Radial", tyre_number="CEAT-2958-002", size="295/80 R22.5", range_km=75000, cost=17500, condition="New", purchase_date=date(2025, 2, 14)),
            # JK Tyre — 11R22.5
            models.TyreInventory(brand="JK Tyre", tyre_type="Tubeless Radial", tyre_number="JKT-R225-001", size="11R22.5", range_km=78000, cost=18000, condition="New", purchase_date=date(2025, 3, 20)),
            models.TyreInventory(brand="JK Tyre", tyre_type="Tubeless Radial", tyre_number="JKT-R225-002", size="11R22.5", range_km=78000, cost=18000, condition="New", purchase_date=date(2025, 3, 20)),
            # Birla Tyres — 10.00 R20 (rethreaded, cost-effective for shorter routes)
            models.TyreInventory(brand="Birla", tyre_type="Tube Type Radial", tyre_number="BIR-R20-001", size="10.00 R20", range_km=40000, cost=7800, condition="Rethreaded", purchase_date=date(2024, 6, 5), retread_cost=3500, retread_count=1),
            models.TyreInventory(brand="Birla", tyre_type="Tube Type Radial", tyre_number="BIR-R20-002", size="10.00 R20", range_km=40000, cost=7800, condition="Rethreaded", purchase_date=date(2024, 6, 5), retread_cost=3500, retread_count=1),
            # Bridgestone — 11R22.5 (premium, for newer trucks)
            models.TyreInventory(brand="Bridgestone", tyre_type="Tubeless Radial", tyre_number="BRDG-R225-001", size="11R22.5", range_km=90000, cost=22000, condition="New", purchase_date=date(2025, 4, 12)),
            models.TyreInventory(brand="Bridgestone", tyre_type="Tubeless Radial", tyre_number="BRDG-R225-002", size="11R22.5", range_km=90000, cost=22000, condition="New", purchase_date=date(2025, 4, 12)),
            # Apollo — Spare step-down tyre
            models.TyreInventory(brand="Apollo", tyre_type="Tube Type Radial", tyre_number="APO-R20-003", size="10.00 R20", range_km=70000, cost=14200, condition="New", purchase_date=date(2025, 5, 2)),
        ]
        db.add_all(tyres)

        # First commit — flush trucks, drivers, staff, customers, vendors, tyres
        db.commit()

        # Refresh customers to get auto-assigned IDs
        for c in customers:
            db.refresh(c)

        # -------------------------------------------------------------------
        # 7. CUSTOMER DESTINATIONS
        # -------------------------------------------------------------------
        destinations = [
            # Maersk India — local Chennai industrial zones
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Sriperumbudur Industrial Zone", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Oragadam Logistics Hub", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[0].id, destination_name="Mahindra World City, Chengalpattu", destination_state="Tamil Nadu", status="ACTIVE"),

            # VRL Logistics — inter-state outstation routes
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Bengaluru Bommasandra Industrial Area", destination_state="Karnataka", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Hyderabad Patancheru", destination_state="Telangana", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[1].id, destination_name="Coimbatore Ganapathy", destination_state="Tamil Nadu", status="ACTIVE"),

            # CMA CGM — Chennai inner industrial pockets
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Irungattukottai SIPCOT", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Ambattur Industrial Estate", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[2].id, destination_name="Manali Petrochemical Zone", destination_state="Tamil Nadu", status="ACTIVE"),

            # TVS Supply Chain — mixed local and outstation
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Hosur Industrial Area", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Ennore Port CFS", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[3].id, destination_name="Singaperumalkoil", destination_state="Tamil Nadu", status="ACTIVE"),

            # Mediterranean Shipping — CFS and long-haul ports
            models.CustomerDestination(customer_id=customers[4].id, destination_name="Kattupalli Port", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[4].id, destination_name="JNPT Nhava Sheva", destination_state="Maharashtra", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[4].id, destination_name="Ennore CFS", destination_state="Tamil Nadu", status="ACTIVE"),

            # SPIC India — Tuticorin and south Tamil Nadu
            models.CustomerDestination(customer_id=customers[5].id, destination_name="Tuticorin Port Trust", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[5].id, destination_name="SPIC Complex Manapad", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[5].id, destination_name="Tirunelveli Industrial Estate", destination_state="Tamil Nadu", status="ACTIVE"),

            # Evergreen Marine — pan-India port routes
            models.CustomerDestination(customer_id=customers[6].id, destination_name="Ennore CFS", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[6].id, destination_name="Mundra Port", destination_state="Gujarat", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[6].id, destination_name="JNPT Nhava Sheva", destination_state="Maharashtra", status="ACTIVE"),

            # Ramco Cements — bulk cement distribution routes
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Cuddalore Industrial Area", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Salem Cement Depot", destination_state="Tamil Nadu", status="ACTIVE"),
            models.CustomerDestination(customer_id=customers[7].id, destination_name="Tiruchirappalli Distribution Hub", destination_state="Tamil Nadu", status="ACTIVE"),
        ]
        db.add_all(destinations)

        # -------------------------------------------------------------------
        # 8. CUSTOMER PRICING
        # -------------------------------------------------------------------
        pricing = [
            # Maersk India — 40FT & 20FT IMPORT/EXPORT, FY 2025-26 rates
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",   load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=16500, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",   load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=10500, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Sriperumbudur Industrial Zone",   load_type="IMPORT", container_type="40 FEET", weight_in_tons="Between 20 - 25 Tons",   rate=19000, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Oragadam Logistics Hub",          load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=14000, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Oragadam Logistics Hub",          load_type="EXPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=9000,  valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[0].id, customer_destination="Mahindra World City, Chengalpattu", load_type="IMPORT", container_type="40 FEET", weight_in_tons="Between 20 - 25 Tons", rate=18500, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),

            # VRL Logistics — inter-state, higher rates
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Bengaluru Bommasandra Industrial Area", load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",           rate=32000, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Bengaluru Bommasandra Industrial Area", load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",           rate=21000, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Hyderabad Patancheru",           load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=42000, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Coimbatore Ganapathy",           load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=16500, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[1].id, customer_destination="Coimbatore Ganapathy",           load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=24000, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),

            # CMA CGM — local Chennai industrial
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",          load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=13500, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",          load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=12000, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Irungattukottai SIPCOT",          load_type="EXPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=8000,  valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Ambattur Industrial Estate",      load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=8500,  valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[2].id, customer_destination="Manali Petrochemical Zone",       load_type="IMPORT", container_type="20 FEET", weight_in_tons="Between 20 - 25 Tons",   rate=11000, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),

            # TVS Supply Chain
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Hosur Industrial Area",           load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=28000, valid_from=date(2025, 6, 1), valid_to=date(2026, 5, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Hosur Industrial Area",           load_type="EXPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=18000, valid_from=date(2025, 6, 1), valid_to=date(2026, 5, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Ennore Port CFS",                 load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=7500,  valid_from=date(2025, 6, 1), valid_to=date(2026, 5, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[3].id, customer_destination="Singaperumalkoil",                load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=15000, valid_from=date(2025, 6, 1), valid_to=date(2026, 5, 31), status="ACTIVE"),

            # Mediterranean Shipping Co — port to port and CFS
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Kattupalli Port",                 load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=8000,  valid_from=date(2025, 3, 1), valid_to=date(2026, 2, 28), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Kattupalli Port",                 load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=12500, valid_from=date(2025, 3, 1), valid_to=date(2026, 2, 28), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="JNPT Nhava Sheva",                load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=55000, valid_from=date(2025, 3, 1), valid_to=date(2026, 2, 28), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[4].id, customer_destination="Ennore CFS",                      load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=9500,  valid_from=date(2025, 3, 1), valid_to=date(2026, 2, 28), status="ACTIVE"),

            # SPIC India — Tuticorin local and south TN
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tuticorin Port Trust",            load_type="IMPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=5000,  valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tuticorin Port Trust",            load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=8500,  valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[5].id, customer_destination="Tirunelveli Industrial Estate",   load_type="OPEN LOAD", container_type="OPEN LOAD", weight_in_tons="Between 25-28 Tons", rate=12000, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31), status="ACTIVE"),

            # Evergreen Marine — CFS and long-haul
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="Ennore CFS",                      load_type="IMPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=11000, valid_from=date(2025, 5, 1), valid_to=date(2026, 4, 30), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="Mundra Port",                     load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=68000, valid_from=date(2025, 5, 1), valid_to=date(2026, 4, 30), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="JNPT Nhava Sheva",                load_type="EXPORT", container_type="20 FEET", weight_in_tons="NORMAL",                 rate=38000, valid_from=date(2025, 5, 1), valid_to=date(2026, 4, 30), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[6].id, customer_destination="JNPT Nhava Sheva",                load_type="EXPORT", container_type="40 FEET", weight_in_tons="NORMAL",                 rate=58000, valid_from=date(2025, 5, 1), valid_to=date(2026, 4, 30), status="ACTIVE"),

            # Ramco Cements — open load bulk cement
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Cuddalore Industrial Area",       load_type="OPEN LOAD", container_type="OPEN LOAD", weight_in_tons="Between 28-30 Tons", rate=9500,  valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Salem Cement Depot",              load_type="OPEN LOAD", container_type="OPEN LOAD", weight_in_tons="Between 25-28 Tons", rate=14000, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
            models.CustomerPricing(customer_id=customers[7].id, customer_destination="Tiruchirappalli Distribution Hub",load_type="OPEN LOAD", container_type="OPEN LOAD", weight_in_tons="Between 20 - 25 Tons", rate=11500, valid_from=date(2025, 4, 1), valid_to=date(2026, 3, 31), status="ACTIVE"),
        ]
        db.add_all(destinations + pricing)

        # -------------------------------------------------------------------
        # 9. DRIVER ASSIGNMENTS — pair each driver to a truck
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

        db.commit()
        print("=" * 60)
        print("Seed data inserted successfully!")
        print("=" * 60)
        print(f"  Branches:              {len(branches)}")
        print(f"  Trucks:                {len(trucks)}")
        print(f"  Drivers:               {len(drivers)}")
        print(f"  Staff:                 {len(staff)}")
        print(f"  Customers:             {len(customers)}")
        print(f"  Customer Destinations: {len(destinations)}")
        print(f"  Customer Pricing:      {len(pricing)}")
        print(f"  Vendors:               {len(vendors)}")
        print(f"  Tyre Inventory:        {len(tyres)}")
        print(f"  Driver Assignments:    {len(assignments)}")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
