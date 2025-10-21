-- Add payment frequency and program date fields to program_enrollments table

-- Add payment_frequency column
ALTER TABLE program_enrollments 
ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'one_time'
CHECK (payment_frequency IN ('weekly', 'biweekly', 'monthly', 'one_time'));

-- Add program start/end date columns for payment schedule calculations
ALTER TABLE program_enrollments 
ADD COLUMN IF NOT EXISTS program_start_date date;

ALTER TABLE program_enrollments 
ADD COLUMN IF NOT EXISTS program_end_date date;

-- Update comment for clarity
COMMENT ON COLUMN program_enrollments.payment_frequency IS 'Payment installment frequency: weekly, biweekly, monthly, or one_time';
COMMENT ON COLUMN program_enrollments.program_start_date IS 'Program start date copied from class for payment schedule calculations';
COMMENT ON COLUMN program_enrollments.program_end_date IS 'Program end date copied from class for payment schedule calculations';
