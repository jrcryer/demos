/** @type {import('ts-jest').JestConfigWithTSJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
  },
  // Synthesising a NodejsFunction runs esbuild, which can exceed Jest's
  // 5 second default on a cold cache.
  testTimeout: 120000,
};
