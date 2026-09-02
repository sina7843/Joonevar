import type { NextConfig } from 'next';

// Foundation entry point. No feature flags or invented behaviour here.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Private uploads never live under /public; they are served only through an authorized route.
  outputFileTracingIncludes: {},
};

export default nextConfig;
