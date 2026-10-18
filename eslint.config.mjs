
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const projectDirectory = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: projectDirectory,
});

const eslintConfig = [
  // Ignore generated files, dependencies and build output.
  {
    ignores: [
      "**/.next/**",
      "**/.next-e2e/**",
      "**/.next-build/**",
      // The API and bot have their own lint setup.
      "platform/**",
      "**/node_modules/**",
      "**/out/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "**/next-env.d.ts",
    ],
  },

  // Next.js, React and TypeScript quality rules.
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript"
  ),
];

export default eslintConfig;
