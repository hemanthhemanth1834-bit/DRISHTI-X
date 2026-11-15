import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["localhost:3000", "127.0.0.1:3000", "192.168.7.12:3000"],
  outputFileTracingRoot: __dirname,
};
export default nextConfig;
