-- Applied to the HRMS database as expand_employee_uan_to_22_characters.
-- Preserve this limit when provisioning another environment.
ALTER TABLE public.employees ALTER COLUMN uan TYPE varchar(22);
