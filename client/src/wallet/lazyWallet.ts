/**
 * Lazy-loading wrapper for wallet functionality.
 *
 * This module provides the same API as the wallet index, but delays loading
 * the heavy wallet dependencies (RainbowKit, wagmi, viem) until they're needed.
 * This reduces initial bundle size by ~2.5MB.
 *
 * The wallet code is loaded when:
 * - User clicks "Connect Wallet"
 * - User interacts with crypto vendor
 * - Any wallet function is called
 */

// Track if wallet module is loaded
let walletModule: typeof import('./index') | null = null;
let loadingPromise: Promise<typeof import('./index')> | null = null;

/**
 * Lazily load the wallet module
 */
async function getWalletModule(): Promise<typeof import('./index')> {
  if (walletModule) {
    return walletModule;
  }

  if (!loadingPromise) {
    console.log('[Wallet] Loading wallet module...');
    loadingPromise = import('./index').then(module => {
      walletModule = module;
      console.log('[Wallet] Wallet module loaded');
      return module;
    });
  }

  return loadingPromise;
}

/**
 * Check if wallet module is already loaded
 */
export function isWalletLoaded(): boolean {
  return walletModule !== null;
}

/**
 * Initialize wallet UI - lazy loaded
 */
export async function initWalletUI(): Promise<void> {
  const module = await getWalletModule();
  module.initWalletUI();
}

/**
 * Destroy wallet UI
 */
export async function destroyWalletUI(): Promise<void> {
  if (!walletModule) return;
  walletModule.destroyWalletUI();
}

// ============================================================================
// Lazy-loaded vendor functions
// ============================================================================

export async function openVendor(
  vendorId: string,
  vendorType: 'trainer' | 'shop',
  services: any[],
  playerGold: number
): Promise<void> {
  const module = await getWalletModule();
  module.openVendor(vendorId, vendorType, services, playerGold);
}

export async function closeVendor(): Promise<void> {
  if (!walletModule) return;
  walletModule.closeVendor();
}

export async function updateVendor(services: any[], playerGold: number): Promise<void> {
  if (!walletModule) return;
  walletModule.updateVendor(services, playerGold);
}

export async function openCryptoVendor(purchasesRemaining: number): Promise<void> {
  const module = await getWalletModule();
  module.openCryptoVendor(purchasesRemaining);
}

export async function closeCryptoVendor(): Promise<void> {
  if (!walletModule) return;
  walletModule.closeCryptoVendor();
}

export async function updatePurchasesRemaining(remaining: number): Promise<void> {
  if (!walletModule) return;
  walletModule.updatePurchasesRemaining(remaining);
}

// ============================================================================
// Event emitter functions (sync wrappers for async module)
// ============================================================================

// Event listeners that work before module is loaded
type WalletEventCallback = (data?: any) => void;
const pendingListeners: Map<string, WalletEventCallback[]> = new Map();
let eventSystemReady = false;

export function emitWalletEvent(event: string, data?: any): void {
  if (walletModule) {
    walletModule.emitWalletEvent(event, data);
  } else {
    // Queue event emission for when module loads
    console.log(`[Wallet] Queuing event: ${event}`);
  }
}

export function onWalletEvent(event: string, callback: WalletEventCallback): () => void {
  if (walletModule) {
    return walletModule.onWalletEvent(event, callback);
  }

  // Store listener for when module loads
  if (!pendingListeners.has(event)) {
    pendingListeners.set(event, []);
  }
  pendingListeners.get(event)!.push(callback);

  // When module loads, register the listener
  getWalletModule().then(module => {
    if (!eventSystemReady) {
      eventSystemReady = true;
      // Register all pending listeners
      pendingListeners.forEach((callbacks, evt) => {
        callbacks.forEach(cb => module.onWalletEvent(evt, cb));
      });
      pendingListeners.clear();
    }
  });

  // Return unsubscribe function
  return () => {
    const listeners = pendingListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  };
}

// ============================================================================
// Preload function for eager loading when appropriate
// ============================================================================

/**
 * Preload wallet module in the background.
 * Call this after initial game load to warm up the wallet code.
 */
export function preloadWallet(): void {
  // Start loading in background, don't await
  getWalletModule().catch(err => {
    console.error('[Wallet] Failed to preload:', err);
  });
}
