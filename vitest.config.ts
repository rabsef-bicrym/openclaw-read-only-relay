import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pluginDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: pluginDir,
  test: {
    include: ["test/**/*.test.ts"],
  },
});
