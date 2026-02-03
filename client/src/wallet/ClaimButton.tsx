import React, { useState, useEffect } from 'react';
import { useWalletStatus } from './useWallet';
import { onWalletEvent } from './WalletUI';

interface ClaimButtonProps {
  onClaimClick: () => void;
  onConnectClick: () => void;
}

export function ClaimButton({ onClaimClick, onConnectClick }: ClaimButtonProps) {
  const { isConnected } = useWalletStatus();
  const [canClaim, setCanClaim] = useState(false);
  const [accumulatedEthWei, setAccumulatedEthWei] = useState('0');

  // Listen for claim eligibility updates
  useEffect(() => {
    const unsubscribeClaim = onWalletEvent('claim-eligibility-changed', (detail) => {
      if (detail?.canClaim !== undefined) {
        setCanClaim(detail.canClaim);
      }
    });

    const unsubscribeEth = onWalletEvent('eth-drop-received', (detail) => {
      if (detail?.totalAccumulatedWei) {
        setAccumulatedEthWei(detail.totalAccumulatedWei);
      }
      // Check if this drop makes us eligible (floor 15 solo)
      if (detail?.canClaim) {
        setCanClaim(true);
      }
    });

    const unsubscribeReset = onWalletEvent('reset-accumulated-eth', () => {
      setAccumulatedEthWei('0');
      setCanClaim(false);
    });

    // Also listen for full crypto state updates (covers reconnection scenarios)
    const unsubscribeCryptoState = onWalletEvent('crypto-state-updated', (detail) => {
      if (detail?.accumulatedEthWei) {
        setAccumulatedEthWei(detail.accumulatedEthWei);
      }
      if (detail?.canClaim !== undefined) {
        setCanClaim(detail.canClaim);
      }
    });

    return () => {
      unsubscribeClaim();
      unsubscribeEth();
      unsubscribeReset();
      unsubscribeCryptoState();
    };
  }, []);

  // Don't show button if no ETH accumulated
  if (accumulatedEthWei === '0') {
    return null;
  }

  // Not connected - show connect prompt
  if (!isConnected) {
    return (
      <button
        className="claim-button claim-button-connect"
        onClick={onConnectClick}
        title="Connect wallet to claim your rewards"
      >
        <span className="claim-icon">&#x1F512;</span>
        <span className="claim-text">Connect to Claim</span>
      </button>
    );
  }

  // Connected but not eligible
  if (!canClaim) {
    return (
      <button
        className="claim-button claim-button-disabled"
        disabled
        title="Defeat the Floor 15 boss solo to claim"
      >
        <span className="claim-icon">&#x23F3;</span>
        <span className="claim-text">Floor 15 to Claim</span>
      </button>
    );
  }

  // Eligible to claim!
  return (
    <button
      className="claim-button claim-button-ready"
      onClick={onClaimClick}
      title="Claim your rewards now!"
    >
      <span className="claim-icon">&#x1F4B0;</span>
      <span className="claim-text">Claim Rewards</span>
    </button>
  );
}
