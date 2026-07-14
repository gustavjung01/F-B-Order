-- Repair one known customer/shop label that was previously stored with UTF-8 replacement characters.
-- Exact-match only: unrelated customer data is never rewritten.

BEGIN;

UPDATE customers
SET
  name = CASE WHEN name = 'Tr� S?a H?ng Tr�' THEN 'Trà Sữa Hùng Trà' ELSE name END,
  shop_name = CASE WHEN shop_name = 'Tr� S?a H?ng Tr�' THEN 'Trà Sữa Hùng Trà' ELSE shop_name END,
  contact_name = CASE WHEN contact_name = 'Tr� S?a H?ng Tr�' THEN 'Trà Sữa Hùng Trà' ELSE contact_name END,
  updated_at = now()
WHERE name = 'Tr� S?a H?ng Tr�'
   OR shop_name = 'Tr� S?a H?ng Tr�'
   OR contact_name = 'Tr� S?a H?ng Tr�';

COMMIT;
