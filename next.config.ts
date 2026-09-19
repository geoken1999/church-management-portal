import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Actions default to a 1MB request body — raised with headroom
  // above the largest app-level file limit (worship documents, 25MB;
  // multipart/form-data adds overhead on top of the raw file bytes).
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  images: {
    // Wildcarded (not tied to one project ref) so this keeps working if the
    // configured Supabase project changes.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
