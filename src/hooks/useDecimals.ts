import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { usePublicClient } from "wagmi";

import { SupportedChainId } from "@/types";

export function useDecimals({
  chainId,
  address,
}: {
  chainId?: SupportedChainId;
  address: string;
}) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["decimals", chainId, address],
    enabled: isAddress(address),
    queryFn: async () => {
      if (!chainId || !isAddress(address)) return null;

      try {
        const result = await publicClient.readContract({
          address,
          abi: [
            {
              inputs: [],
              name: "decimals",
              outputs: [{ type: "uint8", name: "" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "decimals",
        });
        return Number(result);
      } catch {
        return null;
      }
    },
  });
}
