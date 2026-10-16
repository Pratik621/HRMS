-- Required by account creation, submission edits, and password clearing.
ALTER TABLE public.employee_offer_links
    ADD COLUMN IF NOT EXISTS created_employee_id text,
    ADD COLUMN IF NOT EXISTS temp_password text,
    ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false;
