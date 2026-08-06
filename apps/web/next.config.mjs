/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source; Next compiles it in place so
  // web and mobile consume exactly the same calculation code.
  transpilePackages: ['@finscope/core'],
};
export default nextConfig;
