/**
 * Seeded Random Number Generator using Mulberry32 algorithm
 * Provides deterministic random numbers for procedural generation
 */
export class SeededRNG {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'string' ? this.hashString(seed) : seed;
  }

  /**
   * Hash a string to a number for seeding
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get next random number between 0 and 1 (exclusive)
   * Uses Mulberry32 algorithm
   */
  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Get random integer between min and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Get random float between min and max
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffle array in place using Fisher-Yates
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Roll a chance (returns true if roll < probability)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Get current state (for saving/loading)
   */
  getState(): number {
    return this.state;
  }

  /**
   * Set state (for loading saved state)
   */
  setState(state: number): void {
    this.state = state;
  }

  /**
   * Create a forked RNG with a modified seed
   * Useful for generating sub-sequences that don't affect main sequence
   */
  fork(modifier: string | number): SeededRNG {
    const newSeed = typeof modifier === 'string'
      ? this.hashString(`${this.state}_${modifier}`)
      : this.state ^ modifier;
    return new SeededRNG(newSeed);
  }
}

/**
 * Create RNG from run ID and floor number
 * This ensures all players see the same procedural generation
 */
export function createFloorRNG(runId: string, floor: number): SeededRNG {
  return new SeededRNG(`${runId}_floor_${floor}`);
}

/**
 * Create RNG for loot generation
 * Separate from dungeon RNG to allow independent loot rolls
 */
export function createLootRNG(runId: string, floor: number, source: string): SeededRNG {
  return new SeededRNG(`${runId}_loot_${floor}_${source}`);
}
