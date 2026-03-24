/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["chartjs-node-canvas", "canvas"],
  },
};

export default nextConfig;
