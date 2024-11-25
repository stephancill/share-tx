import { HttpTransport } from "viem";
import { cookieStorage, createConfig, createStorage } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { getTransportByChainId } from "./utils";
import { SupportedChainId } from "@/types";

export const chains = [base, optimism, arbitrum, polygon, mainnet] as const;

export const blockscoutUrlByChainId = {
  [base.id]: "https://base.blockscout.com",
  [optimism.id]: "https://optimism.blockscout.com",
  [arbitrum.id]: "https://arbitrum.blockscout.com",
  [polygon.id]: "https://polygon.blockscout.com",
  [mainnet.id]: "https://eth.blockscout.com",
};

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, getTransportByChainId(chain.id)])
) as { [K in SupportedChainId]: HttpTransport };

export function getConfig() {
  return createConfig({
    chains,
    connectors: [
      injected(),
      coinbaseWallet(),
      walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports,
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
