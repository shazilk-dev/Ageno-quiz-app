import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * No webpack overrides: the browser bundle uses Firebase's browser SDK, which needs no Node polyfills.
 * (Polyfills for `process`, `Buffer`, `crypto`, `stream`, ... used to be added to every page; removed in
 * S4.4 of docs/PERFORMANCE_PLAN.md.)
 *
 * `ANALYZE=true npm run build` writes bundle reports to `.next/analyze/`.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "firebasestorage.googleapis.com" }],
    formats: ["image/avif", "image/webp"],
  },
};

export default bundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(nextConfig);
