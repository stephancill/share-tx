/** @type {import('next').NextConfig} */
const nextConfig = {
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908#issuecomment-1487801131
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  experimental: {
    esmExternals: "loose",
  },
};

export default nextConfig;
