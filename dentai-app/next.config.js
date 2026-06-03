/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export' is only needed for Capacitor production builds.
  // In dev mode (next dev) we don't want this constraint — it prevents
  // navigation to dynamic routes with API-loaded IDs.
  // To build for Capacitor: NEXT_EXPORT=1 npm run build
  ...(process.env.NEXT_EXPORT === '1' ? { output: 'export' } : {}),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
