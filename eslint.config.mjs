import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // `_` 로 시작하는 인자는 「일부러 안 쓴다」는 표시다. Omnis 로 옮기면서
    // 사용자 식별이 세션으로 넘어가 `_userId` 같은 인자가 자리만 남았는데,
    // 부르는 쪽을 전부 고치는 것보다 자리를 두는 편이 안전했다. 규약과
    // 린터가 어긋나 경고만 쌓이던 것을 맞춘다.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
