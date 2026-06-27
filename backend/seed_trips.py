"""
Seed realistic trips for Canaan Global ERP.
Run after seed.py (requires customers, drivers, and trucks to exist).
"""
from database import SessionLocal
import models
from datetime import date


def seed_trips():
    db = SessionLocal()
    try:
        # -----------------------------------------------------------------------
        # Resolve customer IDs by name (safe regardless of insertion order)
        # -----------------------------------------------------------------------
        def cid(name: str) -> int:
            c = db.query(models.Customer).filter(models.Customer.name == name).first()
            if not c:
                raise ValueError(f"Customer not found: {name}")
            return c.id

        maersk_id    = cid("Maersk India Pvt Ltd")
        vrl_id       = cid("VRL Logistics Ltd")
        cma_id       = cid("CMA CGM India Pvt Ltd")
        tvs_id       = cid("TVS Supply Chain Solutions Ltd")
        msc_id       = cid("Mediterranean Shipping Co India Pvt Ltd")
        spic_id      = cid("SPIC India Limited")
        evergreen_id = cid("Evergreen Marine India Pvt Ltd")
        ramco_id     = cid("Ramco Cements Ltd")

        # -----------------------------------------------------------------------
        # 12 trips across all workflow stages
        # -----------------------------------------------------------------------
        # Active trips — each driver/truck assigned to at most one active trip
        # Completed trips — can reuse drivers (historical records)
        # -----------------------------------------------------------------------

        trips = [

            # --- ASSIGNED (4 trips waiting to start) ---

            models.Trip(
                trip_id="TRP-1050",
                status="Assigned",
                assigned_date=date(2026, 6, 25),
                booking_reference_no="BKG-CHN-2026-001",
                booking_created_date=date(2026, 6, 24),
                trip_category="LOCAL CFS",
                movement_category="Own Fleet",
                customer_id=maersk_id,
                shipper_consignee="ABB India Limited",
                cargo_classification="IMPORT",
                container_specification="40 FT CONTAINER",
                container_number="MAEU2410345",
                cargo_reference="CR-MAEU-20260624",
                release_order_reference="RO-CHN-2026-001",
                cargo_weight=22.5,
                origin="Chennai Port Trust - Gate 3",
                destination="Sriperumbudur Industrial Zone",
                shipping_line="Maersk",
                vessel_name="Maersk Kotka",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 27),
                driver_id="CGI-D001",
                vehicle_id="CGI-T001",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=3000,
                customer_fuel_advance_litres=25,
                driver_advance_amount=1500,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=16500,
            ),

            models.Trip(
                trip_id="TRP-1051",
                status="Assigned",
                assigned_date=date(2026, 6, 26),
                booking_reference_no="BKG-CHN-2026-002",
                booking_created_date=date(2026, 6, 25),
                trip_category="LOCAL",
                movement_category="Own Fleet",
                customer_id=cma_id,
                shipper_consignee="Hyundai Motor India Ltd",
                cargo_classification="EXPORT",
                container_specification="40 FT CONTAINER",
                container_number="CGMU3821456",
                cargo_reference="CR-CGMU-20260625",
                release_order_reference="RO-CHN-2026-002",
                cargo_weight=18.0,
                origin="Irungattukottai SIPCOT",
                destination="Chennai Port Trust - Export Gate",
                shipping_line="CMA CGM",
                vessel_name="CMA CGM Tago",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 27),
                driver_id="CGI-D003",
                vehicle_id="CGI-T003",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=2500,
                customer_fuel_advance_litres=20,
                driver_advance_amount=1500,
                driver_advance_payment_method="NEFT/IMPS/UPI",
                driver_compensation_type="Normal",
                transport_hire_amount=12000,
            ),

            models.Trip(
                trip_id="TRP-1052",
                status="Assigned",
                assigned_date=date(2026, 6, 27),
                booking_reference_no="BKG-CHN-2026-003",
                booking_created_date=date(2026, 6, 26),
                trip_category="LOCAL CFS",
                movement_category="Own Fleet",
                customer_id=msc_id,
                shipper_consignee="Kattupalli Port Container Terminal",
                cargo_classification="IMPORT",
                container_specification="20 FT CONTAINER",
                container_number="MSCU1234987",
                cargo_reference="CR-MSCU-20260626",
                release_order_reference="RO-CHN-2026-003",
                cargo_weight=16.5,
                origin="Kattupalli Port",
                destination="Ennore CFS",
                shipping_line="Mediterranean Shipping Company",
                vessel_name="MSC Rachele",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 28),
                driver_id="CGI-D007",
                vehicle_id="CGI-T007",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=2000,
                customer_fuel_advance_litres=16,
                driver_advance_amount=1200,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=8000,
            ),

            models.Trip(
                trip_id="TRP-1053",
                status="Assigned",
                assigned_date=date(2026, 6, 27),
                booking_reference_no="BKG-TUT-2026-001",
                booking_created_date=date(2026, 6, 26),
                trip_category="LOCAL",
                movement_category="Own Fleet",
                customer_id=spic_id,
                shipper_consignee="SPIC India Ltd",
                cargo_classification="IMPORT",
                container_specification="20 FT CONTAINER",
                container_number="TCKU5671234",
                cargo_reference="CR-SPIC-20260626",
                release_order_reference="RO-TUT-2026-001",
                cargo_weight=14.0,
                origin="Tuticorin Port Trust - Berth 6",
                destination="SPIC Complex Manapad",
                shipping_line="PIL",
                vessel_name="Wan Hai 291",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 28),
                driver_id="CGI-D008",
                vehicle_id="CGI-T008",
                bill_to="CUSTOMER",
                payment_type="Cash",
                customer_cash_advance=2000,
                customer_fuel_advance_amount=0,
                customer_fuel_advance_litres=0,
                driver_advance_amount=1000,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=5000,
            ),

            # --- STARTED (trip begun, cargo not yet loaded) ---

            models.Trip(
                trip_id="TRP-1054",
                status="Started",
                assigned_date=date(2026, 6, 23),
                booking_reference_no="BKG-CHN-2026-004",
                booking_created_date=date(2026, 6, 22),
                trip_category="OUTSTATION",
                movement_category="Own Fleet",
                customer_id=vrl_id,
                shipper_consignee="VRL Logistics Ltd",
                cargo_classification="IMPORT",
                container_specification="20 FT CONTAINER",
                container_number="EISU7821034",
                cargo_reference="CR-VRL-20260622",
                release_order_reference="RO-CHN-2026-004",
                cargo_weight=19.0,
                origin="Chennai Port Trust - Gate 1",
                destination="Bengaluru Bommasandra Industrial Area",
                shipping_line="Evergreen Marine",
                vessel_name="Ever Living",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 23),
                driver_id="CGI-D002",
                vehicle_id="CGI-T002",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=8000,
                customer_fuel_advance_litres=65,
                driver_advance_amount=3000,
                driver_advance_payment_method="NEFT/IMPS/UPI",
                driver_compensation_type="Normal",
                transport_hire_amount=21000,
            ),

            # --- LOADED (truck loaded, not yet departed) ---

            models.Trip(
                trip_id="TRP-1055",
                status="Loaded",
                assigned_date=date(2026, 6, 22),
                booking_reference_no="BKG-CHN-2026-005",
                booking_created_date=date(2026, 6, 21),
                trip_category="OUTSTATION",
                movement_category="Own Fleet",
                customer_id=evergreen_id,
                shipper_consignee="Evergreen Marine India Pvt Ltd",
                cargo_classification="EXPORT",
                container_specification="40 FT CONTAINER",
                container_number="EITU3456789",
                cargo_reference="CR-EVG-20260621",
                release_order_reference="RO-CHN-2026-005",
                cargo_weight=24.0,
                origin="Ennore CFS",
                destination="JNPT Nhava Sheva",
                shipping_line="Evergreen Marine",
                vessel_name="Ever Living",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 22),
                driver_id="CGI-D004",
                vehicle_id="CGI-T004",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=15000,
                customer_fuel_advance_litres=120,
                driver_advance_amount=5000,
                driver_advance_payment_method="Both",
                driver_compensation_type="Normal",
                transport_hire_amount=38000,
            ),

            # --- ON-TRANSIT (truck on the road) ---

            models.Trip(
                trip_id="TRP-1056",
                status="On-Transit",
                assigned_date=date(2026, 6, 20),
                booking_reference_no="BKG-TUT-2026-002",
                booking_created_date=date(2026, 6, 19),
                trip_category="LOCAL",
                movement_category="Own Fleet",
                customer_id=ramco_id,
                shipper_consignee="Ramco Cements Ltd",
                cargo_classification="OPEN LOAD",
                container_specification="OPEN LOAD CARGO",
                cargo_reference="CR-RAMCO-20260619",
                cargo_weight=28.5,
                origin="Ramco Plant, Rajapalayam",
                destination="Cuddalore Industrial Area",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 20),
                driver_id="CGI-D006",
                vehicle_id="CGI-T006",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=5000,
                customer_fuel_advance_litres=40,
                driver_advance_amount=2000,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=9500,
            ),

            # --- REACHED (truck at destination, not yet unloaded) ---

            models.Trip(
                trip_id="TRP-1057",
                status="Reached",
                assigned_date=date(2026, 6, 19),
                booking_reference_no="BKG-CHN-2026-006",
                booking_created_date=date(2026, 6, 18),
                trip_category="LOCAL CFS",
                movement_category="Own Fleet",
                customer_id=tvs_id,
                shipper_consignee="TVS Motor Company Ltd",
                cargo_classification="EXPORT",
                container_specification="40 FT CONTAINER",
                container_number="BMOU8901234",
                cargo_reference="CR-TVS-20260618",
                release_order_reference="RO-CHN-2026-006",
                cargo_weight=17.5,
                origin="Hosur Industrial Area",
                destination="Ennore Port CFS",
                shipping_line="Hapag-Lloyd",
                vessel_name="HL Copenhagen",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 19),
                driver_id="CGI-D005",
                vehicle_id="CGI-T005",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=7000,
                customer_fuel_advance_litres=56,
                driver_advance_amount=2500,
                driver_advance_payment_method="NEFT/IMPS/UPI",
                driver_compensation_type="Normal",
                transport_hire_amount=28000,
            ),

            # --- COMPLETED (historical trips) ---

            models.Trip(
                trip_id="TRP-1058",
                status="Completed",
                assigned_date=date(2026, 6, 5),
                booking_reference_no="BKG-CHN-2026-007",
                booking_created_date=date(2026, 6, 4),
                trip_category="LOCAL",
                movement_category="Own Fleet",
                customer_id=maersk_id,
                shipper_consignee="Samsung India Electronics Pvt Ltd",
                cargo_classification="EXPORT",
                container_specification="20 FT CONTAINER",
                container_number="MAEU1987654",
                cargo_reference="CR-MAEU-20260604",
                release_order_reference="RO-CHN-2026-007",
                cargo_weight=12.0,
                origin="Oragadam Logistics Hub",
                destination="Chennai Port Trust - Export Gate",
                shipping_line="Maersk",
                vessel_name="Maersk Saltoro",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 5),
                driver_id="CGI-D001",
                vehicle_id="CGI-T001",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=2000,
                customer_fuel_advance_litres=16,
                driver_advance_amount=1500,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=9000,
                verification_status="verified",
                is_invoiced=True,
            ),

            models.Trip(
                trip_id="TRP-1059",
                status="Completed",
                assigned_date=date(2026, 6, 8),
                booking_reference_no="BKG-CHN-2026-008",
                booking_created_date=date(2026, 6, 7),
                trip_category="LOCAL CFS",
                movement_category="Own Fleet",
                customer_id=cma_id,
                shipper_consignee="Ashok Leyland Ltd",
                cargo_classification="IMPORT",
                container_specification="40 FT CONTAINER",
                container_number="CGMU4512678",
                cargo_reference="CR-CGMU-20260607",
                release_order_reference="RO-CHN-2026-008",
                cargo_weight=21.0,
                origin="Chennai Port Trust - Gate 2",
                destination="Ambattur Industrial Estate",
                shipping_line="CMA CGM",
                vessel_name="CMA CGM Coral",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 8),
                driver_id="CGI-D003",
                vehicle_id="CGI-T003",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=2500,
                customer_fuel_advance_litres=20,
                driver_advance_amount=1500,
                driver_advance_payment_method="NEFT/IMPS/UPI",
                driver_compensation_type="Normal",
                transport_hire_amount=13500,
                verification_status="verified",
                is_invoiced=True,
            ),

            models.Trip(
                trip_id="TRP-1060",
                status="Completed",
                assigned_date=date(2026, 6, 10),
                booking_reference_no="BKG-TUT-2026-003",
                booking_created_date=date(2026, 6, 9),
                trip_category="LOCAL",
                movement_category="Own Fleet",
                customer_id=spic_id,
                shipper_consignee="SPIC India Ltd",
                cargo_classification="IMPORT",
                container_specification="20 FT CONTAINER",
                container_number="HLXU6782345",
                cargo_reference="CR-SPIC-20260609",
                release_order_reference="RO-TUT-2026-003",
                cargo_weight=13.5,
                origin="Tuticorin Port Trust - Berth 4",
                destination="Tirunelveli Industrial Estate",
                shipping_line="Hapag-Lloyd",
                vessel_name="HL Tokyo",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 10),
                driver_id="CGI-D006",
                vehicle_id="CGI-T006",
                bill_to="CUSTOMER",
                payment_type="Cash",
                customer_cash_advance=3000,
                customer_fuel_advance_amount=0,
                customer_fuel_advance_litres=0,
                driver_advance_amount=1000,
                driver_advance_payment_method="CASH",
                driver_compensation_type="Normal",
                transport_hire_amount=5000,
                verification_status="verified",
                is_invoiced=False,
            ),

            models.Trip(
                trip_id="TRP-1061",
                status="Completed",
                assigned_date=date(2026, 6, 12),
                booking_reference_no="BKG-CHN-2026-009",
                booking_created_date=date(2026, 6, 11),
                trip_category="OUTSTATION",
                movement_category="Own Fleet",
                customer_id=vrl_id,
                shipper_consignee="VRL Logistics Ltd",
                cargo_classification="EXPORT",
                container_specification="40 FT CONTAINER",
                container_number="EISU9012456",
                cargo_reference="CR-VRL-20260611",
                release_order_reference="RO-CHN-2026-009",
                cargo_weight=20.0,
                origin="Chennai Port Trust - Export Gate",
                destination="Hyderabad Patancheru",
                shipping_line="Evergreen Marine",
                vessel_name="Ever Grade",
                transport_method="Own Fleet",
                scheduled_date=date(2026, 6, 12),
                driver_id="CGI-D007",
                vehicle_id="CGI-T007",
                bill_to="CUSTOMER",
                payment_type="Credit",
                customer_cash_advance=0,
                customer_fuel_advance_amount=12000,
                customer_fuel_advance_litres=95,
                driver_advance_amount=4000,
                driver_advance_payment_method="Both",
                driver_compensation_type="Normal",
                transport_hire_amount=42000,
                verification_status="pending",
                is_invoiced=False,
            ),

        ]

        db.add_all(trips)
        db.commit()

        print("=" * 60)
        print("Trip seed data inserted successfully!")
        print("=" * 60)

        statuses = {}
        for t in trips:
            statuses.setdefault(t.status, 0)
            statuses[t.status] += 1
        for status, count in sorted(statuses.items()):
            print(f"  {status:<14}: {count} trip(s)")

        print("=" * 60)
        print("\nTrip → Driver assignments:")
        for t in trips:
            print(f"  {t.trip_id}  [{t.status:<10}]  {t.driver_id} / {t.vehicle_id}  →  {t.destination}")

    except Exception as e:
        db.rollback()
        print(f"Error seeding trips: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_trips()
