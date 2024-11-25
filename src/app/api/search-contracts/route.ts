import { NextRequest } from "next/server";
import { blockscoutUrlByChainId, chains } from "@/lib/wagmi";
import { SupportedChainId } from "@/types";

interface BlockscoutSearchResult {
  items: Array<{
    address: {
      hash: string;
      name: string;
      is_contract: boolean;
      is_verified: boolean;
    };
    language: string;
    transaction_count: number;
  }>;
}

interface NormalizedSearchResult {
  address: string;
  name: string;
  chainId: SupportedChainId;
  transactionCount: number;
}

export async function GET(request: NextRequest) {
  const searchQuery = request.nextUrl.searchParams.get("q");
  if (!searchQuery) {
    return Response.json({ items: [] });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const searchPromises = chains.map(async (chain) => {
      const baseUrl = blockscoutUrlByChainId[chain.id];
      try {
        const response = await fetch(
          `${baseUrl}/api/v2/smart-contracts?q=${encodeURIComponent(searchQuery)}`,
          { signal: controller.signal }
        );

        if (!response.ok) return [];

        const data: BlockscoutSearchResult = await response.json();

        return data.items
          .filter((item) => item.address.is_contract)
          .map((item) => ({
            address: item.address.hash,
            name: item.address.name || "Unknown",
            chainId: chain.id,
            transactionCount: item.transaction_count || 0,
          }));
      } catch (error) {
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
      .flat()
      .sort((a, b) => b.transactionCount - a.transactionCount);

    return Response.json(flattenedResults);
  } finally {
    clearTimeout(timeout);
  }
}
