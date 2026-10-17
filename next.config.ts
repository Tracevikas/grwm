import type { NextConfig } from "next";

// Routes that run the clothing segmentation model (analyze, re-scan, "Cut out background").
const SEGMENTATION_ROUTES = ["/api/outfits/*/analyze", "/outfits/*", "/items/*"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // onnxruntime-node loads its native library dynamically, so tracing misses it.
  // Ship the Linux x64 build (what Vercel runs), not the macOS/Windows ones.
  outputFileTracingIncludes: Object.fromEntries(
    SEGMENTATION_ROUTES.map((r) => [
      r,
      ["./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*", "./node_modules/onnxruntime-common/**/*"],
    ]),
  ),
  outputFileTracingExcludes: {
    "/*": [
      // The model is downloaded at runtime; never ship a locally cached copy.
      "./node_modules/@huggingface/transformers/.cache/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/{darwin,win32}/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
    ],
  },
};

export default nextConfig;
