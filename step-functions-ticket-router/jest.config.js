/** @type {import('ts-jest').JestConfigWithTSJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // tsconfig sets isolatedModules, so ts-jest transpiles each file without
  // type-checking the whole program in every worker. The SDK type definitions
  // made that cost over 1 GB of heap per worker. `npm test` type-checks once
  // first, through the `pretest` script.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
  },
  // Synthesising a NodejsFunction runs esbuild, which can exceed Jest's
  // 5 second default on a cold cache.
  testTimeout: 120000,
};
