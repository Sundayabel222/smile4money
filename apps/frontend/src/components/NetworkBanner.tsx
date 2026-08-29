import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface NetworkBannerProps {
  walletNetwork: string | null;
}

export function NetworkBanner({ walletNetwork }: NetworkBannerProps) {
  const { isMismatch, walletNetwork: currentNetwork, expectedNetwork } = useNetworkStatus(walletNetwork);

  if (!isMismatch) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="network-banner"
      className="w-full bg-red-600 px-4 py-3 text-center text-sm font-medium text-white"
    >
      Wrong network detected: your wallet is on <strong>{currentNetwork}</strong> but this app
      requires <strong>{expectedNetwork}</strong>.{' '}
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Switch network in your wallet
      </a>
      .
    </div>
  );
}
