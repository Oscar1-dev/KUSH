-- Preserve the creation request independently of later ticket category edits.
ALTER TABLE support_tickets ADD COLUMN create_category text;
UPDATE support_tickets SET create_category=category;
ALTER TABLE support_tickets ALTER COLUMN create_category SET NOT NULL;
