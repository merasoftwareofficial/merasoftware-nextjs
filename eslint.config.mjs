import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Page loading has one source of truth (src/components/loading): every
  // navigation must go through the site's Link or useNavigate() so the loading
  // bar sees it. Only those two files may use the raw Next.js APIs.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/link.tsx", "src/components/loading/navigation.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "next/link", message: 'Import Link from "@/components/link" so the page-loading bar sees the click.' },
            {
              name: "next/navigation",
              importNames: ["useRouter"],
              message: 'Use useNavigate() from "@/components/loading/navigation" so the page-loading bar sees the navigation.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
