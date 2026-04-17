import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "compiled/", "build.py", "*.js"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
    },
    extends: [
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-require-imports": "error",
      "no-console": "error",
      "prettier/prettier": "error",
    },
  },
);
