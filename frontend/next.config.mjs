/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone server (only the node_modules
  // actually needed at runtime) — kept small on purpose for Docker, see
  // ../Dockerfile.
  output: "standalone",
};

export default nextConfig;
