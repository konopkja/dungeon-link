import { describe, it, expect } from 'vitest';
import { validateSaveData } from '../WebSocketServer.js';

function validSaveData() {
  return {
    playerName: 'TestHero',
    classId: 'warrior',
    level: 5,
    gold: 100,
    highestFloor: 3,
    abilities: [{ abilityId: 'warrior_strike', rank: 1, currentCooldown: 0 }],
    backpack: [],
    xp: 50,
    lives: 5,
    timestamp: Date.now(),
  };
}

describe('validateSaveData', () => {
  it('accepts valid save data', () => {
    expect(validateSaveData(validSaveData())).toBeNull();
  });

  it('rejects null/undefined', () => {
    expect(validateSaveData(null)).toBe('Invalid save data');
    expect(validateSaveData(undefined)).toBe('Invalid save data');
  });

  it('rejects non-object', () => {
    expect(validateSaveData('string')).toBe('Invalid save data');
    expect(validateSaveData(42)).toBe('Invalid save data');
  });

  describe('playerName', () => {
    it('rejects empty name', () => {
      const data = validSaveData();
      data.playerName = '';
      expect(validateSaveData(data)).toBe('Invalid player name');
    });

    it('rejects name over 30 chars', () => {
      const data = validSaveData();
      data.playerName = 'A'.repeat(31);
      expect(validateSaveData(data)).toBe('Invalid player name');
    });

    it('rejects non-string name', () => {
      const data = validSaveData();
      (data as any).playerName = 123;
      expect(validateSaveData(data)).toBe('Invalid player name');
    });
  });

  describe('classId', () => {
    it('accepts all valid classes', () => {
      const classes = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
      for (const classId of classes) {
        const data = validSaveData();
        data.classId = classId;
        expect(validateSaveData(data)).toBeNull();
      }
    });

    it('rejects invalid class', () => {
      const data = validSaveData();
      data.classId = 'ninja';
      expect(validateSaveData(data)).toBe('Invalid class ID');
    });
  });

  describe('level', () => {
    it('rejects level < 1', () => {
      const data = validSaveData();
      data.level = 0;
      expect(validateSaveData(data)).toBe('Invalid level');
    });

    it('rejects level > 50', () => {
      const data = validSaveData();
      data.level = 51;
      expect(validateSaveData(data)).toBe('Invalid level');
    });

    it('rejects non-number level', () => {
      const data = validSaveData();
      (data as any).level = 'five';
      expect(validateSaveData(data)).toBe('Invalid level');
    });
  });

  describe('gold', () => {
    it('rejects negative gold', () => {
      const data = validSaveData();
      data.gold = -1;
      expect(validateSaveData(data)).toBe('Invalid gold');
    });

    it('rejects gold over 99999', () => {
      const data = validSaveData();
      data.gold = 100000;
      expect(validateSaveData(data)).toBe('Invalid gold');
    });
  });

  describe('floor', () => {
    it('rejects floor < 1', () => {
      const data = validSaveData();
      data.highestFloor = 0;
      expect(validateSaveData(data)).toBe('Invalid floor');
    });

    it('rejects floor > 30', () => {
      const data = validSaveData();
      data.highestFloor = 31;
      expect(validateSaveData(data)).toBe('Invalid floor');
    });
  });

  describe('abilities', () => {
    it('rejects more than 10 abilities', () => {
      const data = validSaveData();
      data.abilities = Array.from({ length: 11 }, (_, i) => ({
        abilityId: `ability_${i}`,
        rank: 1,
        currentCooldown: 0,
      }));
      expect(validateSaveData(data)).toBe('Too many abilities');
    });
  });

  describe('backpack', () => {
    it('rejects backpack larger than 20', () => {
      const data = validSaveData();
      data.backpack = Array.from({ length: 21 }, (_, i) => ({ id: `item_${i}` }));
      expect(validateSaveData(data)).toBe('Backpack too large');
    });
  });

  describe('xp', () => {
    it('rejects negative xp', () => {
      const data = validSaveData();
      data.xp = -1;
      expect(validateSaveData(data)).toBe('Invalid XP');
    });
  });

  describe('lives', () => {
    it('rejects lives > 5', () => {
      const data = validSaveData();
      data.lives = 6;
      expect(validateSaveData(data)).toBe('Invalid lives');
    });

    it('rejects negative lives', () => {
      const data = validSaveData();
      data.lives = -1;
      expect(validateSaveData(data)).toBe('Invalid lives');
    });

    it('accepts undefined lives (optional)', () => {
      const data = validSaveData();
      delete (data as any).lives;
      expect(validateSaveData(data)).toBeNull();
    });
  });
});
