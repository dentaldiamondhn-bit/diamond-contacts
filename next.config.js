import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the tracing root to this app: a stray parent lockfile can make Next
  // infer /home/dentaldiamondhn as the workspace root and break page-data
  // collection during `next build`.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  // Server mode is the only supported target: the app depends on Clerk sign-in
  // and live /api routes (CardDAV, patient search, label CRUD), and Next static
  // export cannot render Clerk's server actions. The Capacitor Android shell
  // loads the hosted app via `server.url` (see capacitor.config.ts).
  trailingSlash: false,
  images: {
    unoptimized: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
};

export default nextConfig;