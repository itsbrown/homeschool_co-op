module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'server/api/**/*.{js,ts}',
    '!server/api/**/*.d.ts',
  ],
  transform: {
    '^.+\\.(js|ts)$': 'babel-jest',
  },
  moduleNameMapping: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};