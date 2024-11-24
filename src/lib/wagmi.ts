import { HttpTransport } from "viem";
import { cookieStorage, createConfig, createStorage } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { getTransportByChainId } from "./utils";

export const chains = [base, optimism, arbitrum, polygon, mainnet] as const;

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, getTransportByChainId(chain.id)])
) as { [K in (typeof chains)[number]["id"]]: HttpTransport };

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
