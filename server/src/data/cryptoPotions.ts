import { CryptoPotion, CryptoPotionQuality, PotionType, PaymentToken, CryptoVendorService } from '@dungeon-link/shared';
import { v4 as uuidv4 } from 'uuid';

// Quality distribution weights (must sum to 100)
const QUALITY_WEIGHTS: Record<CryptoPotionQuality, number> = {
  [CryptoPotionQuality.Minor]: 40,     // 40% chance
  [CryptoPotionQuality.Standard]: 35,  // 35% chance
  [CryptoPotionQuality.Greater]: 20,   // 20% chance
  [CryptoPotionQuality.Superior]: 5,   // 5% chance
};

// Heal percentages by quality
const HEAL_PERCENTAGES: Record<CryptoPotionQuality, number> = {
  [CryptoPotionQuality.Minor]: 15,
  [CryptoPotionQuality.Standard]: 25,
  [CryptoPotionQuality.Greater]: 40,
  [CryptoPotionQuality.Superior]: 60,
};

// Potion names by type and quality
const POTION_NAMES: Record<PotionType, Record<CryptoPotionQuality, string>> = {
  [PotionType.Health]: {
    [CryptoPotionQuality.Minor]: 'Minor Health Elixir',
    [CryptoPotionQuality.Standard]: 'Health Elixir',
    [CryptoPotionQuality.Greater]: 'Greater Health Elixir',
    [CryptoPotionQuality.Superior]: 'Superior Health Elixir',
  },
  [PotionType.Mana]: {
    [CryptoPotionQuality.Minor]: 'Minor Mana Elixir',
    [CryptoPotionQuality.Standard]: 'Mana Elixir',
    [CryptoPotionQuality.Greater]: 'Greater Mana Elixir',
    [CryptoPotionQuality.Superior]: 'Superior Mana Elixir',
  },
};

// Prices (must match smart contract)
export const CRYPTO_PRICES = {
  [PaymentToken.ETH]: '0.000033', // ~$0.10 at ~$3000/ETH
  [PaymentToken.USDC]: '0.10',
  [PaymentToken.USDT]: '0.10',
};

// Wei amounts for validation
export const CRYPTO_PRICES_WEI = {
  [PaymentToken.ETH]: BigInt('33000000000000'), // 0.000033 ETH in wei
  [PaymentToken.USDC]: BigInt('100000'), // 0.10 USDC (6 decimals)
  [PaymentToken.USDT]: BigInt('100000'), // 0.10 USDT (6 decimals)
};

/**
 * Roll a random quality based on weights
 */
export function rollPotionQuality(): CryptoPotionQuality {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [quality, weight] of Object.entries(QUALITY_WEIGHTS)) {
    cumulative += weight;
    if (roll < cumulative) {
      return quality as CryptoPotionQuality;
    }
  }

  // Fallback (shouldn't happen)
  return CryptoPotionQuality.Minor;
}

/**
 * Create a new crypto potion with random quality
 */
export function createCryptoPotion(type: PotionType): CryptoPotion {
  const quality = rollPotionQuality();

  return {
    id: `crypto_potion_${uuidv4()}`,
    type,
    quality,
    healPercent: HEAL_PERCENTAGES[quality],
    name: POTION_NAMES[type][quality],
  };
}

/**
 * Get vendor services for crypto potions
 */
export function getCryptoVendorServices(): CryptoVendorService[] {
  return [
    {
      type: 'buy_potion',
      potionType: PotionType.Health,
      priceUsd: '$0.10',
      prices: {
        [PaymentToken.ETH]: CRYPTO_PRICES[PaymentToken.ETH],
        [PaymentToken.USDC]: CRYPTO_PRICES[PaymentToken.USDC],
        [PaymentToken.USDT]: CRYPTO_PRICES[PaymentToken.USDT],
      },
    },
    {
      type: 'buy_potion',
      potionType: PotionType.Mana,
      priceUsd: '$0.10',
      prices: {
        [PaymentToken.ETH]: CRYPTO_PRICES[PaymentToken.ETH],
        [PaymentToken.USDC]: CRYPTO_PRICES[PaymentToken.USDC],
        [PaymentToken.USDT]: CRYPTO_PRICES[PaymentToken.USDT],
      },
    },
  ];
}

/**
 * Calculate boss ETH drop based on floor (linear scaling)
 * Formula: floor * 0.00001 ETH
 */
export function calculateBossEthDrop(floor: number): bigint {
  // 0.00001 ETH = 10000000000000 wei (10^13)
  const baseDropWei = BigInt('10000000000000');
  return baseDropWei * BigInt(floor);
}

/**
 * Max purchases per floor
 */
export const MAX_PURCHASES_PER_FLOOR = 5;
