/** @type {import("next").NextConfig} */
const nextConfig = {
  // El SDK usa `jose` (Web Crypto): corre en el runtime de Node de Next.
  poweredByHeader: false,
};

export default nextConfig;
