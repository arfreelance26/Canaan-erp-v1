-- ============================================================================
-- Clear all data from the database while keeping the schema intact.
-- WARNING: This will DELETE ALL DATA from all tables!
-- Run only on a dev/staging DB — never on production without a backup.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Finance & admin
TRUNCATE TABLE notifications;
TRUNCATE TABLE compensation_transactions;
TRUNCATE TABLE edit_approval_requests;
TRUNCATE TABLE recurring_payments;
TRUNCATE TABLE emi_records;
TRUNCATE TABLE sac_codes;
TRUNCATE TABLE repair_types;

-- Attendance & leave
TRUNCATE TABLE leave_requests;
TRUNCATE TABLE staff_attendance;
TRUNCATE TABLE driver_attendance_remarks;
TRUNCATE TABLE driver_attendance;

-- Tyre management
TRUNCATE TABLE tyre_fitment_records;
TRUNCATE TABLE tyre_inventory;

-- Fleet maintenance & fuel
TRUNCATE TABLE maintenance_records;
TRUNCATE TABLE fuel_logs;

-- Trip workflow (children first)
TRUNCATE TABLE trip_invoices;
TRUNCATE TABLE trip_sheets;
TRUNCATE TABLE trip_closures;
TRUNCATE TABLE trips;

-- Driver assignments
TRUNCATE TABLE driver_assignments;

-- Customer data
TRUNCATE TABLE final_customer_pricing;
TRUNCATE TABLE customer_pricing;
TRUNCATE TABLE customer_destinations;
TRUNCATE TABLE customer_origins;
TRUNCATE TABLE customers;

-- Core resources
TRUNCATE TABLE drivers;
TRUNCATE TABLE trucks;
TRUNCATE TABLE vendors;
TRUNCATE TABLE staff;
TRUNCATE TABLE branches;

SET FOREIGN_KEY_CHECKS = 1;

-- Verification: confirm all tables are empty
SELECT 'notifications'            AS table_name, COUNT(*) AS record_count FROM notifications
UNION ALL SELECT 'compensation_transactions',    COUNT(*) FROM compensation_transactions
UNION ALL SELECT 'edit_approval_requests',       COUNT(*) FROM edit_approval_requests
UNION ALL SELECT 'recurring_payments',           COUNT(*) FROM recurring_payments
UNION ALL SELECT 'emi_records',                  COUNT(*) FROM emi_records
UNION ALL SELECT 'sac_codes',                    COUNT(*) FROM sac_codes
UNION ALL SELECT 'repair_types',                 COUNT(*) FROM repair_types
UNION ALL SELECT 'leave_requests',               COUNT(*) FROM leave_requests
UNION ALL SELECT 'staff_attendance',             COUNT(*) FROM staff_attendance
UNION ALL SELECT 'driver_attendance_remarks',    COUNT(*) FROM driver_attendance_remarks
UNION ALL SELECT 'driver_attendance',            COUNT(*) FROM driver_attendance
UNION ALL SELECT 'tyre_fitment_records',         COUNT(*) FROM tyre_fitment_records
UNION ALL SELECT 'tyre_inventory',               COUNT(*) FROM tyre_inventory
UNION ALL SELECT 'maintenance_records',          COUNT(*) FROM maintenance_records
UNION ALL SELECT 'fuel_logs',                    COUNT(*) FROM fuel_logs
UNION ALL SELECT 'trip_invoices',                COUNT(*) FROM trip_invoices
UNION ALL SELECT 'trip_sheets',                  COUNT(*) FROM trip_sheets
UNION ALL SELECT 'trip_closures',                COUNT(*) FROM trip_closures
UNION ALL SELECT 'trips',                        COUNT(*) FROM trips
UNION ALL SELECT 'driver_assignments',           COUNT(*) FROM driver_assignments
UNION ALL SELECT 'final_customer_pricing',       COUNT(*) FROM final_customer_pricing
UNION ALL SELECT 'customer_pricing',             COUNT(*) FROM customer_pricing
UNION ALL SELECT 'customer_destinations',        COUNT(*) FROM customer_destinations
UNION ALL SELECT 'customer_origins',             COUNT(*) FROM customer_origins
UNION ALL SELECT 'customers',                    COUNT(*) FROM customers
UNION ALL SELECT 'drivers',                      COUNT(*) FROM drivers
UNION ALL SELECT 'trucks',                       COUNT(*) FROM trucks
UNION ALL SELECT 'vendors',                      COUNT(*) FROM vendors
UNION ALL SELECT 'staff',                        COUNT(*) FROM staff
UNION ALL SELECT 'branches',                     COUNT(*) FROM branches;
