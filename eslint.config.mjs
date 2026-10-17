import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/target/**",
      "**/.local/**",
      "**/gen/**",
    ],
  },
  ...tseslint.configs.recommended,
);
