import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      AGORA_SCRYPT_N: "1024",
    },
  },
});
