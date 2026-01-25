import { describe, it, expect } from 'vitest';
import { SeededRNG, createFloorRNG } from '../utils/SeededRNG.js';

describe('SeededRNG', () => {
  it('should produce deterministic results with same seed', () => {
    const rng1 = new SeededRNG('test-seed');
    const rng2 = new SeededRNG('test-seed');

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('should produce different results with different seeds', () => {
    const rng1 = new SeededRNG('seed-1');
    const rng2 = new SeededRNG('seed-2');

    const result1 = rng1.next();
    const result2 = rng2.next();

    expect(result1).not.toEqual(result2);
  });

  it('should produce values between 0 and 1', () => {
    const rng = new SeededRNG('test');

    for (let i = 0; i < 100; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('should produce integers in range with nextInt', () => {
    const rng = new SeededRNG('test');

    for (let i = 0; i < 100; i++) {
      const value = rng.nextInt(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('should shuffle arrays deterministically', () => {
    const rng1 = new SeededRNG('shuffle-test');
    const rng2 = new SeededRNG('shuffle-test');

    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];

    const shuffled1 = rng1.shuffle(arr1);
    const shuffled2 = rng2.shuffle(arr2);

    expect(shuffled1).toEqual(shuffled2);
  });

  it('should fork with different results', () => {
    const rng = new SeededRNG('main');
    const forked = rng.fork('sub');

    // Forked RNG should produce different results
    expect(forked.next()).not.toEqual(rng.next());
  });
});

describe('createFloorRNG', () => {
  it('should create deterministic RNG for floor', () => {
    const rng1 = createFloorRNG('run-123', 1);
    const rng2 = createFloorRNG('run-123', 1);

    const results1 = Array.from({ length: 10 }, () => rng1.next());
    const results2 = Array.from({ length: 10 }, () => rng2.next());

    expect(results1).toEqual(results2);
  });

  it('should create different RNG for different floors', () => {
    const rng1 = createFloorRNG('run-123', 1);
    const rng2 = createFloorRNG('run-123', 2);

    expect(rng1.next()).not.toEqual(rng2.next());
  });

  it('should create different RNG for different runs', () => {
    const rng1 = createFloorRNG('run-123', 1);
    const rng2 = createFloorRNG('run-456', 1);

    expect(rng1.next()).not.toEqual(rng2.next());
  });
});
