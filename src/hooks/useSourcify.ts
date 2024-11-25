import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { chains } from "@/lib/wagmi";

interface SourcifyVerification {
  address: string;
  chainIds: {
    chainId: string;
    status: "perfect" | "partial";
  }[];
}

export function useSourcify(contractAddress: string) {
  return useQuery({
    queryKey: ["verification", contractAddress],
    queryFn: async () => {
      if (!isAddress(contractAddress)) return null;

      const response = await fetch(
        `https://sourcify.dev/server/check-all-by-addresses?addresses=${contractAddress}&chainIds=${chains.map((c) => c.id).join(",")}`,
        {
          headers: { accept: "application/json" },
        }
      );

      const [verifications] = (await response.json()) as SourcifyVerification[];
      return verifications;
    },
  });
}
