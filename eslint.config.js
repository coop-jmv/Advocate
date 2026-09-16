import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .wrangler holds Wrangler's own build output — services/*/.wrangler/tmp/
  // deploy-*/index.js is a generated bundle that alone accounted for ~5.9k
  // phantom lint errors. Already gitignored; ignore it here too so `bun run
  // lint` reflects source, not leftover deploy artifacts.
  // src/integrations/supabase/types.ts is Supabase's generated database types
  // (`supabase gen types typescript` output: Row/Insert/Update per table). It
  // was the source of 1,277 of CI's 1,285 lint errors, all prettier formatting,
  // and has kept the Lint step red on main. Reformatting it would be undone the
  // next time the types are regenerated, so it's excluded instead — it is still
  // fully type-checked, just not style-checked.
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "android",
      "ios",
      "**/.wrangler",
      "src/integrations/supabase/types.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
