/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    // Expose DEMO_MODE to the client-side
    // When true, shows mock data for demonstration purposes
    // Default: false (production mode - shows real data only)
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE || 'false',
  },
};

module.exports = nextConfig;
