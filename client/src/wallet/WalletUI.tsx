import React, { useEffect, useState, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWalletStatus, useRewardPool, formatEthDisplay } from './useWallet';
import { wsClient } from '../network/WebSocketClient';
import { formatEther } from 'viem';
import { ClaimButton } from './ClaimButton';
import { ClaimRewardsModal, ClaimError } from './ClaimRewardsModal';
import { ClaimErrorModal } from './ClaimErrorModal';

// Global event system to communicate with Phaser
const walletEvents = new EventTarget();

export function emitWalletEvent(type: string, detail?: any) {
  walletEvents.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onWalletEvent(type: string, handler: (detail: any) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  walletEvents.addEventListener(type, listener);
  return () => walletEvents.removeEventListener(type, listener);
}

// Format wei amount for display - always show full ETH with appropriate precision
function formatWeiDisplay(weiString: string): { amount: string; unit: string } {
  const wei = BigInt(weiString);
  if (wei === 0n) return { amount: '0', unit: 'ETH' };

  const eth = parseFloat(formatEther(wei));

  // Always show in ETH, adjust decimal places based on amount
  let decimals = 4;
  if (eth < 0.0001) decimals = 8;
  else if (eth < 0.001) decimals = 6;
  else if (eth >= 1) decimals = 4;

  const formatted = eth.toFixed(decimals).replace(/\.?0+$/, '');
  return { amount: formatted || '0', unit: 'ETH' };
}

// ETH counter component that displays accumulated ETH from boss chests
export function AccumulatedEthCounter() {
  const [accumulatedEthWei, setAccumulatedEthWei] = useState('0');
  const [showTooltip, setShowTooltip] = useState(false);

  // Listen for ETH drop events
  useEffect(() => {
    const unsubscribe = onWalletEvent('eth-drop-received', (detail) => {
      if (detail?.totalAccumulatedWei) {
        setAccumulatedEthWei(detail.totalAccumulatedWei);
      }
    });

    // Reset when run ends
    const unsubscribeReset = onWalletEvent('reset-accumulated-eth', () => {
      setAccumulatedEthWei('0');
    });

    return () => {
      unsubscribe();
      unsubscribeReset();
    };
  }, []);

  // Don't show if no ETH accumulated
  if (accumulatedEthWei === '0') return null;

  const { amount, unit } = formatWeiDisplay(accumulatedEthWei);

  return (
    <div
      className="accumulated-eth-counter"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
    >
      <span className="eth-icon">◆</span>
      <span className="eth-amount">{amount}</span>
      <span className="eth-label">{unit}</span>
      {showTooltip && (
        <div className="eth-counter-tooltip">
          Collected from boss chests.<br />
          Reach Floor 15 solo to claim!
        </div>
      )}
    </div>
  );
}

// Wallet connect button for landing page
export function WalletConnectButton() {
  const { address, isConnected } = useWalletStatus();

  // Notify server when wallet connects/disconnects
  useEffect(() => {
    if (isConnected && address) {
      wsClient.send({ type: 'CONNECT_WALLET', walletAddress: address });
      emitWalletEvent('wallet-connected', { address });
    } else {
      wsClient.send({ type: 'DISCONNECT_WALLET' });
      emitWalletEvent('wallet-disconnected', {});
    }
  }, [isConnected, address]);

  return (
    <div className="wallet-connect-wrapper">
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus={{
          smallScreen: 'avatar',
          largeScreen: 'full',
        }}
      />
    </div>
  );
}

// Estimated ETH price for USD display (could be fetched from an API)
const ETH_PRICE_USD = 3000; // Rough estimate

// Threshold to show actual ETH amount (when impressive enough)
const IMPRESSIVE_POOL_THRESHOLD = 0.1; // 0.1 ETH (~$300)

// Pool display that updates DOM elements directly for the vault UI
export function RewardPoolDisplay() {
  const { poolBalanceEth, poolBalanceWei, hasPoolFunds, refetch } = useRewardPool();

  // Refresh pool balance periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [refetch]);

  // Update vault display when pool becomes impressive
  useEffect(() => {
    const poolValue = parseFloat(poolBalanceEth || '0');
    const isImpressive = !isNaN(poolValue) && poolValue >= IMPRESSIVE_POOL_THRESHOLD;

    // console.log('[Vault] Pool balance:', poolBalanceEth, 'ETH, impressive:', isImpressive);

    const statusBadge = document.querySelector('.vault-status-badge');

    if (isImpressive && statusBadge) {
      // Pool is impressive - show actual amount instead of "UNCLAIMED"
      const ethAmount = formatEthDisplay(poolBalanceWei);
      statusBadge.textContent = `${ethAmount} ETH`;
    } else if (statusBadge) {
      // Keep default "UNCLAIMED" text
      statusBadge.textContent = 'UNCLAIMED';
    }
  }, [poolBalanceEth, poolBalanceWei]);

  return null; // This component just updates DOM, no visible render
}

// Main wallet overlay component
export function WalletOverlay() {
  const [accumulatedEthWei, setAccumulatedEthWei] = useState('0');
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [claimError, setClaimError] = useState<ClaimError | null>(null);

  // Track accumulated ETH for claim modal
  useEffect(() => {
    const unsubscribe = onWalletEvent('eth-drop-received', (detail) => {
      if (detail?.totalAccumulatedWei) {
        setAccumulatedEthWei(detail.totalAccumulatedWei);
      }
    });

    const unsubscribeReset = onWalletEvent('reset-accumulated-eth', () => {
      setAccumulatedEthWei('0');
      setIsClaimModalOpen(false);
    });

    return () => {
      unsubscribe();
      unsubscribeReset();
    };
  }, []);

  // Handle claim button click
  const handleClaimClick = useCallback(() => {
    setIsClaimModalOpen(true);
  }, []);

  // Handle connect button click (from ClaimButton)
  const handleConnectClick = useCallback(() => {
    // Trigger RainbowKit connect modal by clicking the hidden connect button
    const connectBtn = document.querySelector('[data-testid="rk-connect-button"]') as HTMLButtonElement;
    if (connectBtn) {
      connectBtn.click();
    }
  }, []);

  // Handle claim error
  const handleClaimError = useCallback((error: ClaimError) => {
    setClaimError(error);
    setIsClaimModalOpen(false);
    setIsErrorModalOpen(true);
  }, []);

  // Handle retry from error modal
  const handleRetry = useCallback(() => {
    setIsErrorModalOpen(false);
    setClaimError(null);
    setIsClaimModalOpen(true);
  }, []);

  return (
    <>
      {/* Wallet connect, claim button, and ETH counter in header */}
      <div id="wallet-header-mount">
        <ClaimButton
          onClaimClick={handleClaimClick}
          onConnectClick={handleConnectClick}
        />
        <AccumulatedEthCounter />
        <WalletConnectButton />
      </div>
      {/* Pool display updater - updates vault DOM elements */}
      <RewardPoolDisplay />

      {/* Claim rewards modal */}
      <ClaimRewardsModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        accumulatedEthWei={accumulatedEthWei}
        onError={handleClaimError}
      />

      {/* Error modal */}
      <ClaimErrorModal
        isOpen={isErrorModalOpen}
        error={claimError}
        onClose={() => {
          setIsErrorModalOpen(false);
          setClaimError(null);
        }}
        onRetry={handleRetry}
      />
    </>
  );
}

// Styles for wallet UI (injected into document)
export function injectWalletStyles() {
  const styleId = 'wallet-ui-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #wallet-header-mount {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .accumulated-eth-counter {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(34, 197, 94, 0.1) 100%);
      border: 1px solid rgba(74, 222, 128, 0.4);
      border-radius: 8px;
      padding: 8px 14px;
      font-family: 'Cinzel', serif;
      animation: ethCounterPulse 2s ease-in-out infinite;
      cursor: pointer;
    }

    .accumulated-eth-counter .eth-icon {
      color: #4ade80;
      font-size: 16px;
      text-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
    }

    .accumulated-eth-counter .eth-amount {
      color: #4ade80;
      font-size: 16px;
      font-weight: bold;
      text-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
    }

    .accumulated-eth-counter .eth-label {
      color: rgba(74, 222, 128, 0.8);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .eth-counter-tooltip {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-top: 8px;
      padding: 10px 14px;
      background: rgba(26, 26, 46, 0.98);
      border: 1px solid rgba(74, 222, 128, 0.5);
      border-radius: 6px;
      font-family: 'Crimson Text', serif;
      font-size: 13px;
      color: #4ade80;
      text-align: center;
      white-space: nowrap;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .eth-counter-tooltip::before {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 6px solid rgba(74, 222, 128, 0.5);
    }

    @keyframes ethCounterPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.2); }
      50% { box-shadow: 0 0 16px rgba(74, 222, 128, 0.4); }
    }

    /* Vault awakening state styles */
    .vault-awakening {
      animation: vaultPulse 2s ease-in-out infinite;
      opacity: 0.7;
    }

    .vault-awakening-status {
      font-style: italic;
      color: #8b5cf6 !important;
    }

    @keyframes vaultPulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.9; }
    }

    .wallet-connect-wrapper {
      font-family: system-ui, -apple-system, sans-serif;
    }

    .reward-pool-display {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #8b5cf6;
      border-radius: 12px;
      padding: 20px;
      color: #fff;
      font-family: 'Crimson Text', Georgia, serif;
      max-width: 320px;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
    }

    .pool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .pool-icon {
      font-size: 24px;
    }

    .pool-title {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: bold;
      color: #8b5cf6;
    }

    .pool-amount {
      text-align: center;
      margin: 16px 0;
    }

    .eth-value {
      font-size: 32px;
      font-weight: bold;
      color: #4ade80;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }

    .pool-status {
      text-align: center;
      margin-bottom: 16px;
      padding: 8px;
      border-radius: 6px;
      font-size: 14px;
    }

    .status-active {
      color: #4ade80;
      background: rgba(74, 222, 128, 0.1);
    }

    .status-empty {
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
    }

    .pool-info {
      font-size: 14px;
      color: #a0a0a0;
      border-top: 1px solid #333;
      padding-top: 12px;
    }

    .pool-info p {
      margin: 0 0 8px 0;
    }

    .pool-info ul {
      margin: 8px 0;
      padding-left: 20px;
    }

    .pool-info li {
      margin: 4px 0;
    }

    .pool-rules {
      font-style: italic;
      color: #8b5cf6;
      margin-top: 12px !important;
    }

    /* In-game crypto vendor modal styles */
    .crypto-vendor-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #8b5cf6;
      border-radius: 12px;
      padding: 24px;
      color: #fff;
      font-family: 'Crimson Text', Georgia, serif;
      z-index: 2000;
      min-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .crypto-vendor-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1999;
    }

    .vendor-title {
      font-family: 'Cinzel', serif;
      font-size: 24px;
      text-align: center;
      margin-bottom: 20px;
      color: #8b5cf6;
    }

    .payment-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      justify-content: center;
    }

    .payment-btn {
      padding: 8px 16px;
      border: 1px solid #444;
      background: #2a2a4e;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .payment-btn:hover {
      border-color: #8b5cf6;
    }

    .payment-btn.active {
      border-color: #8b5cf6;
      background: #3a3a6e;
    }

    .potion-buttons {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin: 20px 0;
    }

    .potion-card {
      padding: 16px 20px;
      border: 2px solid #444;
      background: linear-gradient(135deg, #2a2a4e 0%, #1a1a3e 100%);
      color: #fff;
      border-radius: 8px;
      text-align: center;
      transition: all 0.2s;
      min-width: 140px;
    }

    .potion-card:hover {
      border-color: #8b5cf6;
    }

    .potion-card .potion-img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      display: block;
      margin: 0 auto 12px;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
      image-rendering: pixelated;
    }

    .potion-card .potion-name {
      font-family: 'Cinzel', serif;
      font-weight: bold;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
    }

    .potion-card .potion-price {
      font-size: 14px;
      color: #4ade80;
      display: block;
      margin-bottom: 12px;
    }

    .qty-selector {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .qty-btn {
      width: 28px;
      height: 28px;
      border: 1px solid #8b5cf6;
      background: rgba(139, 92, 246, 0.2);
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qty-btn:hover:not(:disabled) {
      background: rgba(139, 92, 246, 0.4);
    }

    .qty-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .qty-value {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: bold;
      min-width: 24px;
      color: #ffd700;
    }

    .buy-btn {
      width: 100%;
      padding: 10px 16px;
      border: 2px solid #4ade80;
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(74, 222, 128, 0.1) 100%);
      color: #4ade80;
      border-radius: 6px;
      cursor: pointer;
      font-family: 'Cinzel', serif;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .buy-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(74, 222, 128, 0.2) 100%);
      transform: translateY(-1px);
    }

    .buy-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .purchases-remaining {
      text-align: center;
      color: #a0a0a0;
      font-size: 14px;
      margin-top: 16px;
    }

    .close-vendor-btn {
      display: block;
      width: 100%;
      padding: 12px;
      margin-top: 16px;
      background: #444;
      border: none;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
    }

    .close-vendor-btn:hover {
      background: #555;
    }

    /* ========================================
       CLAIM BUTTON STYLES
       ======================================== */

    .claim-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .claim-button .claim-icon {
      font-size: 16px;
    }

    .claim-button-ready {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(34, 197, 94, 0.15) 100%);
      border-color: #4ade80;
      color: #4ade80;
      animation: claimPulse 2s ease-in-out infinite;
    }

    .claim-button-ready:hover {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(34, 197, 94, 0.25) 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
    }

    .claim-button-connect {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(109, 40, 217, 0.15) 100%);
      border-color: #8b5cf6;
      color: #8b5cf6;
    }

    .claim-button-connect:hover {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(109, 40, 217, 0.25) 100%);
      transform: translateY(-1px);
    }

    .claim-button-disabled {
      background: rgba(100, 100, 100, 0.1);
      border-color: rgba(150, 150, 150, 0.3);
      color: rgba(150, 150, 150, 0.6);
      cursor: not-allowed;
    }

    @keyframes claimPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.2); }
      50% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.5); }
    }

    /* ========================================
       CLAIM MODAL STYLES
       ======================================== */

    .claim-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 2000;
      backdrop-filter: blur(4px);
    }

    .claim-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #4ade80;
      border-radius: 16px;
      padding: 32px;
      color: #fff;
      font-family: 'Crimson Text', Georgia, serif;
      z-index: 2001;
      min-width: 380px;
      max-width: 450px;
      box-shadow: 0 8px 32px rgba(74, 222, 128, 0.3);
    }

    .claim-title {
      font-family: 'Cinzel', serif;
      font-size: 24px;
      text-align: center;
      margin: 0 0 24px 0;
      color: #4ade80;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
    }

    .reward-breakdown {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .reward-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.5s ease;
    }

    .reward-row.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .reward-label {
      font-size: 16px;
      color: #a0a0a0;
    }

    .reward-value {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }

    .reward-unit {
      font-size: 14px;
      color: #a0a0a0;
      margin-left: 6px;
    }

    .pool-row .reward-label {
      color: #8b5cf6;
    }

    .pool-value {
      color: #8b5cf6 !important;
    }

    .reward-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #4ade80, transparent);
      margin: 8px 0;
      opacity: 0;
      transition: opacity 0.5s ease;
    }

    .reward-divider.visible {
      opacity: 1;
    }

    .total-row .reward-label {
      font-family: 'Cinzel', serif;
      font-weight: bold;
      color: #4ade80;
    }

    .total-value {
      font-size: 28px !important;
      color: #4ade80 !important;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }

    .claim-action-btn {
      width: 100%;
      padding: 16px;
      border: 2px solid #4ade80;
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(74, 222, 128, 0.1) 100%);
      color: #4ade80;
      border-radius: 8px;
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s ease;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.5;
    }

    .claim-action-btn.ready {
      opacity: 1;
    }

    .claim-action-btn.ready:hover {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(74, 222, 128, 0.2) 100%);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(74, 222, 128, 0.4);
    }

    .claim-action-btn:disabled {
      cursor: not-allowed;
    }

    .claim-cancel-btn {
      width: 100%;
      padding: 12px;
      margin-top: 12px;
      background: transparent;
      border: 1px solid #444;
      color: #888;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .claim-cancel-btn:hover {
      border-color: #666;
      color: #aaa;
    }

    /* ========================================
       CLAIM SUCCESS STYLES
       ======================================== */

    .claim-success {
      text-align: center;
    }

    .success-icon {
      font-size: 64px;
      margin-bottom: 16px;
      animation: successBounce 0.6s ease;
    }

    @keyframes successBounce {
      0% { transform: scale(0); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    .success-title {
      font-family: 'Cinzel', serif;
      font-size: 28px;
      color: #4ade80;
      margin: 0 0 20px 0;
      text-shadow: 0 0 15px rgba(74, 222, 128, 0.5);
    }

    .success-amount {
      margin-bottom: 20px;
    }

    .success-amount .amount-value {
      font-family: 'Cinzel', serif;
      font-size: 36px;
      font-weight: bold;
      color: #4ade80;
      text-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
    }

    .success-amount .amount-unit {
      font-size: 20px;
      color: #4ade80;
      margin-left: 8px;
    }

    .tx-link {
      display: inline-block;
      padding: 10px 20px;
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid #8b5cf6;
      border-radius: 6px;
      color: #8b5cf6;
      text-decoration: none;
      font-size: 14px;
      transition: all 0.2s ease;
      margin-bottom: 20px;
    }

    .tx-link:hover {
      background: rgba(139, 92, 246, 0.2);
      transform: translateY(-1px);
    }

    .close-btn {
      width: 100%;
      padding: 14px;
      background: #333;
      border: none;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: #444;
    }

    /* ========================================
       CONFETTI STYLES
       ======================================== */

    .confetti-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .confetti-particle {
      position: absolute;
      top: -10px;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      animation: confettiFall 3s ease-out forwards;
    }

    @keyframes confettiFall {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(400px) rotate(720deg);
        opacity: 0;
      }
    }

    /* ========================================
       ERROR MODAL STYLES
       ======================================== */

    .error-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 2002;
      backdrop-filter: blur(4px);
    }

    .error-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a2e 0%, #2d1f1f 100%);
      border: 2px solid #f87171;
      border-radius: 16px;
      padding: 32px;
      color: #fff;
      font-family: 'Crimson Text', Georgia, serif;
      z-index: 2003;
      min-width: 380px;
      max-width: 450px;
      box-shadow: 0 8px 32px rgba(248, 113, 113, 0.2);
    }

    .error-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 16px;
    }

    .error-title {
      font-family: 'Cinzel', serif;
      font-size: 22px;
      text-align: center;
      margin: 0 0 20px 0;
      color: #f87171;
    }

    .error-content {
      margin-bottom: 24px;
    }

    .error-message {
      font-size: 16px;
      color: #e0e0e0;
      margin: 0 0 16px 0;
      line-height: 1.5;
    }

    .error-suggestion-box {
      display: flex;
      gap: 12px;
      background: rgba(74, 222, 128, 0.1);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 8px;
      padding: 12px;
    }

    .suggestion-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .error-suggestion {
      font-size: 14px;
      color: #4ade80;
      margin: 0;
      line-height: 1.4;
    }

    .error-actions {
      display: flex;
      gap: 12px;
    }

    .error-retry-btn {
      flex: 1;
      padding: 14px;
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(74, 222, 128, 0.1) 100%);
      border: 2px solid #4ade80;
      color: #4ade80;
      border-radius: 6px;
      cursor: pointer;
      font-family: 'Cinzel', serif;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s ease;
    }

    .error-retry-btn:hover {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(74, 222, 128, 0.2) 100%);
    }

    .error-close-btn {
      flex: 1;
      padding: 14px;
      background: #333;
      border: 1px solid #444;
      color: #aaa;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s ease;
    }

    .error-close-btn:hover {
      background: #444;
      color: #fff;
    }

    .error-help {
      text-align: center;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #333;
    }

    .error-help p {
      margin: 0;
      font-size: 13px;
      color: #888;
    }

    .help-link {
      color: #8b5cf6;
      text-decoration: none;
    }

    .help-link:hover {
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);
}
