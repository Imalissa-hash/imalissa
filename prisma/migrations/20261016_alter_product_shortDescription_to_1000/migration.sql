-- Alter Product.shortDescription from VARCHAR(500) to VARCHAR(1000)
-- This fixes the "value too long for column type" error during product import
ALTER TABLE `Product` MODIFY COLUMN `shortDescription` VARCHAR(1000);
