import { describe, it, expect, beforeEach } from 'vitest';
import { GameStateManager } from '../game/GameState.js';
import { ClassName } from '@dungeon-link/shared';

describe('GameState tracking cleanup', () => {
  let gsm: GameStateManager;

  beforeEach(() => {
    gsm = new GameStateManager();
  });

  describe('removePlayer', () => {
    it('cleans up all state for the run', () => {
      const { runId, playerId } = gsm.createRun('Hero', ClassName.Warrior);

      // Verify state exists
      expect(gsm.getRunState(runId)).toBeDefined();
      expect(gsm.getPlayerRun(playerId)).toBeDefined();

      gsm.removePlayer(playerId);

      // Verify state is fully cleaned
      expect(gsm.getRunState(runId)).toBeUndefined();
      expect(gsm.getPlayerRun(playerId)).toBeUndefined();
    });

    it('handles removing non-existent player gracefully', () => {
      expect(() => gsm.removePlayer('nonexistent')).not.toThrow();
    });
  });

  describe('advanceFloor', () => {
    it('clears all tracking Maps on floor advance', () => {
      const { runId, playerId, state } = gsm.createRun('Hero', ClassName.Warrior);

      // Populate tracking Maps with test data
      state.tracking.enemyAggroTimes.set('enemy1', Date.now());
      state.tracking.attackCooldowns.set('enemy1', 1.5);
      state.tracking.attackCooldowns.set(playerId, 0.5);
      state.tracking.eliteAttackCooldowns.set('elite1', 2.0);
      state.tracking.bossAbilityCooldowns.set('boss1_ability1', 3.0);
      state.tracking.bossAoECooldowns.set('boss1_aoe', 4.0);
      state.tracking.groundEffectDamageTicks.set('effect1_player1', Date.now());
      state.tracking.enemyLeashTimers.set('enemy1', Date.now());
      state.tracking.enemyCharging.set('enemy2', { targetId: playerId, startTime: Date.now() });
      state.tracking.enemyChargeCooldowns.set('enemy2', 5.0);
      state.tracking.ambushTriggered.add('room1');
      state.tracking.modifierDamageTicks.set('player1_room1', Date.now());
      state.tracking.bossPhaseTriggered.add('boss1_phase2');
      state.tracking.bossFightStartTimes.set('boss1', Date.now());
      state.tracking.playerMomentum.set(playerId, { vx: 1, vy: 0 });

      // Must mark boss as defeated to advance
      state.dungeon.bossDefeated = true;

      const newState = gsm.advanceFloor(runId);
      expect(newState).not.toBeNull();

      // Verify ALL tracking Maps are cleared
      expect(newState!.tracking.enemyAggroTimes.size).toBe(0);
      expect(newState!.tracking.attackCooldowns.size).toBe(0);
      expect(newState!.tracking.eliteAttackCooldowns.size).toBe(0);
      expect(newState!.tracking.bossAbilityCooldowns.size).toBe(0);
      expect(newState!.tracking.bossAoECooldowns.size).toBe(0);
      expect(newState!.tracking.groundEffectDamageTicks.size).toBe(0);
      expect(newState!.tracking.enemyLeashTimers.size).toBe(0);
      expect(newState!.tracking.enemyCharging.size).toBe(0);
      expect(newState!.tracking.enemyChargeCooldowns.size).toBe(0);
      expect(newState!.tracking.ambushTriggered.size).toBe(0);
      expect(newState!.tracking.modifierDamageTicks.size).toBe(0);
      expect(newState!.tracking.bossPhaseTriggered.size).toBe(0);
      expect(newState!.tracking.bossFightStartTimes.size).toBe(0);
      expect(newState!.tracking.playerMomentum.size).toBe(0);
    });

    it('preserves playerMovement and playerDeathTimes across floor advance', () => {
      const { runId, playerId, state } = gsm.createRun('Hero', ClassName.Warrior);

      // These should survive floor advance
      state.tracking.playerMovement.set(playerId, { moveX: 1, moveY: 0 });
      state.tracking.playerDeathTimes.set(playerId, Date.now());

      state.dungeon.bossDefeated = true;
      const newState = gsm.advanceFloor(runId);

      // playerMovement and playerDeathTimes should persist (intentional)
      expect(newState!.tracking.playerMovement.size).toBe(1);
      expect(newState!.tracking.playerDeathTimes.size).toBe(1);
    });

    it('increments floor number', () => {
      const { runId, state } = gsm.createRun('Hero', ClassName.Warrior);
      const originalFloor = state.floor;

      state.dungeon.bossDefeated = true;
      const newState = gsm.advanceFloor(runId);

      expect(newState!.floor).toBe(originalFloor + 1);
    });

    it('rejects advance if boss not defeated', () => {
      const { runId, state } = gsm.createRun('Hero', ClassName.Warrior);
      state.dungeon.bossDefeated = false;

      const result = gsm.advanceFloor(runId);
      expect(result).toBeNull();
    });

    it('rejects advance for non-existent run', () => {
      expect(gsm.advanceFloor('nonexistent')).toBeNull();
    });

    it('restores player health and mana', () => {
      const { runId, state } = gsm.createRun('Hero', ClassName.Warrior);
      const player = state.players[0];

      // Damage the player
      player.stats.health = 10;
      player.stats.mana = 5;
      player.isAlive = true;

      state.dungeon.bossDefeated = true;
      const newState = gsm.advanceFloor(runId);

      const restoredPlayer = newState!.players[0];
      expect(restoredPlayer.stats.health).toBe(restoredPlayer.stats.maxHealth);
      expect(restoredPlayer.stats.mana).toBe(restoredPlayer.stats.maxMana);
    });

    it('resets ability cooldowns', () => {
      const { runId, state } = gsm.createRun('Hero', ClassName.Warrior);
      const player = state.players[0];

      // Set some ability cooldowns
      for (const ability of player.abilities) {
        ability.currentCooldown = 5.0;
      }

      state.dungeon.bossDefeated = true;
      const newState = gsm.advanceFloor(runId);

      for (const ability of newState!.players[0].abilities) {
        expect(ability.currentCooldown).toBe(0);
      }
    });

    it('clears pending loot', () => {
      const { runId, state } = gsm.createRun('Hero', ClassName.Warrior);
      state.pendingLoot = [{ item: {} as any, position: { x: 0, y: 0 } }];

      state.dungeon.bossDefeated = true;
      const newState = gsm.advanceFloor(runId);

      expect(newState!.pendingLoot).toHaveLength(0);
    });
  });
});
