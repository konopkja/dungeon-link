import { WebSocket } from 'ws';
import {
  CryptoState,
  PotionType,
  PaymentToken,
  ServerMessage,
} from '@dungeon-link/shared';
import {
  createCryptoPotion,
  getCryptoVendorServices,
  calculateBossEthDrop,
  MAX_PURCHASES_PER_FLOOR,
} from '../data/cryptoPotions';
import {
  generateAccountId,
  generateClaimAttestation,
  hasAccountClaimed,
  markAccountClaimed,
  isSignerAvailable,
} from './attestation';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

// Contract address
const VAULT_ADDRESS = (process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

// Public client for reading contract state
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// In-memory tracking of crypto state per run
const runCryptoStates = new Map<string, CryptoState>();

// Wallet to account ID mapping
const walletToAccountId = new Map<string, string>();

/**
 * Initialize crypto state for a new run
 */
export function initializeCryptoState(runId: string): CryptoState {
  const state: CryptoState = {
    isWalletConnected: false,
    purchasesThisFloor: 0,
    maxPurchasesPerFloor: MAX_PURCHASES_PER_FLOOR,
    accumulatedEthWei: '0',
    hasPoolFunds: false,
    rewardPoolWei: '0',
    canClaim: false,
    hasClaimed: false,
  };

  runCryptoStates.set(runId, state);
  return state;
}

/**
 * Get crypto state for a run
 */
export function getCryptoState(runId: string): CryptoState | undefined {
  return runCryptoStates.get(runId);
}

/**
 * Update crypto state for a run
 */
export function updateCryptoState(runId: string, updates: Partial<CryptoState>): CryptoState | undefined {
  const state = runCryptoStates.get(runId);
  if (!state) return undefined;

  const updated = { ...state, ...updates };
  runCryptoStates.set(runId, updated);
  return updated;
}

/**
 * Clean up crypto state when run ends
 */
export function cleanupCryptoState(runId: string): void {
  runCryptoStates.delete(runId);
}

/**
 * Reset floor purchases (called when advancing to new floor)
 */
export function resetFloorPurchases(runId: string): void {
  const state = runCryptoStates.get(runId);
  if (state) {
    state.purchasesThisFloor = 0;
    runCryptoStates.set(runId, state);
  }
}

/**
 * Handle wallet connection
 */
export function handleWalletConnect(
  runId: string,
  walletAddress: string,
  ws: WebSocket
): void {
  const accountId = generateAccountId(walletAddress);
  walletToAccountId.set(walletAddress.toLowerCase(), accountId);

  const hasClaimed = hasAccountClaimed(accountId);

  updateCryptoState(runId, {
    walletAddress,
    isWalletConnected: true,
    hasClaimed,
  });

  // Fetch pool status
  fetchPoolStatus(runId, ws);

  const response: ServerMessage = {
    type: 'WALLET_CONNECTED',
    walletAddress,
    cryptoAccountId: accountId,
  };

  ws.send(JSON.stringify(response));
}

/**
 * Handle wallet disconnection
 */
export function handleWalletDisconnect(runId: string, ws: WebSocket): void {
  updateCryptoState(runId, {
    walletAddress: undefined,
    isWalletConnected: false,
  });

  const response: ServerMessage = {
    type: 'WALLET_DISCONNECTED',
  };

  ws.send(JSON.stringify(response));
}

/**
 * Handle get crypto vendor services request
 */
export function handleGetCryptoVendorServices(runId: string, ws: WebSocket): void {
  const state = getCryptoState(runId);
  const purchasesRemaining = state
    ? MAX_PURCHASES_PER_FLOOR - state.purchasesThisFloor
    : MAX_PURCHASES_PER_FLOOR;

  const response: ServerMessage = {
    type: 'CRYPTO_VENDOR_SERVICES',
    services: getCryptoVendorServices(),
    purchasesRemaining,
  };

  ws.send(JSON.stringify(response));
}

/**
 * Handle crypto purchase verification
 * In production, this would verify the transaction on-chain
 */
export async function handleVerifyCryptoPurchase(
  runId: string,
  txHash: string,
  potionType: PotionType,
  paymentToken: PaymentToken,
  ws: WebSocket
): Promise<void> {
  const state = getCryptoState(runId);

  if (!state) {
    ws.send(JSON.stringify({
      type: 'CRYPTO_PURCHASE_FAILED',
      reason: 'Run not found',
    } as ServerMessage));
    return;
  }

  if (state.purchasesThisFloor >= MAX_PURCHASES_PER_FLOOR) {
    ws.send(JSON.stringify({
      type: 'CRYPTO_PURCHASE_FAILED',
      reason: 'Maximum purchases reached this floor',
    } as ServerMessage));
    return;
  }

  // In production, verify the transaction on-chain
  // For now, we trust the client and create the potion
  // TODO: Implement actual on-chain verification

  try {
    // Verify transaction exists and is confirmed
    // const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    // if (!receipt || receipt.status !== 'success') {
    //   throw new Error('Transaction not confirmed');
    // }

    // Create the potion with random quality
    const potion = createCryptoPotion(potionType);

    // Update purchase count
    updateCryptoState(runId, {
      purchasesThisFloor: state.purchasesThisFloor + 1,
    });

    const purchasesRemaining = MAX_PURCHASES_PER_FLOOR - state.purchasesThisFloor - 1;

    const response: ServerMessage = {
      type: 'CRYPTO_PURCHASE_VERIFIED',
      potion,
      purchasesRemaining,
    };

    ws.send(JSON.stringify(response));

    console.log(`[Crypto] Purchase verified: ${potion.name} (${potion.quality}) for run ${runId}`);
  } catch (error) {
    console.error('[Crypto] Purchase verification failed:', error);
    ws.send(JSON.stringify({
      type: 'CRYPTO_PURCHASE_FAILED',
      reason: 'Transaction verification failed',
    } as ServerMessage));
  }
}

/**
 * Handle boss chest opened - add ETH drop
 */
export function handleBossChestOpened(
  runId: string,
  floor: number,
  isSolo: boolean,
  ws: WebSocket
): void {
  const state = getCryptoState(runId);
  if (!state) return;

  // In development, allow ETH drops even without pool funds for testing
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !state.hasPoolFunds) return;

  const ethDropWei = calculateBossEthDrop(floor);
  const currentAccumulated = BigInt(state.accumulatedEthWei);
  const newTotal = currentAccumulated + ethDropWei;

  updateCryptoState(runId, {
    accumulatedEthWei: newTotal.toString(),
    // Can claim if floor 15 boss chest opened solo and not already claimed
    canClaim: floor === 15 && isSolo && !state.hasClaimed,
  });

  const response: ServerMessage = {
    type: 'CHEST_ETH_DROP',
    floorNumber: floor,
    ethAmountWei: ethDropWei.toString(),
    totalAccumulatedWei: newTotal.toString(),
  };

  ws.send(JSON.stringify(response));

  console.log(`[Crypto] Boss chest ETH drop: ${ethDropWei.toString()} wei (floor ${floor}), total: ${newTotal.toString()}`);
}

/**
 * Handle claim attestation request
 */
export async function handleRequestClaimAttestation(
  runId: string,
  ws: WebSocket
): Promise<void> {
  const state = getCryptoState(runId);

  if (!state) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Run not found',
    } as ServerMessage));
    return;
  }

  if (!state.isWalletConnected || !state.walletAddress) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Wallet not connected',
    } as ServerMessage));
    return;
  }

  if (!state.canClaim) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Must defeat floor 15 boss solo to claim',
    } as ServerMessage));
    return;
  }

  if (state.hasClaimed) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Already claimed on this account',
    } as ServerMessage));
    return;
  }

  if (!isSignerAvailable()) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Claim system unavailable',
    } as ServerMessage));
    return;
  }

  const accountId = walletToAccountId.get(state.walletAddress.toLowerCase());
  if (!accountId) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Account not found',
    } as ServerMessage));
    return;
  }

  // Generate attestation signature
  const signature = await generateClaimAttestation(
    accountId,
    BigInt(state.accumulatedEthWei),
    state.walletAddress
  );

  if (!signature) {
    ws.send(JSON.stringify({
      type: 'CLAIM_NOT_ELIGIBLE',
      reason: 'Failed to generate attestation',
    } as ServerMessage));
    return;
  }

  // Mark as claimed (server-side tracking)
  markAccountClaimed(accountId);
  updateCryptoState(runId, {
    hasClaimed: true,
    canClaim: false,
  });

  const response: ServerMessage = {
    type: 'CLAIM_ATTESTATION',
    signature,
    accountId,
    ethAmountWei: state.accumulatedEthWei,
    walletAddress: state.walletAddress,
  };

  ws.send(JSON.stringify(response));

  console.log(`[Crypto] Claim attestation generated for account ${accountId}`);
}

/**
 * Fetch pool status from contract
 */
export async function fetchPoolStatus(runId: string, ws: WebSocket): Promise<void> {
  try {
    // Read pool balance from contract
    const poolBalance = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: [parseAbiItem('function getRewardPool() view returns (uint256)')],
      functionName: 'getRewardPool',
    });

    const hasPoolFunds = poolBalance > 0n;

    updateCryptoState(runId, {
      rewardPoolWei: poolBalance.toString(),
      hasPoolFunds,
    });

    const response: ServerMessage = {
      type: 'POOL_STATUS',
      rewardPoolWei: poolBalance.toString(),
      hasPoolFunds,
    };

    ws.send(JSON.stringify(response));
  } catch (error) {
    console.error('[Crypto] Failed to fetch pool status:', error);
    // Send default response
    ws.send(JSON.stringify({
      type: 'POOL_STATUS',
      rewardPoolWei: '0',
      hasPoolFunds: false,
    } as ServerMessage));
  }
}

/**
 * Handle get pool status request
 */
export function handleGetPoolStatus(runId: string, ws: WebSocket): void {
  fetchPoolStatus(runId, ws);
}
