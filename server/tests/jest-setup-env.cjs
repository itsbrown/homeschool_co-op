'use strict';

const fs = require('fs');
const path = require('path');

// Runs before any test file is loaded (see jest.integration.config.cjs setupFiles).
// Server modules like server/db/supabase.ts validate env at import time.

// globalSetup runs first and writes this file (separate process).
const integrationDbCache = path.join(process.cwd(), '.jest-cache', 'integration-db.json');
try {
  const { available } = JSON.parse(fs.readFileSync(integrationDbCache, 'utf8'));
  process.env.ASA_INTEGRATION_DB_AVAILABLE = available ? 'true' : 'false';
} catch {
  process.env.ASA_INTEGRATION_DB_AVAILABLE = 'false';
}

if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
}
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = 'jest-placeholder-anon-key';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'jest-placeholder-service-role-key';
}
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'jest-placeholder-openai-key';
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/asa_test';
}

// server/tests/setup.ts requires explicit money-path flags in integration runs.
if (!process.env.PAYMENT_PROCESSOR_ENABLED) {
  process.env.PAYMENT_PROCESSOR_ENABLED = 'true';
}
if (!process.env.BALANCE_AWARE_ALLOCATION) {
  process.env.BALANCE_AWARE_ALLOCATION = 'false';
}

// Payment-flow webhook tests sign payloads with this secret (dev server uses the same).
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_jest_placeholder';
}
