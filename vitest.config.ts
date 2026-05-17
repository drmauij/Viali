import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "shared/**/__tests__/*.test.ts",
      "server/**/__tests__/*.test.ts",
      "client/src/**/__tests__/*.test.tsx",
      "client/src/**/__tests__/*.test.ts",
      "client/src/lib/**/*.test.ts",
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
