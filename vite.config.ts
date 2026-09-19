import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Electron loads the built app over file://, so assets must be referenced
  // relatively instead of from the server root.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
