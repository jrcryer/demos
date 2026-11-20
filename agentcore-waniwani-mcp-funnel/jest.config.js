/** @type {import('ts-jest').JestConfigWithTSJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // tsconfig sets isolatedModules, so ts-jest transpiles each file without
  // type-checking; `npm test` type-checks once first, through `pretest`.
  // The project compiles as ESM-style modules for the bundler, so Jest gets a
  // CommonJS override here.
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', moduleResolution: 'node10', allowJs: true } },
    ],
  },
  // @waniwani/sdk ships ES modules only, so it has to go through the transform.
  transformIgnorePatterns: ['/node_modules/(?!@waniwani/)'],
  // Synthesising a NodejsFunction runs esbuild, which can exceed Jest's
  // 5 second default on a cold cache.
  testTimeout: 120000,
};
