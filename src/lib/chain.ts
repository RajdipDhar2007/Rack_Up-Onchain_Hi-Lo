import { defineChain } from "viem";
import { baseSepolia, foundry } from "viem/chains";

export const isLocalChain = process.env.NEXT_PUBLIC_LOCAL_CHAIN === "true";

// In local mode the browser talks to the chain through the app's own /api/rpc proxy so other devices on the
// Wi-Fi never need direct access to Anvil. Server-side code uses the direct URL.
const directRpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || (isLocalChain ? "http://127.0.0.1:8545" : "https://sepolia.base.org");
const rpcUrl = isLocalChain && typeof window !== "undefined" ? "/api/rpc" : directRpcUrl;

export const localChain = defineChain({
  ...foundry,
  name: "Local Anvil",
  rpcUrls: { default: { http: [rpcUrl] } },
});

export const appChain = isLocalChain ? localChain : baseSepolia;
export const appChainName = isLocalChain ? "Local Anvil" : "Base Sepolia";
export const appRpcUrl = rpcUrl;

/** Anvil dev account 0: owns the local game and runs the /admin desk (host computer only). */
export const localAdminAccount = { label: "Admin", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" } as const;
