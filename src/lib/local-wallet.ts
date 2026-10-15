import { createConnector } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { localChain } from "@/lib/chain";

const STORAGE_KEY = "rackup.local-wallet.v1";

export const LOCAL_PLAYER_CONNECTOR_ID = "local-player";

const signingMethods: Record<string, true> = { personal_sign: true, eth_signTypedData_v4: true, eth_sendTransaction: true };

/** Reads this browser's own throw-away wallet key, creating one on first use. Browser only. */
function loadOrCreateKey(create: boolean): Hex | undefined {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^0x[0-9a-fA-F]{64}$/.test(existing)) return existing as Hex;
    if (!create) return undefined;
    const key = generatePrivateKey();
    window.localStorage.setItem(STORAGE_KEY, key);
    return key;
  } catch {
    // Storage blocked (private mode): fall back to a wallet that lives for this tab only.
    if (!create) return undefined;
    memoryKey ??= generatePrivateKey();
    return memoryKey;
  }
}
let memoryKey: Hex | undefined;

function createProvider() {
  const transport = http(localChain.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({ chain: localChain, transport });

  return {
    async request({ method, params }: { method: string; params?: unknown }) {
      const args = (params ?? []) as unknown[];
      // The wallet is only created when someone explicitly signs in, never as a side effect of a read.
      const key = loadOrCreateKey(method === "eth_requestAccounts");
      if (!key) {
        if (method === "eth_chainId") return numberToHex(localChain.id);
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [];
        if (method in signingMethods) throw new Error("Sign in first.");
        return publicClient.request({ method, params } as never);
      }
      const account = privateKeyToAccount(key);
      const walletClient = createWalletClient({ account, chain: localChain, transport });
      switch (method) {
        case "eth_chainId":
          return numberToHex(localChain.id);
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "wallet_switchEthereumChain":
          return null;
        case "personal_sign":
          return account.signMessage({ message: { raw: args[0] as Hex } });
        case "eth_signTypedData_v4":
          return account.signTypedData(JSON.parse(args[1] as string));
        case "eth_sendTransaction": {
          const tx = args[0] as { to?: Address; data?: Hex; value?: Hex; gas?: Hex };
          return walletClient.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
          });
        }
        default:
          return publicClient.request({ method, params } as never);
      }
    },
  };
}

/**
 * A wallet that lives in this browser only. Every phone or laptop gets its own address, so any number of
 * people can play the local game at once. The key never leaves the device; the chain only ever sees signed
 * transactions.
 */
export function localPlayerConnector() {
  return createConnector((config) => ({
    id: LOCAL_PLAYER_CONNECTOR_ID,
    name: "This device",
    type: "local-player",
    async connect() {
      const key = loadOrCreateKey(true)!;
      return { accounts: [privateKeyToAccount(key).address] as never, chainId: config.chains[0].id };
    },
    async disconnect() {},
    async getAccounts() {
      const key = loadOrCreateKey(false);
      return key ? [getAddress(privateKeyToAccount(key).address)] : [];
    },
    async getChainId() {
      return config.chains[0].id;
    },
    async isAuthorized() {
      return Boolean(loadOrCreateKey(false));
    },
    async getProvider() {
      return createProvider();
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
