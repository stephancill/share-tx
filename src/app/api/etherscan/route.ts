import { createProxyRequestHandler } from "@/lib/utils";

export const GET = createProxyRequestHandler(
  "https://api.etherscan.io/v2/api",
  {
    searchParams: {
      apikey: process.env.ETHERSCAN_API_KEY!,
    },
  }
);
