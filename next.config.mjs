/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  // We have multiple lockfiles on this machine, and Next can infer the wrong workspace root,
  // which leads to intermittent missing-module / tracing artifacts during build/dev.
  outputFileTracingRoot: __dirname,
  webpack: (config, { dev }) => {
    // The runtime "Cannot read properties of undefined (reading 'call')" has been correlated
    // with flaky chunk/module resolution in this project (missing chunk files / missing pages).
    // Disabling persistent caching in dev makes the output deterministic and avoids stale/corrupt cache state.
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;


