import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators:false,
  trailingSlash:true,
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
