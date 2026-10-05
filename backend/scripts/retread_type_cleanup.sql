-- =============================================================================
-- Retread type cleanup — Tyre Inventory (MySQL)
-- =============================================================================
-- Fixes tyres whose tyre_type was entered as "RETREADED" instead of their real
-- tyre type. Retreading is recorded by retread_count / condition, not by type.
--
-- DO NOT RUN BLINDLY. Work through the steps in order.
--
--   STEP 0  Back up the production database (or at least tyre_inventory).
--   STEP 1  Run the READ-ONLY review query and look at every row.
--   STEP 2  Fill in the mapping (STEP 2 section) with each tyre's REAL type.
--           The real type can't be inferred from the data — it must be decided
--           by a person who knows the tyre.
--   STEP 3  Run the UPDATE inside a transaction and check the result.
--   STEP 4  Commit only if the checks pass; otherwise ROLLBACK.
--
-- Run the backend deploy (which adds retread_flagged_* columns and backfills
-- condition) BEFORE this script.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 0 — Back up first (run in a shell, not in this file):
--   mysqldump -u <user> -p <database> tyre_inventory > tyre_inventory_backup_$(date +%F).sql
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- STEP 1 — REVIEW (read-only). Lists every live tyre whose type is "RETREADED".
-- -----------------------------------------------------------------------------
SELECT id, tyre_number, brand, size, tyre_type, retread_count, `condition`, cost, range_km, deleted_at
FROM tyre_inventory
WHERE UPPER(TRIM(tyre_type)) = 'RETREADED'
ORDER BY id;

-- Also check soft-deleted rows, so nothing is missed in the Tyre Archive:
SELECT id, tyre_number, tyre_type, retread_count, `condition`
FROM tyre_inventory
WHERE UPPER(TRIM(tyre_type)) = 'RETREADED'
  AND deleted_at IS NOT NULL
ORDER BY id;


-- -----------------------------------------------------------------------------
-- STEP 2 — MAPPING. Replace the placeholders with the REAL tyre type for each id
-- listed in STEP 1. Do not leave any placeholder in place.
--
-- Example for one tyre (delete the example before running):
--   SET @fix_id_1 = 123, @fix_type_1 = 'RADIAL';
-- -----------------------------------------------------------------------------
-- SET @fix_id_1 = <id>, @fix_type_1 = '<REAL TYPE>';
-- SET @fix_id_2 = <id>, @fix_type_2 = '<REAL TYPE>';
-- (add one pair per tyre from STEP 1)


-- -----------------------------------------------------------------------------
-- STEP 3 — UPDATE, inside a transaction.
-- Each mapped tyre gets its real type, and at least one retreading recorded,
-- since it was entered as a retread. Condition is recomputed from the count.
-- -----------------------------------------------------------------------------
START TRANSACTION;

UPDATE tyre_inventory
SET tyre_type = @fix_type_1,
    retread_count = GREATEST(COALESCE(retread_count, 0), 1),
    `condition` = 'Rethreaded'
WHERE id = @fix_id_1
  AND UPPER(TRIM(tyre_type)) = 'RETREADED';

UPDATE tyre_inventory
SET tyre_type = @fix_type_2,
    retread_count = GREATEST(COALESCE(retread_count, 0), 1),
    `condition` = 'Rethreaded'
WHERE id = @fix_id_2
  AND UPPER(TRIM(tyre_type)) = 'RETREADED';

-- (add one UPDATE per mapped tyre, same shape)


-- -----------------------------------------------------------------------------
-- STEP 3 CHECK — inside the same transaction, before COMMIT.
-- Expect 0 rows for both queries below.
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS still_retreaded_type
FROM tyre_inventory
WHERE UPPER(TRIM(tyre_type)) = 'RETREADED';

-- Expect 0 rows: a Rethreaded tyre must have a count of at least 1.
SELECT id, tyre_number, retread_count, `condition`
FROM tyre_inventory
WHERE `condition` = 'Rethreaded' AND COALESCE(retread_count, 0) < 1;


-- -----------------------------------------------------------------------------
-- STEP 4 — COMMIT if the checks above are as expected, otherwise ROLLBACK.
-- -----------------------------------------------------------------------------
-- COMMIT;
-- ROLLBACK;


-- -----------------------------------------------------------------------------
-- ROLLBACK PLAN — if the change was committed and must be undone, restore the
-- backup from STEP 0 for tyre_inventory only (drop the table, then re-import
-- tyre_inventory_backup_<date>.sql). Do not hand-edit the rows back.
-- -----------------------------------------------------------------------------
