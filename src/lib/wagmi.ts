import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { createConfig, createConnector, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { baseSepolia, foundry } from "viem/chains";
import { appChain, appRpcUrl, isLocalChain, localAdminAccount } from "@/lib/chain";
import { localPlayerConnector } from "@/lib/local-wallet";

export const LOCAL_ADMIN_CONNECTOR_ID = "local-admin";

/**
 * Local mode: every device gets its own wallet (unlimited players). The Anvil admin account is a second
 * connector that is only ever offered on the host computer's /admin desk.
 */
const localConnectors = isLocalChain
  ? [
      localPlayerConnector(),
      (() => {
        const base = mock({ accounts: [localAdminAccount.address], features: { defaultConnected: false } });
        return createConnector((config) => ({
          ...base(config),
          id: LOCAL_ADMIN_CONNECTOR_ID,
          name: "Admin",
        }));
      })(),
    ]
  : [];

const transports = {
  [baseSepolia.id]: http(appRpcUrl),
  [foundry.id]: http(appRpcUrl),
};

// `ssr: true` delays restoring a saved wallet until after hydration so server and client HTML always match.
// Privy owns connector management in production; the local stack uses plain wagmi with the connectors above.
export const wagmiConfig = isLocalChain
  ? createConfig({ chains: [appChain], connectors: localConnectors, transports, ssr: true })
  : createPrivyConfig({ chains: [appChain], transports, ssr: true });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
