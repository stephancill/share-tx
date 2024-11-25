import { useQuery } from "@tanstack/react-query";
import { isAddress, parseAbi } from "viem";
import {
  type Abi,
  type Address,
  type PublicClient,
  getAddress,
  zeroAddress,
} from "viem";
import { usePublicClient } from "wagmi";

import { SupportedChainId } from "@/types";

export function useAbi({
  chainId,
  address,
}: {
  chainId?: SupportedChainId;
  address?: string;
}) {
  const client = usePublicClient({ chainId }) as PublicClient;

  return useQuery({
    queryKey: ["abi", chainId, address],
    enabled: !!address && isAddress(address),
    queryFn: () => {
      if (!chainId || !address || !isAddress(address)) return null;
      return fetchAbi(client, chainId, address);
    },
  });
}

interface SourcifyResponse {
  status: string;
  files: {
    name: string;
    path: string;
    content: string;
  }[];
}

interface MetadataJson {
  output: {
    abi: Abi;
  };
}

async function fetchAbi(
  publicClient: PublicClient,
  chainId: number,
  address: Address
): Promise<Abi> {
  let normalizedAddress = address.toLowerCase();

  try {
    const [implementationAddress, implementationSlot] = await Promise.all([
      publicClient
        .readContract({
          address: normalizedAddress as `0x${string}`,
          abi: parseAbi(["function implementation() view returns (address)"]),
          functionName: "implementation",
        })
        .catch(() => null),
      publicClient
        .getStorageAt({
          address: normalizedAddress as `0x${string}`,
          // https://eips.ethereum.org/EIPS/eip-1967
          slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        })
        .catch(() => null),
    ]);

    if (implementationAddress) {
      normalizedAddress = getAddress(implementationAddress);
    } else if (implementationSlot) {
      // Convert bytes32 to address by taking the last 20 bytes
      const addressFromSlot = getAddress(`0x${implementationSlot.slice(-40)}`);
      if (addressFromSlot !== zeroAddress) {
        normalizedAddress = addressFromSlot;
      }
    }
  } catch (error) {
    console.error("Error fetching ABI:", error);
  }

  const response = await fetch(
    `https://sourcify.dev/server/files/any/${chainId}/${normalizedAddress}`,
    {
      headers: {
        accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Contract not found on Sourcify");
  }

  const data = (await response.json()) as SourcifyResponse;

  const metadataFile = data.files.find((file) => file.name === "metadata.json");
  if (!metadataFile) {
    throw new Error("Metadata file not found");
  }

  try {
    const metadata = JSON.parse(metadataFile.content) as MetadataJson;
    return metadata.output.abi;
  } catch (error) {
    throw new Error("Failed to parse contract metadata");
  }
}
