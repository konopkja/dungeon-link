import { ServerMessage } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';
import { emitWalletEvent } from './WalletUI';

let isInitialized = false;

/**
 * Initialize the crypto message handler.
 * This listens for crypto-related server messages and emits wallet events.
 */
export function initCryptoMessageHandler(): void {
  if (isInitialized) return;
  isInitialized = true;

  wsClient.onMessage((message: ServerMessage) => {
    switch (message.type) {
      case 'CHEST_ETH_DROP':
        // Emit event with ETH drop info
        emitWalletEvent('eth-drop-received', {
          floorNumber: message.floorNumber,
          ethAmountWei: message.ethAmountWei,
          totalAccumulatedWei: message.totalAccumulatedWei,
          // Check if this is floor 15 (eligibility for claim)
          canClaim: message.floorNumber === 15,
        });
        break;

      case 'CLAIM_ATTESTATION':
        // Server has provided attestation for claiming
        emitWalletEvent('claim-attestation-received', {
          signature: message.signature,
          accountId: message.accountId,
          ethAmountWei: message.ethAmountWei,
          walletAddress: message.walletAddress,
        });
        break;

      case 'CLAIM_NOT_ELIGIBLE':
        // Claim request was rejected
        emitWalletEvent('claim-not-eligible', {
          reason: message.reason,
        });
        break;

      case 'POOL_STATUS':
        // Pool status update
        emitWalletEvent('pool-status-updated', {
          rewardPoolWei: message.rewardPoolWei,
          hasPoolFunds: message.hasPoolFunds,
        });
        break;

      case 'CRYPTO_STATE_UPDATE':
        // Full crypto state update
        if (message.cryptoState) {
          emitWalletEvent('crypto-state-updated', message.cryptoState);

          // Also emit claim eligibility change if relevant
          emitWalletEvent('claim-eligibility-changed', {
            canClaim: message.cryptoState.canClaim,
            hasClaimed: message.cryptoState.hasClaimed,
          });
        }
        break;

      case 'WALLET_CONNECTED':
        emitWalletEvent('wallet-connected-server', {
          walletAddress: message.walletAddress,
          cryptoAccountId: message.cryptoAccountId,
        });
        break;

      case 'WALLET_DISCONNECTED':
        emitWalletEvent('wallet-disconnected-server', {});
        break;
    }
  });

  console.log('[Crypto] Message handler initialized');
}
