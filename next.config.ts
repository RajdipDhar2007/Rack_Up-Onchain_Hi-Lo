import type { NextConfig } from "next";

// Let phones/laptops on the same Wi-Fi load the dev server by the host computer's LAN address.
const lanOrigins = (process.env.LOCAL_LAN_IPS ?? "").split(",").filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanOrigins, "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

