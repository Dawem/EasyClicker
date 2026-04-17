const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["./jest.setup.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: {
          ignoreCodes: [5107],
        },
      },
    ],
  },
};