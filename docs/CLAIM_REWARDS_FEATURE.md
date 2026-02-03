# Claim Rewards Feature

This document describes the UI implementation for claiming smart contract pool rewards after defeating the Floor 15 boss solo.

## Overview

Players who defeat the Floor 15 boss in a solo run can claim:
1. **Boss Chest ETH** - Accumulated from boss chests throughout the run (floor × 0.00001 ETH per boss)
2. **Pool Bonus** - 100% of the current reward pool in the AbyssalVault contract

The claim is a one-time action per account, verified on-chain via server-signed attestation.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME PROGRESSION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Player starts solo run                                      │
│           ↓                                                     │
│  2. Defeats bosses on floors 1-14                               │
│     • ETH accumulates from boss chests                          │
│     • Green ETH counter appears in HUD                          │
│           ↓                                                     │
│  3. Defeats Floor 15 boss (solo)                                │
│     • canClaim = true                                           │
│     • Claim button becomes active (pulsing green)               │
│           ↓                                                     │
│  4. Player clicks "Claim Rewards"                               │
│     • Modal opens with count-up animation                       │
│           ↓                                                     │
│  5. Player clicks "Claim Now" (one-click)                       │
│     • Request attestation from server                           │
│     • Server signs proof of Floor 15 solo clear                 │
│     • Contract call: claimRewards(accountId, ethAmount, sig)    │
│           ↓                                                     │
│  6. Transaction confirms                                        │
│     • Confetti celebration                                      │
│     • BaseScan transaction link                                 │
│     • ETH transferred to player's wallet                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. ClaimButton (`client/src/wallet/ClaimButton.tsx`)

HUD button displayed next to the accumulated ETH counter.

**States:**

| State | Condition | Appearance |
|-------|-----------|------------|
| Hidden | No accumulated ETH | Not rendered |
| Connect | Wallet not connected | Purple, lock icon, "Connect to Claim" |
| Disabled | Connected but floor < 15 | Gray, hourglass icon, "Floor 15 to Claim" |
| Ready | Connected + floor 15 cleared | Green pulsing, money bag icon, "Claim Rewards" |

**Props:**
```typescript
interface ClaimButtonProps {
  onClaimClick: () => void;    // Opens claim modal
  onConnectClick: () => void;  // Triggers wallet connect
}
```

**Events Listened:**
- `eth-drop-received` - Updates accumulated ETH and checks canClaim
- `claim-eligibility-changed` - Updates canClaim state
- `reset-accumulated-eth` - Resets state after claim
- `crypto-state-updated` - Syncs with server state

---

### 2. ClaimRewardsModal (`client/src/wallet/ClaimRewardsModal.tsx`)

Main modal for the claim flow with animated reward reveal.

**States:**

| State | Description |
|-------|-------------|
| `idle` | Initial state, modal closed |
| `animating` | Count-up animation playing |
| `ready` | Animation complete, claim button enabled |
| `requesting` | Requesting attestation from server |
| `claiming` | Transaction pending in wallet |
| `success` | Claim successful, showing confetti |
| `error` | Error occurred, triggers error modal |

**Animation Sequence:**
```
0ms      → Modal opens
300ms    → Boss Chest ETH counts up (1500ms duration)
1800ms   → Pool Bonus counts up (1500ms duration)
3300ms   → Total revealed, claim button enabled
```

**Props:**
```typescript
interface ClaimRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accumulatedEthWei: string;        // From boss chests
  onError: (error: ClaimError) => void;
}
```

**Success State Features:**
- Confetti animation (50 particles)
- Total ETH claimed display
- BaseScan transaction link
- Auto-resets accumulated ETH counter

---

### 3. ClaimErrorModal (`client/src/wallet/ClaimErrorModal.tsx`)

Detailed error modal with actionable suggestions.

**Error Types & Suggestions:**

| Error | Suggestion |
|-------|------------|
| "Wallet not connected" | Connect your wallet using the button in the top right corner. |
| "Must defeat floor 15" | Continue your solo run and defeat the boss on Floor 15. |
| "Already claimed" | Each account can only claim once. Start a new character. |
| "System unavailable" | The claim system is temporarily unavailable. Try again later. |
| Transaction failed | Check your wallet has enough ETH for gas fees. |

**Props:**
```typescript
interface ClaimErrorModalProps {
  isOpen: boolean;
  error: ClaimError | null;
  onClose: () => void;
  onRetry?: () => void;  // Only shown for retryable errors
}

interface ClaimError {
  title: string;      // e.g., "Claim Not Available"
  message: string;    // Detailed error description
  suggestion: string; // How to fix the issue
}
```

---

### 4. cryptoMessageHandler (`client/src/wallet/cryptoMessageHandler.ts`)

Bridges server WebSocket messages to React wallet events.

**Message → Event Mapping:**

| Server Message | Wallet Event | Data |
|----------------|--------------|------|
| `CHEST_ETH_DROP` | `eth-drop-received` | floorNumber, ethAmountWei, totalAccumulatedWei, canClaim |
| `CLAIM_ATTESTATION` | `claim-attestation-received` | signature, accountId, ethAmountWei, walletAddress |
| `CLAIM_NOT_ELIGIBLE` | `claim-not-eligible` | reason |
| `POOL_STATUS` | `pool-status-updated` | rewardPoolWei, hasPoolFunds |
| `CRYPTO_STATE_UPDATE` | `crypto-state-updated` | Full CryptoState object |
| `WALLET_CONNECTED` | `wallet-connected-server` | walletAddress, cryptoAccountId |
| `WALLET_DISCONNECTED` | `wallet-disconnected-server` | - |

---

## Network Messages

### Client → Server

```typescript
// Request claim attestation (after clicking Claim Now)
{ type: 'REQUEST_CLAIM_ATTESTATION' }
```

### Server → Client

```typescript
// Success: Server provides signed attestation
{
  type: 'CLAIM_ATTESTATION',
  signature: '0x...',           // Server signature for contract verification
  accountId: 'acc_abc123',      // Unique account identifier
  ethAmountWei: '1200000000000000', // Total boss ETH in wei
  walletAddress: '0x...'        // Player's wallet address
}

// Failure: Not eligible to claim
{
  type: 'CLAIM_NOT_ELIGIBLE',
  reason: 'Must defeat floor 15 boss solo to claim'
}
```

---

## Smart Contract Integration

### Contract Call

```typescript
// Called automatically after receiving attestation
claimRewards(
  accountId: string,      // From attestation
  bossEthAmount: bigint,  // From attestation (wei)
  signature: bytes        // Server signature
)
```

### Contract Behavior

1. Verifies signature matches server signer
2. Confirms account hasn't claimed before
3. Transfers: `bossEthAmount + currentPoolBalance` to player
4. Marks account as claimed
5. Resets pool to 0

---

## Wallet Events

Events emitted via `emitWalletEvent()` and listened via `onWalletEvent()`:

| Event | Emitted By | Purpose |
|-------|------------|---------|
| `eth-drop-received` | cryptoMessageHandler | Boss chest ETH accumulated |
| `claim-eligibility-changed` | cryptoMessageHandler | Can/cannot claim status |
| `claim-attestation-received` | cryptoMessageHandler | Server provided attestation |
| `claim-not-eligible` | cryptoMessageHandler | Claim request rejected |
| `claim-success` | ClaimRewardsModal | Transaction confirmed |
| `reset-accumulated-eth` | ClaimRewardsModal | Reset after claim |
| `crypto-state-updated` | cryptoMessageHandler | Full state sync |
| `pool-status-updated` | cryptoMessageHandler | Pool balance changed |

---

## CSS Classes

### Claim Button

| Class | Description |
|-------|-------------|
| `.claim-button` | Base button styles |
| `.claim-button-ready` | Green pulsing state (eligible) |
| `.claim-button-connect` | Purple state (need wallet) |
| `.claim-button-disabled` | Gray state (not eligible) |
| `@keyframes claimPulse` | Pulsing glow animation |

### Claim Modal

| Class | Description |
|-------|-------------|
| `.claim-modal-backdrop` | Dark overlay with blur |
| `.claim-modal` | Modal container |
| `.claim-title` | "Claim Your Rewards" header |
| `.reward-breakdown` | Container for reward rows |
| `.reward-row` | Individual reward line |
| `.reward-row.visible` | Fade-in animation applied |
| `.pool-row` | Purple styling for pool bonus |
| `.total-row` | Large green styling for total |
| `.claim-action-btn` | Main claim button |
| `.claim-action-btn.ready` | Enabled state |

### Success State

| Class | Description |
|-------|-------------|
| `.claim-success` | Success view container |
| `.success-icon` | Bouncing party emoji |
| `.success-title` | "Rewards Claimed!" text |
| `.success-amount` | Large ETH display |
| `.tx-link` | BaseScan link button |
| `.confetti-container` | Confetti overlay |
| `.confetti-particle` | Individual confetti piece |
| `@keyframes confettiFall` | Falling + rotating animation |

### Error Modal

| Class | Description |
|-------|-------------|
| `.error-modal-backdrop` | Dark overlay |
| `.error-modal` | Red-tinted modal container |
| `.error-icon` | Warning triangle |
| `.error-title` | Error title (red) |
| `.error-suggestion-box` | Green suggestion container |
| `.error-retry-btn` | Green retry button |
| `.error-close-btn` | Gray close/cancel button |

---

## File Structure

```
client/src/wallet/
├── ClaimButton.tsx           # HUD claim button component
├── ClaimRewardsModal.tsx     # Main claim modal with animations
├── ClaimErrorModal.tsx       # Error modal with suggestions
├── cryptoMessageHandler.ts   # Server message → wallet event bridge
├── WalletUI.tsx              # Updated with claim integration + CSS
├── useWallet.ts              # Hooks (useClaimRewards, useRewardPool)
├── config.ts                 # Contract ABI including claimRewards
└── index.ts                  # Exports + initialization
```

---

## Testing Checklist

### Happy Path
- [ ] Accumulated ETH counter appears after boss kill
- [ ] Claim button shows correct state based on wallet/eligibility
- [ ] Modal opens with staggered count-up animation
- [ ] Claim executes successfully
- [ ] Confetti displays on success
- [ ] Transaction link works
- [ ] ETH counter resets after claim

### Edge Cases
- [ ] Wallet disconnected mid-claim → Shows connect prompt
- [ ] Transaction rejected in wallet → Error modal with retry
- [ ] Already claimed account → Error with explanation
- [ ] No pool funds → Still shows boss ETH (pool shows 0)
- [ ] Network error → Error modal with retry option
- [ ] Page refresh during run → State restored from server

### States
- [ ] No ETH accumulated → No button shown
- [ ] ETH accumulated, no wallet → "Connect to Claim"
- [ ] ETH accumulated, wallet, floor < 15 → "Floor 15 to Claim" (disabled)
- [ ] ETH accumulated, wallet, floor 15 solo → "Claim Rewards" (active)

---

## Configuration

### Environment Variables

**Client (`client/.env`):**
```
VITE_VAULT_ADDRESS=0x...        # AbyssalVault contract address
VITE_WALLETCONNECT_PROJECT_ID=  # WalletConnect project ID
```

**Server (`server/.env`):**
```
VAULT_ADDRESS=0x...             # Same contract address
SERVER_SIGNER_PRIVATE_KEY=0x... # Private key for signing attestations
```

### Constants

```typescript
// Base explorer for transaction links
const BASE_EXPLORER_URL = 'https://basescan.org/tx/';

// Animation timings (ms)
const ACCUMULATED_REVEAL_DELAY = 300;
const POOL_REVEAL_DELAY = 1800;
const TOTAL_REVEAL_DELAY = 3300;
const COUNT_UP_DURATION = 1500;
```

---

## Security Considerations

1. **Server-side verification**: Claim eligibility is verified server-side before attestation
2. **Signed attestations**: Contract verifies server signature before payout
3. **One-time claim**: Both server and contract track claimed accounts
4. **No client trust**: Client cannot forge eligibility or claim amounts
