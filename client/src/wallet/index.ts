// Re-export all wallet functionality
export { WalletProvider } from './WalletProvider';
export { WalletOverlay, WalletConnectButton, RewardPoolDisplay, injectWalletStyles, emitWalletEvent, onWalletEvent } from './WalletUI';
export { CryptoVendorModal, CryptoVendorModalManager, openCryptoVendor, closeCryptoVendor, updatePurchasesRemaining } from './CryptoVendorModal';
export { VendorModal, VendorModalManager, openVendor, closeVendor, updateVendor } from './VendorModal';
export { GameModal, GameButton, injectGameModalStyles } from './GameModal';
export { useWalletStatus, useRewardPool, useHasClaimed, usePurchasePotion, useBatchedPurchase, useClaimRewards, formatEthDisplay } from './useWallet';
export { wagmiConfig, VAULT_ADDRESS, VAULT_ABI, USDC_ADDRESS, USDT_ADDRESS, POTION_PRICE_ETH, POTION_PRICE_USDC, POTION_PRICE_USDT } from './config';

// Initialize wallet UI
import { createRoot } from 'react-dom/client';
import React from 'react';
import { WalletProvider } from './WalletProvider';
import { WalletOverlay, injectWalletStyles } from './WalletUI';
import { CryptoVendorModalManager } from './CryptoVendorModal';
import { VendorModalManager } from './VendorModal';
import { injectGameModalStyles } from './GameModal';
import { initCryptoMessageHandler } from './cryptoMessageHandler';

let walletRoot: ReturnType<typeof createRoot> | null = null;

export function initWalletUI() {
  // Inject styles
  injectWalletStyles();
  injectGameModalStyles();

  // Initialize crypto message handler (listens for server messages)
  initCryptoMessageHandler();

  // Create mount point if it doesn't exist
  let mountPoint = document.getElementById('wallet-root');
  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.id = 'wallet-root';
    document.body.appendChild(mountPoint);
  }

  // Mount React components
  if (!walletRoot) {
    walletRoot = createRoot(mountPoint);
    walletRoot.render(
      React.createElement(WalletProvider, null,
        React.createElement(React.Fragment, null,
          React.createElement(WalletOverlay),
          React.createElement(CryptoVendorModalManager),
          React.createElement(VendorModalManager)
        )
      )
    );
  }

  console.log('[Wallet] UI initialized');
}

export function destroyWalletUI() {
  if (walletRoot) {
    walletRoot.unmount();
    walletRoot = null;
  }
  const mountPoint = document.getElementById('wallet-root');
  if (mountPoint) {
    mountPoint.remove();
  }
}
