import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Token-only zones: code here must style with BoardUI semantic tokens, so it
 * renders correctly in light AND dark mode without per-component overrides.
 * When a module is migrated to the new design, add its folders here — the
 * rule then stops raw colors from creeping back in.
 *
 * Vendor folders (src/components/base, src/components/shadcn) are generated
 * by the BoardUI / shadcn CLIs and reviewed at install time instead.
 */
// Everything we own is token-only. shadcn files are vendored (kept as the
// registry ships them) and map onto BoardUI tokens through src/styles/shadcn.css.
const TOKEN_ONLY_ZONES = ["src/**/*.{ts,tsx}"];
// Celebration decor and its management page are kept exactly as they were
// before the redesign (commit 9440742), at the owner's request: they paint
// fixed festive colours (gold bunting, red Christmas, navy Founding Day) on
// purpose, so the token-only rule does not apply to them.
const CELEBRATION_FILES = [
  "src/components/layout/BirthdayDecor.tsx",
  "src/components/layout/SeasonDecor.tsx",
  "src/components/layout/FoundingDecor.tsx",
  "src/components/layout/CelebrationPreviewBar.tsx",
  "src/components/dashboard/BirthdayCard.tsx",
  "src/components/dashboard/SeasonCard.tsx",
  "src/components/dashboard/FoundingCard.tsx",
];
const TOKEN_ONLY_IGNORES = ["src/components/shadcn/**", ...CELEBRATION_FILES];

const RAW_PALETTE =
  "(^|[\\s:!])(bg|text|border|ring|from|to|via|divide|fill|stroke|outline|shadow|decoration|placeholder|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand-navy|brand-gold)(-[0-9]{2,3})?(\\/[0-9]+)?(\\s|$)|(^|[\\s:!])(bg|text|border)-(white|black)(\\/[0-9]+)?(\\s|$)";
// `dark:hidden` / `dark:block` (logo swaps) are fine; colour overrides are not.
const DARK_VARIANT = "(^|\\s)dark:(bg|text|border|ring|from|to|via|divide|fill|stroke|outline|shadow|decoration|placeholder|caret)-";
const ARBITRARY_COLOR = "-\\[(#|rgb|hsl|oklch)";

const tokenRule = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: TOKEN_ONLY_ZONES,
    ignores: TOKEN_ONLY_IGNORES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...tokenRule(RAW_PALETTE, "Raw palette color. Use a BoardUI semantic token (text-text-*, bg-background-*, border-separator-border …) so dark mode works."),
        ...tokenRule(DARK_VARIANT, "No `dark:` overrides. Pick a semantic token that already flips in dark mode."),
        ...tokenRule(ARBITRARY_COLOR, "No arbitrary color values. Use a semantic token, or add one in src/styles/brand.css."),
      ],
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "lucide-react", message: "Use @remixicon/react." }, { name: "sweetalert2", message: "Use @/lib/feedback." }] },
      ],
    },
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
]);

export default eslintConfig;
