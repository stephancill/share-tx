"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Link, Send, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AbiFunction,
  decodeFunctionData,
  formatEther,
  isAddress,
  isHex,
} from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAbi } from "@/hooks/useAbi";
import { bigintReplacer } from "@/lib/utils";
import { chains } from "@/lib/wagmi";
import { SupportedChainId } from "@/types";

export default function Page() {
  const searchParams = useSearchParams();
  const account = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransaction } = useSendTransaction();
  const { switchChain } = useSwitchChain();
  const currentChainId = useChainId();

  const [showConnectModal, setShowConnectModal] = useState(false);

  const {
    data: parsedParams,
    isLoading: isParsedParamsLoading,
    error: parsedParamsError,
  } = useQuery({
    queryKey: ["txParams", searchParams],
    queryFn: () => {
      const to = searchParams.get("to");
      const value = searchParams.get("value");
      const data = searchParams.get("data");
      const chainId = searchParams.get("chainId");

      if (!to || !value || !data || !chainId) {
        throw new Error("Missing required parameters");
      }

      if (!isAddress(to)) {
        throw new Error("Invalid address format");
      }

      if (!isHex(data)) {
        throw new Error("Invalid hex data");
      }

      const chain = chains.find((c) => c.id === parseInt(chainId));
      if (!chain) {
        throw new Error("Unsupported chain ID");
      }

      return {
        to,
        value,
        valueFormatted: formatEther(BigInt(value)),
        data,
        chainId: parseInt(chainId) as SupportedChainId,
      };
    },
  });

  const client = usePublicClient({ chainId: parsedParams?.chainId });

  const { data: abi, isLoading: isAbiLoading } = useAbi({
    chainId: parsedParams?.chainId,
    address: parsedParams?.to,
  });

  const decodedData = useMemo(() => {
    if (!abi || !parsedParams?.data) return null;
    return decodeFunctionData({ abi, data: parsedParams.data });
  }, [abi, parsedParams?.data]);

  const selectedFunction = useMemo(() => {
    if (!abi || !decodedData) return null;
    return abi.find(
      (fn) => fn.type === "function" && fn.name === decodedData.functionName
    ) as AbiFunction;
  }, [abi, decodedData]);

  useEffect(() => {
    if (parsedParams && currentChainId !== parsedParams.chainId) {
      switchChain({ chainId: parsedParams.chainId });
    }
  }, [currentChainId, parsedParams?.chainId, switchChain]);

  if (isParsedParamsLoading || isAbiLoading) {
    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </CardContent>
      </Card>
    );
  }

  if (parsedParamsError) {
    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-red-600">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-600">
            {parsedParamsError instanceof Error
              ? parsedParamsError.message
              : "An error occurred while parsing parameters"}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end max-w-2xl mx-auto mt-4">
        {account.status === "connected" ? (
          <Button
            variant="outline"
            onClick={() => disconnect()}
            className="flex items-center gap-2"
          >
            <Wallet className="h-4 w-4" />
            <span className="font-mono text-sm truncate">
              {account.address?.slice(0, 6)}...{account.address?.slice(-4)}
            </span>
          </Button>
        ) : null}
      </div>

      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setShowConnectModal(false);
                }}
                variant="outline"
                className="w-full"
              >
                {connector.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="w-full max-w-2xl mx-auto mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">
              Transaction Details
            </CardTitle>
            <Badge variant="secondary" className="text-sm font-medium">
              {client.chain.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-[24px_1fr_2fr] items-center gap-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">To</span>
            <span
              className="font-mono text-sm truncate"
              title={parsedParams?.to}
            >
              {parsedParams?.to}
            </span>
          </div>
          <Separator />
          <div className="grid grid-cols-[24px_1fr_2fr] items-center gap-2">
            <Link className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Value</span>
            <span className="font-mono text-sm">
              {parsedParams?.valueFormatted} ETH
            </span>
          </div>
          {selectedFunction && decodedData && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="font-medium text-lg">
                  {selectedFunction.name}
                </div>
                {selectedFunction.inputs.map((input, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[24px_1fr_2fr] items-center gap-2"
                  >
                    <div>
                      <div className="font-medium">{input.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {input.type}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {/* Empty middle column */}
                    </div>
                    <div className="font-mono text-sm break-all">
                      {JSON.stringify(
                        decodedData?.args?.[index],
                        bigintReplacer,
                        2
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          {account.status === "connected" && parsedParams ? (
            <Button
              className="flex items-center gap-2 w-full"
              onClick={() => {
                sendTransaction({
                  to: parsedParams.to,
                  value: BigInt(parsedParams.value),
                  data: parsedParams.data,
                });
              }}
            >
              {/* TODO: Show tx status */}
              <Send className="h-4 w-4" />
              Confirm
            </Button>
          ) : (
            <Button
              className="flex items-center gap-2 w-full"
              onClick={() => setShowConnectModal(true)}
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </CardFooter>
      </Card>
    </>
  );
}
