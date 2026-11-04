import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["tests/setup-env.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
