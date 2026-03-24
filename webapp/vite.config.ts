/// <reference types="vitest/config" />
import path from "path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const criticalCoverageInclude = [
  "src/services/problemStorage.ts",
  "src/services/problemStorage/**/*.ts",
  "src/services/solverWorker/conversions.ts",
  "src/services/wasm/conversions.ts",
  "src/store/slices/problemSlice.ts",
  "src/store/slices/solverSlice.ts",
  "src/store/slices/uiSlice.ts",
  "src/utils/csvExport.ts",
  "src/utils/metricCalculations.ts",
  "src/utils/personUtils.ts",
  "src/utils/problemSnapshot.ts",
  "src/components/Navigation.tsx",
  "src/components/ProblemEditor/ProblemEditorHeader.tsx",
  "src/components/ProblemManager/CreateProblemDialog.tsx",
  "src/components/ProblemManager/DeleteConfirmDialog.tsx",
  "src/components/ResultsView/ConfigDiffBadge.tsx",
  "src/components/ResultsView/ResultsExportDropdown.tsx",
  "src/components/ResultsView/ResultsHeader.tsx",
  "src/components/ResultsView/ResultsSchedule.tsx",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "virtual:wasm-solver": path.resolve(dirname, "./public/pkg/solver_wasm.js"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    fs: {
      allow: [".."],
    },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["@/../solver-wasm/pkg"],
  },
  assetsInclude: ["**/*.wasm"],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary", "cobertura"],
      reportsDirectory: "./coverage/unit",
      include: criticalCoverageInclude,
      exclude: [
        "src/**/*.stories.*",
        "src/stories/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/types/wasm.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
      ],
      thresholds: {
        lines: 73,
        statements: 74,
        functions: 80,
        branches: 65,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.stories.*", "src/stories/**"],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
