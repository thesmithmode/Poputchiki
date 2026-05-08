import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tlsDir = path.resolve(__dirname, "../.tls");
const tlsCert = path.join(tlsDir, "cert.pem");
const tlsKey = path.join(tlsDir, "cert-key.pem");
const hasTls = fs.existsSync(tlsCert) && fs.existsSync(tlsKey);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    ...(hasTls && {
      https: {
        cert: fs.readFileSync(tlsCert),
        key: fs.readFileSync(tlsKey),
      },
    }),
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
