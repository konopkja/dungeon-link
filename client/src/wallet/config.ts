import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

// Contract addresses on Base mainnet
export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDT_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as const;

// Potion prices (must match contract)
export const POTION_PRICE_ETH = BigInt('33000000000000'); // 0.000033 ETH in wei
export const POTION_PRICE_USDC = BigInt('100000'); // $0.10 (6 decimals)
export const POTION_PRICE_USDT = BigInt('100000'); // $0.10 (6 decimals)

// Wagmi config
export const wagmiConfig = getDefaultConfig({
  appName: 'Abyssal Descent',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [base],
  ssr: false,
});

// ABI for AbyssalVault contract (minimal subset for client interactions)
export const VAULT_ABI = [
  // Read functions
  {
    type: 'function',
    name: 'getRewardPool',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasPoolFunds',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasAccountClaimed',
    inputs: [{ name: 'accountId', type: 'string' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'POTION_PRICE_ETH',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'POTION_PRICE_USDC',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'POTION_PRICE_USDT',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write functions
  {
    type: 'function',
    name: 'purchasePotionWithEth',
    inputs: [{ name: 'potionType', type: 'string' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'purchasePotionWithUsdc',
    inputs: [{ name: 'potionType', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'purchasePotionWithUsdt',
    inputs: [{ name: 'potionType', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRewards',
    inputs: [
      { name: 'accountId', type: 'string' },
      { name: 'bossEthAmount', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event',
    name: 'PotionPurchased',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'potionType', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RewardsClaimed',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'accountId', type: 'string', indexed: false },
      { name: 'bossEth', type: 'uint256', indexed: false },
      { name: 'poolShare', type: 'uint256', indexed: false },
      { name: 'totalPaid', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ERC20 ABI for approvals
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
