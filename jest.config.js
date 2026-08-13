/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit', '<rootDir>/src'],
  testMatch: ['**/tests/unit/**/*.test.ts'],
  // Scratch probes (`*.local.test.ts`) stay out of CI / `npm test`.
  testPathIgnorePatterns: ['\\.local\\.test\\.ts$'],
  setupFiles: ['<rootDir>/tests/unit/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          resolveJsonModule: true,
          strict: true,
          paths: { '@/*': ['./*'] },
        },
      },
    ],
  },
};
