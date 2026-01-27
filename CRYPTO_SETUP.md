# Crypto Rewards System Setup Guide

This guide explains how to deploy and configure the crypto rewards system for Abyssal Descent.

## Overview

The system allows players to:
1. **Purchase potions** with ETH, USDC, or USDT (~$0.10 each, max 5 per floor)
2. **Accumulate imaginary ETH** from boss kills (floor × 0.00001 ETH per boss)
3. **Claim rewards** after defeating floor 15 boss solo (accumulated ETH + 25% of reward pool)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Client (React) │────▶│  Server (Node)  │────▶│  Smart Contract │
│  - RainbowKit   │     │  - Attestation  │     │  - AbyssalVault │
│  - wagmi/viem   │     │  - Verification │     │  - Base Mainnet │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Step 1: Deploy Smart Contract

### 1.1 Set up environment

```bash
cd contracts
npm install

# Create .env file
cp .env.example .env
```

### 1.2 Generate server signer wallet

```bash
npx hardhat run scripts/generateSigner.ts
```

Save the output:
- Add `SERVER_SIGNER_ADDRESS` to `contracts/.env`
- Add `SERVER_SIGNER_PRIVATE_KEY` to `server/.env`

### 1.3 Fund deployer wallet

Send ETH to the deployer wallet address on Base mainnet for gas fees.

### 1.4 Deploy contract

```bash
# Deploy to Base Sepolia (testnet) first
npm run deploy:base-sepolia

# Then deploy to Base mainnet
npm run deploy:base
```

Save the proxy contract address from the output.

### 1.5 Fund the reward pool

Send ETH to the contract address. This becomes the initial reward pool.

## Step 2: Configure Server

### 2.1 Add environment variables to server

```bash
# server/.env
SERVER_SIGNER_PRIVATE_KEY=0x...  # From step 1.2
VAULT_ADDRESS=0x...              # From step 1.4
```

### 2.2 The server will automatically:
- Initialize the signer on startup
- Handle wallet connections
- Verify purchases (TODO: full on-chain verification)
- Generate claim attestations for eligible players

## Step 3: Configure Client

### 3.1 Add environment variables

```bash
# client/.env
VITE_VAULT_ADDRESS=0x...              # From step 1.4
VITE_WALLETCONNECT_PROJECT_ID=...     # Get from cloud.walletconnect.com
```

### 3.2 Install dependencies

```bash
cd client
npm install
```

## Step 4: Production Checklist

### Smart Contract
- [ ] Deploy to Base mainnet
- [ ] Verify contract on Basescan
- [ ] Fund reward pool with initial ETH
- [ ] Test potion purchases
- [ ] Test claim flow

### Server
- [ ] Set environment variables in Railway/hosting
- [ ] Never commit private keys
- [ ] Implement full on-chain purchase verification
- [ ] Add database for claim tracking (currently in-memory)

### Client
- [ ] Set WalletConnect project ID
- [ ] Test wallet connection on Base network
- [ ] Verify potion purchase flow
- [ ] Test claim UI after floor 15 boss

## Token Addresses (Base Mainnet)

| Token | Address |
|-------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDT | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |

## Pricing

| Item | ETH | USDC | USDT |
|------|-----|------|------|
| Health Potion | 0.000033 ETH | $0.10 | $0.10 |
| Mana Potion | 0.000033 ETH | $0.10 | $0.10 |

## Boss ETH Drops

| Floor | ETH Drop |
|-------|----------|
| 1 | 0.00001 ETH |
| 5 | 0.00005 ETH |
| 10 | 0.0001 ETH |
| 15 | 0.00015 ETH |

**Total for full run (floors 1-15):** ~0.0012 ETH

## Claiming Rules

1. Must defeat floor 15 boss **solo** (no multiplayer)
2. One claim per account (tracked by server + on-chain)
3. Pool resets to 0 after each claim
4. If pool is empty, bosses stop dropping ETH

## Revenue Split

- 75% → Owner (withdrawable)
- 25% → Reward pool (claimable by winners)

## Troubleshooting

### Wallet won't connect
- Ensure WalletConnect project ID is set
- Check that Base network is supported

### Transaction failing
- Verify token approval for USDC/USDT
- Check sufficient balance
- Ensure contract isn't paused

### Claim not working
- Verify account hasn't claimed before
- Ensure floor 15 boss was defeated solo
- Check that pool has funds

## Files Overview

```
contracts/
├── src/
│   └── AbyssalVault.sol      # Main contract
├── scripts/
│   ├── deploy.ts             # Deployment script
│   └── generateSigner.ts     # Wallet generator
└── hardhat.config.ts         # Network config

server/src/
├── crypto/
│   ├── attestation.ts        # Signature generation
│   └── cryptoHandler.ts      # Message handlers
└── data/
    └── cryptoPotions.ts      # Potion definitions

client/src/
├── wallet/
│   ├── config.ts             # Contract config
│   ├── WalletProvider.tsx    # RainbowKit setup
│   ├── WalletUI.tsx          # Connect button + pool display
│   ├── CryptoVendorModal.tsx # Purchase UI
│   ├── useWallet.ts          # React hooks
│   └── index.ts              # Exports + init
```

## Security Notes

1. **Private keys**: Never commit to git, use environment variables
2. **Server signer**: Use a dedicated wallet with minimal funds
3. **Attestation**: Server signature proves boss was defeated legitimately
4. **On-chain tracking**: Contract prevents double claims
5. **Pause function**: Owner can pause contract in emergency
