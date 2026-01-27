import React, { useState, useEffect } from 'react';
import { useWalletStatus, useBatchedPurchase, formatEthDisplay } from './useWallet';
import { PaymentToken, PotionType } from '@dungeon-link/shared';
import { POTION_PRICE_ETH, POTION_PRICE_USDC, POTION_PRICE_USDT } from './config';
import { wsClient } from '../network/WebSocketClient';
import { emitWalletEvent, onWalletEvent } from './WalletUI';
import { GameModal, GameButton } from './GameModal';

interface CryptoVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchasesRemaining: number;
}

export function CryptoVendorModal({ isOpen, onClose, purchasesRemaining }: CryptoVendorModalProps) {
  const [selectedToken, setSelectedToken] = useState<PaymentToken>(PaymentToken.USDC);
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'approving' | 'purchasing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [healthQty, setHealthQty] = useState(1);
  const [manaQty, setManaQty] = useState(1);
  const [lastPurchasedType, setLastPurchasedType] = useState<PotionType | null>(null);
  const [lastPurchasedQty, setLastPurchasedQty] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<{ potionType: PotionType; quantity: number } | null>(null);

  const { isConnected } = useWalletStatus();
  const {
    purchaseBatched,
    purchaseRegular,
    approveToken,
    hasAllowance,
    callsId,
    isPending,
    isConfirming,
    isSuccess,
    error,
    batchError,
    refetchAllowances
  } = useBatchedPurchase();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPurchaseStatus('idle');
      setErrorMessage('');
      setHealthQty(1);
      setManaQty(1);
      setPendingPurchase(null);
      refetchAllowances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only reset when modal opens, not when refetchAllowances changes

  // Ensure quantities don't exceed remaining purchases
  useEffect(() => {
    if (healthQty > purchasesRemaining) setHealthQty(Math.max(1, purchasesRemaining));
    if (manaQty > purchasesRemaining) setManaQty(Math.max(1, purchasesRemaining));
  }, [purchasesRemaining, healthQty, manaQty]);

  // Handle purchase success
  useEffect(() => {
    if (isSuccess && callsId && purchaseStatus === 'purchasing') {
      setPurchaseStatus('success');
      // Notify server for each potion purchased
      if (lastPurchasedType !== null) {
        for (let i = 0; i < lastPurchasedQty; i++) {
          wsClient.send({
            type: 'VERIFY_CRYPTO_PURCHASE',
            txHash: callsId, // Using callsId as identifier
            potionType: lastPurchasedType,
            paymentToken: selectedToken,
          });
        }
      }
      // Emit event for Phaser to update UI
      emitWalletEvent('purchase-success', { callsId, quantity: lastPurchasedQty });
      // Refresh allowances after successful purchase
      refetchAllowances();
    }
  }, [isSuccess, callsId, purchaseStatus, lastPurchasedType, lastPurchasedQty, selectedToken, refetchAllowances]);

  // Handle EIP-5792 errors - switch to fallback mode
  useEffect(() => {
    if (batchError && !useFallback) {
      const isUnsupportedError =
        batchError.message?.includes('not supported') ||
        batchError.message?.includes('wallet_sendCalls') ||
        batchError.message?.includes('does not support') ||
        batchError.message?.includes('Method not found');

      if (isUnsupportedError) {
        console.log('[CryptoVendor] EIP-5792 not supported, switching to fallback mode');
        setUseFallback(true);
        setPurchaseStatus('idle');
        setErrorMessage('');
        // If we had a pending purchase, user will need to retry with fallback flow
      }
    }
  }, [batchError, useFallback]);

  // Handle general errors (in fallback mode)
  useEffect(() => {
    if (error && useFallback && purchaseStatus !== 'idle') {
      setPurchaseStatus('error');
      setErrorMessage(error.message || 'Transaction failed');
    }
  }, [error, useFallback, purchaseStatus]);

  // Handle approval success in fallback mode - proceed to purchase
  useEffect(() => {
    if (isSuccess && purchaseStatus === 'approving' && pendingPurchase) {
      console.log('[CryptoVendor] Approval successful, proceeding to purchase');
      refetchAllowances();
      // Small delay to ensure allowance is updated
      setTimeout(() => {
        setPurchaseStatus('purchasing');
        purchaseRegular(pendingPurchase.potionType, selectedToken);
      }, 500);
    }
  }, [isSuccess, purchaseStatus, pendingPurchase, selectedToken, purchaseRegular, refetchAllowances]);

  const handlePurchase = async (potionType: PotionType, quantity: number) => {
    if (!isConnected || purchasesRemaining <= 0 || quantity > purchasesRemaining) return;

    setErrorMessage('');
    setLastPurchasedType(potionType);
    setLastPurchasedQty(quantity);

    if (useFallback) {
      // Fallback mode: check allowance first for token purchases
      if (selectedToken !== PaymentToken.ETH && !hasAllowance(selectedToken, quantity)) {
        // Need to approve first
        setPurchaseStatus('approving');
        setPendingPurchase({ potionType, quantity });
        try {
          await approveToken(selectedToken, quantity);
        } catch (err) {
          // Error will be handled by useEffect
        }
      } else {
        // Already approved or ETH - proceed directly to purchase
        setPurchaseStatus('purchasing');
        setPendingPurchase(null);
        try {
          await purchaseRegular(potionType, selectedToken);
        } catch (err) {
          // Error will be handled by useEffect
        }
      }
    } else {
      // Try EIP-5792 batched flow
      setPurchaseStatus('purchasing');
      try {
        await purchaseBatched(potionType, selectedToken, quantity);
      } catch (err) {
        // Error will be handled by the useEffect above
      }
    }
  };

  const getPrice = (qty: number = 1) => {
    switch (selectedToken) {
      case PaymentToken.ETH:
        const ethTotal = (parseFloat(POTION_PRICE_ETH.toString()) / 1e18 * qty).toFixed(6);
        return `${formatEthDisplay(ethTotal)} ETH`;
      case PaymentToken.USDC:
        return `$${(0.10 * qty).toFixed(2)} USDC`;
      case PaymentToken.USDT:
        return `$${(0.10 * qty).toFixed(2)} USDT`;
    }
  };

  const maxQty = Math.min(5, purchasesRemaining);

  const isProcessing = isPending || isConfirming || purchaseStatus === 'approving';

  return (
    <GameModal
      isOpen={isOpen}
      onClose={onClose}
      title="Alchemist's Emporium"
      titleIcon="🧪"
      width={440}
    >
      {!isConnected ? (
        <div className="game-status game-status-error">
          Connect your wallet to purchase potions
        </div>
      ) : (
        <>
          {/* Payment selector */}
          <div className="game-select-group">
            {Object.values(PaymentToken).map((token) => (
              <button
                key={token}
                className={`game-select-btn ${selectedToken === token ? 'active' : ''}`}
                onClick={() => setSelectedToken(token)}
                disabled={isProcessing}
              >
                {token.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Fallback notice for token payments */}
          {selectedToken !== PaymentToken.ETH && useFallback && (
            <div className={`game-status ${hasAllowance(selectedToken, Math.max(healthQty, manaQty)) ? 'game-status-success' : 'game-status-warning'}`}>
              {hasAllowance(selectedToken, Math.max(healthQty, manaQty))
                ? '✓ Token approved - ready to purchase'
                : '⚠ Requires 2 transactions: approve + purchase'}
            </div>
          )}

          {/* Potion cards */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '16px 0' }}>
            <div className="game-item-card">
              <img src="/assets/ui/potion_health.png" alt="Health Potion" />
              <div className="game-item-name">Health Potion</div>
              <div className="game-item-price">{getPrice(healthQty)}</div>
              <div className="game-qty-selector">
                <button
                  className="game-qty-btn"
                  onClick={() => setHealthQty(q => Math.max(1, q - 1))}
                  disabled={healthQty <= 1 || isProcessing}
                >−</button>
                <span className="game-qty-value">{healthQty}</span>
                <button
                  className="game-qty-btn"
                  onClick={() => setHealthQty(q => Math.min(maxQty, q + 1))}
                  disabled={healthQty >= maxQty || isProcessing}
                >+</button>
              </div>
              <GameButton
                onClick={() => handlePurchase(PotionType.Health, healthQty)}
                disabled={isProcessing || purchasesRemaining <= 0}
                variant="buy"
                size="small"
                fullWidth
              >
                {isProcessing ? 'Processing...' : `Buy ${healthQty > 1 ? `(${healthQty})` : ''}`}
              </GameButton>
            </div>

            <div className="game-item-card">
              <img src="/assets/ui/potion_mana.png" alt="Mana Potion" />
              <div className="game-item-name">Mana Potion</div>
              <div className="game-item-price">{getPrice(manaQty)}</div>
              <div className="game-qty-selector">
                <button
                  className="game-qty-btn"
                  onClick={() => setManaQty(q => Math.max(1, q - 1))}
                  disabled={manaQty <= 1 || isProcessing}
                >−</button>
                <span className="game-qty-value">{manaQty}</span>
                <button
                  className="game-qty-btn"
                  onClick={() => setManaQty(q => Math.min(maxQty, q + 1))}
                  disabled={manaQty >= maxQty || isProcessing}
                >+</button>
              </div>
              <GameButton
                onClick={() => handlePurchase(PotionType.Mana, manaQty)}
                disabled={isProcessing || purchasesRemaining <= 0}
                variant="buy"
                size="small"
                fullWidth
              >
                {isProcessing ? 'Processing...' : `Buy ${manaQty > 1 ? `(${manaQty})` : ''}`}
              </GameButton>
            </div>
          </div>

          {/* Status messages */}
          {purchaseStatus === 'approving' && (
            <div className="game-status game-status-warning">
              {isPending ? 'Step 1/2: Confirm approval in wallet...' : 'Processing approval...'}
            </div>
          )}
          {purchaseStatus === 'purchasing' && (
            <div className="game-status game-status-warning">
              {isPending
                ? (useFallback ? 'Step 2/2: Confirm purchase in wallet...' : 'Confirm in wallet...')
                : 'Processing transaction...'}
            </div>
          )}
          {purchaseStatus === 'success' && (
            <div className="game-status game-status-success">
              ✓ Purchase successful! {lastPurchasedQty > 1 ? `${lastPurchasedQty} potions` : 'Potion'} added to inventory.
            </div>
          )}
          {purchaseStatus === 'error' && (
            <div className="game-status game-status-error">
              {errorMessage}
            </div>
          )}

          {/* Purchases remaining */}
          <div style={{ textAlign: 'center', color: purchasesRemaining > 0 ? '#888' : '#f87171', fontSize: '14px', marginTop: '12px' }}>
            {purchasesRemaining > 0
              ? `${purchasesRemaining} purchases remaining this floor`
              : 'No purchases remaining this floor'}
          </div>
        </>
      )}
    </GameModal>
  );
}

// Standalone state manager for the modal (can be controlled from Phaser)
let modalState = {
  isOpen: false,
  purchasesRemaining: 5,
  setIsOpen: (_: boolean) => {},
  setPurchasesRemaining: (_: number) => {},
};

export function CryptoVendorModalManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [purchasesRemaining, setPurchasesRemaining] = useState(5);

  // Store setters for external access
  useEffect(() => {
    modalState.isOpen = isOpen;
    modalState.purchasesRemaining = purchasesRemaining;
    modalState.setIsOpen = setIsOpen;
    modalState.setPurchasesRemaining = setPurchasesRemaining;
  }, [isOpen, purchasesRemaining]);

  // Listen for events from Phaser
  useEffect(() => {
    const unsubOpen = onWalletEvent('open-crypto-vendor', (detail) => {
      setPurchasesRemaining(detail?.purchasesRemaining ?? 5);
      setIsOpen(true);
    });

    const unsubClose = onWalletEvent('close-crypto-vendor', () => {
      setIsOpen(false);
    });

    const unsubUpdate = onWalletEvent('update-purchases-remaining', (detail) => {
      setPurchasesRemaining(detail?.remaining ?? 0);
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubUpdate();
    };
  }, []);

  return (
    <CryptoVendorModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      purchasesRemaining={purchasesRemaining}
    />
  );
}

// Export functions to control modal from Phaser
export function openCryptoVendor(purchasesRemaining: number = 5) {
  emitWalletEvent('open-crypto-vendor', { purchasesRemaining });
}

export function closeCryptoVendor() {
  emitWalletEvent('close-crypto-vendor', {});
}

export function updatePurchasesRemaining(remaining: number) {
  emitWalletEvent('update-purchases-remaining', { remaining });
}
