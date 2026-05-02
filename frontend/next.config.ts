import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["host.docker.internal", "172.10.23.117"],
  devIndicators: false,
};

export default nextConfig;
