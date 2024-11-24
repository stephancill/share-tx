import { NextRequest, NextResponse } from "next/server";
import { http, toHex } from "viem";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateColorFromMethodId(methodId: string): string {
  const hex = methodId.slice(2, 8);
  const r = parseInt(hex.slice(0, 2), 16) % 200;
  const g = parseInt(hex.slice(2, 4), 16) % 200;
  const b = parseInt(hex.slice(4, 6), 16) % 200;
  return `rgb(${r}, ${g}, ${b})`;
}

export function getTransportByChainId(chainId: number) {
  const url = process.env[`NEXT_PUBLIC_EVM_RPC_URL_${chainId}`];
  if (url) {
    return http(url);
  } else {
    return http();
  }
}

export function bigintReplacer(key: string, value: any) {
  if (typeof value === "bigint") {
    return toHex(value);
  }
  return value;
}

export function createProxyRequestHandler(
  targetUrl: string | ((req: NextRequest) => string),
  {
    searchParams = {},
    headers = {},
  }: {
    searchParams?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
) {
  return async function handler(
    req: NextRequest,
    context: { params?: { path: string[] } }
  ): Promise<NextResponse> {
    const url = new URL(
      typeof targetUrl === "function" ? targetUrl(req) : targetUrl
    );

    url.pathname = [
      ...url.pathname.split("/").slice(1),
      ...(context?.params?.path ?? []),
    ].join("/");

    url.search = req.nextUrl.search;

    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const newReqHeaders = new Headers(req.headers);
    newReqHeaders.delete("host");

    Object.entries(headers).forEach(([key, value]) => {
      newReqHeaders.set(key, value);
    });

    try {
      const response = await fetch(url, {
        method: req.method,
        headers: newReqHeaders,
        body: req.method === "POST" ? await req.text() : undefined,
      });

      const data = await response.text();

      const newResHeaders = new Headers(response.headers);
      newResHeaders.delete("host");
      newResHeaders.delete("content-encoding");

      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: newResHeaders,
      });
    } catch (error) {
      console.error("Proxy error:", error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  };
}
