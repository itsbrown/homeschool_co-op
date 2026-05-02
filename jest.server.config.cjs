module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  testMatch: ['<rootDir>/server/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts'],
  globalSetup: '<rootDir>/server/tests/globalSetup.mjs',
  globalTeardown: '<rootDir>/server/tests/globalTeardown.mjs',
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
  testTimeout: 30000,
};
