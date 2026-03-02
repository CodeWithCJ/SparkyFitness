UPDATE foods
SET barcode = '0' || barcode
WHERE barcode IS NOT NULL AND LENGTH(barcode) = 12;
