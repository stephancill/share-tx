"use client";

import { Copy, Eye, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chain,
  createPublicClient,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  hexToNumber,
  http,
  isAddress,
  parseAbi,
  toFunctionSelector,
  zeroAddress,
  type Abi,
  type AbiFunction,
} from "viem";
import { mainnet } from "viem/chains";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bigintReplacer,
  functionSelectorToColor,
  getRelativeTime,
} from "@/lib/utils";
import { chains } from "@/lib/wagmi";
import { useMutation, useQuery } from "@tanstack/react-query";

interface SourcifyResponse {
  status: string;
  files: {
    name: string;
    path: string;
    content: string;
  }[];
}

interface CompilerOutput {
  abi: Abi;
}

interface MetadataJson {
  output: CompilerOutput;
}

interface SourcifyVerification {
  address: string;
  chainIds: {
    chainId: string;
    status: "perfect" | "partial";
  }[];
}

interface ContractSearchResult {
  address: string;
  name: string;
  chainId: number;
}

async function fetchAbi(chainId: number, address: string): Promise<Abi> {
  let normalizedAddress = address.toLowerCase();

  const publicClient = createPublicClient({
    chain: chains.find((c) => c.id === chainId),
    transport: http(),
  });

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

function scaleMagnitude(value: string, magnitude: number) {
  const floatValue = value.startsWith("0x")
    ? hexToNumber(value as `0x${string}`)
    : parseFloat(value);
  if (isNaN(floatValue)) throw new Error("Invalid number");
  const scale = magnitude;
  const scaledValue = Math.round(floatValue * Math.pow(10, scale)).toString();
  const bigIntValue = BigInt(scaledValue);

  return bigIntValue;
}

function getChainName(chainId: number) {
  return chains.find((chain) => chain.id === chainId)?.name || "Unknown Chain";
}

export default function Page() {
  const [contractAddress, setContractAddress] = useState("");
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [selectedFunctionSelector, setSelectedFunctionSelector] = useState<
    string | null
  >(null);

  const [inputs, setInputs] = useState<string[]>([]);
  const [valueInput, setValueInput] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchResults, setSearchResults] = useState<ContractSearchResult[]>(
    []
  );

  const {
    data: abi,
    isLoading: isLoadingAbi,
    error: abiError,
  } = useQuery({
    queryKey: ["abi", selectedChain?.id, contractAddress],
    queryFn: () =>
      selectedChain ? fetchAbi(selectedChain.id, contractAddress) : null,
    enabled: isAddress(contractAddress) && !!selectedChain,
    staleTime: Infinity,
  });

  const handleInputChange = useMemo(() => {
    return (index: number, value: string) => {
      setInputs((prev) => {
        const newInputs = [...prev];
        newInputs[index] = value;
        return newInputs;
      });
    };
  }, []);

  const functions = useMemo(() => {
    return (abi || []).filter(
      (item): item is AbiFunction => item.type === "function"
    );
  }, [abi]);

  const selectedFunction = useMemo(() => {
    return selectedFunctionSelector
      ? functions.find(
          (f) => toFunctionSelector(f) === selectedFunctionSelector
        )
      : null;
  }, [selectedFunctionSelector, functions]);

  const encodedData = useMemo(() => {
    if (!selectedFunction || !inputs) return null;

    if (
      selectedFunction.stateMutability === "view" ||
      selectedFunction.stateMutability === "pure"
    )
      return null;

    if (selectedFunction.inputs.length !== inputs.length) return null;

    try {
      return encodeFunctionData({
        abi: [selectedFunction],
        functionName: selectedFunction.name,
        args: inputs,
      });
    } catch (error) {
      console.error("Error encoding function data:", error);
      return null;
    }
  }, [selectedFunction, inputs]);

  const resolveEnsName = useCallback(
    async (input: string, index: number) => {
      if (!input || isAddress(input) || !input.toLowerCase().endsWith(".eth"))
        return;

      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      try {
        const resolved = await publicClient.getEnsAddress({
          name: input,
        });
        if (resolved) {
          handleInputChange(index, resolved);
        }
      } catch (error) {
        console.error("Error resolving ENS name:", error);
      }
    },
    [handleInputChange]
  );

  const readContractMutation = useMutation({
    mutationFn: async (): Promise<any | null> => {
      if (
        !selectedFunctionSelector ||
        !contractAddress ||
        !inputs ||
        !selectedChain
      )
        return null;

      const publicClient = createPublicClient({
        chain: selectedChain,
        transport: http(),
      });

      const f = functions.find(
        (f) => toFunctionSelector(f) === selectedFunctionSelector
      );

      if (!f) return null;

      return publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [f],
        functionName: f.name,
        args: inputs,
      });
    },
  });

  const { data: decimals } = useQuery({
    queryKey: ["decimals", selectedChain?.id, contractAddress],
    queryFn: async () => {
      if (!selectedChain || !contractAddress) return null;

      const publicClient = createPublicClient({
        chain: selectedChain,
        transport: http(),
      });

      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
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
    enabled: isAddress(contractAddress) && !!selectedChain,
  });

  const { data: verification, isLoading: isLoadingVerification } = useQuery({
    queryKey: ["verification", contractAddress],
    queryFn: async () => {
      const response = await fetch(
        `https://sourcify.dev/server/check-all-by-addresses?addresses=${contractAddress}&chainIds=${chains.map((c) => c.id).join(",")}`,
        {
          headers: { accept: "application/json" },
        }
      );
      const [verifications] = (await response.json()) as SourcifyVerification[];
      return verifications;
    },
    enabled: isAddress(contractAddress),
  });

  const availableChains = useMemo(() => {
    if (!verification) return verification;

    const filteredChains = chains.filter((chain) =>
      verification.chainIds?.some((v) => v.chainId === chain.id.toString())
    );
    return filteredChains.length > 0 ? filteredChains : chains;
  }, [verification]);

  useEffect(() => {
    if (availableChains && availableChains.length > 0) {
      setSelectedChain(availableChains[0]);
    } else {
      setSelectedChain(null);
    }
  }, [availableChains]);

  useEffect(() => {
    setSelectedFunctionSelector(null);
    setInputs([]);
  }, [contractAddress]);

  const { data: txList, isLoading: isLoadingTxList } = useQuery({
    queryKey: ["transactions", selectedChain?.id, contractAddress],
    queryFn: async () => {
      if (!selectedChain?.id || !contractAddress) return null;
      const response = await fetch(
        `/api/etherscan?chainid=${selectedChain.id}&module=account&action=txlist&address=${contractAddress}&sort=desc&limit=100`
      );
      const data = await response.json();
      return data.result;
    },
    enabled: isAddress(contractAddress) && !!selectedChain,
  });

  const filteredTransactions = useMemo(() => {
    if (!txList) return [];
    return txList
      .filter((tx: any) => {
        if (!selectedFunctionSelector) return true;
        if (!functions.length) return false;
        const selectedFunc = functions.find(
          (f) => toFunctionSelector(f) === selectedFunctionSelector
        );
        if (selectedFunc?.stateMutability === "view") return true;
        return tx.methodId === selectedFunctionSelector.slice(0, 10);
      })
      .slice(0, 50);
  }, [txList, selectedFunctionSelector, functions]);

  const handleTransactionClick = useCallback(
    (tx: any) => {
      const f = functions.find((f) => toFunctionSelector(f) === tx.methodId);
      if (!f) return;

      setSelectedFunctionSelector(toFunctionSelector(f));
      try {
        const decoded = decodeFunctionData({
          abi: [f],
          data: tx.input,
        });
        setInputs(decoded.args.map((v: any) => v.toString()));

        if (f.stateMutability === "payable" && tx.value !== "0") {
          setValueInput(tx.value);
        }
      } catch (error) {
        console.error("Error decoding transaction data:", error);
      }
    },
    [functions]
  );

  const scaleInput = (index: number, value: string, magnitude: number) => {
    try {
      const bigIntValue = scaleMagnitude(value, magnitude);
      handleInputChange(index, bigIntValue.toString());
    } catch (error) {
      console.error("Error scaling input:", error);
    }
  };

  const scaleValueInput = (value: string) => {
    try {
      const bigIntValue = scaleMagnitude(value, 18);
      setValueInput(bigIntValue.toString());
    } catch (error) {
      console.error("Error scaling value:", error);
    }
  };

  useEffect(() => {
    if (!searchInput || searchInput.length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search-contracts?q=${encodeURIComponent(searchInput)}`,
          { signal: controller.signal }
        );
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Search failed:", error);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const handleShare = useCallback(() => {
    if (!selectedChain || !contractAddress || !encodedData) return;

    const params = new URLSearchParams({
      chainId: selectedChain.id.toString(),
      data: encodedData,
      to: contractAddress,
      value: valueInput || "0",
    });

    const url = `${window.location.origin}/tx?${params.toString()}`;
    navigator.clipboard.writeText(url);
  }, [selectedChain, contractAddress, encodedData, valueInput]);

  return (
    <div className="p-10 mx-auto">
      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Contract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="contractAddress">Contract Address</Label>
              <div className="flex gap-2">
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Input
                      id="contractAddress"
                      value={contractAddress}
                      onChange={(e) => {
                        const value = e.target.value;
                        setContractAddress(value);
                        if (!isAddress(value)) {
                          setSearchInput(value);
                          setSearchOpen(true);
                        } else {
                          setSearchOpen(false);
                        }
                      }}
                      placeholder="Search by name or address..."
                      className="text-left"
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)]"
                    align="start"
                  >
                    <Command
                      className="rounded-lg shadow-md"
                      shouldFilter={false}
                    >
                      <CommandInput
                        placeholder="Search contracts..."
                        value={searchInput}
                        onValueChange={(value) => {
                          setContractAddress(value);
                          if (!isAddress(value)) {
                            setSearchInput(value);
                            setSearchOpen(true);
                          } else {
                            setSearchOpen(false);
                          }
                        }}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {searchInput === ""
                            ? "Start typing to search contracts..."
                            : "No contracts found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {searchResults.map((result) => (
                            <CommandItem
                              key={`${result.address}-${result.chainId}`}
                              value={result.address}
                              onSelect={() => {
                                setContractAddress(result.address);
                                setSearchOpen(false);
                              }}
                              className={
                                contractAddress.toLowerCase() ===
                                result.address.toLowerCase()
                                  ? "bg-gray-100"
                                  : ""
                              }
                            >
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {result.name}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                                    {getChainName(result.chainId)}
                                  </span>
                                </div>
                                <span className="text-sm text-gray-500">
                                  {result.address}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {isAddress(contractAddress) && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      navigator.clipboard.writeText(contractAddress)
                    }
                    disabled={!isAddress(contractAddress)}
                    title="Copy address"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {isLoadingVerification && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Loader2 className="animate-spin" size={16} />
                <span>Checking verified chains...</span>
              </div>
            )}

            {verification && availableChains && (
              <div className="space-y-2">
                <Label htmlFor="chainSelector">Select Chain</Label>
                <Select
                  onValueChange={(value) => {
                    const chain = availableChains.find(
                      (c) => c.id === Number(value)
                    );
                    setSelectedChain(chain || null);
                  }}
                  defaultValue={availableChains[0].id.toString()}
                >
                  <SelectTrigger id="chainSelector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChains.map((chain) => (
                      <SelectItem key={chain.id} value={chain.id.toString()}>
                        <div className="flex items-center">
                          {chain.name}{" "}
                          {!verification.chainIds?.find(
                            (v) => v.chainId === chain.id.toString()
                          ) && " (unverified)"}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isLoadingAbi && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Loader2 className="animate-spin" size={16} />
                <span>Loading contract ABI...</span>
              </div>
            )}

            {abiError && (
              <div className="text-sm text-destructive">
                Error loading ABI: {abiError.message}
              </div>
            )}

            {abi && abi.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="functionSelector">Select Function</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedFunctionSelector || undefined}
                      onValueChange={(selector) => {
                        setSelectedFunctionSelector(selector);
                        setInputs([]);
                      }}
                    >
                      <SelectTrigger id="functionSelector">
                        <SelectValue placeholder="Select a function" />
                      </SelectTrigger>
                      <SelectContent>
                        {functions.map((func) => (
                          <SelectItem
                            key={toFunctionSelector(func)}
                            value={toFunctionSelector(func)}
                          >
                            <div className="flex items-center gap-2">
                              {func.name} ({toFunctionSelector(func)})
                              {func.stateMutability === "view" && (
                                <Eye className="h-4 w-4 text-gray-500" />
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedFunctionSelector(null);
                        setInputs([]);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {selectedFunction && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">
                      Function Arguments
                    </h3>

                    {selectedFunction.stateMutability === "payable" && (
                      <div className="space-y-2">
                        <Label htmlFor="value-input">value (payable)</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="value-input"
                            value={valueInput}
                            onChange={(e) => setValueInput(e.target.value)}
                            placeholder="0.0"
                            type="text"
                          />
                          <Button
                            variant="outline"
                            onClick={() => scaleValueInput(valueInput)}
                            disabled={!valueInput}
                            title="Scale by 18 decimals"
                          >
                            ×1e18
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedFunction.inputs.map(
                      (input: any, index: number) => (
                        <div key={index} className="space-y-2">
                          <Label htmlFor={`input-${index}`}>
                            {input.name || `Input ${index + 1}`} ({input.type})
                          </Label>
                          <div className="flex space-x-2">
                            <Input
                              id={`input-${index}`}
                              value={inputs[index] || ""}
                              onChange={(e) =>
                                handleInputChange(index, e.target.value)
                              }
                              placeholder={`Enter ${input.type}`}
                            />
                            {input.type === "address" &&
                              !isAddress(inputs[index]) &&
                              !!inputs[index] && (
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    resolveEnsName(inputs[index], index)
                                  }
                                >
                                  <Search className="h-4 w-4" />
                                  ENS
                                </Button>
                              )}
                            {input.type.startsWith("uint") ||
                            input.type.startsWith("int") ? (
                              <Button
                                variant="outline"
                                onClick={() =>
                                  scaleInput(
                                    index,
                                    inputs[index],
                                    decimals || 18
                                  )
                                }
                                disabled={!inputs[index]}
                                title={`Scale by ${decimals || 18} decimals`}
                              >
                                ×1e{decimals || 18}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )
                    )}

                    {encodedData && (
                      <div className="space-y-2">
                        <Label>Encoded Data:</Label>
                        <div className="relative">
                          <pre className="p-4 bg-muted rounded-md border whitespace-pre-wrap break-all">
                            {encodedData}
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() =>
                              navigator.clipboard.writeText(encodedData)
                            }
                          >
                            <Copy size={16} />
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedFunction.stateMutability === "view" ? (
                      <Button
                        onClick={() => readContractMutation.mutate()}
                        disabled={readContractMutation.isPending}
                      >
                        {readContractMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Reading...
                          </>
                        ) : (
                          "Read"
                        )}
                      </Button>
                    ) : (
                      <div>
                        <Button onClick={handleShare} disabled={!encodedData}>
                          <Copy className="mr-2 h-4 w-4" />
                          Share
                        </Button>
                      </div>
                    )}

                    {selectedFunction.stateMutability === "view" && (
                      <div>
                        {readContractMutation.error && (
                          <div className="text-sm text-destructive">
                            Error: {readContractMutation.error.message}
                          </div>
                        )}
                        {!!readContractMutation.data && (
                          <div className="space-y-2">
                            <Label>Result:</Label>
                            <pre className="p-4 bg-muted rounded-md overflow-x-auto">
                              {JSON.stringify(
                                readContractMutation.data,
                                bigintReplacer,
                                2
                              )}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {(isLoadingTxList || txList) && (
          <Card className="w-full lg:w-100">
            <CardHeader>
              <CardTitle className="">
                {selectedFunctionSelector &&
                selectedFunction?.stateMutability !== "view"
                  ? `${selectedFunction?.name || "Function"} Transactions`
                  : "Recent Transactions"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTxList ? (
                <div className="h-[600px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="flex flex-col gap-2">
                    {filteredTransactions.map((tx: any) => (
                      <div
                        key={tx.hash}
                        className="p-4 rounded-lg border cursor-pointer hover:bg-muted"
                        onClick={() => handleTransactionClick(tx)}
                      >
                        <div className="font-medium flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: functionSelectorToColor(
                                tx.methodId
                              ),
                            }}
                          />
                          {tx.functionName || tx.methodId}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {getRelativeTime(parseInt(tx.timeStamp))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {tx.hash}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
