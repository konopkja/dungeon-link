import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatEther } from 'viem';
import { useClaimRewards, useRewardPool } from './useWallet';
import { wsClient } from '../network/WebSocketClient';
import { emitWalletEvent, onWalletEvent } from './WalletUI';

interface ClaimRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accumulatedEthWei: string;
  onError: (error: ClaimError) => void;
}

export interface ClaimError {
  title: string;
  message: string;
  suggestion: string;
}

type ClaimState = 'idle' | 'animating' | 'ready' | 'requesting' | 'claiming' | 'success' | 'error';

// Base chain block explorer
const BASE_EXPLORER_URL = 'https://basescan.org/tx/';

// Count-up animation hook
function useCountUp(
  targetValue: number,
  duration: number = 2000,
  startAnimation: boolean = false
): number {
  const [currentValue, setCurrentValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startAnimation || targetValue === 0) {
      setCurrentValue(startAnimation ? targetValue : 0);
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const value = targetValue * easeOutQuart;

      setCurrentValue(value);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [targetValue, duration, startAnimation]);

  return currentValue;
}

// Format ETH with appropriate precision
function formatEthWithPrecision(wei: bigint): string {
  const eth = parseFloat(formatEther(wei));
  if (eth === 0) return '0';
  if (eth < 0.000001) return '< 0.000001';
  if (eth < 0.0001) return eth.toFixed(8).replace(/\.?0+$/, '');
  if (eth < 0.01) return eth.toFixed(6).replace(/\.?0+$/, '');
  return eth.toFixed(4).replace(/\.?0+$/, '');
}

export function ClaimRewardsModal({
  isOpen,
  onClose,
  accumulatedEthWei,
  onError,
}: ClaimRewardsModalProps) {
  const [claimState, setClaimState] = useState<ClaimState>('idle');
  const [attestation, setAttestation] = useState<{
    signature: string;
    accountId: string;
    ethAmountWei: string;
    walletAddress: string;
  } | null>(null);

  const { claim, txHash, isPending, isConfirming, isSuccess, error } = useClaimRewards();
  const { poolBalanceWei, refetch: refetchPool } = useRewardPool();

  // Parse amounts
  const accumulatedWei = BigInt(accumulatedEthWei || '0');
  const poolWei = BigInt(poolBalanceWei || '0');
  const totalWei = accumulatedWei + poolWei;

  // Convert to numbers for animation (in ETH units)
  const accumulatedEth = parseFloat(formatEther(accumulatedWei));
  const poolEth = parseFloat(formatEther(poolWei));
  const totalEth = parseFloat(formatEther(totalWei));

  // Animation states
  const [showAccumulated, setShowAccumulated] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [showTotal, setShowTotal] = useState(false);

  const animatedAccumulated = useCountUp(accumulatedEth, 1500, showAccumulated);
  const animatedPool = useCountUp(poolEth, 1500, showPool);
  const animatedTotal = useCountUp(totalEth, 1000, showTotal);

  // Start animation sequence when modal opens
  useEffect(() => {
    if (isOpen && claimState === 'idle') {
      setClaimState('animating');
      refetchPool();

      // Stagger the animations
      const timer1 = setTimeout(() => setShowAccumulated(true), 300);
      const timer2 = setTimeout(() => setShowPool(true), 1800);
      const timer3 = setTimeout(() => {
        setShowTotal(true);
        setClaimState('ready');
      }, 3300);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  }, [isOpen, claimState, refetchPool]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setClaimState('idle');
      setShowAccumulated(false);
      setShowPool(false);
      setShowTotal(false);
      setAttestation(null);
    }
  }, [isOpen]);

  // Listen for attestation response
  useEffect(() => {
    const unsubscribeAttestation = onWalletEvent('claim-attestation-received', (detail) => {
      if (detail?.signature) {
        setAttestation(detail);
        setClaimState('claiming');
        // Execute the claim immediately (one-click)
        claim(detail.accountId, detail.ethAmountWei, detail.signature as `0x${string}`);
      }
    });

    const unsubscribeNotEligible = onWalletEvent('claim-not-eligible', (detail) => {
      setClaimState('error');
      onError({
        title: 'Claim Not Available',
        message: detail?.reason || 'Unable to claim at this time.',
        suggestion: getErrorSuggestion(detail?.reason),
      });
    });

    return () => {
      unsubscribeAttestation();
      unsubscribeNotEligible();
    };
  }, [claim, onError]);

  // Handle transaction states
  useEffect(() => {
    if (isSuccess && txHash) {
      setClaimState('success');
      // Emit event to reset accumulated ETH
      emitWalletEvent('claim-success', { txHash });
      emitWalletEvent('reset-accumulated-eth', {});
    }
  }, [isSuccess, txHash]);

  useEffect(() => {
    if (error) {
      setClaimState('error');
      onError({
        title: 'Transaction Failed',
        message: error.message || 'The claim transaction failed.',
        suggestion: 'Please check your wallet has enough ETH for gas fees and try again.',
      });
    }
  }, [error, onError]);

  // Handle claim button click
  const handleClaim = useCallback(() => {
    setClaimState('requesting');
    // Request attestation from server
    wsClient.send({ type: 'REQUEST_CLAIM_ATTESTATION' });
  }, []);

  // Handle close with confetti cleanup
  const handleClose = useCallback(() => {
    if (claimState === 'success') {
      // Allow some time for confetti to be enjoyed
      setTimeout(onClose, 500);
    } else {
      onClose();
    }
  }, [claimState, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="claim-modal-backdrop" onClick={handleClose} />
      <div className="claim-modal">
        {claimState === 'success' ? (
          // Success state
          <div className="claim-success">
            <div className="success-icon">&#x1F389;</div>
            <h2 className="success-title">Rewards Claimed!</h2>
            <div className="success-amount">
              <span className="amount-value">{formatEthWithPrecision(totalWei)}</span>
              <span className="amount-unit">ETH</span>
            </div>
            <a
              href={`${BASE_EXPLORER_URL}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              View on BaseScan &#x2197;
            </a>
            <button className="close-btn" onClick={handleClose}>
              Close
            </button>
            <Confetti />
          </div>
        ) : (
          // Claim flow
          <>
            <h2 className="claim-title">Claim Your Rewards</h2>

            <div className="reward-breakdown">
              {/* Accumulated ETH */}
              <div className={`reward-row ${showAccumulated ? 'visible' : ''}`}>
                <span className="reward-label">Boss Chest ETH</span>
                <span className="reward-value">
                  {showAccumulated ? animatedAccumulated.toFixed(6) : '---'}
                  <span className="reward-unit">ETH</span>
                </span>
              </div>

              {/* Pool bonus */}
              <div className={`reward-row pool-row ${showPool ? 'visible' : ''}`}>
                <span className="reward-label">+ Pool Bonus</span>
                <span className="reward-value pool-value">
                  {showPool ? animatedPool.toFixed(6) : '---'}
                  <span className="reward-unit">ETH</span>
                </span>
              </div>

              {/* Divider */}
              <div className={`reward-divider ${showTotal ? 'visible' : ''}`} />

              {/* Total */}
              <div className={`reward-row total-row ${showTotal ? 'visible' : ''}`}>
                <span className="reward-label">Total</span>
                <span className="reward-value total-value">
                  {showTotal ? animatedTotal.toFixed(6) : '---'}
                  <span className="reward-unit">ETH</span>
                </span>
              </div>
            </div>

            <button
              className={`claim-action-btn ${claimState === 'ready' ? 'ready' : ''}`}
              onClick={handleClaim}
              disabled={claimState !== 'ready'}
            >
              {getButtonText(claimState, isPending, isConfirming)}
            </button>

            <button className="claim-cancel-btn" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </>
  );
}

function getButtonText(
  state: ClaimState,
  isPending: boolean,
  isConfirming: boolean
): string {
  if (state === 'animating') return 'Calculating...';
  if (state === 'requesting') return 'Preparing...';
  if (isPending) return 'Confirm in Wallet...';
  if (isConfirming) return 'Confirming...';
  if (state === 'ready') return 'Claim Now';
  return 'Claim Now';
}

function getErrorSuggestion(reason?: string): string {
  if (!reason) return 'Please try again or contact support.';

  if (reason.includes('Wallet not connected')) {
    return 'Connect your wallet using the button in the top right corner.';
  }
  if (reason.includes('floor 15')) {
    return 'Continue your solo run and defeat the boss on Floor 15 to unlock claiming.';
  }
  if (reason.includes('Already claimed')) {
    return 'Each account can only claim once. Start a new character to earn more rewards.';
  }
  if (reason.includes('unavailable')) {
    return 'The claim system is temporarily unavailable. Please try again later.';
  }

  return 'Please check your connection and try again.';
}

// Simple confetti component
function Confetti() {
  const [particles, setParticles] = useState<
    { id: number; x: number; color: string; delay: number }[]
  >([]);

  useEffect(() => {
    const colors = ['#4ade80', '#fbbf24', '#8b5cf6', '#f472b6', '#38bdf8'];
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="confetti-container">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
