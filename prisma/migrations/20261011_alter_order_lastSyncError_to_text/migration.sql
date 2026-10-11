-- Alter Order.lastSyncError from VARCHAR to TEXT to support longer error messages
-- This fixes the "value too long for column type" error
ALTER TABLE `Order` MODIFY COLUMN `lastSyncError` TEXT;
