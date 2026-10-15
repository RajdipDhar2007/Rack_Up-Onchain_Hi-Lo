"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { appChain, appChainName } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { usePrivyAuth } from "@/hooks/use-privy-auth";

const subscribeNever = () => () => undefined;

export function SiteHeader({ admin = false }: { admin?: boolean }) {
  const auth = usePrivyAuth();
  const account = useAccount();
  const chainId = useChainId();
  // Wallet and auth state only exists in the browser; render the signed-out state until hydration is done
  // so the server and first client render always agree.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const { connectOrCreateWallet } = auth;
  const authenticated = mounted && auth.authenticated;
  const ready = mounted && auth.ready;
  const address = mounted ? account.address : undefined;
  const isConnected = mounted && account.isConnected;
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const signedIn = authenticated || isConnected;
  const wrongNetwork = signedIn && isConnected && chainId !== appChain.id;
  const buttonLabel = !ready
    ? "Loading…"
    : wrongNetwork
      ? "Switch network"
      : isConnected
        ? shortAddress(address)
        : authenticated
          ? "Preparing wallet…"
          : "Sign in / create wallet";

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Rack Up home">
        <span className="brand__mark">8</span>
        <span>Rack Up</span>
      </Link>
      <div className="header-actions">
        <span className="network-pill">{appChainName}</span>
        <Link className="button button--ghost button--compact desktop-only" href={admin ? "/" : "/admin"}>
          {admin ? "Player view" : "Admin desk"}
        </Link>
        {wrongNetwork ? (
          <button
            className="button button--brass button--compact"
            type="button"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: appChain.id })}
          >
            {isSwitching ? "Switching…" : "Switch network"}
          </button>
        ) : (
          <button
            className="button button--ivory button--compact"
            type="button"
            disabled={!ready || (authenticated && !isConnected)}
            onClick={() => void connectOrCreateWallet()}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </header>
  );
}
