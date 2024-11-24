"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function Page() {
  const searchParams = useSearchParams();

  const to = searchParams.get("to");
  const value = searchParams.get("value");
  const data = searchParams.get("data");
  const chainId = searchParams.get("chainId");

  return (
    <div>
      <h1>Tx</h1>
      <div>
        <div>To: {to}</div>
        <div>Value: {value}</div>
        <div>Data: {data}</div>
        <div>Chain: {chainId}</div>
      </div>
    </div>
  );
}
