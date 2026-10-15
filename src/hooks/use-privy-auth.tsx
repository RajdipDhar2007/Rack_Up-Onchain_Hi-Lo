"use client";

import { useConnectOrCreateWallet, usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { isLocalChain } from "@/lib/chain";
import { LOCAL_PLAYER_CONNECTOR_ID } from "@/lib/local-wallet";
import { LOCAL_ADMIN_CONNECTOR_ID } from "@/lib/wagmi";

type AppAuth = {
  authenticated: boolean;
  ready: boolean;
  connectOrCreateWallet: () => void;
};

const fallbackAuth: AppAuth = {
  authenticated: false,
  ready: true,
  connectOrCreateWallet: () => undefined,
};

const AuthContext = createContext<AppAuth>(fallbackAuth);

function PrivyAuthBridge({ children }: { children: React.ReactNode }) {
  const { authenticated, ready } = usePrivy();
  const { connectOrCreateWallet } = useConnectOrCreateWallet();

  return (
    <AuthContext.Provider value={{ authenticated, ready, connectOrCreateWallet }}>
      {children}
    </AuthContext.Provider>
  );
}

function isHostComputer() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

/** The admin desk on the host computer signs in as the Anvil admin; everyone else gets a wallet of their own. */
function wantsAdmin() {
  return isHostComputer() && window.location.pathname.startsWith("/admin");
}

function LocalAuthBridge({ children }: { children: React.ReactNode }) {
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected, status, connector } = useAccount();
  const pathname = usePathname();

  const connectAs = useCallback(
    (admin: boolean) => {
      const next = connectors.find((item) => item.id === (admin ? LOCAL_ADMIN_CONNECTOR_ID : LOCAL_PLAYER_CONNECTOR_ID));
      if (next) connect({ connector: next });
    },
    [connect, connectors],
  );

  // Keep the host's admin desk on the admin account (and out of any player wallet) without a picker.
  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") return;
    if (!pathname.startsWith("/admin") || !isHostComputer()) return;
    if (status === "connected" && connector?.id === LOCAL_ADMIN_CONNECTOR_ID) return;
    if (status === "connected") disconnect();
    connectAs(true);
  }, [connectAs, connector?.id, disconnect, pathname, status]);

  return (
    <AuthContext.Provider
      value={{
        authenticated: isConnected,
        ready: true,
        connectOrCreateWallet: () => {
          if (!isConnected) connectAs(wantsAdmin());
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AppAuthProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  if (!enabled && isLocalChain) return <LocalAuthBridge>{children}</LocalAuthBridge>;

  if (!enabled) {
    return <AuthContext.Provider value={fallbackAuth}>{children}</AuthContext.Provider>;
  }

  return <PrivyAuthBridge>{children}</PrivyAuthBridge>;
}

export function usePrivyAuth() {
  return useContext(AuthContext);
}
