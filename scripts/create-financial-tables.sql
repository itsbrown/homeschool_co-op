-- Migration: Create Financial Tracking Tables
-- Date: 2025-10-21
-- Description: Add program_enrollments, payments, scheduled_payments, and refunds tables

-- Program Enrollments Table
CREATE TABLE IF NOT EXISTS program_enrollments (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_id INTEGER REFERENCES classes(id),
  program_id INTEGER,
  child_id INTEGER NOT NULL REFERENCES children(id),
  child_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  variant_id TEXT,
  parent_id INTEGER NOT NULL REFERENCES users(id),
  parent_email TEXT NOT NULL,
  
  -- Financial fields (amounts in cents)
  total_cost INTEGER NOT NULL,
  total_paid INTEGER NOT NULL DEFAULT 0,
  remaining_balance INTEGER NOT NULL,
  deposit_required INTEGER NOT NULL DEFAULT 0,
  
  -- Payment tracking
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'deposit_paid', 'partial_payment', 'completed', 'stripe_managed', 'refunded')),
  payment_plan TEXT CHECK (payment_plan IN ('full_payment', 'deposit_only', 'monthly', 'custom')),
  payment_system_version TEXT NOT NULL DEFAULT 'v2_stripe',
  
  -- Enrollment status
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'completed', 'withdrawn', 'cancelled', 'waitlist')),
  enrollment_date TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Stripe integration
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  
  -- Metadata
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_enrollments_school ON program_enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_program_enrollments_child ON program_enrollments(child_id);
CREATE INDEX IF NOT EXISTS idx_program_enrollments_parent ON program_enrollments(parent_id);
CREATE INDEX IF NOT EXISTS idx_program_enrollments_status ON program_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_program_enrollments_payment_status ON program_enrollments(payment_status);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  
  -- Parent/payer information
  parent_id INTEGER REFERENCES users(id),
  parent_email TEXT NOT NULL,
  
  -- Payment details (amounts in cents)
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Transaction metadata
  child_name TEXT,
  class_name TEXT,
  description TEXT,
  
  -- Payment status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- Stripe integration
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  
  -- Payment method
  payment_method TEXT NOT NULL DEFAULT 'stripe' CHECK (payment_method IN ('stripe', 'cash', 'check', 'bank_transfer', 'other')),
  
  -- Related records
  enrollment_ids JSONB NOT NULL DEFAULT '[]',
  original_payment_id INTEGER,
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Timestamps
  payment_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_school ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_parent ON payments(parent_id);
CREATE INDEX IF NOT EXISTS idx_payments_parent_email ON payments(parent_email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON payments(stripe_payment_intent_id);

-- Scheduled Payments Table
CREATE TABLE IF NOT EXISTS scheduled_payments (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  
  -- Related enrollment
  enrollment_id INTEGER NOT NULL REFERENCES program_enrollments(id),
  
  -- Payer information
  parent_id INTEGER NOT NULL REFERENCES users(id),
  parent_email TEXT NOT NULL,
  
  -- Schedule details (amounts in cents)
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Payment schedule
  scheduled_date TIMESTAMP NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'weekly', 'monthly', 'quarterly', 'annual')),
  installment_number INTEGER NOT NULL,
  total_installments INTEGER NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped')),
  
  -- Stripe integration
  stripe_payment_intent_id TEXT,
  
  -- Processing details
  processed_at TIMESTAMP,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_payments_enrollment ON scheduled_payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_parent ON scheduled_payments(parent_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_scheduled_date ON scheduled_payments(scheduled_date);

-- Refunds Table
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  
  -- Related payment
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  enrollment_id INTEGER REFERENCES program_enrollments(id),
  
  -- Refund details (amounts in cents)
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  
  -- Refund metadata
  reason TEXT NOT NULL,
  description TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Stripe integration
  stripe_refund_id TEXT UNIQUE,
  
  -- Processing details
  processed_by INTEGER REFERENCES users(id),
  processed_at TIMESTAMP,
  failure_reason TEXT,
  
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_enrollment ON refunds(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_id ON refunds(stripe_refund_id);

-- Success message
SELECT 'Financial tracking tables created successfully!' AS message;
