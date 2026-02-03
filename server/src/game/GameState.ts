import { v4 as uuidv4 } from 'uuid';
import {
  RunState, Player, ClassName, Equipment, EquipSlot, Rarity, Buff,
  PlayerInput, CombatEvent, TauntEvent, LootDrop, Position, Enemy, PotionType, Pet, AbilityType,
  GroundEffect, GroundEffectType, SaveData, VendorService, TargetType, GroundItem,
  Trap, Chest, TrapType, FloorTheme, EnemyType, createRunTracking
} from '@dungeon-link/shared';
import { getVendorServices, purchaseLevelUp, purchaseAbilityTrain, createVendor, createShopVendor, createCryptoVendor, getShopServices, sellItem, sellAllItems } from './Vendor.js';
import { GAME_CONFIG, SPRITE_CONFIG } from '@dungeon-link/shared';
import { generateDungeon, getPlayerSpawnPosition } from './DungeonGenerator.js';
import { getClassById, getBaselineAbilities, getAbilityById } from '../data/classes.js';
import { processAbilityCast, processEnemyAttack, updateCooldowns, regenerateMana, isInRange, getDirection, processAoEDamageOnTarget } from './Combat.js';
import { generateBossLoot, generateRareLoot, generateEnemyLoot, applyLootDrop, recalculateStats, getPartyAverageItemPower } from './Loot.js';
import { getPartyScaling } from '../data/scaling.js';
import { getBossAbilitiesForFloor } from '../data/bosses.js';
import { awardXP, getEnemyXP, initializePlayerLevel } from '../data/leveling.js';
import { hasSetEffect } from '../data/sets.js';

export class GameStateManager {
  private runs: Map<string, RunState> = new Map();
  private playerToRun: Map<string, string> = new Map();
  private lastUpdate: Map<string, number> = new Map();

  // ==========================================================================
  // CONSTANTS - All per-run tracking Maps are now in RunState.tracking
  // This fixes the memory leak where global Maps accumulated stale entity IDs
  // ==========================================================================

  private readonly ELITE_SPECIAL_COOLDOWN = 6; // 6 seconds between special attacks
  private readonly ENEMY_AGGRO_DELAY = 1.0; // 1 second delay before enemies can damage
  private readonly ENEMY_AGGRO_DELAY_PATROL = 0.3; // Reduced delay for patrolling enemies (already alert)
  private readonly ENEMY_LEASH_RESET_DELAY = 3000; // 3 seconds after losing target, reset
  private readonly ENEMY_LEASH_DISTANCE = 400; // Max distance from spawn before leash kicks in
  private readonly RESPAWN_DELAY = 3000; // 3 second respawn delay
  private readonly ENEMY_ATTACK_COOLDOWN = 2.0; // Enemies attack every 2 seconds
  private readonly PLAYER_AUTO_ATTACK_COOLDOWN = 1.5; // Players auto-attack every 1.5 seconds
  private readonly MELEE_RANGE = 60;
  private readonly RANGED_RANGE = 300;
  private readonly CHARGE_COOLDOWN = 8; // 8 seconds between charges
  private readonly CHARGE_SPEED = 250; // Fast charge speed
  private readonly CHARGE_TRIGGER_DISTANCE = 200; // Start charging when this far from target
  private readonly CHARGE_DAMAGE_BONUS = 1.5; // 50% bonus damage on charge impact

  /**
   * Create a new run
   */
  createRun(playerName: string, classId: ClassName): { runId: string; playerId: string; state: RunState } {
    const runId = uuidv4().slice(0, 8);
    const playerId = uuidv4().slice(0, 8);

    // Create initial player
    const player = this.createPlayer(playerId, playerName, classId);

    // Generate first floor
    const dungeon = generateDungeon(runId, 1, 1, 0);

    // Set player spawn position
    player.position = getPlayerSpawnPosition(dungeon, 0);

    // Calculate initial party scaling
    const partyScaling = getPartyScaling(1, 0);

    const state: RunState = {
      runId,
      seed: runId,
      floor: 1,
      players: [player],
      pets: [],
      dungeon,
      inCombat: false,
      pendingLoot: [],
      partyScaling,
      groundEffects: [],
      tracking: createRunTracking()
    };

    this.runs.set(runId, state);
    this.playerToRun.set(playerId, runId);
    this.lastUpdate.set(runId, Date.now());

    // Spawn vendor in start room
    this.spawnVendorInStartRoom(state);

    // Apply floor theme buffs to explain environmental effects
    this.applyFloorThemeBuffs(state);

    console.log(`[DEBUG] Player created: ${playerName} (${classId}), buffs: ${JSON.stringify(player.buffs)}, buffs length: ${player.buffs.length}`);

    return { runId, playerId, state };
  }

  /**
   * Create a new run from saved character data
   */
  createRunFromSave(saveData: SaveData): { runId: string; playerId: string; state: RunState } {
    const runId = uuidv4().slice(0, 8);
    const playerId = uuidv4().slice(0, 8);

    // Create player from save data
    const classData = getClassById(saveData.classId);
    if (!classData) {
      throw new Error(`Unknown class: ${saveData.classId}`);
    }

    // Migrate old ability IDs to new ones
    const migratedAbilities = saveData.abilities.map(ability => {
      // Migrate rogue_backstab -> rogue_stealth
      if (ability.abilityId === 'rogue_backstab') {
        console.log(`[DEBUG] Migrating ability rogue_backstab -> rogue_stealth`);
        return { ...ability, abilityId: 'rogue_stealth' };
      }
      // Migrate rogue_eviscerate -> rogue_blind
      if (ability.abilityId === 'rogue_eviscerate') {
        console.log(`[DEBUG] Migrating ability rogue_eviscerate -> rogue_blind`);
        return { ...ability, abilityId: 'rogue_blind' };
      }
      // Migrate shaman_bolt -> shaman_chainlight (new baseline)
      if (ability.abilityId === 'shaman_bolt') {
        console.log(`[DEBUG] Migrating ability shaman_bolt -> shaman_chainlight`);
        return { ...ability, abilityId: 'shaman_chainlight' };
      }
      // Migrate mage_frostbolt -> mage_meditation
      if (ability.abilityId === 'mage_frostbolt') {
        console.log(`[DEBUG] Migrating ability mage_frostbolt -> mage_meditation`);
        return { ...ability, abilityId: 'mage_meditation' };
      }
      // Migrate mage_blizzard -> mage_blaze
      if (ability.abilityId === 'mage_blizzard') {
        console.log(`[DEBUG] Migrating ability mage_blizzard -> mage_blaze`);
        return { ...ability, abilityId: 'mage_blaze' };
      }
      // Migrate paladin_consecration -> paladin_retribution
      if (ability.abilityId === 'paladin_consecration') {
        console.log(`[DEBUG] Migrating ability paladin_consecration -> paladin_retribution`);
        return { ...ability, abilityId: 'paladin_retribution' };
      }
      return ability;
    });

    // Ensure player name is not empty - fallback to "Hero" if missing
    const playerName = saveData.playerName || 'Hero';
    if (!saveData.playerName) {
      console.warn(`[DEBUG] createRunFromSave: playerName was empty, using fallback "Hero"`);
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      classId: saveData.classId,
      position: { x: 0, y: 0 },
      stats: { ...saveData.baseStats }, // Will be recalculated
      baseStats: { ...saveData.baseStats },
      equipment: saveData.equipment,
      abilities: migratedAbilities,
      gold: saveData.gold,
      rerollTokens: saveData.rerollTokens,
      isAlive: true,
      targetId: null,
      backpack: saveData.backpack,
      buffs: [],
      level: saveData.level,
      xp: saveData.xp,
      xpToNextLevel: saveData.xpToNextLevel
    };

    // Recalculate stats from equipment
    recalculateStats(player);

    // Use saved floor (default to 1 if not set)
    const savedFloor = saveData.highestFloor ?? 1;

    // Generate dungeon at saved floor
    const dungeon = generateDungeon(runId, savedFloor, 1, 0);

    // Set player spawn position
    player.position = getPlayerSpawnPosition(dungeon, 0);

    // Calculate party scaling for saved floor
    const partyScaling = getPartyScaling(1, 0);

    const state: RunState = {
      runId,
      seed: runId,
      floor: savedFloor,
      players: [player],
      pets: [],
      dungeon,
      inCombat: false,
      pendingLoot: [],
      partyScaling,
      groundEffects: [],
      tracking: createRunTracking()
    };

    this.runs.set(runId, state);
    this.playerToRun.set(playerId, runId);
    this.lastUpdate.set(runId, Date.now());

    // Spawn vendor in start room
    this.spawnVendorInStartRoom(state);

    // Apply floor theme buffs to explain environmental effects
    this.applyFloorThemeBuffs(state);

    console.log(`[DEBUG] Created run from save for ${saveData.playerName} (Level ${saveData.level}, Floor ${savedFloor})`);

    return { runId, playerId, state };
  }

  // NOTE: joinRun removed - game is now single-player only

  /**
   * Remove a player from their run (single-player: always deletes the run)
   */
  removePlayer(playerId: string): void {
    const runId = this.playerToRun.get(playerId);
    if (!runId) return;

    this.playerToRun.delete(playerId);
    this.runs.delete(runId);
    this.lastUpdate.delete(runId);
  }

  /**
   * Get run state
   */
  getRunState(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  /**
   * Get run for a player
   */
  getPlayerRun(playerId: string): RunState | undefined {
    const runId = this.playerToRun.get(playerId);
    if (!runId) return undefined;
    return this.runs.get(runId);
  }

  /**
   * Set player's current target
   */
  setPlayerTarget(playerId: string, targetId: string | null): void {
    const state = this.getPlayerRun(playerId);
    if (!state) return;

    const player = state.players.find(p => p.id === playerId);
    if (player) {
      player.targetId = targetId;
    }
  }

  /**
   * Process player input
   */
  processInput(playerId: string, input: PlayerInput): CombatEvent[] {
    const state = this.getPlayerRun(playerId);
    if (!state) return [];

    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return [];

    const events: CombatEvent[] = [];

    // Store movement direction (will be applied continuously in update)
    state.tracking.playerMovement.set(playerId, { moveX: input.moveX, moveY: input.moveY });

    // Process ability cast
    if (input.castAbility) {
      console.log(`[DEBUG] Player ${player.name} casting ability: ${input.castAbility}`);

      // Check if this is a self-targeting ability
      const abilityCheck = getAbilityById(input.castAbility);
      const isSelfTargetAbility = abilityCheck?.ability.targetType === TargetType.Self;

      let target: Player | Enemy | null = null;

      if (input.targetId) {
        // Find target
        const targetPlayer = state.players.find(p => p.id === input.targetId);

        if (targetPlayer) {
          // Target is a player - allow if self-target ability or if targeting another player
          target = targetPlayer;
        } else if (!isSelfTargetAbility) {
          // Only look for enemy targets if this is NOT a self-targeting ability
          for (const room of state.dungeon.rooms) {
            const enemy = room.enemies.find(e => e.id === input.targetId);
            if (enemy) {
              target = enemy;
              break;
            }
          }
        }
      }

      // For self-targeting abilities, always target self (unless targeting a party member)
      if (isSelfTargetAbility && (!target || !('id' in target) || !state.players.some(p => p.id === (target as Player).id))) {
        target = player;
        console.log(`[DEBUG] Self-target ability ${input.castAbility} - forcing target to self`);
      }

      // Check line of sight for targeted abilities
      if (target && 'position' in target) {
        const targetPos = (target as { position: Position }).position;
        if (!this.hasLineOfSight(state, player.position, targetPos)) {
          // No line of sight to target, ability blocked
          console.log(`[DEBUG] Ability ${input.castAbility} blocked - no line of sight`);
          return events;
        }
      }

      // Start boss fight timer if targeting a boss
      if (target && 'isBoss' in target && (target as Enemy).isBoss) {
        const bossEnemy = target as Enemy;
        if (!state.tracking.bossFightStartTimes.has(bossEnemy.id)) {
          state.tracking.bossFightStartTimes.set(bossEnemy.id, Date.now());
          console.log(`[DEBUG] Boss fight started (ability): ${bossEnemy.name}`);
        }
      }

      // Check if this is an AoE ability
      const abilityInfo = getAbilityById(input.castAbility);
      const isAoE = abilityInfo?.ability.targetType === TargetType.AoE;

      if (isAoE && abilityInfo) {
        // AoE ability - damage all enemies within range
        const aoeRange = abilityInfo.ability.range;
        const centerPos = input.targetPosition ?? player.position;
        const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);

        // Get player ability for mana/cooldown check
        const playerAbility = player.abilities.find(a => a.abilityId === input.castAbility);
        if (!playerAbility) {
          console.log(`[DEBUG] Player does not have ability ${input.castAbility}`);
          return events;
        }

        // Check cooldown
        if (playerAbility.currentCooldown > 0) {
          console.log(`[DEBUG] AoE ability ${input.castAbility} on cooldown`);
          return events;
        }

        // Check mana
        const ability = abilityInfo.ability;
        if (player.stats.mana < ability.manaCost) {
          console.log(`[DEBUG] Not enough mana for AoE ability ${input.castAbility}`);
          return events;
        }

        // Deduct mana and start cooldown ONCE
        player.stats.mana -= ability.manaCost;
        playerAbility.currentCooldown = ability.cooldown;

        console.log(`[DEBUG] AoE ability ${input.castAbility} cast at (${centerPos.x}, ${centerPos.y}) with range ${aoeRange}`);

        if (currentRoom) {
          let hitCount = 0;
          const rank = playerAbility.rank;

          for (const enemy of currentRoom.enemies) {
            if (!enemy.isAlive) continue;

            // Check distance from AoE center
            const dx = enemy.position.x - centerPos.x;
            const dy = enemy.position.y - centerPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= aoeRange) {
              // Enemy is in AoE range - process damage (no mana/cooldown checks)
              const result = processAoEDamageOnTarget(player, enemy, input.castAbility, rank);
              events.push(...result.events);
              hitCount++;

              if (result.targetDied) {
                this.handleEnemyDeath(state, enemy, player);
              }
            }
          }
          console.log(`[DEBUG] AoE hit ${hitCount} enemies`);

          // Bloodlust healing for AoE abilities
          const bloodlustBuffAoE = player.buffs.find(b => b.icon === 'warrior_bloodlust');
          if (bloodlustBuffAoE) {
            const totalAoEDamage = events.reduce((sum, e) => sum + (e.damage || 0), 0);
            if (totalAoEDamage > 0) {
              const buffRank = bloodlustBuffAoE.rank ?? 1;
              let healPercent = 0.15 + buffRank * 0.05; // 20/25/30/35/40%

              // COMBO: Bloodlust + Whirlwind - 25% extra healing
              if (input.castAbility === 'warrior_whirlwind') {
                healPercent *= 1.25; // 25% bonus
                console.log(`[DEBUG] Whirlwind COMBO! Bloodlust healing increased by 25%`);
              }

              const healAmount = Math.round(totalAoEDamage * healPercent);
              player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + healAmount);
              events.push({
                sourceId: player.id,
                targetId: player.id,
                heal: healAmount,
                abilityId: 'warrior_bloodlust'
              });
              console.log(`[DEBUG] AoE Bloodlust healed for ${healAmount} (${hitCount} targets hit)`);
            }
          }

          // Auto-target after AoE if any enemies died
          this.autoTargetClosestEnemy(state, player, currentRoom);
        }
      } else {
        // Single target ability - check range first
        if (target && abilityInfo && 'position' in target) {
          const targetPos = (target as { position: Position }).position;
          const dx = targetPos.x - player.position.x;
          const dy = targetPos.y - player.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Check if target is within ability range
          if (distance > abilityInfo.ability.range) {
            console.log(`[DEBUG] Ability ${input.castAbility} blocked - target too far (${distance.toFixed(0)} > ${abilityInfo.ability.range})`);
            return events;
          }
        }

        const result = processAbilityCast(player, target, input.castAbility, input.targetPosition);
        events.push(...result.events);

        // Bloodlust healing - scales with rank: 20/25/30/35/40% at ranks 1-5
        const bloodlustBuff = player.buffs.find(b => b.icon === 'warrior_bloodlust');
        if (bloodlustBuff) {
          const totalDamage = result.events.reduce((sum, e) => sum + (e.damage || 0), 0);
          if (totalDamage > 0) {
            const buffRank = bloodlustBuff.rank ?? 1;
            const healPercent = 0.15 + buffRank * 0.05; // 20/25/30/35/40%
            const healAmount = Math.round(totalDamage * healPercent);
            player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + healAmount);
            // Add heal event for visual feedback
            events.push({
              sourceId: player.id,
              targetId: player.id,
              heal: healAmount,
              abilityId: 'warrior_bloodlust'
            });
          }
        }

        // WARLOCK COMBO: Drain Life also heals the player's Imp
        if (input.castAbility === 'warlock_drain') {
          const playerImp = state.pets.find(p => p.ownerId === player.id && p.petType === 'imp' && p.isAlive);
          if (playerImp) {
            // Heal event from result contains the heal amount
            const drainHeal = result.events.find(e => e.heal && e.heal > 0)?.heal || 0;
            if (drainHeal > 0) {
              const impHealAmount = Math.round(drainHeal * 0.5); // Imp gets 50% of the heal
              playerImp.stats.health = Math.min(playerImp.stats.maxHealth, playerImp.stats.health + impHealAmount);
              events.push({
                sourceId: player.id,
                targetId: playerImp.id,
                heal: impHealAmount,
                abilityId: 'warlock_drain'
              });
              console.log(`[DEBUG] Drain Life COMBO! Imp healed for ${impHealAmount}`);
            }
          }

          // WARLOCK COMBO: Hellfire + Drain Life = AoE drain on all enemies with burn DoT
          const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
          if (currentRoom && target && 'debuffs' in target) {
            const targetEnemy = target as Enemy;
            // Check if the primary target has Hellfire burn
            const hasBurn = targetEnemy.debuffs?.some(d => d.abilityId === 'warlock_hellfire' && d.remainingDuration > 0);
            if (hasBurn) {
              console.log(`[DEBUG] Drain Life COMBO! Target has Hellfire burn - draining all burning enemies`);
              const drainAbility = getAbilityById('warlock_drain');
              const playerAbility = player.abilities.find(a => a.abilityId === 'warlock_drain');
              const rank = playerAbility?.rank ?? 1;

              let totalComboHeal = 0;
              for (const enemy of currentRoom.enemies) {
                // Skip the primary target (already drained) and dead enemies
                if (!enemy.isAlive || enemy.id === targetEnemy.id) continue;

                // Only drain enemies with Hellfire burn
                const enemyHasBurn = enemy.debuffs?.some(d => d.abilityId === 'warlock_hellfire' && d.remainingDuration > 0);
                if (!enemyHasBurn) continue;

                // Calculate reduced damage for secondary targets (50% of normal)
                const baseDamage = drainAbility?.ability.baseDamage ?? 20;
                const scaledDamage = baseDamage * (1 + (rank - 1) * 0.1) * 0.5; // 50% for secondary
                const totalDamage = Math.round(scaledDamage + player.stats.spellPower * 0.25);

                // Apply damage
                const resist = enemy.stats.resist;
                const reduction = 100 / (100 + resist);
                const finalDamage = Math.round(totalDamage * reduction);

                enemy.stats.health -= finalDamage;
                const killed = enemy.stats.health <= 0;
                if (killed) {
                  enemy.isAlive = false;
                  this.handleEnemyDeath(state, enemy, player);
                }

                // Heal from this drain
                const drainHealSecondary = Math.round(finalDamage * 0.5);
                totalComboHeal += drainHealSecondary;

                events.push({
                  sourceId: player.id,
                  targetId: enemy.id,
                  abilityId: 'warlock_drain',
                  damage: finalDamage,
                  killed
                });
              }

              // Apply total combo heal to player
              if (totalComboHeal > 0) {
                player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + totalComboHeal);
                events.push({
                  sourceId: player.id,
                  targetId: player.id,
                  heal: totalComboHeal,
                  abilityId: 'warlock_drain'
                });
                console.log(`[DEBUG] Drain Life AoE COMBO! Extra heal: ${totalComboHeal}`);
              }
            }
          }
        }

        // Blaze chain bounce - bounces up to 4 additional times (5 total hits)
        // Can bounce back and forth between enemies
        if (input.castAbility === 'mage_blaze' && target && 'isBoss' in target) {
          const primaryTarget = target as Enemy;
          const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);

          if (currentRoom) {
            const playerAbility = player.abilities.find(a => a.abilityId === 'mage_blaze');
            const rank = playerAbility?.rank ?? 1;

            // Get ability for damage calculation
            const blazeAbility = getAbilityById('mage_blaze');
            if (blazeAbility) {
              // Bounce to nearby enemies (can hit same enemy multiple times)
              const bounceRange = 200; // Bounce range
              let lastTarget = primaryTarget;
              let bounceCount = 0;

              while (bounceCount < 4) {
                // Find closest alive enemy to last target (excluding the last target itself)
                let closestEnemy: Enemy | null = null;
                let closestDist = Infinity;

                for (const enemy of currentRoom.enemies) {
                  // Skip dead enemies and the enemy we just bounced from
                  if (!enemy.isAlive || enemy.id === lastTarget.id) continue;

                  const dx = enemy.position.x - lastTarget.position.x;
                  const dy = enemy.position.y - lastTarget.position.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (dist < closestDist && dist <= bounceRange) {
                    closestDist = dist;
                    closestEnemy = enemy;
                  }
                }

                if (!closestEnemy) break; // No more targets in range

                // Deal damage to bounce target
                const baseDamage = blazeAbility.ability.baseDamage ?? 25;
                const scaledDamage = baseDamage * (1 + (rank - 1) * 0.15); // 15% increase per rank
                const spellPower = player.stats.spellPower;
                const totalDamage = Math.round(scaledDamage + spellPower * 0.5);

                // Apply damage reduction from resist
                const resist = closestEnemy.stats.resist;
                const reduction = 100 / (100 + resist);
                const finalDamage = Math.round(totalDamage * reduction);

                closestEnemy.stats.health -= finalDamage;
                const killed = closestEnemy.stats.health <= 0;
                if (killed) {
                  closestEnemy.isAlive = false;
                }

                // Add bounce event
                events.push({
                  sourceId: lastTarget.id, // Source is the previous target (for chain visual)
                  targetId: closestEnemy.id,
                  abilityId: 'mage_blaze',
                  damage: finalDamage,
                  isCrit: false,
                  killed
                });

                if (killed) {
                  this.handleEnemyDeath(state, closestEnemy, player);
                }

                lastTarget = closestEnemy;
                bounceCount++;
              }

              console.log(`[DEBUG] Blaze bounced ${bounceCount} additional times`);

              // COMBO: Pyroblast + Blaze - If primary target has Pyroblast stun, stun ALL enemies hit
              const primaryHasPyroStun = primaryTarget.debuffs?.some(
                d => d.abilityId === 'mage_pyroblast' && d.remainingDuration > 0
              );
              if (primaryHasPyroStun) {
                console.log(`[DEBUG] Blaze COMBO! Primary target stunned by Pyroblast - stunning all enemies in room`);
                const stunDuration = 2; // 2 second stun for combo (shorter than Pyroblast's 3s)
                for (const enemy of currentRoom.enemies) {
                  if (!enemy.isAlive) continue;
                  // Don't re-stun the primary target that already has Pyroblast stun
                  if (enemy.id === primaryTarget.id) continue;

                  const blazeStun = {
                    id: `blaze_stun_${Date.now()}_${enemy.id}`,
                    sourceId: player.id,
                    abilityId: 'mage_blaze',
                    name: 'Blaze Stun',
                    damagePerTick: 0,
                    tickInterval: 1,
                    remainingDuration: stunDuration,
                    lastTickTime: Date.now() / 1000,
                    isStun: true
                  };
                  // Add stun (don't remove existing - let them stack)
                  enemy.debuffs = enemy.debuffs || [];
                  enemy.debuffs.push(blazeStun);
                }
                console.log(`[DEBUG] Blaze stunned all enemies for ${stunDuration}s`);
              }
            }
          }
        }

        // Check if target died
        if (result.targetDied && target && 'isBoss' in target) {
          this.handleEnemyDeath(state, target as Enemy, player);

          // Auto-target next closest enemy after ability kill
          const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
          if (currentRoom) {
            this.autoTargetClosestEnemy(state, player, currentRoom);
          }
        }
      }

      // Check if this was a summon ability
      const abilityData = getAbilityById(input.castAbility);
      console.log(`[DEBUG] Ability data found:`, abilityData ? `type=${abilityData.ability.type}` : 'NOT FOUND');
      if (abilityData && abilityData.ability.type === AbilityType.Summon) {
        console.log(`[DEBUG] Summoning pet for player ${player.name}`);
        this.summonPet(state, player, input.castAbility);
        console.log(`[DEBUG] Pet summoned. Total pets: ${state.pets.length}`);
      }

      // Recalculate stats if this was a buff ability (for stat modifiers like Aspect of the Hawk)
      if (abilityData && abilityData.ability.type === AbilityType.Buff) {
        recalculateStats(player);
      }

      // Check if this was a debuff ability (DoT)
      if (abilityData && abilityData.ability.type === AbilityType.Debuff && target && 'isBoss' in target) {
        const enemy = target as Enemy;
        if (enemy.isAlive) {
          this.applyDoT(enemy, player, abilityData.ability);
        }
      }

      // Check if this was Vanish - clear all enemy aggro and targets on this player
      if (input.castAbility === 'rogue_vanish') {
        // Clear all enemy targets pointing to this player
        for (const room of state.dungeon.rooms) {
          for (const enemy of room.enemies) {
            if (enemy.targetId === player.id) {
              enemy.targetId = null;
            }
          }
        }
        // Clear aggro times for this player from all enemies
        // We can't easily track per-player aggro, so just clear player's target
        player.targetId = null;

        // Apply stealth buff
        const stealthBuff: Buff = {
          id: `vanish_${Date.now()}`,
          name: 'Vanish',
          icon: 'rogue_vanish',
          duration: 5,
          maxDuration: 5,
          isDebuff: false
        };
        player.buffs = player.buffs.filter(b => b.icon !== 'rogue_vanish');
        player.buffs.push(stealthBuff);
        console.log(`[DEBUG] Rogue ${player.name} vanished - cleared enemy aggro`);
      }

      // Check if this was Stealth (out of combat stealth)
      if (input.castAbility === 'rogue_stealth') {
        // Check if player is in combat (any enemy in current room targeting them or has aggro)
        const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
        const inCombat = currentRoom?.enemies.some(e =>
          e.isAlive && (e.targetId === player.id || state.tracking.enemyAggroTimes.has(e.id))
        ) ?? false;

        if (inCombat) {
          console.log(`[DEBUG] Cannot use Stealth in combat!`);
          // Refund mana since ability shouldn't work
          const abilityData = getAbilityById('rogue_stealth');
          if (abilityData) {
            player.stats.mana = Math.min(player.stats.maxMana, player.stats.mana + abilityData.ability.manaCost);
          }
          // Reset cooldown
          const ability = player.abilities.find(a => a.abilityId === 'rogue_stealth');
          if (ability) ability.currentCooldown = 0;
        } else {
          // Clear all enemy targets pointing to this player (like Vanish)
          for (const room of state.dungeon.rooms) {
            for (const enemy of room.enemies) {
              if (enemy.targetId === player.id) {
                enemy.targetId = null;
                // Also clear aggro so they don't immediately re-aggro
                state.tracking.enemyAggroTimes.delete(enemy.id);
              }
            }
          }

          // Apply stealth buff (10 seconds, 25% slow, 100% bonus on Sinister Strike)
          const stealthBuff: Buff = {
            id: `stealth_${Date.now()}`,
            name: 'Stealth',
            icon: 'rogue_stealth',
            duration: 10,
            maxDuration: 10,
            isDebuff: false
          };
          player.buffs = player.buffs.filter(b => b.icon !== 'rogue_stealth' && b.icon !== 'rogue_vanish');
          player.buffs.push(stealthBuff);
          player.targetId = null; // Clear target when entering stealth
          console.log(`[DEBUG] Rogue ${player.name} entered stealth - cleared enemy aggro, 10 seconds, 25% slow, Sinister Strike bonus ready`);
        }
      }

      // Check if this was Sinister Strike from stealth - apply bonus damage
      if (input.castAbility === 'rogue_stab') {
        const wasStealthed = player.buffs.some(b => b.icon === 'rogue_stealth');
        if (wasStealthed) {
          // Stealth is broken by using Sinister Strike - buff removal handled by ability damage
          player.buffs = player.buffs.filter(b => b.icon !== 'rogue_stealth');
          console.log(`[DEBUG] Rogue ${player.name} broke stealth with Sinister Strike!`);
        }
      }
    }

    return events;
  }

  /**
   * Update game state (called every tick)
   */
  update(): Map<string, { state: RunState; events: CombatEvent[]; tauntEvents: TauntEvent[]; collectedItems: { playerId: string; itemName: string; itemType: 'item' | 'potion' }[] }> {
    const updates = new Map<string, { state: RunState; events: CombatEvent[]; tauntEvents: TauntEvent[]; collectedItems: { playerId: string; itemName: string; itemType: 'item' | 'potion' }[] }>();
    const now = Date.now();
    const deltaTime = 1 / GAME_CONFIG.SERVER_TICK_RATE;

    for (const [runId, state] of this.runs) {
      const events: CombatEvent[] = [];
      const tauntEvents: TauntEvent[] = [];
      const collectedItems: { playerId: string; itemName: string; itemType: 'item' | 'potion' }[] = [];

      // Update player cooldowns and mana regen
      for (const player of state.players) {
        if (!player.isAlive) continue;
        updateCooldowns(player, deltaTime);
        regenerateMana(player, deltaTime);

        // Update buff durations and remove expired buffs
        const buffCountBefore = player.buffs.length;
        for (const buff of player.buffs) {
          buff.duration -= deltaTime;
        }
        player.buffs = player.buffs.filter(b => b.duration > 0);

        // Recalculate stats if buffs expired (for stat modifier buffs like Aspect of the Hawk)
        if (player.buffs.length !== buffCountBefore) {
          recalculateStats(player);
        }

        // Apply continuous movement with collision checking
        const movement = state.tracking.playerMovement.get(player.id);
        const isFrozenTheme = state.dungeon.theme === FloorTheme.Frozen;
        const movementModifier = state.dungeon.themeModifiers?.movementModifier || 1.0;

        // Get or initialize momentum
        let momentum = state.tracking.playerMomentum.get(player.id);
        if (!momentum) {
          momentum = { vx: 0, vy: 0 };
          state.tracking.playerMomentum.set(player.id, momentum);
        }

        // Apply stealth slow (25% slower while in rogue_stealth)
        const stealthSlow = player.buffs.some(b => b.icon === 'rogue_stealth') ? 0.75 : 1.0;
        const speed = GAME_CONFIG.PLAYER_MOVE_SPEED * (1 + player.stats.haste / 100) * stealthSlow;
        let moveX = 0;
        let moveY = 0;

        if (isFrozenTheme) {
          // Ice sliding mechanics
          const acceleration = 0.15; // How fast player accelerates
          const friction = 0.02; // How fast momentum decays (low = more slippery)
          const maxSpeed = speed * movementModifier;

          // Apply input to momentum
          if (movement && (movement.moveX !== 0 || movement.moveY !== 0)) {
            momentum.vx += movement.moveX * acceleration * speed;
            momentum.vy += movement.moveY * acceleration * speed;
          }

          // Apply friction (drag)
          momentum.vx *= (1 - friction);
          momentum.vy *= (1 - friction);

          // Clamp to max speed
          const currentSpeed = Math.sqrt(momentum.vx * momentum.vx + momentum.vy * momentum.vy);
          if (currentSpeed > maxSpeed) {
            const scale = maxSpeed / currentSpeed;
            momentum.vx *= scale;
            momentum.vy *= scale;
          }

          // Stop if very slow
          if (Math.abs(momentum.vx) < 0.5) momentum.vx = 0;
          if (Math.abs(momentum.vy) < 0.5) momentum.vy = 0;

          moveX = momentum.vx * deltaTime;
          moveY = momentum.vy * deltaTime;
        } else {
          // Normal movement
          if (movement && (movement.moveX !== 0 || movement.moveY !== 0)) {
            moveX = movement.moveX * speed * deltaTime;
            moveY = movement.moveY * speed * deltaTime;
          }
          // Reset momentum when not on ice
          momentum.vx = 0;
          momentum.vy = 0;
        }

        if (moveX !== 0 || moveY !== 0) {
          // Calculate new position
          const newX = player.position.x + moveX;
          const newY = player.position.y + moveY;
          const newPosition = { x: newX, y: newY };

          // Check if new position is walkable
          if (this.isPositionWalkable(state, newPosition)) {
            player.position.x = newX;
            player.position.y = newY;
          } else {
            // Try sliding along walls - X only
            const slideX = { x: newX, y: player.position.y };
            if (this.isPositionWalkable(state, slideX)) {
              player.position.x = newX;
              // Bounce momentum on Y axis for ice
              if (isFrozenTheme) momentum.vy *= -0.5;
            } else {
              // Try Y only
              const slideY = { x: player.position.x, y: newY };
              if (this.isPositionWalkable(state, slideY)) {
                player.position.y = newY;
                // Bounce momentum on X axis for ice
                if (isFrozenTheme) momentum.vx *= -0.5;
              } else if (isFrozenTheme) {
                // Hit a corner, dampen momentum significantly
                momentum.vx *= -0.3;
                momentum.vy *= -0.3;
              }
            }
          }

          // Check if player entered a new room
          const newRoom = this.findRoomAtPosition(state, player.position);
          if (newRoom && newRoom.id !== state.dungeon.currentRoomId) {
            const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);

            // Check if player is STRICTLY inside the new room (not in corridor)
            const strictlyInsideNewRoom =
              player.position.x >= newRoom.x &&
              player.position.x <= newRoom.x + newRoom.width &&
              player.position.y >= newRoom.y &&
              player.position.y <= newRoom.y + newRoom.height;

            // Allow transition if:
            // 1. Player is strictly inside the new room (most reliable), OR
            // 2. Current room is connected to new room, OR
            // 3. New room is connected to current room (bidirectional check), OR
            // 4. Current room is cleared (allows exploring)
            const isConnected = currentRoom && (
              currentRoom.connectedTo.includes(newRoom.id) ||
              newRoom.connectedTo.includes(state.dungeon.currentRoomId)
            );
            const isCleared = currentRoom && currentRoom.cleared;
            const shouldTransition = strictlyInsideNewRoom || isConnected || isCleared;

            if (shouldTransition) {
              console.log(`[DEBUG] Player ${player.name} entered ${newRoom.id} (from ${state.dungeon.currentRoomId}), enemies: ${newRoom.enemies.filter(e => e.isAlive).length}, strictlyInside: ${strictlyInsideNewRoom}`);

              // Remove room modifier buffs from previous room
              const oldRoom = currentRoom;
              if (oldRoom?.modifier) {
                this.removeRoomModifierBuffs(state, player, oldRoom.modifier);
              }

              state.dungeon.currentRoomId = newRoom.id;

              // Clear aggro times for enemies in the new room so they have fresh aggro delay
              // FIX: Add staggered aggro delay variation (0.5-1.5s) to prevent all enemies attacking at once
              for (const enemy of newRoom.enemies) {
                state.tracking.enemyAggroTimes.delete(enemy.id);
                // Reset attack cooldowns so enemies don't immediately attack
                state.tracking.attackCooldowns.delete(enemy.id);

                // FIX: Set initial cooldowns for boss abilities and AoE to prevent burst damage on aggro
                // Without this, all boss abilities start at 0 cooldown and fire back-to-back
                // FIX 2: Stagger abilities so they don't all come off cooldown at the same time
                if (enemy.isBoss && enemy.bossId) {
                  const bossAbilities = getBossAbilitiesForFloor(enemy.bossId, state.floor);
                  for (let i = 0; i < bossAbilities.length; i++) {
                    const abilityId = bossAbilities[i];
                    const cdKey = `${enemy.id}_${abilityId}`;
                    // Staggered initial cooldowns: first ability at 4-5s, second at 7-8s, third at 10-11s, etc.
                    // This prevents all abilities from coming off cooldown together
                    const baseDelay = 4 + i * 3; // 4s, 7s, 10s, 13s...
                    const initialCooldown = baseDelay + Math.random();
                    state.tracking.bossAbilityCooldowns.set(cdKey, initialCooldown);
                  }
                  // Initial AoE cooldown: 6-8 seconds (longer to give players time to position)
                  const aoECdKey = `${enemy.id}_aoe`;
                  const initialAoECooldown = 6 + Math.random() * 2;
                  state.tracking.bossAoECooldowns.set(aoECdKey, initialAoECooldown);
                  console.log(`[DEBUG] Set staggered boss cooldowns for ${enemy.name}: abilities staggered from 4s, AoE=6-8s`);
                }

                // Ensure enemy position is inside the room (fix stuck enemies)
                const roomCenterX = newRoom.x + newRoom.width / 2;
                const roomCenterY = newRoom.y + newRoom.height / 2;
                const isInsideRoom =
                  enemy.position.x >= newRoom.x && enemy.position.x <= newRoom.x + newRoom.width &&
                  enemy.position.y >= newRoom.y && enemy.position.y <= newRoom.y + newRoom.height;

                if (!isInsideRoom) {
                  // Enemy is outside room bounds, reset to room center with some spread
                  const spreadX = (Math.random() - 0.5) * (newRoom.width * 0.6);
                  const spreadY = (Math.random() - 0.5) * (newRoom.height * 0.6);
                  enemy.position.x = roomCenterX + spreadX;
                  enemy.position.y = roomCenterY + spreadY;
                  console.log(`[DEBUG] Reset stuck enemy ${enemy.name} position to room center`);
                }
              }

              // Auto-target closest enemy when entering a new room
              this.autoTargetClosestEnemy(state, player, newRoom);
            } else {
              // Debug: log why transition was blocked (rarely)
              if (Math.random() < 0.05) {
                console.log(`[DEBUG] Room transition BLOCKED for ${player.name}: currentRoom=${state.dungeon.currentRoomId}, newRoom=${newRoom.id}, strictlyInside=${strictlyInsideNewRoom}, isConnected=${isConnected}, isCleared=${isCleared}`);
              }
            }
          }
        }

        // Process ground item pickup
        this.processGroundItemPickup(state, player, collectedItems);

        // Check trap collisions for this player
        this.checkTrapCollisions(state, player, events);

        // Check theme-specific hazards (lava damage for inferno, poison for swamp)
        this.checkThemeHazards(state, player, events, deltaTime);
      }

      // Update trap states
      this.updateTraps(state, deltaTime);

      // Process player auto-attacks
      const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);

      // BUG FIX: Check for patrolling enemies from OTHER rooms that have physically entered the current room
      // This MUST run before auto-attacks so players can target patrols
      // The idle patrol loop skips the current room, so patrols might be physically here but not in this room's array
      if (currentRoom) {
        // Debug: Log all patrolling enemies every 5 seconds
        if (Math.random() < 0.03) {
          let patrolCount = 0;
          for (const room of state.dungeon.rooms) {
            for (const enemy of room.enemies) {
              if (enemy.isPatrolling) {
                patrolCount++;
                console.log(`[DEBUG] Patrol ${enemy.name} in ${room.id}, pos=(${Math.round(enemy.position.x)},${Math.round(enemy.position.y)}), waypoint=${enemy.currentWaypointIndex}/${enemy.patrolWaypoints?.length || 0}`);
              }
            }
          }
          if (patrolCount === 0) {
            console.log(`[DEBUG] No patrols found on floor ${state.floor}`);
          }
        }

        for (const otherRoom of state.dungeon.rooms) {
          if (otherRoom.id === currentRoom.id) continue;

          const patrolsToMove: Enemy[] = [];
          for (const enemy of otherRoom.enemies) {
            if (!enemy.isAlive) continue;
            if (!enemy.isPatrolling) continue;

            // Check if this patrol is physically inside the current room
            // BUG FIX: Add margin to prevent detecting patrols in corridors as "inside" the room
            // Corridors connect at room edges, so we need a buffer to avoid false positives
            const ROOM_MARGIN = 60; // Patrol must be at least 60px inside room bounds
            const inCurrentRoom =
              enemy.position.x >= currentRoom.x + ROOM_MARGIN &&
              enemy.position.x <= currentRoom.x + currentRoom.width - ROOM_MARGIN &&
              enemy.position.y >= currentRoom.y + ROOM_MARGIN &&
              enemy.position.y <= currentRoom.y + currentRoom.height - ROOM_MARGIN;

            if (inCurrentRoom) {
              patrolsToMove.push(enemy);
              console.log(`[DEBUG] Patrol ${enemy.name} detected in player room! pos=(${Math.round(enemy.position.x)},${Math.round(enemy.position.y)}) room bounds=(${currentRoom.x},${currentRoom.y},${currentRoom.width}x${currentRoom.height})`);
            }
          }

          // Move patrols to current room's enemies array
          for (const patrol of patrolsToMove) {
            otherRoom.enemies = otherRoom.enemies.filter(e => e.id !== patrol.id);
            currentRoom.enemies.push(patrol);
            patrol.currentRoomId = currentRoom.id;

            // BUG FIX: Un-clear the room so the enemy AI loop will process the patrol
            if (currentRoom.cleared) {
              currentRoom.cleared = false;
              console.log(`[DEBUG] Room ${currentRoom.id} un-cleared due to patrol entering`);
            }

            console.log(`[DEBUG] Moved patrol ${patrol.name} from ${otherRoom.id} to ${currentRoom.id} (player room)`);
          }
        }
      }

      // ============================================
      // ROOM VARIANT: Ambush Trigger
      // ============================================
      if (currentRoom?.variant === 'ambush' && !state.tracking.ambushTriggered.has(currentRoom.id)) {
        const roomCenter = {
          x: currentRoom.x + currentRoom.width / 2,
          y: currentRoom.y + currentRoom.height / 2
        };

        // Check if any player is near center
        for (const player of state.players) {
          if (!player.isAlive) continue;

          const dist = Math.hypot(
            player.position.x - roomCenter.x,
            player.position.y - roomCenter.y
          );

          // Trigger ambush when player reaches center area (within 60 units)
          if (dist < 60) {
            state.tracking.ambushTriggered.add(currentRoom.id);

            // Reveal all hidden enemies
            let revealedCount = 0;
            for (const enemy of currentRoom.enemies) {
              if (enemy.isHidden && enemy.isAlive) {
                enemy.isHidden = false;
                revealedCount++;
              }
            }

            console.log(`[AMBUSH] Room ${currentRoom.id} triggered! Revealed ${revealedCount} hidden enemies.`);
            break;
          }
        }
      }

      // ============================================
      // ROOM MODIFIER: Environmental Effects
      // ============================================
      if (currentRoom?.modifier) {
        for (const player of state.players) {
          if (!player.isAlive) continue;

          switch (currentRoom.modifier) {
            case 'burning': {
              // Deal fire damage every 2 seconds
              const tickKey = `${player.id}_${currentRoom.id}`;
              const lastTick = state.tracking.modifierDamageTicks.get(tickKey) ?? 0;
              const now = Date.now();

              if (now - lastTick >= 2000) { // 2 second interval
                const damage = 5 + state.dungeon.floor * 2;
                player.stats.health = Math.max(0, player.stats.health - damage);
                state.tracking.modifierDamageTicks.set(tickKey, now);

                // Create combat event for visual feedback
                events.push({
                  sourceId: 'room_burning',
                  targetId: player.id,
                  damage,
                  isCrit: false
                });

                if (player.stats.health <= 0) {
                  player.isAlive = false;
                  events.push({
                    sourceId: 'room_burning',
                    targetId: player.id,
                    damage: 0,
                    killed: true
                  });
                }
              }
              break;
            }

            case 'cursed': {
              // Apply stat debuff (handled via temporary stat modification)
              // Check if debuff already applied this room visit
              const hasCurseDebuff = player.buffs.some(b => b.id === 'room_curse');
              if (!hasCurseDebuff) {
                // Track actual reduction amounts (can't reduce below 0)
                const actualArmorReduction = Math.min(10, player.stats.armor);
                const actualResistReduction = Math.min(5, player.stats.resist);

                player.buffs.push({
                  id: 'room_curse',
                  name: 'Cursed Ground',
                  icon: 'curse',
                  duration: 999999, // Permanent while in room (removed on exit)
                  maxDuration: 999999,
                  isDebuff: true,
                  statModifiers: {
                    // Store actual deltas as negative values for proper tooltip display
                    armor: -actualArmorReduction,
                    resist: -actualResistReduction
                  }
                });
                // Apply stat reduction (clamped to 0)
                player.stats.armor = Math.max(0, player.stats.armor - 10);
                player.stats.resist = Math.max(0, player.stats.resist - 5);
              }
              break;
            }

            case 'blessed': {
              // Apply stat buff
              const hasBlessBuff = player.buffs.some(b => b.id === 'room_bless');
              if (!hasBlessBuff) {
                // Store deltas as positive values for buff
                const armorBonus = 10;
                const critBonus = 5;

                player.buffs.push({
                  id: 'room_bless',
                  name: 'Blessed Ground',
                  icon: 'bless',
                  duration: 999999,
                  maxDuration: 999999,
                  isDebuff: false,
                  statModifiers: {
                    // Store actual deltas for proper tooltip display and restoration
                    armor: armorBonus,
                    crit: critBonus
                  }
                });
                // Apply stat boost
                player.stats.armor += armorBonus;
                player.stats.crit += critBonus;
              }
              break;
            }

            case 'dark':
              // Visual effect only - handled on client
              break;
          }
        }
      }

      // Debug: log current room info (10% of the time to avoid spam)
      if (currentRoom && Math.random() < 0.10) {
        const aliveEnemies = currentRoom.enemies.filter(e => e.isAlive);
        const hiddenCount = currentRoom.enemies.filter(e => e.isHidden && e.isAlive).length;
        console.log(`[DEBUG] Processing room ${currentRoom.id}, enemies: ${aliveEnemies.length} (${hiddenCount} hidden), cleared: ${currentRoom.cleared}, variant: ${currentRoom.variant || 'standard'}, modifier: ${currentRoom.modifier || 'none'}`);
      }

      if (currentRoom && !currentRoom.cleared) {
        for (const player of state.players) {
          if (!player.isAlive || !player.targetId) continue;

          // Update player attack cooldown
          const playerCd = state.tracking.attackCooldowns.get(player.id) ?? 0;
          if (playerCd > 0) {
            state.tracking.attackCooldowns.set(player.id, Math.max(0, playerCd - deltaTime));
            continue;
          }

          // Disable auto-attacks while in Stealth (rogue_stealth) - only Sinister Strike can break it
          if (player.buffs.some(b => b.icon === 'rogue_stealth')) {
            continue; // Skip auto-attack while stealthed
          }

          // Find target enemy
          const targetEnemy = currentRoom.enemies.find(e => e.id === player.targetId && e.isAlive);
          if (!targetEnemy) {
            player.targetId = null;
            continue;
          }

          // Check range (use first ability's range or default)
          const dx = targetEnemy.position.x - player.position.x;
          const dy = targetEnemy.position.y - player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Ranged classes: Hunter, Mage, Warlock, Priest, Shaman
          const rangedClasses = ['hunter', 'mage', 'warlock', 'priest', 'shaman'];
          const isRangedClass = rangedClasses.includes(player.classId);
          const attackRange = isRangedClass ? this.RANGED_RANGE : this.MELEE_RANGE;

          if (dist <= attackRange) {
            // Check line of sight before attacking
            if (!this.hasLineOfSight(state, player.position, targetEnemy.position)) {
              // No clear path to target - clear target and try to find a new one
              player.targetId = null;
              this.autoTargetClosestEnemy(state, player, currentRoom);
              continue;
            }

            // Start boss fight timer if this is the first hit on a boss
            if (targetEnemy.isBoss && !state.tracking.bossFightStartTimes.has(targetEnemy.id)) {
              state.tracking.bossFightStartTimes.set(targetEnemy.id, Date.now());
              console.log(`[DEBUG] Boss fight started: ${targetEnemy.name}`);
            }

            // Auto-attack!
            const isMagic = player.stats.spellPower > player.stats.attackPower;
            const baseDamage = isMagic ? player.stats.spellPower : player.stats.attackPower;
            const armor = isMagic ? targetEnemy.stats.resist : targetEnemy.stats.armor;
            const reduction = 100 / (100 + armor);
            let damage = Math.round(baseDamage * reduction);

            // SET EFFECT: Vengeance (Bulwark 4pc) - Each stack gives +3% damage
            const vengeanceBuff = player.buffs.find(b => b.icon === 'set_vengeance');
            if (vengeanceBuff && vengeanceBuff.stacks) {
              const damageBonus = 1 + (vengeanceBuff.stacks * 0.03); // +3% per stack
              damage = Math.round(damage * damageBonus);
            }

            // Stealth bonus: 50% extra damage when attacking from Vanish
            const isStealthed = player.buffs.some(b => b.icon === 'rogue_vanish');
            if (isStealthed) {
              damage = Math.round(damage * 1.5);
              console.log(`[DEBUG] Stealth attack bonus! Damage increased to ${damage}`);
            }

            const isCrit = Math.random() * 100 < player.stats.crit;
            if (isCrit) damage = Math.round(damage * 1.5);

            targetEnemy.stats.health = Math.max(0, targetEnemy.stats.health - damage);
            const killed = targetEnemy.stats.health <= 0;
            if (killed) {
              targetEnemy.isAlive = false;
              this.handleEnemyDeath(state, targetEnemy, player);

              // Auto-target next closest enemy after kill
              this.autoTargetClosestEnemy(state, player, currentRoom);
            }

            events.push({
              sourceId: player.id,
              targetId: targetEnemy.id,
              damage,
              isCrit,
              killed
            });

            // Break stealth (Vanish) when attacking
            const hadVanish = player.buffs.some(b => b.icon === 'rogue_vanish');
            if (hadVanish) {
              player.buffs = player.buffs.filter(b => b.icon !== 'rogue_vanish');
              console.log(`[DEBUG] Player ${player.name} broke stealth by attacking`);
            }

            // Bloodlust healing - scales with rank: 20/25/30/35/40% (auto-attack)
            const bloodlustBuff = player.buffs.find(b => b.icon === 'warrior_bloodlust');
            if (bloodlustBuff && damage > 0) {
              const buffRank = bloodlustBuff.rank ?? 1;
              const healPercent = 0.15 + buffRank * 0.05; // 20/25/30/35/40%
              const healAmount = Math.round(damage * healPercent);
              player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + healAmount);
              // Add heal event for visual feedback
              events.push({
                sourceId: player.id,
                targetId: player.id,
                heal: healAmount,
                abilityId: 'warrior_bloodlust'
              });
            }

            // Blade Flurry - attack an additional nearby enemy (always triggers, even if main target died)
            const hasBladeFlurry = player.buffs.some(b => b.icon === 'rogue_bladeflurry');
            if (hasBladeFlurry) {
              // Find another enemy within range (not the main target, or any alive enemy if target died)
              // Using 300 pixel range - roughly 6 tile widths for reliable room-wide cleave
              const BLADE_FLURRY_RANGE = 300;
              const nearbyEnemy = currentRoom.enemies.find(e =>
                e.id !== targetEnemy.id &&
                e.isAlive &&
                Math.sqrt(Math.pow(e.position.x - player.position.x, 2) + Math.pow(e.position.y - player.position.y, 2)) <= BLADE_FLURRY_RANGE
              );

              if (nearbyEnemy) {
                // Deal 100% of the original damage to the secondary target (full cleave)
                const secondaryDamage = damage;
                nearbyEnemy.stats.health = Math.max(0, nearbyEnemy.stats.health - secondaryDamage);
                const secondaryKilled = nearbyEnemy.stats.health <= 0;
                if (secondaryKilled) {
                  nearbyEnemy.isAlive = false;
                  this.handleEnemyDeath(state, nearbyEnemy, player);
                }

                console.log(`[DEBUG] Blade Flurry hit ${nearbyEnemy.name} for ${secondaryDamage} damage`);

                events.push({
                  sourceId: player.id,
                  targetId: nearbyEnemy.id,
                  damage: secondaryDamage,
                  isCrit: false,
                  killed: secondaryKilled
                });
              }
            }

            // Set cooldown - Blade Flurry doubles attack speed (halves cooldown)
            let attackCooldown = hasBladeFlurry
              ? this.PLAYER_AUTO_ATTACK_COOLDOWN / 2
              : this.PLAYER_AUTO_ATTACK_COOLDOWN;

            // SET EFFECT: Bloodthirst (Bladestorm 4pc) - Each stack gives +10% attack speed
            const bloodthirstBuff = player.buffs.find(b => b.icon === 'set_bloodthirst');
            if (bloodthirstBuff && bloodthirstBuff.stacks) {
              const attackSpeedBonus = bloodthirstBuff.stacks * 0.10; // 10% per stack
              attackCooldown = attackCooldown * (1 - attackSpeedBonus);
            }

            state.tracking.attackCooldowns.set(player.id, attackCooldown);
          }
        }

        // Process enemy AI
        for (const enemy of currentRoom.enemies) {
          if (!enemy.isAlive) continue;
          if (enemy.isHidden) continue; // Ambush enemies don't act until revealed

          // Skip all AI if enemy is stunned (Blind or Judgment)
          const isStunned = enemy.debuffs?.some(d =>
            (d.abilityId === 'rogue_blind' || d.abilityId === 'paladin_judgment') && d.remainingDuration > 0
          );
          if (isStunned) {
            // Stunned enemies can't move or attack
            continue;
          }

          // Calculate slow factor from slow debuffs (reserved for future use)
          const slowFactor = 1.0;

          // Stop patrolling when in combat (players are in the room)
          if (enemy.isPatrolling) {
            enemy.isPatrolling = false;
            enemy.patrolRoute = undefined;
            enemy.patrolTargetRoomId = undefined;
            enemy.patrolWaypoints = undefined;
            // BUG FIX: Mark as ex-patroller for reduced aggro delay
            enemy.wasPatrolling = true;
            // Reset aggro time so enemy has fresh aggro delay (but shorter for patrollers)
            state.tracking.enemyAggroTimes.delete(enemy.id);
            // Reset attack cooldown so enemy doesn't immediately attack
            state.tracking.attackCooldowns.delete(enemy.id);
            console.log(`[DEBUG] Patrolling enemy ${enemy.name} entered combat mode (reduced aggro delay)`);
          }

          // Update enemy attack cooldown
          const enemyCd = state.tracking.attackCooldowns.get(enemy.id) ?? 0;
          if (enemyCd > 0) {
            state.tracking.attackCooldowns.set(enemy.id, Math.max(0, enemyCd - deltaTime));
          }

          // Elite enemy special attack (telegraphed ground effect)
          if (enemy.isElite && !enemy.isBoss) {
            const eliteCd = state.tracking.eliteAttackCooldowns.get(enemy.id) ?? 0;
            if (eliteCd > 0) {
              state.tracking.eliteAttackCooldowns.set(enemy.id, Math.max(0, eliteCd - deltaTime));
            } else {
              // Find nearest player for targeting (only players in current room)
              const roomPadding = 200;
              const alivePlayers = state.players.filter(p => {
                if (!p.isAlive) return false;
                if (p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth')) return false;
                // Check if in current room
                return p.position.x >= currentRoom.x - roomPadding &&
                       p.position.x <= currentRoom.x + currentRoom.width + roomPadding &&
                       p.position.y >= currentRoom.y - roomPadding &&
                       p.position.y <= currentRoom.y + currentRoom.height + roomPadding;
              });
              if (alivePlayers.length > 0) {
                const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                const effectId = uuidv4().slice(0, 8);
                const baseDamage = 8 + state.floor * 2;

                // Create a void zone at player's position (telegraphed attack)
                const groundEffect: GroundEffect = {
                  id: effectId,
                  type: GroundEffectType.VoidZone,
                  position: { ...targetPlayer.position },
                  sourceId: enemy.id,
                  radius: 5, // Starts very small (warning indicator)
                  maxRadius: 70,
                  damage: baseDamage,
                  tickInterval: 0.5,
                  duration: 4,
                  color: '#8844ff' // Purple for elite attacks
                };

                state.groundEffects.push(groundEffect);
                state.tracking.eliteAttackCooldowns.set(enemy.id, this.ELITE_SPECIAL_COOLDOWN);
              }
            }
          }

          // Boss ability casting
          if (enemy.isBoss && enemy.bossId) {
            const bossAbilities = getBossAbilitiesForFloor(enemy.bossId, state.floor);

            // Update boss ability cooldowns
            for (const abilityId of bossAbilities) {
              const cdKey = `${enemy.id}_${abilityId}`;
              const abilityCd = state.tracking.bossAbilityCooldowns.get(cdKey) ?? 0;
              if (abilityCd > 0) {
                state.tracking.bossAbilityCooldowns.set(cdKey, Math.max(0, abilityCd - deltaTime));
              }
            }

            // Try to cast an ability
            for (const abilityId of bossAbilities) {
              const cdKey = `${enemy.id}_${abilityId}`;
              if ((state.tracking.bossAbilityCooldowns.get(cdKey) ?? 0) <= 0) {
                // Find a target player (exclude stealthed players, only in current room)
                const roomPadding = 200;
                const alivePlayers = state.players.filter(p => {
                  if (!p.isAlive) return false;
                  if (p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth')) return false;
                  return p.position.x >= currentRoom.x - roomPadding &&
                         p.position.x <= currentRoom.x + currentRoom.width + roomPadding &&
                         p.position.y >= currentRoom.y - roomPadding &&
                         p.position.y <= currentRoom.y + currentRoom.height + roomPadding;
                });
                if (alivePlayers.length > 0) {
                  const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

                  // Calculate damage based on boss stats and ability
                  const baseDamage = enemy.stats.spellPower * 0.8;
                  const armor = targetPlayer.stats.resist;
                  const reduction = 100 / (100 + armor);
                  const damage = Math.round(baseDamage * reduction);

                  targetPlayer.stats.health = Math.max(0, targetPlayer.stats.health - damage);
                  const killed = targetPlayer.stats.health <= 0;
                  if (killed) {
                    targetPlayer.isAlive = false;
                  }

                  events.push({
                    sourceId: enemy.id,
                    targetId: targetPlayer.id,
                    abilityId: abilityId,
                    damage,
                    isCrit: false,
                    killed
                  });

                  // Set ability cooldown (5-10 seconds depending on ability)
                  const cooldown = 5 + Math.random() * 5;
                  state.tracking.bossAbilityCooldowns.set(cdKey, cooldown);

                  // Only cast one ability per tick
                  break;
                }
              }
            }

            // Boss AoE ability casting (ground effects)
            const aoECdKey = `${enemy.id}_aoe`;
            const aoECd = state.tracking.bossAoECooldowns.get(aoECdKey) ?? 0;

            if (aoECd > 0) {
              state.tracking.bossAoECooldowns.set(aoECdKey, Math.max(0, aoECd - deltaTime));
            } else {
              // Spawn an AoE effect based on boss type and floor (exclude stealthed players, only in current room)
              const roomPadding = 200;
              const alivePlayers = state.players.filter(p => {
                if (!p.isAlive) return false;
                if (p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth')) return false;
                return p.position.x >= currentRoom.x - roomPadding &&
                       p.position.x <= currentRoom.x + currentRoom.width + roomPadding &&
                       p.position.y >= currentRoom.y - roomPadding &&
                       p.position.y <= currentRoom.y + currentRoom.height + roomPadding;
              });
              if (alivePlayers.length > 0) {
                const groundEffect = this.createBossAoEEffect(state, enemy);
                if (groundEffect) {
                  state.groundEffects.push(groundEffect);
                  // Set cooldown based on floor (faster on higher floors)
                  const aoECooldown = Math.max(4, 10 - state.floor * 0.5);
                  state.tracking.bossAoECooldowns.set(aoECdKey, aoECooldown);
                }
              }
            }
          }

          // Check if enemy is taunted by a pet
          const tauntingPet = state.pets.find(p => p.isAlive && enemy.targetId === p.id);

          if (tauntingPet) {
            // Attack the pet instead of players
            const dx = tauntingPet.position.x - enemy.position.x;
            const dy = tauntingPet.position.y - enemy.position.y;
            const distToPet = Math.sqrt(dx * dx + dy * dy);
            const attackRange = enemy.type === 'melee' ? this.MELEE_RANGE : this.RANGED_RANGE;

            if (distToPet <= attackRange) {
              // Check line of sight before attacking pet
              if (!this.hasLineOfSight(state, enemy.position, tauntingPet.position)) {
                // No clear path, move closer with obstacle avoidance
                const moveSpeed = 60 * slowFactor;
                const newPos = this.moveWithObstacleAvoidance(
                  state, enemy.position, tauntingPet.position, moveSpeed, deltaTime
                );
                if (newPos) {
                  enemy.position.x = newPos.x;
                  enemy.position.y = newPos.y;
                }
              } else if ((state.tracking.attackCooldowns.get(enemy.id) ?? 0) <= 0) {
                // Attack the pet
                const isMagic = enemy.type === 'caster';
                const baseDamage = isMagic ? enemy.stats.spellPower : enemy.stats.attackPower;
                const armor = isMagic ? tauntingPet.stats.resist : tauntingPet.stats.armor;
                const reduction = 100 / (100 + armor);
                let damage = Math.round(baseDamage * reduction);

                tauntingPet.stats.health = Math.max(0, tauntingPet.stats.health - damage);
                if (tauntingPet.stats.health <= 0) {
                  tauntingPet.isAlive = false;
                  enemy.targetId = null; // Clear taunt
                }

                events.push({
                  sourceId: enemy.id,
                  targetId: tauntingPet.id,
                  damage,
                  isCrit: false,
                  killed: !tauntingPet.isAlive
                });

                state.tracking.attackCooldowns.set(enemy.id, this.ENEMY_ATTACK_COOLDOWN);
              }
            } else {
              // Move towards pet with obstacle avoidance
              const moveSpeed = 60 * slowFactor;
              const newPos = this.moveWithObstacleAvoidance(
                state, enemy.position, tauntingPet.position, moveSpeed, deltaTime
              );
              if (newPos) {
                enemy.position.x = newPos.x;
                enemy.position.y = newPos.y;
              }
            }
          } else {
            // Normal behavior: find nearest player (exclude stealthed players)
            // Only target players in the current room to prevent cross-room aggro
            let nearestPlayer: Player | null = null;
            let nearestDist = Infinity;

            for (const player of state.players) {
              if (!player.isAlive) continue;
              // Skip stealthed players (Vanish or Stealth)
              const hasStealthBuff = player.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth');
              if (hasStealthBuff) {
                // Log once per second to avoid spam
                if (Math.random() < 0.02) {
                  console.log(`[DEBUG] Enemy ${enemy.name} skipping stealthed player ${player.name} (buffs: ${player.buffs.map(b => b.icon).join(', ')})`);
                }
                continue;
              }

              // Check if player is in the current room (with padding for corridors and room transitions)
              // CORRIDOR_WIDTH is 64, so corridors can be up to 128px wide between rooms
              const roomPadding = 200; // Allow targeting players in corridors (must be > CORRIDOR_WIDTH)
              const inCurrentRoom =
                player.position.x >= currentRoom.x - roomPadding &&
                player.position.x <= currentRoom.x + currentRoom.width + roomPadding &&
                player.position.y >= currentRoom.y - roomPadding &&
                player.position.y <= currentRoom.y + currentRoom.height + roomPadding;

              if (!inCurrentRoom) continue;

              const dx = player.position.x - enemy.position.x;
              const dy = player.position.y - enemy.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestPlayer = player;
              }
            }

            if (!nearestPlayer) {
              // Debug: log why no player was found (20% of the time)
              if (Math.random() < 0.20) {
                const alivePlayers = state.players.filter(p => p.isAlive);
                const stealthedPlayers = state.players.filter(p => p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth'));
                console.log(`[DEBUG] Enemy ${enemy.name} found no target. Alive: ${alivePlayers.length}, Stealthed: ${stealthedPlayers.length}`);
                for (const p of alivePlayers) {
                  const dx = p.position.x - currentRoom.x;
                  const dy = p.position.y - currentRoom.y;
                  const inRoom = dx >= -200 && dx <= currentRoom.width + 200 && dy >= -200 && dy <= currentRoom.height + 200;
                  console.log(`[DEBUG]   Player ${p.name} pos=(${Math.round(p.position.x)},${Math.round(p.position.y)}) room=(${currentRoom.x},${currentRoom.y},${currentRoom.width}x${currentRoom.height}) inRoom=${inRoom}`);
                }
              }
              // No valid target found - this is normal when all players are dead, stealthed, or outside room
              // No player in range - check if enemy should leash back to spawn
              if (enemy.spawnPosition && !enemy.isBoss && !enemy.isPatrolling) {
                const distFromSpawn = Math.sqrt(
                  Math.pow(enemy.position.x - enemy.spawnPosition.x, 2) +
                  Math.pow(enemy.position.y - enemy.spawnPosition.y, 2)
                );

                if (distFromSpawn > this.ENEMY_LEASH_DISTANCE) {
                  // Enemy is far from spawn with no target - start leash timer
                  if (!state.tracking.enemyLeashTimers.has(enemy.id)) {
                    state.tracking.enemyLeashTimers.set(enemy.id, Date.now());
                  } else {
                    const leashStartTime = state.tracking.enemyLeashTimers.get(enemy.id)!;
                    if (Date.now() - leashStartTime >= this.ENEMY_LEASH_RESET_DELAY) {
                      // Leash timer expired - reset enemy to spawn
                      enemy.position.x = enemy.spawnPosition.x;
                      enemy.position.y = enemy.spawnPosition.y;
                      enemy.stats.health = enemy.stats.maxHealth;
                      enemy.targetId = null;
                      state.tracking.enemyAggroTimes.delete(enemy.id);
                      state.tracking.enemyLeashTimers.delete(enemy.id);
                      state.tracking.attackCooldowns.delete(enemy.id);

                      // Return to original room if displaced
                      if (enemy.originalRoomId && enemy.currentRoomId !== enemy.originalRoomId) {
                        const originalRoom = state.dungeon.rooms.find(r => r.id === enemy.originalRoomId);
                        const enemyCurrentRoom = state.dungeon.rooms.find(r => r.enemies.some(e => e.id === enemy.id));
                        if (originalRoom && enemyCurrentRoom) {
                          enemyCurrentRoom.enemies = enemyCurrentRoom.enemies.filter(e => e.id !== enemy.id);
                          originalRoom.enemies.push(enemy);
                          enemy.currentRoomId = enemy.originalRoomId;
                        }
                      }
                      console.log(`[DEBUG] Enemy ${enemy.name} leashed back to spawn`);
                      continue;
                    }
                  }
                } else {
                  // Enemy is close to spawn - clear leash timer
                  state.tracking.enemyLeashTimers.delete(enemy.id);
                }
              }
              continue;
            }

            // Enemy has a target - clear leash timer
            state.tracking.enemyLeashTimers.delete(enemy.id);

            // Debug: log when enemy finds a player (occasionally)
            if (Math.random() < 0.02) {
              console.log(`[DEBUG] Enemy ${enemy.name} found player ${nearestPlayer.name} at dist=${Math.round(nearestDist)}`);
            }

            // Track aggro time when enemy first spots a player
            // FIX: Add staggered aggro delay (0 to 500ms random offset) to prevent all enemies
            // in a room from attacking at exactly the same time after the base 1s delay
            // By setting aggro time slightly in the future, timeSinceAggro starts negative,
            // effectively adding extra delay before the enemy can attack
            if (!state.tracking.enemyAggroTimes.has(enemy.id)) {
              const staggerOffset = Math.random() * 500; // 0-500ms random stagger
              state.tracking.enemyAggroTimes.set(enemy.id, Date.now() + staggerOffset);
            }

            // Get attack range based on enemy type
            const attackRange = enemy.type === 'melee' ? this.MELEE_RANGE : this.RANGED_RANGE;

            if (nearestDist <= attackRange) {
              // Check if player is actually INSIDE the room (not just in padding zone)
              // The padding allows targeting players in corridors, but casters shouldn't shoot through walls
              const playerInRoom =
                nearestPlayer.position.x >= currentRoom.x &&
                nearestPlayer.position.x <= currentRoom.x + currentRoom.width &&
                nearestPlayer.position.y >= currentRoom.y &&
                nearestPlayer.position.y <= currentRoom.y + currentRoom.height;

              // Skip LOS check if:
              // 1. Player is at melee range (close enough that walls don't matter)
              // 2. Player is actually inside the room (rooms are open spaces, no internal walls)
              // Require LOS check if player is in the corridor/padding zone (could be behind a wall)
              const skipLOSCheck = nearestDist <= this.MELEE_RANGE || playerInRoom;

              // Check line of sight before attacking (required for ranged/casters if player outside room)
              if (!skipLOSCheck && !this.hasLineOfSight(state, enemy.position, nearestPlayer.position)) {
                // No clear path, try to move closer with obstacle avoidance
                const moveSpeed = 60 * slowFactor;
                const newPos = this.moveWithObstacleAvoidance(
                  state, enemy.position, nearestPlayer.position, moveSpeed, deltaTime
                );
                if (newPos) {
                  enemy.position.x = newPos.x;
                  enemy.position.y = newPos.y;
                }
              } else if ((state.tracking.attackCooldowns.get(enemy.id) ?? 0) <= 0) {
                // Check aggro delay - enemies can't attack for 1 second after first seeing a player
                // If aggro time is not set, set it now (this ensures enemies always have an aggro time)
                if (!state.tracking.enemyAggroTimes.has(enemy.id)) {
                  state.tracking.enemyAggroTimes.set(enemy.id, Date.now());
                  console.log(`[DEBUG] Enemy ${enemy.name} (${enemy.id}) aggro time set to NOW`);
                }
                const aggroTime = state.tracking.enemyAggroTimes.get(enemy.id)!;
                const timeSinceAggro = (Date.now() - aggroTime) / 1000;
                // BUG FIX: Ex-patrollers get reduced aggro delay (they're already alert)
                const requiredDelay = enemy.wasPatrolling ? this.ENEMY_AGGRO_DELAY_PATROL : this.ENEMY_AGGRO_DELAY;

                if (timeSinceAggro >= requiredDelay) {
                  // Only attack if cooldown is ready, have LOS, and aggro delay has passed
                  console.log(`[DEBUG] Enemy ${enemy.name} (${enemy.id}) ATTACKING player ${nearestPlayer.name}, timeSinceAggro=${timeSinceAggro.toFixed(2)}s`);
                  const result = processEnemyAttack(enemy, nearestPlayer);
                  if (result.events.length === 0) {
                    console.log(`[DEBUG] Enemy ${enemy.name} attack produced NO events! Player buffs: ${nearestPlayer.buffs.map(b => b.icon).join(', ')}`);
                  }
                  events.push(...result.events);
                  state.tracking.attackCooldowns.set(enemy.id, this.ENEMY_ATTACK_COOLDOWN);

                  // Ranged/caster kiting behavior - back away after attacking if player is too close
                  if ((enemy.type === 'ranged' || enemy.type === 'caster') && nearestDist < 120) {
                    // Move away from player
                    const dx = enemy.position.x - nearestPlayer.position.x;
                    const dy = enemy.position.y - nearestPlayer.position.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                      const kiteSpeed = 80;
                      const kiteX = enemy.position.x + (dx / dist) * kiteSpeed * deltaTime;
                      const kiteY = enemy.position.y + (dy / dist) * kiteSpeed * deltaTime;

                      // Check if new position is valid (inside room)
                      const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
                      if (currentRoom) {
                        const padding = 20;
                        if (kiteX >= currentRoom.x + padding &&
                            kiteX <= currentRoom.x + currentRoom.width - padding &&
                            kiteY >= currentRoom.y + padding &&
                            kiteY <= currentRoom.y + currentRoom.height - padding) {
                          enemy.position.x = kiteX;
                          enemy.position.y = kiteY;
                        }
                      }
                    }
                  }

                  // Ancestral Spirit healing - heal when hit if buff is active
                  if (result.events.length > 0 && result.events[0].damage) {
                    const ancestralBuff = nearestPlayer.buffs.find(b => b.icon === 'shaman_ancestral' && (b.stacks ?? 0) > 0);
                    if (ancestralBuff && ancestralBuff.stacks) {
                      const healAmount = 30;
                      nearestPlayer.stats.health = Math.min(nearestPlayer.stats.maxHealth, nearestPlayer.stats.health + healAmount);
                      ancestralBuff.stacks -= 1;

                      // Add heal event for visual feedback
                      events.push({
                        sourceId: nearestPlayer.id,
                        targetId: nearestPlayer.id,
                        heal: healAmount,
                        abilityId: 'shaman_ancestral'
                      });

                      // Remove buff if no stacks left
                      if (ancestralBuff.stacks <= 0) {
                        nearestPlayer.buffs = nearestPlayer.buffs.filter(b => b.icon !== 'shaman_ancestral');
                      }
                    }

                    // Retribution Aura - damage enemy when they hit the paladin
                    const retributionBuff = nearestPlayer.buffs.find(b => b.icon === 'paladin_retribution');
                    if (retributionBuff && enemy.isAlive) {
                      const buffRank = retributionBuff.rank ?? 1;
                      const reflectDamage = 5 + buffRank * 5; // 10/15/20/25/30 damage at ranks 1-5
                      enemy.stats.health = Math.max(0, enemy.stats.health - reflectDamage);

                      // Add damage event for visual feedback
                      events.push({
                        sourceId: nearestPlayer.id,
                        targetId: enemy.id,
                        damage: reflectDamage,
                        abilityId: 'paladin_retribution'
                      });

                      // Check if enemy died from reflect damage
                      if (enemy.stats.health <= 0) {
                        enemy.isAlive = false;
                        this.handleEnemyDeath(state, enemy, nearestPlayer);
                      }
                    }
                  }
                }
              }
            } else {
              // Enemy is outside attack range - need to move closer
              if (Math.random() < 0.02) {
                console.log(`[DEBUG] Enemy ${enemy.name} outside range (dist=${Math.round(nearestDist)}, range=${attackRange}), moving towards ${nearestPlayer.name}`);
              }

              // Check if melee enemy should charge
              const isCharging = state.tracking.enemyCharging.has(enemy.id);
              const chargeCooldown = state.tracking.enemyChargeCooldowns.get(enemy.id) ?? 0;
              const shouldStartCharge =
                enemy.type === 'melee' &&
                !enemy.isBoss &&
                !isCharging &&
                chargeCooldown <= 0 &&
                nearestDist >= this.CHARGE_TRIGGER_DISTANCE &&
                nearestDist <= 400 && // Don't charge from too far
                Math.random() < 0.02; // 2% chance per tick when conditions are met

              if (shouldStartCharge) {
                // Start charging at nearest player
                state.tracking.enemyCharging.set(enemy.id, {
                  targetId: nearestPlayer.id,
                  startTime: Date.now()
                });
              }

              if (isCharging) {
                // Charging - move fast toward target
                const chargeData = state.tracking.enemyCharging.get(enemy.id)!;
                const chargeTarget = state.players.find(p => p.id === chargeData.targetId);

                if (!chargeTarget || !chargeTarget.isAlive) {
                  // Target gone - end charge
                  state.tracking.enemyCharging.delete(enemy.id);
                  state.tracking.enemyChargeCooldowns.set(enemy.id, this.CHARGE_COOLDOWN);
                } else {
                  const newPos = this.moveWithObstacleAvoidance(
                    state, enemy.position, chargeTarget.position, this.CHARGE_SPEED, deltaTime
                  );
                  if (newPos) {
                    enemy.position.x = newPos.x;
                    enemy.position.y = newPos.y;
                  }

                  // Check if reached target
                  const dx = chargeTarget.position.x - enemy.position.x;
                  const dy = chargeTarget.position.y - enemy.position.y;
                  const distToTarget = Math.sqrt(dx * dx + dy * dy);

                  if (distToTarget <= this.MELEE_RANGE) {
                    // Charge impact - deal bonus damage
                    state.tracking.enemyCharging.delete(enemy.id);
                    state.tracking.enemyChargeCooldowns.set(enemy.id, this.CHARGE_COOLDOWN);

                    // Deal charge damage (bonus damage)
                    const isMagic = enemy.type === 'caster';
                    const baseDamage = isMagic ? enemy.stats.spellPower : enemy.stats.attackPower;
                    const armor = isMagic ? chargeTarget.stats.resist : chargeTarget.stats.armor;
                    const reduction = 100 / (100 + armor);
                    let damage = Math.round(baseDamage * this.CHARGE_DAMAGE_BONUS * reduction);

                    chargeTarget.stats.health = Math.max(0, chargeTarget.stats.health - damage);

                    events.push({
                      sourceId: enemy.id,
                      targetId: chargeTarget.id,
                      damage,
                      isCrit: false,
                      killed: chargeTarget.stats.health <= 0
                    });

                    // Check if player died
                    if (chargeTarget.stats.health <= 0) {
                      chargeTarget.isAlive = false;
                    }

                    // Set attack cooldown
                    state.tracking.attackCooldowns.set(enemy.id, this.ENEMY_ATTACK_COOLDOWN);
                  }

                  // Timeout charge after 3 seconds
                  if (Date.now() - chargeData.startTime > 3000) {
                    state.tracking.enemyCharging.delete(enemy.id);
                    state.tracking.enemyChargeCooldowns.set(enemy.id, this.CHARGE_COOLDOWN);
                  }
                }
              } else {
                // Normal movement towards player
                const moveSpeed = 60 * slowFactor;
                const newPos = this.moveWithObstacleAvoidance(
                  state, enemy.position, nearestPlayer.position, moveSpeed, deltaTime
                );
                if (newPos) {
                  enemy.position.x = newPos.x;
                  enemy.position.y = newPos.y;
                } else {
                  // Fallback: Direct movement clamped to current room if no path found
                  const dir = getDirection(enemy.position, nearestPlayer.position);
                  const moveAmount = moveSpeed * deltaTime;
                  const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
                  if (currentRoom) {
                    const padding = 20;
                    const newX = Math.max(currentRoom.x + padding, Math.min(currentRoom.x + currentRoom.width - padding, enemy.position.x + dir.x * moveAmount));
                    const newY = Math.max(currentRoom.y + padding, Math.min(currentRoom.y + currentRoom.height - padding, enemy.position.y + dir.y * moveAmount));
                    enemy.position.x = newX;
                    enemy.position.y = newY;
                  }
                }
              }

              // Update charge cooldown
              if (chargeCooldown > 0) {
                state.tracking.enemyChargeCooldowns.set(enemy.id, chargeCooldown - deltaTime);
              }
            }
          }
        }

        // Process DoT effects on enemies
        for (const enemy of currentRoom.enemies) {
          if (!enemy.isAlive || !enemy.debuffs || enemy.debuffs.length === 0) continue;

          const dotsToRemove: string[] = [];

          for (const dot of enemy.debuffs) {
            // Update remaining duration
            dot.remainingDuration -= deltaTime;

            // Check if it's time to tick (only for damage-dealing DoTs)
            if (dot.damagePerTick > 0) {
              dot.lastTickTime += deltaTime;
              if (dot.lastTickTime >= dot.tickInterval) {
                dot.lastTickTime = 0;

                // Apply damage
                const resist = enemy.stats.resist;
                const reduction = 100 / (100 + resist);
                const damage = Math.round(dot.damagePerTick * reduction);

                enemy.stats.health = Math.max(0, enemy.stats.health - damage);

                // Find the source player for combat event
                const sourcePlayer = state.players.find(p => p.id === dot.sourceId);

                events.push({
                  sourceId: dot.sourceId,
                  targetId: enemy.id,
                  abilityId: dot.abilityId,
                  damage,
                  isCrit: false,
                  killed: enemy.stats.health <= 0
                });

                // Check if enemy died from DoT
                if (enemy.stats.health <= 0) {
                  enemy.isAlive = false;
                  if (sourcePlayer) {
                    this.handleEnemyDeath(state, enemy, sourcePlayer);

                    // Auto-target next closest enemy after DoT kill
                    if (currentRoom) {
                      this.autoTargetClosestEnemy(state, sourcePlayer, currentRoom);
                    }
                  }
                }
              }
            }

            // Mark for removal if expired
            if (dot.remainingDuration <= 0) {
              dotsToRemove.push(dot.id);
            }
          }

          // Remove expired DoTs
          enemy.debuffs = enemy.debuffs.filter(d => !dotsToRemove.includes(d.id));
        }

        // Process pet AI (combat only - attacking enemies in room)
        for (const pet of state.pets) {
          if (!pet.isAlive) continue;

          const owner = state.players.find(p => p.id === pet.ownerId);
          if (!owner || !owner.isAlive) {
            pet.isAlive = false;
            continue;
          }

          // Update pet taunt cooldown
          if (pet.tauntCooldown > 0) {
            pet.tauntCooldown = Math.max(0, pet.tauntCooldown - deltaTime);
          }

          // Periodic taunt - every 5 seconds, taunt all nearby enemies (independent of attacks)
          if (pet.tauntCooldown <= 0) {
            const tauntRange = 350; // Range for periodic taunt
            const tauntedIds: string[] = [];
            for (const enemy of currentRoom.enemies) {
              if (!enemy.isAlive) continue;
              const dx = enemy.position.x - pet.position.x;
              const dy = enemy.position.y - pet.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= tauntRange) {
                enemy.targetId = pet.id;
                tauntedIds.push(enemy.id);
              }
            }
            if (tauntedIds.length > 0) {
              pet.tauntCooldown = 5; // Taunt every 5 seconds
              console.log(`[DEBUG] Pet ${pet.name} taunted enemies in room`);
              // Emit taunt event for visual feedback
              tauntEvents.push({
                sourceId: pet.id,
                sourcePosition: { x: pet.position.x, y: pet.position.y },
                targetIds: tauntedIds
              });
            }
          }

          // Find nearest enemy to attack
          let nearestEnemy: Enemy | null = null;
          let nearestEnemyDist = Infinity;

          for (const enemy of currentRoom.enemies) {
            if (!enemy.isAlive) continue;
            const dx = enemy.position.x - pet.position.x;
            const dy = enemy.position.y - pet.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestEnemyDist) {
              nearestEnemyDist = dist;
              nearestEnemy = enemy;
            }
          }

          // Pet attack range - increased to 300 for ranged attacks, totems have 250 range
          const petAttackRange = pet.petType === 'imp' ? 300 : (pet.petType === 'totem' ? 250 : 200);

          if (nearestEnemy && nearestEnemyDist <= petAttackRange) {
            // Pet attacks (skip line of sight for now - it was blocking attacks)
            const petCd = state.tracking.attackCooldowns.get(pet.id) ?? 0;
            if (petCd <= 0) {
              // Pet auto-attack
              const isMagic = pet.stats.spellPower > pet.stats.attackPower;
              const baseDamage = isMagic ? pet.stats.spellPower : pet.stats.attackPower;
              const armor = isMagic ? nearestEnemy.stats.resist : nearestEnemy.stats.armor;
              const reduction = 100 / (100 + armor);
              let damage = Math.round(baseDamage * reduction);

              const isCrit = Math.random() * 100 < pet.stats.crit;
              if (isCrit) damage = Math.round(damage * 1.5);

              nearestEnemy.stats.health = Math.max(0, nearestEnemy.stats.health - damage);
              const killed = nearestEnemy.stats.health <= 0;
              if (killed) {
                nearestEnemy.isAlive = false;
                this.handleEnemyDeath(state, nearestEnemy, owner);

                // Auto-target next closest enemy for owner after pet kill
                if (currentRoom) {
                  this.autoTargetClosestEnemy(state, owner, currentRoom);
                }
              }

              console.log(`[DEBUG] Pet ${pet.name} attacked ${nearestEnemy.name} for ${damage} damage${isCrit ? ' (CRIT!)' : ''}`);

              events.push({
                sourceId: pet.id,
                targetId: nearestEnemy.id,
                damage,
                isCrit,
                killed
              });

              state.tracking.attackCooldowns.set(pet.id, 1.5); // Pet attacks every 1.5s
            }
          }
        }

        // Check if room is cleared
        if (currentRoom.enemies.every(e => !e.isAlive)) {
          currentRoom.cleared = true;

          // If boss room, generate loot
          let boss = currentRoom.enemies.find(e => e.isBoss);

          // Fallback: If no boss in current room, check ALL rooms for a dead boss
          // This handles edge cases where boss might have moved between rooms
          if (!boss) {
            for (const room of state.dungeon.rooms) {
              const deadBoss = room.enemies.find(e => e.isBoss && !e.isAlive);
              if (deadBoss) {
                boss = deadBoss;
                console.log(`[DEBUG] Found dead boss in room ${room.id} (fallback check)`);
                break;
              }
            }
          }

          if (boss && boss.bossId && !state.dungeon.bossDefeated) {
            state.dungeon.bossDefeated = true;

            // Calculate boss kill time bonus (faster kill = better loot)
            const bossStartTime = state.tracking.bossFightStartTimes.get(boss.id);
            let killTimeBonus = 0;
            if (bossStartTime) {
              const killTimeSeconds = (Date.now() - bossStartTime) / 1000;
              // Bonus tiers: < 30s = +50%, < 60s = +25%, < 90s = +10%
              if (killTimeSeconds < 30) {
                killTimeBonus = 0.5;
                console.log(`[DEBUG] Fast boss kill! (${killTimeSeconds.toFixed(1)}s) - 50% loot bonus`);
              } else if (killTimeSeconds < 60) {
                killTimeBonus = 0.25;
                console.log(`[DEBUG] Quick boss kill! (${killTimeSeconds.toFixed(1)}s) - 25% loot bonus`);
              } else if (killTimeSeconds < 90) {
                killTimeBonus = 0.1;
                console.log(`[DEBUG] Good boss kill! (${killTimeSeconds.toFixed(1)}s) - 10% loot bonus`);
              } else {
                console.log(`[DEBUG] Boss killed in ${killTimeSeconds.toFixed(1)}s - no bonus`);
              }
              state.tracking.bossFightStartTimes.delete(boss.id);
            }

            const lootMap = generateBossLoot(runId, state.floor, boss.bossId, state.players, killTimeBonus);

            // Apply loot to each player - check distance for ground drops
            for (const [pId, drops] of lootMap) {
              const player = state.players.find(p => p.id === pId);
              if (player) {
                const dx = player.position.x - boss.position.x;
                const dy = player.position.y - boss.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                for (const drop of drops) {
                  if (distance <= this.LOOT_PICKUP_DISTANCE) {
                    // Close enough - auto pickup
                    applyLootDrop(player, drop);
                    state.pendingLoot.push(drop);
                  } else {
                    // Too far - drop on ground
                    this.dropItemOnGround(currentRoom, drop, boss.position);
                    console.log(`[DEBUG] Boss loot dropped on ground (distance: ${distance.toFixed(1)})`);
                  }
                }
              }
            }
          }

          // Check for rare mob loot
          const rare = currentRoom.enemies.find(e => e.isRare);
          if (rare) {
            const lootMap = generateRareLoot(runId, state.floor, rare, state.players);
            for (const [pId, drops] of lootMap) {
              const player = state.players.find(p => p.id === pId);
              if (player) {
                const dx = player.position.x - rare.position.x;
                const dy = player.position.y - rare.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                for (const drop of drops) {
                  if (distance <= this.LOOT_PICKUP_DISTANCE) {
                    applyLootDrop(player, drop);
                    state.pendingLoot.push(drop);
                  } else {
                    this.dropItemOnGround(currentRoom, drop, rare.position);
                    console.log(`[DEBUG] Rare loot dropped on ground (distance: ${distance.toFixed(1)})`);
                  }
                }
              }
            }
          }
        }
      }

      // Pet following logic (always runs, even outside combat)
      for (const pet of state.pets) {
        if (!pet.isAlive) continue;

        // Totems are stationary - they don't follow the owner
        if (pet.petType === 'totem') continue;

        const owner = state.players.find(p => p.id === pet.ownerId);
        if (!owner || !owner.isAlive) {
          pet.isAlive = false;
          continue;
        }

        // Pet follows owner
        const ownerDist = Math.sqrt(
          Math.pow(owner.position.x - pet.position.x, 2) +
          Math.pow(owner.position.y - pet.position.y, 2)
        );

        // If too far from owner, move towards them (with collision checking)
        if (ownerDist > 60) {
          const dir = getDirection(pet.position, owner.position);
          const petSpeed = 120; // Slightly faster than player to catch up
          const newX = pet.position.x + dir.x * petSpeed * deltaTime;
          const newY = pet.position.y + dir.y * petSpeed * deltaTime;
          const newPetPos = { x: newX, y: newY };

          if (this.isPositionWalkable(state, newPetPos)) {
            pet.position.x = newX;
            pet.position.y = newY;
          }
        }
      }

      // Update ground effects
      const effectsToRemove: string[] = [];
      for (const effect of state.groundEffects) {
        // Update effect duration
        effect.duration -= deltaTime;
        if (effect.duration <= 0) {
          effectsToRemove.push(effect.id);
          continue;
        }

        // Update effect based on type
        switch (effect.type) {
          case GroundEffectType.ExpandingCircle:
            // Slowly expand the radius
            if (effect.radius < effect.maxRadius) {
              effect.radius += (effect.maxRadius / 3) * deltaTime; // Reach max in 3 seconds
            }
            break;

          case GroundEffectType.MovingWave:
            // Move in the specified direction
            if (effect.direction && effect.speed) {
              effect.position.x += effect.direction.x * effect.speed * deltaTime;
              effect.position.y += effect.direction.y * effect.speed * deltaTime;
            }
            break;

          case GroundEffectType.VoidZone:
            // Slowly grow
            if (effect.radius < effect.maxRadius) {
              effect.radius += (effect.maxRadius / 4) * deltaTime; // Reach max in 4 seconds
            }
            break;

          case GroundEffectType.RotatingBeam:
            // Rotate direction
            if (effect.direction) {
              const rotSpeed = 1.5; // radians per second
              const angle = Math.atan2(effect.direction.y, effect.direction.x);
              const newAngle = angle + rotSpeed * deltaTime;
              effect.direction.x = Math.cos(newAngle);
              effect.direction.y = Math.sin(newAngle);
            }
            break;

          case GroundEffectType.FirePool:
            // Static, just stays in place
            break;

          case GroundEffectType.GravityWell:
            // Slowly grow like void zone
            if (effect.radius < effect.maxRadius) {
              effect.radius += (effect.maxRadius / 3) * deltaTime; // Reach max in 3 seconds
            }
            // Pull players toward center (handled below in damage section)
            break;
        }

        // Damage players standing in the effect
        for (const player of state.players) {
          if (!player.isAlive) continue;

          // Ice Block makes player immune to ALL damage including ground effects
          const hasIceBlock = player.buffs.some(b => b.icon === 'mage_iceblock');
          if (hasIceBlock) continue;

          const dx = player.position.x - effect.position.x;
          const dy = player.position.y - effect.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Special handling for RotatingBeam - only damage players in the beam's path
          // not the entire radius (fixes misleading clock animation)
          let isInEffect = false;
          if (effect.type === GroundEffectType.RotatingBeam && effect.direction) {
            // Beam is a narrow cone in the direction it's pointing
            // Player must be within the beam length AND within a 20-degree cone
            if (dist <= effect.radius && dist > 20) { // Min distance to avoid always hitting at center
              const playerAngle = Math.atan2(dy, dx);
              const beamAngle = Math.atan2(effect.direction.y, effect.direction.x);
              let angleDiff = Math.abs(playerAngle - beamAngle);
              // Normalize angle difference to [0, PI]
              if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
              // 20 degrees = ~0.35 radians - narrow beam
              const beamHalfWidth = 0.35;
              isInEffect = angleDiff <= beamHalfWidth;
            }
          } else {
            // All other effects use circular radius check
            isInEffect = dist <= effect.radius;
          }

          // GravityWell pulls players toward center (even if they're at the edge)
          if (effect.type === GroundEffectType.GravityWell && dist <= effect.radius && dist > 10) {
            // Pull strength increases as you get closer to center (more dramatic effect)
            const pullStrength = 80 + (1 - dist / effect.radius) * 40; // 80-120 units/sec
            const pullX = (-dx / dist) * pullStrength * deltaTime;
            const pullY = (-dy / dist) * pullStrength * deltaTime;
            player.position.x += pullX;
            player.position.y += pullY;
          }

          if (isInEffect) {
            // Check damage tick
            const tickKey = `${effect.id}_${player.id}`;
            const lastTick = state.tracking.groundEffectDamageTicks.get(tickKey) ?? 0;
            const nowMs = Date.now();

            if (nowMs - lastTick >= effect.tickInterval * 1000) {
              // Apply damage
              const resist = player.stats.resist;
              const reduction = 100 / (100 + resist);
              const damage = Math.round(effect.damage * reduction);

              player.stats.health = Math.max(0, player.stats.health - damage);
              const killed = player.stats.health <= 0;
              if (killed) {
                player.isAlive = false;
              }

              events.push({
                sourceId: effect.sourceId,
                targetId: player.id,
                damage,
                isCrit: false,
                killed
              });

              state.tracking.groundEffectDamageTicks.set(tickKey, nowMs);
            }
          }
        }
      }

      // Remove expired effects
      state.groundEffects = state.groundEffects.filter(e => !effectsToRemove.includes(e.id));

      // Process idle patrol for enemies in rooms WITHOUT players
      for (const room of state.dungeon.rooms) {
        if (room.id === state.dungeon.currentRoomId) continue; // Skip current room (handled above)
        if (room.cleared) continue; // Skip cleared rooms

        for (const enemy of room.enemies) {
          if (!enemy.isAlive) continue;

          // Handle patrolling enemies - BUG FIX: Now follows corridor waypoints
          if (enemy.isPatrolling && enemy.patrolWaypoints && enemy.patrolWaypoints.length >= 2) {
            // Initialize waypoint index if not set
            if (enemy.currentWaypointIndex === undefined) {
              enemy.currentWaypointIndex = 0;
            }
            if (enemy.patrolDirection === undefined) {
              enemy.patrolDirection = 1;
            }

            // Get current target waypoint
            const targetWaypoint = enemy.patrolWaypoints[enemy.currentWaypointIndex];
            if (!targetWaypoint) continue;

            // Move toward current waypoint (follows corridor path)
            const dx = targetWaypoint.x - enemy.position.x;
            const dy = targetWaypoint.y - enemy.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const speed = 120; // Patrol speed
            const waypointThreshold = 20; // How close to waypoint before moving to next

            if (dist > waypointThreshold) {
              // Move toward waypoint
              const moveX = (dx / dist) * speed * deltaTime;
              const moveY = (dy / dist) * speed * deltaTime;
              enemy.position.x += moveX;
              enemy.position.y += moveY;
            } else {
              // Reached waypoint - move to next one
              const nextIndex = enemy.currentWaypointIndex + enemy.patrolDirection;

              if (nextIndex >= enemy.patrolWaypoints.length) {
                // Reached end, reverse direction
                enemy.patrolDirection = -1;
                enemy.currentWaypointIndex = enemy.patrolWaypoints.length - 2;
              } else if (nextIndex < 0) {
                // Reached start, reverse direction
                enemy.patrolDirection = 1;
                enemy.currentWaypointIndex = 1;
              } else {
                enemy.currentWaypointIndex = nextIndex;
              }

              // Update current room based on waypoint position
              // Check which room the enemy is now in
              for (const checkRoom of state.dungeon.rooms) {
                if (
                  enemy.position.x >= checkRoom.x &&
                  enemy.position.x <= checkRoom.x + checkRoom.width &&
                  enemy.position.y >= checkRoom.y &&
                  enemy.position.y <= checkRoom.y + checkRoom.height
                ) {
                  if (checkRoom.id !== room.id) {
                    // Move enemy to new room's enemy list
                    room.enemies = room.enemies.filter(e => e.id !== enemy.id);
                    checkRoom.enemies.push(enemy);
                    enemy.currentRoomId = checkRoom.id;
                  }
                  break;
                }
              }
            }
          } else {
            // SIMPLE RULE: Enemies do NOT follow between rooms.
            // When player is not in this room, enemy walks back to spawn.

            // Bosses stay clamped in their room
            if (enemy.isBoss) {
              const padding = 30;
              enemy.position.x = Math.max(room.x + padding, Math.min(room.x + room.width - padding, enemy.position.x));
              enemy.position.y = Math.max(room.y + padding, Math.min(room.y + room.height - padding, enemy.position.y));
              // Bosses also reset to full health when player leaves
              enemy.stats.health = enemy.stats.maxHealth;
              continue;
            }

            // Clear all combat state - player left the room
            state.tracking.enemyAggroTimes.delete(enemy.id);
            state.tracking.attackCooldowns.delete(enemy.id);
            state.tracking.enemyCharging.delete(enemy.id);
            state.tracking.enemyLeashTimers.delete(enemy.id);

            // Get spawn position
            const spawnX = enemy.spawnPosition?.x ?? (room.x + room.width / 2);
            const spawnY = enemy.spawnPosition?.y ?? (room.y + room.height / 2);

            // Calculate distance to spawn
            const dx = spawnX - enemy.position.x;
            const dy = spawnY - enemy.position.y;
            const distToSpawn = Math.sqrt(dx * dx + dy * dy);

            // Walk back to spawn at fast speed (200 units/sec)
            const returnSpeed = 200;
            if (distToSpawn > 5) {
              // Still returning - move towards spawn
              const moveX = (dx / distToSpawn) * returnSpeed * deltaTime;
              const moveY = (dy / distToSpawn) * returnSpeed * deltaTime;
              enemy.position.x += moveX;
              enemy.position.y += moveY;
            } else {
              // Reached spawn - snap to position and heal
              enemy.position.x = spawnX;
              enemy.position.y = spawnY;
              enemy.stats.health = enemy.stats.maxHealth;
            }

            // If enemy was somehow moved to wrong room, return them
            if (enemy.originalRoomId && enemy.originalRoomId !== room.id) {
              const spawnRoom = state.dungeon.rooms.find(r => r.id === enemy.originalRoomId);
              if (spawnRoom) {
                room.enemies = room.enemies.filter(e => e.id !== enemy.id);
                spawnRoom.enemies.push(enemy);
                enemy.currentRoomId = enemy.originalRoomId;
              }
            }
          }
        }
      }

      // Respawn dead players after delay
      for (const player of state.players) {
        if (!player.isAlive) {
          // Track death time if not already tracked
          if (!state.tracking.playerDeathTimes.has(player.id)) {
            // Check for Soulstone buff - instant resurrection at same location
            const soulstoneBuffIndex = player.buffs.findIndex(b => b.icon === 'warlock_soulstone');
            if (soulstoneBuffIndex >= 0) {
              // Consume the soulstone buff
              player.buffs.splice(soulstoneBuffIndex, 1);

              // Resurrect immediately with full HP and half mana
              player.isAlive = true;
              player.stats.health = player.stats.maxHealth;
              player.stats.mana = Math.floor(player.stats.maxMana / 2);
              // Position stays the same (where they died)

              console.log(`[DEBUG] Player ${player.name} resurrected by Soulstone!`);
              continue; // Skip normal death handling
            }

            state.tracking.playerDeathTimes.set(player.id, Date.now());
            player.targetId = null; // Clear target on death

            // Clear all enemy targetIds pointing to this dead player
            for (const room of state.dungeon.rooms) {
              for (const enemy of room.enemies) {
                if (enemy.targetId === player.id) {
                  enemy.targetId = null;
                }
              }
            }

            console.log(`[DEBUG] Player ${player.name} died, starting respawn timer`);
          }

          // Check if respawn delay has passed
          const deathTime = state.tracking.playerDeathTimes.get(player.id)!;
          const timeSinceDeath = Date.now() - deathTime;

          if (timeSinceDeath >= this.RESPAWN_DELAY) {
            // Respawn the player
            player.isAlive = true;
            player.stats.health = player.stats.maxHealth;
            player.stats.mana = player.stats.maxMana;
            player.position = getPlayerSpawnPosition(state.dungeon, state.players.indexOf(player));
            player.targetId = null; // Clear target on respawn
            state.tracking.playerDeathTimes.delete(player.id);

            // Update currentRoomId to start room (where player spawns)
            const startRoom = state.dungeon.rooms.find(r => r.type === 'start');
            if (startRoom) {
              state.dungeon.currentRoomId = startRoom.id;
            }

            // Reset all enemy aggro times so they have a delay before attacking respawned player
            state.tracking.enemyAggroTimes.clear();

            // Reset boss AoE cooldowns so they don't immediately cast on respawned player
            state.tracking.bossAoECooldowns.clear();

            // Return any enemies that followed players back to their original rooms
            // currentRoomId tracks where they moved TO, so if it's set and different from
            // the spawn room (tracked by originalRoomId), move them back
            for (const room of state.dungeon.rooms) {
              const enemiesToRemove: string[] = [];
              for (const enemy of room.enemies) {
                // If enemy followed to this room (has originalRoomId set and different from this room)
                if (enemy.originalRoomId && enemy.originalRoomId !== room.id) {
                  const originalRoom = state.dungeon.rooms.find(r => r.id === enemy.originalRoomId);
                  if (originalRoom && originalRoom !== room) {
                    enemiesToRemove.push(enemy.id);
                    originalRoom.enemies.push(enemy);
                    // Reset enemy position to original room center
                    enemy.position.x = originalRoom.x + originalRoom.width / 2;
                    enemy.position.y = originalRoom.y + originalRoom.height / 2;
                    // Clear the tracking
                    enemy.currentRoomId = enemy.originalRoomId;
                  }
                }
              }
              room.enemies = room.enemies.filter(e => !enemiesToRemove.includes(e.id));
            }

            // Clear any ground effects targeting the respawn area (give player time to move)
            state.groundEffects = state.groundEffects.filter(effect => {
              const dist = Math.sqrt(
                Math.pow(effect.position.x - player.position.x, 2) +
                Math.pow(effect.position.y - player.position.y, 2)
              );
              return dist > 150; // Remove effects within 150px of respawn
            });

            console.log(`[DEBUG] Player ${player.name} respawned after ${timeSinceDeath}ms`);
          }
        }
      }

      this.lastUpdate.set(runId, now);
      updates.set(runId, { state, events, tauntEvents, collectedItems });
    }

    return updates;
  }

  /**
   * Find which room contains the given position
   */
  private findRoomAtPosition(state: RunState, position: Position): import('@dungeon-link/shared').Room | null {
    // First, check if strictly inside any room
    for (const room of state.dungeon.rooms) {
      if (
        position.x >= room.x &&
        position.x <= room.x + room.width &&
        position.y >= room.y &&
        position.y <= room.y + room.height
      ) {
        return room;
      }
    }

    // If not inside any room (in corridor), find the nearest room within padding
    // Use large padding to account for wide corridors (up to 328px)
    const corridorPadding = 200;
    let nearestRoom: import('@dungeon-link/shared').Room | null = null;
    let nearestDist = Infinity;

    for (const room of state.dungeon.rooms) {
      // Check if within corridor padding
      if (
        position.x >= room.x - corridorPadding &&
        position.x <= room.x + room.width + corridorPadding &&
        position.y >= room.y - corridorPadding &&
        position.y <= room.y + room.height + corridorPadding
      ) {
        // Calculate distance to room center
        const roomCenterX = room.x + room.width / 2;
        const roomCenterY = room.y + room.height / 2;
        const dist = Math.sqrt(
          Math.pow(position.x - roomCenterX, 2) +
          Math.pow(position.y - roomCenterY, 2)
        );

        if (dist < nearestDist) {
          nearestDist = dist;
          nearestRoom = room;
        }
      }
    }

    return nearestRoom;
  }

  /**
   * Check if a position is within a walkable area (room or corridor)
   */
  private isPositionWalkable(state: RunState, position: Position): boolean {
    const { rooms } = state.dungeon;

    // Check if inside any room
    for (const room of rooms) {
      if (
        position.x >= room.x &&
        position.x <= room.x + room.width &&
        position.y >= room.y &&
        position.y <= room.y + room.height
      ) {
        return true;
      }
    }

    // Check if inside any corridor between connected rooms
    const corridorWidth = 50; // Width of corridors
    for (const room of rooms) {
      for (const connectedId of room.connectedTo) {
        const other = rooms.find(r => r.id === connectedId);
        if (!other) continue;

        // Only check each corridor once (using ID comparison)
        if (room.id > connectedId) continue;

        // Calculate corridor bounds
        const fromX = room.x + room.width / 2;
        const fromY = room.y + room.height / 2;
        const toX = other.x + other.width / 2;
        const toY = other.y + other.height / 2;

        // Check if position is within the corridor (rectangular approximation)
        const minX = Math.min(fromX, toX) - corridorWidth / 2;
        const maxX = Math.max(fromX, toX) + corridorWidth / 2;
        const minY = Math.min(fromY, toY) - corridorWidth / 2;
        const maxY = Math.max(fromY, toY) + corridorWidth / 2;

        if (
          position.x >= minX &&
          position.x <= maxX &&
          position.y >= minY &&
          position.y <= maxY
        ) {
          // For diagonal corridors, also check distance from line
          const dx = toX - fromX;
          const dy = toY - fromY;
          const length = Math.sqrt(dx * dx + dy * dy);

          if (length > 0) {
            // Calculate perpendicular distance from line
            const t = Math.max(0, Math.min(1,
              ((position.x - fromX) * dx + (position.y - fromY) * dy) / (length * length)
            ));
            const projX = fromX + t * dx;
            const projY = fromY + t * dy;
            const distToLine = Math.sqrt(
              Math.pow(position.x - projX, 2) +
              Math.pow(position.y - projY, 2)
            );

            if (distToLine <= corridorWidth / 2) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Move an entity towards a target with simple obstacle avoidance
   * Returns the new position, or null if no valid move found
   */
  private moveWithObstacleAvoidance(
    state: RunState,
    currentPos: Position,
    targetPos: Position,
    moveSpeed: number,
    deltaTime: number
  ): Position | null {
    const dir = getDirection(currentPos, targetPos);
    const moveAmount = moveSpeed * deltaTime;

    // Try direct movement first
    const directPos = {
      x: currentPos.x + dir.x * moveAmount,
      y: currentPos.y + dir.y * moveAmount
    };

    if (this.isPositionWalkable(state, directPos)) {
      return directPos;
    }

    // Try angled movements (45 degrees left and right)
    const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

    for (const angle of angles) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotatedX = dir.x * cos - dir.y * sin;
      const rotatedY = dir.x * sin + dir.y * cos;

      const angledPos = {
        x: currentPos.x + rotatedX * moveAmount,
        y: currentPos.y + rotatedY * moveAmount
      };

      if (this.isPositionWalkable(state, angledPos)) {
        return angledPos;
      }
    }

    // No valid move found
    return null;
  }

  /**
   * Check if there's line of sight between two positions (not blocked by walls)
   */
  private hasLineOfSight(state: RunState, from: Position, to: Position): boolean {
    // Check multiple points along the line to see if path is walkable
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return true;

    // Check points every 20 units along the path
    const numChecks = Math.max(3, Math.ceil(dist / 20));

    for (let i = 0; i <= numChecks; i++) {
      const t = i / numChecks;
      const checkPos = {
        x: from.x + dx * t,
        y: from.y + dy * t
      };

      if (!this.isPositionWalkable(state, checkPos)) {
        return false;
      }
    }

    return true;
  }

  // Pickup distance constant (increased for better auto-pickup)
  private readonly LOOT_PICKUP_DISTANCE = 100;

  /**
   * Handle enemy death
   */
  private handleEnemyDeath(state: RunState, enemy: Enemy, killer: Player): void {
    // Clear aggro time for dead enemy
    state.tracking.enemyAggroTimes.delete(enemy.id);

    // SET EFFECT: Bloodthirst (Bladestorm 4pc) - Kills grant +10% attack speed for 6s (stacks 3x)
    if (hasSetEffect(killer.equipment, 'bloodthirst')) {
      const existingBuff = killer.buffs.find(b => b.icon === 'set_bloodthirst');
      if (existingBuff) {
        // Stack up to 3x, refresh duration
        existingBuff.stacks = Math.min((existingBuff.stacks ?? 1) + 1, 3);
        existingBuff.duration = 6;
        console.log(`[DEBUG] Bloodthirst stacked to ${existingBuff.stacks}x (+${existingBuff.stacks * 10}% attack speed)`);
      } else {
        killer.buffs.push({
          id: `bloodthirst_${Date.now()}`,
          icon: 'set_bloodthirst',
          name: 'Bloodthirst',
          duration: 6,
          maxDuration: 6,
          isDebuff: false,
          stacks: 1 // Each stack = +10% attack speed
        });
        console.log(`[DEBUG] Bloodthirst activated (+10% attack speed)`);
      }
    }

    // Award XP to killer
    const xpAmount = getEnemyXP(state.floor, enemy.isBoss, enemy.isRare);
    const { leveledUp, levelsGained } = awardXP(killer, xpAmount);
    if (leveledUp) {
      console.log(`[DEBUG] Player ${killer.name} leveled up! Now level ${killer.level} (+${levelsGained} levels)`);
    }

    // Generate normal enemy loot
    if (!enemy.isBoss && !enemy.isRare) {
      const loot = generateEnemyLoot(state.runId, state.floor, enemy, killer);

      // Check distance from killer to enemy
      const dx = killer.position.x - enemy.position.x;
      const dy = killer.position.y - enemy.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);

      for (const drop of loot) {
        if (distance <= this.LOOT_PICKUP_DISTANCE) {
          // Close enough - auto pickup
          applyLootDrop(killer, drop);
          state.pendingLoot.push(drop);
        } else if (currentRoom) {
          // Too far - drop on ground
          this.dropItemOnGround(currentRoom, drop, enemy.position);
        }
      }
    }
  }

  /**
   * Drop an item on the ground
   */
  private dropItemOnGround(room: import('@dungeon-link/shared').Room, drop: LootDrop, position: Position): void {
    if (!room.groundItems) {
      room.groundItems = [];
    }

    // Only drop items and potions (gold is auto-picked up)
    if (drop.type === 'item' && drop.item) {
      const groundItem: GroundItem = {
        id: uuidv4(),
        item: drop.item,
        position: {
          x: position.x + (Math.random() - 0.5) * 30,
          y: position.y + (Math.random() - 0.5) * 30
        },
        droppedAt: Date.now()
      };
      room.groundItems.push(groundItem);
      console.log(`[DEBUG] Dropped item on ground: ${drop.item.name}`);
    } else if (drop.type === 'potion' && drop.potion) {
      const groundItem: GroundItem = {
        id: uuidv4(),
        item: drop.potion,
        position: {
          x: position.x + (Math.random() - 0.5) * 30,
          y: position.y + (Math.random() - 0.5) * 30
        },
        droppedAt: Date.now()
      };
      room.groundItems.push(groundItem);
      console.log(`[DEBUG] Dropped potion on ground`);
    } else if (drop.type === 'gold' && drop.goldAmount) {
      // Gold is always auto-picked up (add to pending loot)
      // Find all players in the room and give them gold
    }
  }

  /**
   * Process ground item pickup for a player
   * Checks ALL rooms for nearby ground items (not just current room)
   */
  private processGroundItemPickup(
    state: RunState,
    player: Player,
    collectedItems: { playerId: string; itemName: string; itemType: 'item' | 'potion' }[]
  ): void {
    // Check all rooms for ground items near the player
    for (const room of state.dungeon.rooms) {
      if (!room.groundItems || room.groundItems.length === 0) continue;

      const itemsToRemove: string[] = [];

      for (const groundItem of room.groundItems) {
        const dx = player.position.x - groundItem.position.x;
        const dy = player.position.y - groundItem.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.LOOT_PICKUP_DISTANCE) {
          // Check if player has backpack space
          if (player.backpack.length < 20) {
            player.backpack.push(groundItem.item);
            itemsToRemove.push(groundItem.id);

            // Track collected item for notification
            const isPotion = 'type' in groundItem.item && 'amount' in groundItem.item;
            collectedItems.push({
              playerId: player.id,
              itemName: groundItem.item.name,
              itemType: isPotion ? 'potion' : 'item'
            });

            console.log(`[DEBUG] Player picked up ground item at distance ${distance.toFixed(1)} from room ${room.id}`);
          } else {
            console.log(`[DEBUG] Backpack full, can't pick up item`);
          }
        }
      }

      // Remove picked up items from this room
      if (itemsToRemove.length > 0) {
        room.groundItems = room.groundItems.filter(
          item => !itemsToRemove.includes(item.id)
        );
      }
    }
  }

  /**
   * Manually pick up a specific ground item by ID (for click-to-pickup)
   * Searches all rooms for the item
   * Returns collected item info for notification, or null if failed
   */
  pickupGroundItem(runId: string, playerId: string, itemId: string): { playerId: string; itemName: string; itemType: 'item' | 'potion' } | null {
    const state = this.runs.get(runId);
    if (!state) {
      console.log(`[DEBUG] pickupGroundItem: run not found`);
      return null;
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) {
      console.log(`[DEBUG] pickupGroundItem: player not found or dead`);
      return null;
    }

    // Search all rooms for the item
    for (const room of state.dungeon.rooms) {
      if (!room.groundItems) continue;

      const groundItem = room.groundItems.find(i => i.id === itemId);
      if (!groundItem) continue;

      // Found the item - check distance
      const dx = player.position.x - groundItem.position.x;
      const dy = player.position.y - groundItem.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 200) { // Max click pickup range (generous)
        console.log(`[DEBUG] Item too far to pick up: ${distance.toFixed(1)}`);
        return null;
      }

      // Check backpack space
      if (player.backpack.length >= 20) {
        console.log(`[DEBUG] Backpack full`);
        return null;
      }

      // Pick up the item
      player.backpack.push(groundItem.item);
      room.groundItems = room.groundItems.filter(i => i.id !== itemId);
      console.log(`[DEBUG] Player clicked to pick up ground item from room ${room.id}`);

      // Return collected item info
      const isPotion = 'type' in groundItem.item && 'amount' in groundItem.item;
      return {
        playerId: player.id,
        itemName: groundItem.item.name,
        itemType: isPotion ? 'potion' : 'item'
      };
    }

    console.log(`[DEBUG] pickupGroundItem: item ${itemId} not found in any room`);
    return null;
  }

  /**
   * Open a chest and get loot
   */
  openChest(runId: string, playerId: string, chestId: string): { lootDescriptions: string[]; isBossRoomChest: boolean; floor: number; isSolo: boolean } | null {
    const state = this.runs.get(runId);
    if (!state) return null;

    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return null;

    // Find the chest in any room
    for (const room of state.dungeon.rooms) {
      if (!room.chests) continue;

      const chest = room.chests.find(c => c.id === chestId);
      if (!chest || chest.isOpen) continue;

      // Check if player is close enough (within 80 pixels)
      const dx = player.position.x - chest.position.x;
      const dy = player.position.y - chest.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 80) {
        console.log(`[DEBUG] Player too far from chest: ${distance}`);
        return null;
      }

      // Check if chest is locked and player has no key
      if (chest.isLocked) {
        // TODO: Check for key in player inventory
        console.log(`[DEBUG] Chest is locked`);
        return null;
      }

      // Check if chest is a mimic (Treasure theme mechanic)
      if (chest.isMimic) {
        // Open the chest to reveal it was a mimic
        chest.isOpen = true;

        // Spawn a mimic enemy at the chest position
        const mimicHealth = 80 + state.floor * 30;
        const mimicDamage = 15 + state.floor * 8;

        const mimicEnemy: Enemy = {
          id: `mimic_${chest.id}`,
          type: EnemyType.Melee,
          name: 'Mimic',
          position: { ...chest.position },
          stats: {
            health: mimicHealth,
            maxHealth: mimicHealth,
            mana: 0,
            maxMana: 0,
            attackPower: mimicDamage,
            spellPower: 0,
            armor: 8 + state.floor * 2,
            crit: 15,
            haste: 10,
            lifesteal: 0,
            resist: 5
          },
          isAlive: true,
          targetId: player.id, // Immediately target the player who opened it
          isBoss: false,
          isRare: true, // Mimics drop rare loot
          debuffs: []
        };

        // Add mimic to the room's enemies
        room.enemies.push(mimicEnemy);

        // Mark room as not cleared so the combat loop processes the mimic
        room.cleared = false;

        console.log(`[DEBUG] Player ${player.name} triggered a MIMIC! Spawned at chest ${chest.id}`);
        return { lootDescriptions: ['IT\'S A MIMIC!'], isBossRoomChest: false, floor: state.floor, isSolo: state.players.length === 1 };
      }

      // Open the chest
      chest.isOpen = true;

      // Generate loot based on tier
      const lootDescriptions: string[] = [];

      // Gold amount based on tier
      const goldAmounts = { common: 20, rare: 50, epic: 100 };
      const baseGold = goldAmounts[chest.lootTier] || 20;
      const goldBonus = Math.floor(Math.random() * (baseGold * 0.5));
      const totalGold = baseGold + goldBonus + state.floor * 5;

      player.gold += totalGold;
      lootDescriptions.push(`${totalGold} gold`);

      // Chance for potion based on tier
      const potionChance = { common: 0.3, rare: 0.5, epic: 0.8 };
      if (Math.random() < (potionChance[chest.lootTier] || 0.3)) {
        const potionType = Math.random() < 0.5 ? PotionType.Health : PotionType.Mana;
        const potion = {
          id: `potion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: potionType === PotionType.Health ? 'Health Potion' : 'Mana Potion',
          type: potionType,
          amount: 30 + state.floor * 5,
          rarity: Rarity.Common
        };
        if (player.backpack.length < 20) {
          player.backpack.push(potion);
          lootDescriptions.push(potion.name);
        }
      }

      // Chance for equipment on rare/epic
      if (chest.lootTier === 'rare' || chest.lootTier === 'epic') {
        const equipChance = chest.lootTier === 'epic' ? 0.8 : 0.4;
        if (Math.random() < equipChance) {
          // Generate a random item using loot system
          const fakeBoss: Enemy = {
            id: `chest_${chest.id}`,
            type: 'melee' as any,
            name: 'Chest',
            position: chest.position,
            stats: { health: 0, maxHealth: 0, mana: 0, maxMana: 0, attackPower: 0, spellPower: 0, armor: 0, crit: 0, haste: 0, lifesteal: 0, resist: 0 },
            isAlive: false,
            targetId: null,
            isBoss: false,
            isRare: chest.lootTier === 'epic',
            debuffs: []
          };
          const lootDrops = generateEnemyLoot(state.runId, state.floor, fakeBoss, player);
          for (const drop of lootDrops) {
            if (drop.item && player.backpack.length < 20) {
              player.backpack.push(drop.item);
              lootDescriptions.push(drop.item.name);
            }
          }
        }
      }

      const isBossRoomChest = room.type === 'boss';
      console.log(`[DEBUG] Player ${player.name} opened ${chest.lootTier} chest: ${lootDescriptions.join(', ')} (boss room: ${isBossRoomChest})`);
      return { lootDescriptions, isBossRoomChest, floor: state.floor, isSolo: state.players.length === 1 };
    }

    return null;
  }

  /**
   * Advance to next floor
   */
  advanceFloor(runId: string): RunState | null {
    const state = this.runs.get(runId);
    if (!state) return null;

    if (!state.dungeon.bossDefeated) return null;

    // Clear all aggro times for new floor
    state.tracking.enemyAggroTimes.clear();

    // Clear boss cooldowns from previous floor (new bosses will get fresh staggered cooldowns)
    state.tracking.bossAbilityCooldowns.clear();
    state.tracking.bossAoECooldowns.clear();

    // Increment floor
    state.floor++;

    // Clear pending loot
    state.pendingLoot = [];

    // Regenerate dungeon
    const avgItemPower = getPartyAverageItemPower(state.players);
    state.dungeon = generateDungeon(
      runId,
      state.floor,
      state.players.length,
      avgItemPower
    );

    // Reset player positions and restore health/mana
    state.players.forEach((player, i) => {
      player.position = getPlayerSpawnPosition(state.dungeon, i);
      player.stats.health = player.stats.maxHealth;
      player.stats.mana = player.stats.maxMana;
      player.isAlive = true;

      // Reset ability cooldowns
      for (const ability of player.abilities) {
        ability.currentCooldown = 0;
      }
    });

    // Recalculate scaling
    state.partyScaling = getPartyScaling(state.players.length, avgItemPower);

    // Spawn vendor in start room for new floor
    this.spawnVendorInStartRoom(state);

    // Apply floor theme buffs to explain environmental effects
    this.applyFloorThemeBuffs(state);

    return state;
  }

  /**
   * Change current room
   */
  changeRoom(runId: string, roomId: string): boolean {
    const state = this.runs.get(runId);
    if (!state) return false;

    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (!currentRoom) return false;

    // Check if room is connected
    if (!currentRoom.connectedTo.includes(roomId)) return false;

    // Check if current room is cleared
    if (!currentRoom.cleared) return false;

    state.dungeon.currentRoomId = roomId;

    // Move all players to new room entrance
    const newRoom = state.dungeon.rooms.find(r => r.id === roomId);
    if (newRoom) {
      state.players.forEach((player, i) => {
        player.position = {
          x: newRoom.x + newRoom.width / 2 + (i - state.players.length / 2) * SPRITE_CONFIG.PLAYER_SIZE * 2,
          y: newRoom.y + newRoom.height / 2
        };
      });
    }

    return true;
  }

  /**
   * Create a new player instance
   */
  private createPlayer(id: string, name: string, classId: ClassName): Player {
    const classData = getClassById(classId);
    if (!classData) {
      throw new Error(`Unknown class: ${classId}`);
    }

    const baselineAbilities = getBaselineAbilities(classId);

    const emptyEquipment: Equipment = {
      [EquipSlot.Head]: null,
      [EquipSlot.Chest]: null,
      [EquipSlot.Legs]: null,
      [EquipSlot.Feet]: null,
      [EquipSlot.Hands]: null,
      [EquipSlot.Weapon]: null,
      [EquipSlot.Ring]: null,
      [EquipSlot.Trinket]: null
    };

    const player: Player = {
      id,
      name,
      classId,
      position: { x: 0, y: 0 },
      stats: { ...classData.baseStats },
      baseStats: { ...classData.baseStats },
      equipment: emptyEquipment,
      abilities: baselineAbilities.map(a => ({
        abilityId: a.id,
        rank: 1,
        currentCooldown: 0
      })),
      gold: 0,
      rerollTokens: 0,
      isAlive: true,
      targetId: null,
      backpack: [],
      buffs: [],
      level: 1,
      xp: 0,
      xpToNextLevel: 100
    };

    // Initialize leveling properly
    initializePlayerLevel(player);

    return player;
  }

  /**
   * Use a potion from backpack
   * Returns the potion type if successful, null otherwise
   */
  useItem(playerId: string, itemId: string): { success: boolean; potionType?: 'health' | 'mana' } {
    const state = this.getPlayerRun(playerId);
    if (!state) return { success: false };

    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return { success: false };

    const itemIndex = player.backpack.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return { success: false };

    const item = player.backpack[itemIndex];

    // Check if it's a potion (has 'amount' property which potions have)
    if ('amount' in item && 'type' in item) {
      const potion = item as import('@dungeon-link/shared').Potion;

      if (potion.type === PotionType.Health) {
        player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + potion.amount);
        // Remove potion from backpack
        player.backpack.splice(itemIndex, 1);
        return { success: true, potionType: 'health' };
      } else if (potion.type === PotionType.Mana) {
        player.stats.mana = Math.min(player.stats.maxMana, player.stats.mana + potion.amount);
        // Remove potion from backpack
        player.backpack.splice(itemIndex, 1);
        return { success: true, potionType: 'mana' };
      }
    }

    return { success: false };
  }

  /**
   * Swap equipment with backpack item
   */
  swapEquipment(playerId: string, backpackIndex: number, slot: EquipSlot): boolean {
    const state = this.getPlayerRun(playerId);
    if (!state) return false;

    const player = state.players.find(p => p.id === playerId);
    if (!player) return false;

    if (backpackIndex < 0 || backpackIndex >= player.backpack.length) return false;

    const backpackItem = player.backpack[backpackIndex];

    // Check if backpack item is an equipment item (not a potion)
    if (!('slot' in backpackItem)) return false;

    const equipItem = backpackItem as import('@dungeon-link/shared').Item;

    // Check if item matches the slot
    if (equipItem.slot !== slot) return false;

    // Swap items
    const currentEquipped = player.equipment[slot];
    player.equipment[slot] = equipItem;

    if (currentEquipped) {
      player.backpack[backpackIndex] = currentEquipped;
    } else {
      player.backpack.splice(backpackIndex, 1);
    }

    // Recalculate stats
    recalculateStats(player);
    return true;
  }

  /**
   * Unequip an item to backpack
   */
  unequipItem(playerId: string, slot: EquipSlot): boolean {
    const state = this.getPlayerRun(playerId);
    if (!state) return false;

    const player = state.players.find(p => p.id === playerId);
    if (!player) return false;

    const equippedItem = player.equipment[slot];
    if (!equippedItem) return false;

    // Check if backpack has space (max 20 items)
    if (player.backpack.length >= 20) return false;

    // Move item to backpack
    player.backpack.push(equippedItem);
    player.equipment[slot] = null;

    // Recalculate stats
    recalculateStats(player);
    return true;
  }

  /**
   * Get available vendor services for a player
   */
  getVendorServices(playerId: string, vendorId: string): VendorService[] | null {
    console.log('[DEBUG] getVendorServices - playerId:', playerId, 'vendorId:', vendorId);
    const state = this.getPlayerRun(playerId);
    if (!state) {
      console.log('[DEBUG] getVendorServices - no state found for player');
      return null;
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      console.log('[DEBUG] getVendorServices - player not found in state');
      return null;
    }

    // Find the vendor in the dungeon (check both trainer and shop vendor)
    let foundVendor: import('@dungeon-link/shared').Vendor | null = null;
    console.log('[DEBUG] getVendorServices - checking', state.dungeon.rooms.length, 'rooms');
    for (const room of state.dungeon.rooms) {
      console.log('[DEBUG] getVendorServices - room', room.id, 'vendor:', room.vendor?.id, 'shopVendor:', room.shopVendor?.id);
      if (room.vendor?.id === vendorId) {
        foundVendor = room.vendor;
        break;
      }
      if (room.shopVendor?.id === vendorId) {
        foundVendor = room.shopVendor;
        break;
      }
    }

    if (!foundVendor) {
      console.log('[DEBUG] getVendorServices - vendor not found in any room');
      return null;
    }

    // Return different services based on vendor type
    let services: VendorService[];
    if (foundVendor.vendorType === 'shop') {
      services = getShopServices(player);
      console.log('[DEBUG] getVendorServices - returning', services.length, 'shop services');
    } else {
      services = getVendorServices(player, state.floor);
      console.log('[DEBUG] getVendorServices - returning', services.length, 'trainer services');
    }
    return services;
  }

  /**
   * Process a service purchase from a vendor
   */
  purchaseService(
    playerId: string,
    vendorId: string,
    serviceType: 'level_up' | 'train_ability' | 'sell_item' | 'sell_all',
    abilityId?: string,
    itemId?: string
  ): { success: boolean; message: string; newGold?: number } {
    const state = this.getPlayerRun(playerId);
    if (!state) return { success: false, message: 'Player not found' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    // Find the vendor (check both trainer and shop vendor)
    let foundVendor: import('@dungeon-link/shared').Vendor | null = null;
    for (const room of state.dungeon.rooms) {
      if (room.vendor?.id === vendorId) {
        foundVendor = room.vendor;
        break;
      }
      if (room.shopVendor?.id === vendorId) {
        foundVendor = room.shopVendor;
        break;
      }
    }

    if (!foundVendor) return { success: false, message: 'Vendor not found' };

    let result: { success: boolean; message: string };

    if (serviceType === 'level_up') {
      result = purchaseLevelUp(player);
    } else if (serviceType === 'train_ability' && abilityId) {
      result = purchaseAbilityTrain(player, abilityId, state.floor);
    } else if (serviceType === 'sell_item' && itemId) {
      const sellResult = sellItem(player, itemId);
      result = { success: sellResult.success, message: sellResult.message };
    } else if (serviceType === 'sell_all') {
      const sellResult = sellAllItems(player);
      result = { success: sellResult.success, message: sellResult.message };
    } else {
      return { success: false, message: 'Invalid service type' };
    }

    return { ...result, newGold: player.gold };
  }

  /**
   * Spawn vendors (trainer, shop, and crypto) in the start room
   */
  private spawnVendorInStartRoom(state: RunState): void {
    console.log('[DEBUG] spawnVendorInStartRoom - rooms:', state.dungeon.rooms.map(r => ({ id: r.id, type: r.type })));
    const startRoom = state.dungeon.rooms.find(r => r.type === 'start');
    console.log('[DEBUG] spawnVendorInStartRoom - startRoom:', startRoom?.id);
    if (startRoom) {
      // Spawn trainer in top-left corner
      if (!startRoom.vendor) {
        startRoom.vendor = createVendor(startRoom, state.floor);
        console.log('[DEBUG] spawnVendorInStartRoom - created trainer:', startRoom.vendor);
      }
      // Spawn shop vendor in top-right corner
      if (!startRoom.shopVendor) {
        startRoom.shopVendor = createShopVendor(startRoom, state.floor);
        console.log('[DEBUG] spawnVendorInStartRoom - created shop vendor:', startRoom.shopVendor);
      }
      // Spawn crypto vendor in bottom-left corner
      if (!startRoom.cryptoVendor) {
        startRoom.cryptoVendor = createCryptoVendor(startRoom, state.floor);
        console.log('[DEBUG] spawnVendorInStartRoom - created crypto vendor:', startRoom.cryptoVendor);
      }
    } else {
      console.log('[DEBUG] spawnVendorInStartRoom - no startRoom found');
    }
  }

  /**
   * Find a valid spawn position near a target position
   */
  private findValidSpawnPosition(state: RunState, targetPos: Position, distance: number = 30): Position {
    // Try positions in a circle around the target
    const offsets = [
      { x: distance, y: 0 },
      { x: -distance, y: 0 },
      { x: 0, y: distance },
      { x: 0, y: -distance },
      { x: distance * 0.7, y: distance * 0.7 },
      { x: -distance * 0.7, y: distance * 0.7 },
      { x: distance * 0.7, y: -distance * 0.7 },
      { x: -distance * 0.7, y: -distance * 0.7 },
    ];

    for (const offset of offsets) {
      const testPos = {
        x: targetPos.x + offset.x,
        y: targetPos.y + offset.y
      };
      if (this.isPositionWalkable(state, testPos)) {
        return testPos;
      }
    }

    // If no valid position found, return target position itself
    return { x: targetPos.x, y: targetPos.y };
  }

  /**
   * Summon a pet for a player
   */
  private summonPet(state: RunState, player: Player, abilityId: string): void {
    // Remove existing pet for this player (only one pet at a time)
    state.pets = state.pets.filter(p => p.ownerId !== player.id);

    // Get ability rank for scaling pet stats
    const playerAbility = player.abilities.find(a => a.abilityId === abilityId);
    const rank = playerAbility?.rank || 1;
    const rankBonus = 1 + (rank - 1) * GAME_CONFIG.RANK_DAMAGE_INCREASE;

    // Find a valid spawn position near the player
    const spawnPosition = this.findValidSpawnPosition(state, player.position, 30);

    // Create pet based on ability
    const petId = uuidv4().slice(0, 8);
    let pet: Pet;

    if (abilityId === 'warlock_summon_imp') {
      const baseHealth = 100 + state.floor * 10;
      const baseAttack = 8 + state.floor * 2;
      const baseSpell = 12 + state.floor * 3;
      pet = {
        id: petId,
        ownerId: player.id,
        name: rank > 1 ? `Imp (Rank ${rank})` : 'Imp',
        position: spawnPosition,
        stats: {
          health: Math.round(baseHealth * rankBonus),
          maxHealth: Math.round(baseHealth * rankBonus),
          mana: 0,
          maxMana: 0,
          attackPower: Math.round(baseAttack * rankBonus),
          spellPower: Math.round(baseSpell * rankBonus),
          armor: 5,
          crit: 5,
          haste: 10,
          lifesteal: 0,
          resist: 5
        },
        isAlive: true,
        targetId: null,
        petType: 'imp',
        tauntCooldown: 0
      };
    } else if (abilityId === 'shaman_totem') {
      // Searing Totem - stationary, attacks nearby enemies, fire damage
      const baseHealth = 30 + state.floor * 5;
      const baseSpell = 10 + state.floor * 3; // Fire damage
      pet = {
        id: petId,
        ownerId: player.id,
        name: rank > 1 ? `Searing Totem (Rank ${rank})` : 'Searing Totem',
        position: spawnPosition,
        stats: {
          health: Math.round(baseHealth * rankBonus),
          maxHealth: Math.round(baseHealth * rankBonus),
          mana: 0,
          maxMana: 0,
          attackPower: 0,
          spellPower: Math.round(baseSpell * rankBonus),
          armor: 0, // Totems are fragile
          crit: 10,
          haste: 20, // Fast attack speed
          lifesteal: 0,
          resist: 0
        },
        isAlive: true,
        targetId: null,
        petType: 'totem',
        tauntCooldown: 999999 // Totems don't taunt
      };
    } else {
      // Default pet
      const baseHealth = 40 + state.floor * 8;
      const baseAttack = 6 + state.floor * 2;
      pet = {
        id: petId,
        ownerId: player.id,
        name: rank > 1 ? `Minion (Rank ${rank})` : 'Minion',
        position: spawnPosition,
        stats: {
          health: Math.round(baseHealth * rankBonus),
          maxHealth: Math.round(baseHealth * rankBonus),
          mana: 0,
          maxMana: 0,
          attackPower: Math.round(baseAttack * rankBonus),
          spellPower: 0,
          armor: 3,
          crit: 3,
          haste: 5,
          lifesteal: 0,
          resist: 3
        },
        isAlive: true,
        targetId: null,
        petType: 'beast',
        tauntCooldown: 0
      };
    }

    state.pets.push(pet);

    // Immediately taunt all nearby enemies in the current room
    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (currentRoom) {
      const tauntRange = 300; // Taunt enemies within 300 units
      for (const enemy of currentRoom.enemies) {
        if (!enemy.isAlive) continue;
        const dx = enemy.position.x - pet.position.x;
        const dy = enemy.position.y - pet.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= tauntRange) {
          enemy.targetId = pet.id;
          console.log(`[DEBUG] Imp taunted ${enemy.name}`);
        }
      }
    }
  }

  /**
   * Apply a DoT effect to an enemy
   */
  private applyDoT(enemy: Enemy, caster: Player, ability: import('@dungeon-link/shared').AbilityDefinition): void {
    // Initialize debuffs array if not present
    if (!enemy.debuffs) {
      enemy.debuffs = [];
    }

    // Remove existing DoT from same ability (refresh)
    enemy.debuffs = enemy.debuffs.filter(d => d.abilityId !== ability.id);

    // Calculate damage per tick based on ability and caster stats
    const baseDamage = ability.baseDamage ?? 0;
    const spellPowerBonus = Math.round(caster.stats.spellPower * 0.3);
    const totalDamage = baseDamage + spellPowerBonus;

    // DoT deals damage over 12 seconds, ticking every 2 seconds (6 ticks)
    const duration = 12;
    const tickInterval = 2;
    const damagePerTick = Math.round(totalDamage / (duration / tickInterval));

    const dot: import('@dungeon-link/shared').DoTEffect = {
      id: `${ability.id}_${Date.now()}`,
      sourceId: caster.id,
      abilityId: ability.id,
      name: ability.name,
      damagePerTick,
      tickInterval,
      remainingDuration: duration,
      lastTickTime: 0 // Will tick immediately on first update
    };

    enemy.debuffs.push(dot);
    console.log(`[DEBUG] Applied DoT ${ability.name} to ${enemy.name}: ${damagePerTick} dmg every ${tickInterval}s for ${duration}s`);
  }

  /**
   * Remove room modifier buffs/debuffs when player leaves a modified room
   */
  private removeRoomModifierBuffs(state: RunState, player: Player, modifier: import('@dungeon-link/shared').RoomModifier): void {
    if (modifier === 'cursed') {
      // Remove curse debuff and restore stats using stored deltas
      const curseIndex = player.buffs.findIndex(b => b.id === 'room_curse');
      if (curseIndex >= 0) {
        const curseBuff = player.buffs[curseIndex];
        player.buffs.splice(curseIndex, 1);

        // Restore stats using the stored deltas (negative values, so subtract to add)
        if (curseBuff.statModifiers) {
          // statModifiers.armor is negative (e.g., -3), so subtracting it adds back
          player.stats.armor -= curseBuff.statModifiers.armor ?? 0;
          player.stats.resist -= curseBuff.statModifiers.resist ?? 0;
        }
        console.log(`[MODIFIER] Removed curse debuff from ${player.name}, restored armor/resist`);
      }
    } else if (modifier === 'blessed') {
      // Remove bless buff using stored deltas
      const blessIndex = player.buffs.findIndex(b => b.id === 'room_bless');
      if (blessIndex >= 0) {
        const blessBuff = player.buffs[blessIndex];
        player.buffs.splice(blessIndex, 1);

        // Remove stat boost using stored deltas (positive values, so subtract)
        if (blessBuff.statModifiers) {
          player.stats.armor = Math.max(0, player.stats.armor - (blessBuff.statModifiers.armor ?? 0));
          player.stats.crit = Math.max(0, player.stats.crit - (blessBuff.statModifiers.crit ?? 0));
        }
        console.log(`[MODIFIER] Removed blessed buff from ${player.name}`);
      }
    }
    // 'burning' and 'dark' don't have persistent buffs to remove
  }

  /**
   * Apply floor theme buff/debuff to explain the floor's environmental effects
   * Called when starting a new run or advancing to a new floor
   */
  private applyFloorThemeBuffs(state: RunState): void {
    const theme = state.dungeon.theme;

    // Floor theme buff IDs for removal
    const floorThemeBuffIds = ['floor_inferno', 'floor_frozen', 'floor_swamp', 'floor_shadow', 'floor_treasure'];

    for (const player of state.players) {
      // Remove any existing floor theme buffs first
      player.buffs = player.buffs.filter(b => !floorThemeBuffIds.includes(b.id));

      // Apply theme-specific buff based on current floor theme
      switch (theme) {
        case FloorTheme.Inferno:
          player.buffs.push({
            id: 'floor_inferno',
            name: 'Inferno',
            icon: 'fire',
            duration: 999999,
            maxDuration: 999999,
            isDebuff: true,
            statModifiers: {} // No stat change, just informational
          });
          break;

        case FloorTheme.Frozen:
          player.buffs.push({
            id: 'floor_frozen',
            name: 'Frozen Ground',
            icon: 'frost',
            duration: 999999,
            maxDuration: 999999,
            isDebuff: true,
            statModifiers: {} // Movement modifier handled separately
          });
          break;

        case FloorTheme.Swamp:
          player.buffs.push({
            id: 'floor_swamp',
            name: 'Toxic Swamp',
            icon: 'poison',
            duration: 999999,
            maxDuration: 999999,
            isDebuff: true,
            statModifiers: {}
          });
          break;

        case FloorTheme.Shadow:
          player.buffs.push({
            id: 'floor_shadow',
            name: 'Darkness',
            icon: 'shadow',
            duration: 999999,
            maxDuration: 999999,
            isDebuff: true,
            statModifiers: {}
          });
          break;

        case FloorTheme.Treasure:
          player.buffs.push({
            id: 'floor_treasure',
            name: 'Treasure Vault',
            icon: 'gold',
            duration: 999999,
            maxDuration: 999999,
            isDebuff: false, // This is a positive indicator
            statModifiers: {}
          });
          break;

        // FloorTheme.Crypt is standard - no buff needed
      }
    }

    if (theme !== FloorTheme.Crypt) {
      console.log(`[THEME] Applied ${theme} floor theme buff to all players`);
    }
  }

  /**
   * Auto-target the closest enemy when entering a new room
   */
  private autoTargetClosestEnemy(state: RunState, player: Player, room: import('@dungeon-link/shared').Room): void {
    if (!player.isAlive) return;

    // Find the closest alive enemy in the room (prefer enemies with line of sight)
    let closestEnemyWithLOS: Enemy | null = null;
    let closestDistWithLOS = Infinity;
    let closestEnemyAny: Enemy | null = null;
    let closestDistAny = Infinity;

    for (const enemy of room.enemies) {
      if (!enemy.isAlive) continue;
      if (enemy.isHidden) continue; // Skip hidden enemies (ambush rooms)

      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Track closest enemy regardless of LOS
      if (dist < closestDistAny) {
        closestDistAny = dist;
        closestEnemyAny = enemy;
      }

      // Track closest enemy with line of sight
      if (this.hasLineOfSight(state, player.position, enemy.position) && dist < closestDistWithLOS) {
        closestDistWithLOS = dist;
        closestEnemyWithLOS = enemy;
      }
    }

    // Prefer enemy with LOS, fall back to any enemy
    const targetEnemy = closestEnemyWithLOS ?? closestEnemyAny;
    if (targetEnemy) {
      player.targetId = targetEnemy.id;
      console.log(`[DEBUG] Auto-targeted ${targetEnemy.name} for player ${player.name}${closestEnemyWithLOS ? ' (has LOS)' : ' (no LOS)'}`);
    }
  }

  /**
   * Create a boss AoE effect based on boss type
   */
  private createBossAoEEffect(state: RunState, boss: Enemy): GroundEffect | null {
    const effectId = uuidv4().slice(0, 8);
    const baseDamage = 5 + state.floor * 3; // Scales with floor

    // Pick a random alive player to target
    const now = Date.now();
    const alivePlayers = state.players.filter(p => {
      if (!p.isAlive) return false;
      // Exclude stealthed players (vanish or stealth)
      if (p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth')) return false;
      // Check if boss has aggro (has been in combat)
      const aggroTime = state.tracking.enemyAggroTimes.get(boss.id);
      if (!aggroTime) return false; // Boss hasn't aggroed yet
      return (now - aggroTime) >= this.ENEMY_AGGRO_DELAY * 1000;
    });
    // If no players pass the filter, just target any alive non-stealthed player
    const fallbackPlayers = state.players.filter(p => p.isAlive && !p.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth'));
    const targetablePlayers = alivePlayers.length > 0 ? alivePlayers : fallbackPlayers;
    if (targetablePlayers.length === 0) return null;
    const targetPlayer = targetablePlayers[Math.floor(Math.random() * targetablePlayers.length)];

    // Different effects based on boss ID
    const bossEffects: Record<string, () => GroundEffect> = {
      // Skeleton King - bone storm expanding circle
      'boss_skeleton_king': () => ({
        id: effectId,
        type: GroundEffectType.ExpandingCircle,
        position: { ...boss.position },
        sourceId: boss.id,
        radius: 20,
        maxRadius: 150,
        damage: baseDamage,
        tickInterval: 0.5,
        duration: 4,
        color: '#aaaaaa'
      }),

      // Spider - poison pool at player location
      'boss_giant_spider': () => ({
        id: effectId,
        type: GroundEffectType.FirePool,
        position: { ...targetPlayer.position },
        sourceId: boss.id,
        radius: 60,
        maxRadius: 60,
        damage: baseDamage * 0.8,
        tickInterval: 1,
        duration: 6,
        color: '#44ff44'
      }),

      // Orc Warlord - moving shockwave
      'boss_orc_warlord': () => {
        const angle = Math.atan2(
          targetPlayer.position.y - boss.position.y,
          targetPlayer.position.x - boss.position.x
        );
        return {
          id: effectId,
          type: GroundEffectType.MovingWave,
          position: { ...boss.position },
          sourceId: boss.id,
          radius: 40,
          maxRadius: 40,
          damage: baseDamage * 1.2,
          tickInterval: 0.3,
          duration: 3,
          direction: { x: Math.cos(angle), y: Math.sin(angle) },
          speed: 120,
          color: '#cc6600'
        };
      },

      // Lich - frost tomb void zone
      'boss_lich': () => ({
        id: effectId,
        type: GroundEffectType.VoidZone,
        position: { ...targetPlayer.position },
        sourceId: boss.id,
        radius: 10,
        maxRadius: 80,
        damage: baseDamage * 0.9,
        tickInterval: 0.8,
        duration: 5,
        color: '#6699ff'
      }),

      // Dragon - fire breath in cone (simulated as moving wave)
      'boss_dragon': () => {
        const angle = Math.atan2(
          targetPlayer.position.y - boss.position.y,
          targetPlayer.position.x - boss.position.x
        );
        return {
          id: effectId,
          type: GroundEffectType.MovingWave,
          position: { ...boss.position },
          sourceId: boss.id,
          radius: 50,
          maxRadius: 50,
          damage: baseDamage * 1.5,
          tickInterval: 0.4,
          duration: 2.5,
          direction: { x: Math.cos(angle), y: Math.sin(angle) },
          speed: 180,
          color: '#ff4400'
        };
      },

      // Void Lord - gravity well that pulls players in (stay at edges!)
      'boss_void_lord': () => ({
        id: effectId,
        type: GroundEffectType.GravityWell,
        position: { ...boss.position }, // Centered on boss
        sourceId: boss.id,
        radius: 30,
        maxRadius: 140, // Large pull area
        damage: baseDamage * 0.8, // Lower damage but pull is dangerous
        tickInterval: 0.5,
        duration: 5,
        color: '#4422aa' // Dark purple swirl
      }),

      // Titan - massive expanding slam
      'boss_titan': () => ({
        id: effectId,
        type: GroundEffectType.ExpandingCircle,
        position: { ...boss.position },
        sourceId: boss.id,
        radius: 30,
        maxRadius: 200,
        damage: baseDamage * 1.3,
        tickInterval: 0.4,
        duration: 3.5,
        color: '#ffcc00'
      }),

      // Old God - rotating chaos beam
      'boss_old_god': () => ({
        id: effectId,
        type: GroundEffectType.RotatingBeam,
        position: { ...boss.position },
        sourceId: boss.id,
        radius: 120, // Long beam
        maxRadius: 120,
        damage: baseDamage * 1.4,
        tickInterval: 0.3,
        duration: 5,
        direction: { x: 1, y: 0 },
        speed: 0,
        color: '#ff00ff'
      })
    };

    // Get the effect creator for this boss
    const createEffect = bossEffects[boss.bossId || ''];
    if (createEffect) {
      return createEffect();
    }

    // Default effect for unknown bosses - fire pool
    return {
      id: effectId,
      type: GroundEffectType.FirePool,
      position: { ...targetPlayer.position },
      sourceId: boss.id,
      radius: 50,
      maxRadius: 50,
      damage: baseDamage,
      tickInterval: 1,
      duration: 4,
      color: '#ff6600'
    };
  }

  // Track trap damage cooldowns to prevent rapid damage
  private trapDamageCooldowns: Map<string, number> = new Map();

  private updateTraps(state: RunState, deltaTime: number): void {
    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (!currentRoom?.traps) return;

    for (const trap of currentRoom.traps) {
      if (trap.cooldown > 0) {
        trap.cooldown -= deltaTime;
        if (trap.cooldown <= 0) {
          // Toggle trap state
          trap.isActive = !trap.isActive;
          trap.cooldown = trap.isActive ? trap.activeDuration : trap.inactiveDuration;
        }
      }
    }
  }

  private checkTrapCollisions(state: RunState, player: Player, events: CombatEvent[]): void {
    if (!player.isAlive) return;

    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (!currentRoom?.traps) return;

    const now = Date.now();

    for (const trap of currentRoom.traps) {
      if (!trap.isActive) continue;

      // Check cooldown for this player-trap combination
      const cooldownKey = `${player.id}_${trap.id}`;
      const lastDamage = this.trapDamageCooldowns.get(cooldownKey) || 0;
      if (now - lastDamage < 1000) continue; // 1 second damage cooldown

      let inTrap = false;

      if (trap.type === TrapType.Spikes) {
        // Spike trap - circular area
        const dx = player.position.x - trap.position.x;
        const dy = player.position.y - trap.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        inTrap = distance < 30; // 30px radius
      } else if (trap.type === TrapType.Flamethrower) {
        // Flamethrower - rectangular area in direction
        const flameLength = 100;
        const flameWidth = 30;

        // Calculate flame area based on direction
        let minX = trap.position.x;
        let maxX = trap.position.x;
        let minY = trap.position.y;
        let maxY = trap.position.y;

        switch (trap.direction) {
          case 'up':
            minY -= flameLength;
            minX -= flameWidth / 2;
            maxX += flameWidth / 2;
            break;
          case 'down':
            maxY += flameLength;
            minX -= flameWidth / 2;
            maxX += flameWidth / 2;
            break;
          case 'left':
            minX -= flameLength;
            minY -= flameWidth / 2;
            maxY += flameWidth / 2;
            break;
          case 'right':
            maxX += flameLength;
            minY -= flameWidth / 2;
            maxY += flameWidth / 2;
            break;
        }

        inTrap = player.position.x >= minX && player.position.x <= maxX &&
                 player.position.y >= minY && player.position.y <= maxY;
      }

      if (inTrap) {
        // Deal damage
        const damage = trap.damage;
        player.stats.health = Math.max(0, player.stats.health - damage);
        this.trapDamageCooldowns.set(cooldownKey, now);

        // Create combat event for visual feedback
        events.push({
          sourceId: trap.id,
          targetId: player.id,
          damage: damage,
          isCrit: false,
          killed: player.stats.health <= 0
        });

        // Check for player death
        if (player.stats.health <= 0) {
          player.isAlive = false;
          player.targetId = null;
        }
      }
    }
  }

  // Track theme hazard damage cooldowns (playerId -> last damage time)
  private themeHazardCooldowns: Map<string, number> = new Map();

  /**
   * Check and apply theme-specific hazard damage
   * - Inferno: Constant environmental fire damage
   * - Swamp: Poison DoT that stacks
   */
  private checkThemeHazards(state: RunState, player: Player, events: CombatEvent[], deltaTime: number): void {
    if (!player.isAlive) return;

    const theme = state.dungeon.theme;
    const modifiers = state.dungeon.themeModifiers;
    const now = Date.now();

    // Only Inferno has hazard damage (Swamp/Marsh does NOT have continuous damage)
    if (theme !== FloorTheme.Inferno) return;

    // Check cooldown (5 seconds between hazard ticks - very generous)
    const lastDamage = this.themeHazardCooldowns.get(player.id) || 0;
    if (now - lastDamage < 5000) return;

    // Calculate hazard damage based on theme (heavily capped)
    const baseHazardDamage = modifiers.hazardDamage || 0;
    // Cap damage at 8% of player max health (very low)
    const maxDamage = Math.floor(player.stats.maxHealth * 0.08);
    let hazardDamage = Math.min(baseHazardDamage, maxDamage);
    // Minimum damage of 3 so it's noticeable
    hazardDamage = Math.max(3, hazardDamage);
    let hazardSource = 'hazard';

    // Inferno: very occasional heat damage (8% chance per check)
    // Balanced: 5 second cooldown, 8% chance = ~once every 60 seconds on average
    if (Math.random() < 0.08) {
      hazardSource = 'lava_burn';
      // Deal damage
      player.stats.health = Math.max(0, player.stats.health - hazardDamage);
      this.themeHazardCooldowns.set(player.id, now);

      events.push({
        sourceId: hazardSource,
        targetId: player.id,
        damage: hazardDamage,
        isCrit: false,
        killed: player.stats.health <= 0
      });

      if (player.stats.health <= 0) {
        player.isAlive = false;
        player.targetId = null;
      }
    }

    // NOTE: Swamp/Marsh theme intentionally has NO continuous damage
    // The swamp hazards are visual/atmospheric only
  }
}

// Singleton instance
export const gameStateManager = new GameStateManager();
