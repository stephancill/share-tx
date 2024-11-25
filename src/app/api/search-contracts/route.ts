import { NextRequest } from "next/server";
import { blockscoutUrlByChainId, chains } from "@/lib/wagmi";
import { SupportedChainId } from "@/types";

interface BlockscoutSearchResult {
  items: Array<{
    address: string;
    name: string;
    symbol: string;
    type: string;
    is_smart_contract_verified: boolean;
  }>;
}

interface NormalizedSearchResult {
  address: string;
  name: string;
  chainId: SupportedChainId;
}

export async function GET(request: NextRequest) {
  const searchQuery = request.nextUrl.searchParams.get("q");
  if (!searchQuery) {
    return Response.json({ items: [] });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const searchPromises = chains.map(async (chain) => {
      const baseUrl = blockscoutUrlByChainId[chain.id];
      try {
        const response = await fetch(
          `${baseUrl}/api/v2/search?q=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );

        if (!response.ok) return [];

        const data: BlockscoutSearchResult = await response.json();

        return data.items
          .filter((item) => item.type === "token" || item.type === "contract")
          .map((item) => ({
            address: item.address,
            name: item.name || item.symbol || "Unknown",
            chainId: chain.id,
          }));
      } catch (error) {
        // Ignore individual chain errors and timeouts
        console.warn(`Search failed for chain ${chain.id}`);
        return [];
      }
    });

    // Use Promise.allSettled instead of Promise.all to handle individual failures
    const results = await Promise.allSettled(searchPromises);
    const flattenedResults = results
      .filter(
        (result): result is PromiseFulfilledResult<NormalizedSearchResult[]> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value)
      .flat();

    return Response.json(flattenedResults);
  } finally {
    clearTimeout(timeout);
  }
}
