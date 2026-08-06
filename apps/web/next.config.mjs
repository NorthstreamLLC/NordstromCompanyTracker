import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The shared package ships TypeScript source; Next compiles it in place so
  // web and mobile consume exactly the same calculation code.
  transpilePackages: ['@finscope/core'],

  // Pin the monorepo root explicitly. Next otherwise infers it by walking up
  // looking for lockfiles, and any stray package-lock.json in a parent folder
  // (a home directory, for instance) wins — which silently changes what gets
  // bundled for deployment.
  outputFileTracingRoot: join(here, '../../'),
};

export default nextConfig;
