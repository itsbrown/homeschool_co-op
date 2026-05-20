module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['<rootDir>/server/tests/jest-setup-env.cjs'],
  modulePathIgnorePatterns: ['<rootDir>/.worktree-'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    // server/lib/database-url.mjs uses bare ESM `export` syntax that ts-jest
    // cannot compile under `module: 'commonjs'`. Redirect any `.mjs` import
    // back to its CJS-friendly stub so the integration suite can load
    // anything that touches the database SSL helpers.
    '^(.*/)?database-url\\.mjs$': '<rootDir>/server/tests/helpers/databaseUrlStub.cjs',
  },
  globalSetup: '<rootDir>/server/tests/globalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts'],
  testMatch: [
    '<rootDir>/server/tests/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        module: 'commonjs',
      },
    }],
  },
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.d.ts',
    '!server/tests/**',
  ],
  coverageDirectory: 'coverage-integration',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'cjs', 'mjs', 'json'],
  testTimeout: 30000,
  workerIdleMemoryLimit: '512MB',
  maxWorkers: 1,
};
