import type { NextConfig } from "next";

// Baseline browser protections for every route. The CSP only restricts framing, plugins, base and form targets,
// so it does not interfere with Next.js inline scripts; tighten script-src with nonces separately.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Shared build hosts (such as Hostinger) report many CPUs but allow few threads, so a default build starts dozens of
// workers and the native tools' thread pools fail with "can't spawn worker thread" (EAGAIN). Keep the build small;
// set BUILD_CPUS to raise it on a machine with room. Worker processes inherit these variables.
const buildCpus = Math.max(1, Number(process.env.BUILD_CPUS) || 2);
process.env.TOKIO_WORKER_THREADS ??= String(buildCpus);
process.env.RAYON_NUM_THREADS ??= String(buildCpus);
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, buildCpus));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: buildCpus, workerThreads: false, memoryBasedWorkersCount: false, staticGenerationMaxConcurrency: 4 },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The video interview room needs this site's own camera, microphone and screen sharing. Later entries win.
      { source: "/interview/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()" }] },
    ];
  },
};

export default nextConfig;
