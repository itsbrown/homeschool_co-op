module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '../../',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  testMatch: [
    '<rootDir>/server/tests/minimal-test.test.ts',
    '<rootDir>/server/tests/snapshot-trust-cache.test.ts',
    '<rootDir>/server/tests/enrollment-effective-balance.test.ts',
    '<rootDir>/server/tests/profile-style-enrollment-due.test.ts',
    '<rootDir>/server/tests/cart-checkout-enrollment-match.test.ts',
    '<rootDir>/server/tests/parent-identity-scoping.test.ts',
    '<rootDir>/server/tests/auth-register-normalize.test.ts',
    '<rootDir>/server/tests/enrollment-cart-eligibility.test.ts',
    '<rootDir>/server/tests/checkout-payment-plan-normalize.test.ts',
    '<rootDir>/server/tests/stuck-parent-manual-installments.test.ts',
    '<rootDir>/server/tests/unit/grade-levels.test.ts',
    '<rootDir>/server/tests/unit/session-payment-eligibility.test.ts',
    '<rootDir>/server/tests/unit/current-class-enrollment.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      diagnostics: false,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
      },
    }],
  },
  testTimeout: 10000,
};
