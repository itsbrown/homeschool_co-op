process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgresql://test:test@localhost:5432/asa_test';

if (process.env.PAYMENT_PROCESSOR_ENABLED !== 'true') {
  throw new Error(
    `PAYMENT_PROCESSOR_ENABLED must be "true" (got ${JSON.stringify(
      process.env.PAYMENT_PROCESSOR_ENABLED,
    )}). The payment-flow harness asserts the unified processor path.`,
  );
}

jest.setTimeout(30000);
