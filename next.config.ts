import type { NextConfig } from 'next';

// Foundation entry point. No feature flags or invented behaviour here.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Private uploads never live under /public; they are served only through an authorized route.
  outputFileTracingIncludes: {},
  experimental: {
    /*
     * Uploads arrive through Server Actions, and the default request body limit
     * is 1MB — smaller than every file rule in `src/files/signature.ts`, which
     * allows up to 10MB. A photo from a phone is several megabytes, so the
     * default turned an ordinary upload into a client-side exception before any
     * of the product's own validation ran. This matches the largest rule, with a
     * little room for the rest of the form; the real per-purpose limit, the
     * accepted types and the signature check are still enforced on the server.
     */
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
