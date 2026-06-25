-- ============================================================================
-- Clear all data from the database while keeping the schema intact
-- WARNING: This will DELETE ALL DATA from all tables!
-- ============================================================================

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Delete all data from all tables (in dependency order)
TRUNCATE TABLE trip_expenses;
TRUNCATE TABLE trips;
TRUNCATE TABLE assigned_drivers;
TRUNCATE TABLE customer_pricing;
TRUNCATE TABLE customer_destinations;
TRUNCATE TABLE customers;
TRUNCATE TABLE drivers;
TRUNCATE TABLE trucks;
TRUNCATE TABLE vendors;
TRUNCATE TABLE staff;
TRUNCATE TABLE tyre_expenses;
TRUNCATE TABLE tyre_fitment_records;
TRUNCATE TABLE tyre_inventory;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Verify tables are empty
SELECT 'trip_expenses' as table_name, COUNT(*) as record_count FROM trip_expenses
UNION ALL
SELECT 'trips', COUNT(*) FROM trips
UNION ALL
SELECT 'assigned_drivers', COUNT(*) FROM assigned_drivers
UNION ALL
SELECT 'customer_pricing', COUNT(*) FROM customer_pricing
UNION ALL
SELECT 'customer_destinations', COUNT(*) FROM customer_destinations
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'trucks', COUNT(*) FROM trucks
UNION ALL
SELECT 'vendors', COUNT(*) FROM vendors
UNION ALL
SELECT 'staff', COUNT(*) FROM staff
UNION ALL
SELECT 'tyre_expenses', COUNT(*) FROM tyre_expenses
UNION ALL
SELECT 'tyre_fitment_records', COUNT(*) FROM tyre_fitment_records
UNION ALL
SELECT 'tyre_inventory', COUNT(*) FROM tyre_inventory;
