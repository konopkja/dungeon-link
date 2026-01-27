import { createWalletClient, http, type WalletClient, type PrivateKeyAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract address (set via environment variable)
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000';
const CHAIN_ID = 8453; // Base mainnet

// Server signer setup
let serverSigner: PrivateKeyAccount | null = null;
let walletClient: WalletClient | null = null;

/**
 * Initialize the server signer from environment variable
 */
export function initializeSigner(): boolean {
  const privateKey = process.env.SERVER_SIGNER_PRIVATE_KEY;

  if (!privateKey) {
    console.warn('[Crypto] SERVER_SIGNER_PRIVATE_KEY not set - claim attestation disabled');
    return false;
  }

  try {
    // Ensure the key has 0x prefix
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    serverSigner = privateKeyToAccount(formattedKey as `0x${string}`);

    walletClient = createWalletClient({
      account: serverSigner,
      chain: base,
      transport: http(),
    });

    console.log(`[Crypto] Server signer initialized: ${serverSigner.address}`);
    return true;
  } catch (error) {
    console.error('[Crypto] Failed to initialize server signer:', error);
    return false;
  }
}

/**
 * Check if the signer is available
 */
export function isSignerAvailable(): boolean {
  return serverSigner !== null;
}

/**
 * Get the signer address (for verification)
 */
export function getSignerAddress(): string | null {
  return serverSigner?.address || null;
}

/**
 * Generate a claim attestation signature
 * This proves the server verified the player beat floor 15 boss solo
 *
 * The message format must match the contract's verification:
 * keccak256(abi.encodePacked(accountId, bossEthAmount, walletAddress, chainId, contractAddress))
 */
export async function generateClaimAttestation(
  accountId: string,
  bossEthAmountWei: bigint,
  walletAddress: string
): Promise<string | null> {
  if (!serverSigner) {
    console.error('[Crypto] Cannot sign attestation - signer not initialized');
    return null;
  }

  try {
    // Create the message hash matching the contract's format
    // Using ethers-style encoding for compatibility
    const { keccak256, encodePacked, toBytes } = await import('viem');

    const messageHash = keccak256(
      encodePacked(
        ['string', 'uint256', 'address', 'uint256', 'address'],
        [
          accountId,
          bossEthAmountWei,
          walletAddress as `0x${string}`,
          BigInt(CHAIN_ID),
          VAULT_ADDRESS as `0x${string}`,
        ]
      )
    );

    // Sign the message (this adds the Ethereum signed message prefix)
    const signature = await serverSigner.signMessage({
      message: { raw: toBytes(messageHash) },
    });

    console.log(`[Crypto] Generated claim attestation for account ${accountId}`);
    return signature;
  } catch (error) {
    console.error('[Crypto] Failed to generate attestation:', error);
    return null;
  }
}

/**
 * Generate a unique account ID from wallet address
 * This is used to track claims per account
 */
export function generateAccountId(walletAddress: string): string {
  // Simple deterministic ID based on wallet address
  // In production, you might want to include additional factors
  return `account_${walletAddress.toLowerCase()}`;
}

/**
 * Track claimed accounts (in-memory for now, should use database in production)
 */
const claimedAccounts = new Set<string>();

export function hasAccountClaimed(accountId: string): boolean {
  return claimedAccounts.has(accountId);
}

export function markAccountClaimed(accountId: string): void {
  claimedAccounts.add(accountId);
}

/**
 * Contract interaction helpers
 */
export { VAULT_ADDRESS, CHAIN_ID };
