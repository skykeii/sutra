import { defineConfig } from "@playwright/test";

// Expects the app to be running already (npm run start or npm run dev).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
});
