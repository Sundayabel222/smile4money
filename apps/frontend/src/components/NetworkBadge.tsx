import React from 'react';
import { useNetworkStatus, NETWORK_COLORS } from '../hooks/useNetworkStatus';

interface NetworkBadgeProps {
  /** Override the network to display. Defaults to the app's expected network. */
  network?: string;
}

export function NetworkBadge({ network }: NetworkBadgeProps) {
  const { expectedNetwork, expectedColor, expectedLabel, walletNetwork, walletLabel } =
    useNetworkStatus(network ?? null);

  // When an explicit `network` prop is provided it is treated as the
  // "wallet network"; otherwise fall back to the expected network.
  const displayNet = walletNetwork ?? expectedNetwork;
  const displayLabel = walletLabel ?? expectedLabel;
  const displayColor = walletNetwork ? (NETWORK_COLORS[walletNetwork] ?? 'bg-gray-400') : expectedColor;

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${displayColor} text-white`}
      data-testid="network-badge"
      data-network={displayNet}
    >
      {displayLabel}
    </span>
  );
}
