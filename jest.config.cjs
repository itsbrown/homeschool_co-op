module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '.',
  // Nested git worktrees under the repo root confuse jest-haste-map (duplicate mocks).
  modulePathIgnorePatterns: ['<rootDir>/.worktree-'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@assets/(.*)$': '<rootDir>/attached_assets/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/client/src/test/setup.ts'],
  testMatch: [
    '<rootDir>/client/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/client/**/*.{spec,test}.{ts,tsx}',
  ],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      diagnostics: false,
      isolatedModules: true,
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        allowJs: true,
      },
    }],
  },
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    '!client/src/**/*.d.ts',
    '!client/src/**/__tests__/**',
    '!client/src/test/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    '/node_modules/(?!(wouter|regexparam|mitt)/)',
  ],
};
