-- How an agreement was signed (both are the same legal record).
ALTER TABLE agreements ADD COLUMN signed_via text CHECK (signed_via IS NULL OR signed_via IN ('website','discord'));
-- New outbox kind is unchanged ('agreement.issued'); team roster gains the
-- application that brought the person in.
ALTER TABLE staff_members ADD COLUMN application_id uuid REFERENCES staff_applications(id);
