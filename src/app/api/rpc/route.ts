import { NextRequest, NextResponse } from "next/server";

import { isLocalChain } from "@/lib/chain";

export const runtime = "nodejs";

/**
 * Local-mode JSON-RPC proxy so phones/laptops on the same Wi-Fi can reach the private Anvil node
 * through the app's own origin. Players sign in their own browser and only send raw signed transactions, so
 * remote devices may never ask the node to sign (the unlocked admin/relayer accounts) or use chain-control methods.
 */
const upstream = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
// Methods that make the node sign with one of its unlocked accounts.
const nodeSigningMethods = new Set(["eth_sendTransaction", "personal_sign", "eth_sign", "eth_signTypedData", "eth_signTypedData_v4"]);
const blockedPrefixes = ["anvil_", "evm_", "hardhat_", "debug_", "ots_", "personal_", "eth_sendUnsignedTransaction"];

type RpcCall = { id?: unknown; jsonrpc?: string; method?: string; params?: unknown[] };

function isHostComputer(request: NextRequest) {
  // nextUrl.hostname reflects the bind address (0.0.0.0), so read the Host header the browser actually used.
  const hostname = (request.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isAllowedForRemote(call: RpcCall) {
  const method = call.method ?? "";
  return !nodeSigningMethods.has(method) && !blockedPrefixes.some((prefix) => method.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  if (!isLocalChain) return NextResponse.json({ error: "Not available" }, { status: 404 });

  let body: RpcCall | RpcCall[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isHostComputer(request)) {
    const calls = Array.isArray(body) ? body : [body];
    const denied = calls.find((call) => !isAllowedForRemote(call));
    if (denied) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: denied.id ?? null, error: { code: -32601, message: "Only the host computer may do that." } },
        { status: 403 },
      );
    }
  }

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Local chain is not reachable" }, { status: 502 });
  }
}
