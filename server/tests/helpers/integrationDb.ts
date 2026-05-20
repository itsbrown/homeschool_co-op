import { describe } from '@jest/globals';

/**
 * Use for suites that require Postgres (via testDb / CombinedStorage).
 * Skipped when globalSetup could not reach the integration database.
 */
export const describeIntegration =
  process.env.ASA_INTEGRATION_DB_AVAILABLE === 'false' ? describe.skip : describe;

export function integrationDbAvailable(): boolean {
  return process.env.ASA_INTEGRATION_DB_AVAILABLE !== 'false';
}
