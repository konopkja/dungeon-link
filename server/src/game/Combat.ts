import { Player, Enemy, CombatEvent, Stats, Position, Buff } from '@dungeon-link/shared';
import { GAME_CONFIG } from '@dungeon-link/shared';
import { getAbilityById } from '../data/classes.js';
import { scaleAbilityDamage } from '../data/scaling.js';

export interface CombatResult {
  events: CombatEvent[];
  targetDied: boolean;
}

/**
 * Process a basic attack from one entity to another
 */
export function processBasicAttack(
  attacker: { id: string; stats: Stats },
  target: { id: string; stats: Stats; isAlive: boolean },
  isMagic: boolean = false
): CombatResult {
  const events: CombatEvent[] = [];

  if (!target.isAlive) {
    return { events, targetDied: false };
  }

  // Calculate damage
  const baseDamage = isMagic ? attacker.stats.spellPower : attacker.stats.attackPower;
  const armor = isMagic ? target.stats.resist : target.stats.armor;

  // Armor reduction formula: damage * (100 / (100 + armor))
  const reduction = 100 / (100 + armor);
  let damage = Math.round(baseDamage * reduction);

  // Crit check
  const isCrit = Math.random() * 100 < attacker.stats.crit;
  if (isCrit) {
    damage = Math.round(damage * GAME_CONFIG.CRIT_DAMAGE_MULTIPLIER);
  }

  // Apply damage
  target.stats.health = Math.max(0, target.stats.health - damage);

  // Check for death
  const killed = target.stats.health <= 0;
  if (killed) {
    target.isAlive = false;
  }

  // Lifesteal
  if (attacker.stats.lifesteal > 0) {
    const healAmount = Math.round(damage * (attacker.stats.lifesteal / 100));
    attacker.stats.health = Math.min(attacker.stats.maxHealth, attacker.stats.health + healAmount);
  }

  events.push({
    sourceId: attacker.id,
    targetId: target.id,
    damage,
    isCrit,
    killed
  });

  return { events, targetDied: killed };
}

/**
 * Process an ability cast
 */
export function processAbilityCast(
  caster: Player,
  targetEntity: Player | Enemy | null,
  abilityId: string,
  targetPosition?: Position
): CombatResult {
  const events: CombatEvent[] = [];

  // Find ability definition and player's rank
  const abilityInfo = getAbilityById(abilityId);
  if (!abilityInfo) {
    return { events, targetDied: false };
  }

  const playerAbility = caster.abilities.find(a => a.abilityId === abilityId);
  if (!playerAbility) {
    return { events, targetDied: false };
  }

  // Check cooldown
  if (playerAbility.currentCooldown > 0) {
    return { events, targetDied: false };
  }

  // Check mana
  const ability = abilityInfo.ability;
  if (caster.stats.mana < ability.manaCost) {
    return { events, targetDied: false };
  }

  // For damage abilities, require a valid target before consuming mana
  if (ability.type === 'damage') {
    if (!targetEntity || !('isAlive' in targetEntity) || !targetEntity.isAlive) {
      // No valid target - don't waste mana
      return { events, targetDied: false };
    }
  }

  // For debuff abilities, also require a valid target
  if (ability.type === 'debuff') {
    if (!targetEntity || !('isAlive' in targetEntity) || !targetEntity.isAlive) {
      return { events, targetDied: false };
    }
  }

  // Deduct mana and start cooldown
  caster.stats.mana -= ability.manaCost;
  playerAbility.currentCooldown = ability.cooldown;

  // Calculate scaled damage/heal based on rank
  const rank = playerAbility.rank;

  let targetDied = false;

  // Process based on ability type
  switch (ability.type) {
    case 'damage': {
      if (!targetEntity || !('isAlive' in targetEntity) || !targetEntity.isAlive) break;

      const baseDamage = ability.baseDamage ?? 0;
      const scaledDamage = scaleAbilityDamage(baseDamage, rank);

      // Use spell power or attack power based on caster class
      const powerStat = ability.baseDamage && caster.stats.spellPower > caster.stats.attackPower
        ? caster.stats.spellPower
        : caster.stats.attackPower;

      // Ability damage = scaled base + power stat contribution
      let totalDamage = scaledDamage + Math.round(powerStat * 0.5);

      // Stealth bonus: 100% extra damage for Sinister Strike (rogue_stab) from rogue_stealth
      // Note: 50% bonus from rogue_vanish is already handled in auto-attack code
      const isFromStealth = caster.buffs.some(b => b.icon === 'rogue_stealth');
      let isStealthAttack = false;
      if (isFromStealth && abilityId === 'rogue_stab') {
        totalDamage = Math.round(totalDamage * 2); // 100% bonus = 2x damage
        isStealthAttack = true;
        console.log(`[DEBUG] Sinister Strike from stealth! Double damage: ${totalDamage}`);
        // Remove stealth buff after attack
        caster.buffs = caster.buffs.filter(b => b.icon !== 'rogue_stealth');
      }

      // COMBO: Pyroblast + Fireball - 50% extra damage on stunned targets
      const hasPyroStun = 'debuffs' in targetEntity &&
        targetEntity.debuffs.some(d => d.abilityId === 'mage_pyroblast' && d.remainingDuration > 0);
      if (hasPyroStun && abilityId === 'mage_fireball') {
        totalDamage = Math.round(totalDamage * 1.5); // 50% bonus damage
        console.log(`[DEBUG] Fireball COMBO! Target stunned by Pyroblast - 50% bonus damage: ${totalDamage}`);
      }

      // COMBO: Judgment + Crusader Strike - 50% extra damage + 30% self heal
      const hasJudgmentStun = 'debuffs' in targetEntity &&
        targetEntity.debuffs.some(d => d.abilityId === 'paladin_judgment' && d.remainingDuration > 0);
      let judgmentComboHeal = 0;
      if (hasJudgmentStun && abilityId === 'paladin_strike') {
        totalDamage = Math.round(totalDamage * 1.5); // 50% bonus damage
        console.log(`[DEBUG] Crusader Strike COMBO! Target stunned by Judgment - 50% bonus damage: ${totalDamage}`);
      }

      // Apply armor/resist reduction
      const armor = caster.stats.spellPower > caster.stats.attackPower
        ? targetEntity.stats.resist
        : targetEntity.stats.armor;

      const reduction = 100 / (100 + armor);
      let finalDamage = Math.round(totalDamage * reduction);

      // Crit check
      const isCrit = Math.random() * 100 < caster.stats.crit;
      if (isCrit) {
        finalDamage = Math.round(finalDamage * GAME_CONFIG.CRIT_DAMAGE_MULTIPLIER);
      }

      targetEntity.stats.health = Math.max(0, targetEntity.stats.health - finalDamage);

      if (targetEntity.stats.health <= 0) {
        targetEntity.isAlive = false;
        targetDied = true;
      }

      // Lifesteal on ability damage
      if (caster.stats.lifesteal > 0) {
        const healAmount = Math.round(finalDamage * (caster.stats.lifesteal / 100));
        caster.stats.health = Math.min(caster.stats.maxHealth, caster.stats.health + healAmount);
      }

      // COMBO: Judgment + Crusader Strike self-heal (30% of damage dealt)
      if (hasJudgmentStun && abilityId === 'paladin_strike') {
        judgmentComboHeal = Math.round(finalDamage * 0.3);
        caster.stats.health = Math.min(caster.stats.maxHealth, caster.stats.health + judgmentComboHeal);
        console.log(`[DEBUG] Crusader Strike COMBO! Self-heal: ${judgmentComboHeal}`);
      }

      // Special handling for Drain Life - heals caster based on damage dealt
      let drainHealAmount = 0;
      if (ability.baseHeal && ability.baseHeal > 0) {
        const scaledHeal = scaleAbilityDamage(ability.baseHeal, rank);
        drainHealAmount = scaledHeal + Math.round(caster.stats.spellPower * 0.3);
        caster.stats.health = Math.min(caster.stats.maxHealth, caster.stats.health + drainHealAmount);
        console.log(`[DEBUG] Drain Life healed caster for ${drainHealAmount}`);
      }

      // Calculate total heal to show (Drain Life or Judgment combo)
      const totalHealToShow = drainHealAmount > 0 ? drainHealAmount : (judgmentComboHeal > 0 ? judgmentComboHeal : undefined);

      events.push({
        sourceId: caster.id,
        targetId: targetEntity.id,
        abilityId,
        damage: finalDamage,
        heal: totalHealToShow,
        isCrit,
        isStealthAttack,
        killed: targetDied
      });

      // Pyroblast applies a 3 second stun to enemies
      if (abilityId === 'mage_pyroblast' && 'debuffs' in targetEntity && targetEntity.isAlive) {
        const stunDuration = 3;
        const stunDebuff = {
          id: `pyroblast_stun_${Date.now()}_${targetEntity.id}`,
          sourceId: caster.id,
          abilityId: 'mage_pyroblast',
          name: 'Pyroblast Stun',
          damagePerTick: 0,
          tickInterval: 1,
          remainingDuration: stunDuration,
          lastTickTime: Date.now() / 1000,
          isStun: true // Flag for stun effect
        };
        // Remove existing stun and add new one
        targetEntity.debuffs = targetEntity.debuffs.filter(d => d.abilityId !== 'mage_pyroblast');
        targetEntity.debuffs.push(stunDebuff);
        console.log(`[DEBUG] Pyroblast stunned ${targetEntity.name} for ${stunDuration}s`);
      }
      break;
    }

    case 'heal': {
      // Only heal players, not enemies - check if target has 'isBoss' property (enemies have it)
      let healTarget: Player;
      if (targetEntity && !('isBoss' in targetEntity) && 'classId' in targetEntity) {
        // Target is a player
        healTarget = targetEntity as Player;
      } else {
        // No valid target or target is enemy - heal self
        healTarget = caster;
      }

      if (!healTarget.isAlive) break;

      const baseHeal = ability.baseHeal ?? 0;
      const scaledHeal = scaleAbilityDamage(baseHeal, rank); // Same scaling function

      // Heal = scaled base + spell power contribution
      const totalHeal = scaledHeal + Math.round(caster.stats.spellPower * 0.5);

      healTarget.stats.health = Math.min(
        healTarget.stats.maxHealth,
        healTarget.stats.health + totalHeal
      );

      events.push({
        sourceId: caster.id,
        targetId: healTarget.id,
        abilityId,
        heal: totalHeal
      });
      break;
    }

    case 'buff': {
      // Apply buff to target player (or self if no valid target)
      let buffTarget: Player;
      if (targetEntity && !('isBoss' in targetEntity) && 'classId' in targetEntity) {
        buffTarget = targetEntity as Player;
      } else {
        buffTarget = caster;
      }

      // Define base buff durations (some abilities scale with rank)
      const buffDurations: Record<string, number> = {
        'paladin_blessing': 8,      // Blessing of Protection
        'paladin_retribution': 999999, // Retribution Aura - permanent passive, reflects damage
        'warrior_shield': 6,        // Shield Wall
        'warrior_bloodlust': 8 + rank * 2, // Bloodlust - 8/10/12/14/16s duration, heal scales with rank
        'warrior_retaliation': 10,  // Retaliation - reflect damage
        'warlock_soulstone': 10,    // Soulstone - resurrect on death
        'mage_ice_barrier': 8,      // Ice Barrier
        'mage_iceblock': 5,         // Ice Block
        'rogue_evasion': 6,         // Evasion
        'rogue_bladeflurry': 15,    // Blade Flurry
        'rogue_vanish': 4 + rank,   // Vanish - 4/5/6/7/8s stealth, drop aggro
        'rogue_stealth': 8 + rank * 2, // Stealth - 8/10/12/14/16s, 100% bonus damage on Sinister Strike
        'shaman_ancestral': 6 + rank * 2, // Ancestral Spirit - 6/8/10/12/14s, heals when hit
      };
      const duration = buffDurations[abilityId] ?? 10;

      // Handle Meditation - instant mana restore, no buff needed
      if (abilityId === 'mage_meditation') {
        // 50% base + 5% per rank (50/55/60/65/70% at ranks 1-5)
        const manaPercent = 0.50 + (rank - 1) * 0.05;
        const manaRestore = Math.round(buffTarget.stats.maxMana * manaPercent);
        buffTarget.stats.mana = Math.min(buffTarget.stats.maxMana, buffTarget.stats.mana + manaRestore);

        events.push({
          sourceId: caster.id,
          targetId: buffTarget.id,
          abilityId,
          manaRestore
        });
        console.log(`[DEBUG] Meditation restored ${manaRestore} mana (${Math.round(manaPercent * 100)}%) to ${buffTarget.name}`);
        break;
      }

      // Create the buff with rank info for scaling effects
      const buff: Buff = {
        id: `${abilityId}_${Date.now()}`,
        name: ability.name,
        icon: abilityId,
        duration,
        maxDuration: duration,
        isDebuff: false,
        stacks: abilityId === 'shaman_ancestral' ? (2 + rank) : undefined, // Ancestral Spirit: 3/4/5/6/7 charges
        rank // Store rank for effects that scale (like Bloodlust healing)
      };

      // Remove existing buff of same ability if present (refresh duration)
      // Only remove the exact same buff, not all buffs from the same class
      buffTarget.buffs = buffTarget.buffs.filter(b => b.icon !== abilityId);

      // Add the new buff
      buffTarget.buffs.push(buff);

      events.push({
        sourceId: caster.id,
        targetId: buffTarget.id,
        abilityId
      });
      break;
    }

    case 'debuff': {
      // Apply debuff effects to target
      if (targetEntity && 'debuffs' in targetEntity && targetEntity.isAlive) {
        // Handle Blind (rogue_blind) - stun scales with rank: 8/10/12/14/16 seconds
        if (abilityId === 'rogue_blind') {
          const blindDuration = 6 + rank * 2; // 8/10/12/14/16s at ranks 1-5
          const blindDebuff = {
            id: `blind_${Date.now()}`,
            sourceId: caster.id,
            abilityId: 'rogue_blind',
            name: 'Blind',
            damagePerTick: 0, // Stun, no damage
            tickInterval: 1,
            remainingDuration: blindDuration,
            lastTickTime: Date.now() / 1000
          };
          // Remove existing blind if present and add new one
          targetEntity.debuffs = targetEntity.debuffs.filter(d => d.abilityId !== 'rogue_blind');
          targetEntity.debuffs.push(blindDebuff);
        }
      }

      events.push({
        sourceId: caster.id,
        targetId: targetEntity?.id ?? caster.id,
        abilityId
      });
      break;
    }

    case 'summon':
    case 'utility': {
      // For prototype, these just trigger the event
      events.push({
        sourceId: caster.id,
        targetId: targetEntity?.id ?? caster.id,
        abilityId
      });
      break;
    }
  }

  return { events, targetDied };
}

/**
 * Process AoE damage on a single target (no mana/cooldown checks)
 * Used after the first target to avoid re-checking mana/cooldown
 */
export function processAoEDamageOnTarget(
  caster: Player,
  targetEntity: Enemy,
  abilityId: string,
  rank: number
): CombatResult {
  const events: CombatEvent[] = [];
  let targetDied = false;

  const abilityInfo = getAbilityById(abilityId);
  if (!abilityInfo || !targetEntity.isAlive) {
    return { events, targetDied: false };
  }

  const ability = abilityInfo.ability;

  // Only handle damage type abilities for AoE
  if (ability.type !== 'damage') {
    return { events, targetDied: false };
  }

  const baseDamage = ability.baseDamage ?? 0;
  const scaledDamage = scaleAbilityDamage(baseDamage, rank);

  // Use spell power or attack power based on caster class
  const powerStat = ability.baseDamage && caster.stats.spellPower > caster.stats.attackPower
    ? caster.stats.spellPower
    : caster.stats.attackPower;

  // Ability damage = scaled base + power stat contribution
  const totalDamage = scaledDamage + Math.round(powerStat * 0.5);

  // Apply armor/resist reduction
  const armor = caster.stats.spellPower > caster.stats.attackPower
    ? targetEntity.stats.resist
    : targetEntity.stats.armor;

  const reduction = 100 / (100 + armor);
  let finalDamage = Math.round(totalDamage * reduction);

  // Crit check
  const isCrit = Math.random() * 100 < caster.stats.crit;
  if (isCrit) {
    finalDamage = Math.round(finalDamage * GAME_CONFIG.CRIT_DAMAGE_MULTIPLIER);
  }

  targetEntity.stats.health = Math.max(0, targetEntity.stats.health - finalDamage);

  if (targetEntity.stats.health <= 0) {
    targetEntity.isAlive = false;
    targetDied = true;
  }

  events.push({
    sourceId: caster.id,
    targetId: targetEntity.id,
    abilityId,
    damage: finalDamage,
    isCrit,
    killed: targetDied
  });

  // Judgment also stuns all targets - duration scales with rank: 2/3/4/5/6 seconds
  if (abilityId === 'paladin_judgment' && targetEntity.isAlive) {
    const stunDuration = 1 + rank; // 2/3/4/5/6s at ranks 1-5
    const stunDebuff = {
      id: `judgment_stun_${Date.now()}_${targetEntity.id}`,
      sourceId: caster.id,
      abilityId: 'paladin_judgment',
      name: 'Judgment',
      damagePerTick: 0, // Stun, no damage
      tickInterval: 1,
      remainingDuration: stunDuration,
      lastTickTime: Date.now() / 1000
    };
    // Remove existing judgment stun if present and add new one
    targetEntity.debuffs = targetEntity.debuffs.filter(d => d.abilityId !== 'paladin_judgment');
    targetEntity.debuffs.push(stunDebuff);
  }

  // Hellfire applies a burning DoT (half of initial damage over 4 seconds)
  if (abilityId === 'warlock_hellfire' && targetEntity.isAlive) {
    const dotTotalDamage = Math.round(finalDamage * 0.5); // Half of initial damage
    const dotDamagePerTick = Math.round(dotTotalDamage / 4); // 4 ticks over 4 seconds
    const hellfireDoT = {
      id: `hellfire_dot_${Date.now()}_${targetEntity.id}`,
      sourceId: caster.id,
      abilityId: 'warlock_hellfire',
      name: 'Hellfire Burn',
      damagePerTick: dotDamagePerTick,
      tickInterval: 1,
      remainingDuration: 4,
      lastTickTime: Date.now() / 1000
    };
    // Remove existing hellfire DoT if present and add new one
    targetEntity.debuffs = targetEntity.debuffs.filter(d => d.abilityId !== 'warlock_hellfire');
    targetEntity.debuffs.push(hellfireDoT);
    console.log(`[DEBUG] Applied Hellfire DoT to ${targetEntity.name}: ${dotDamagePerTick} dmg/tick for 4s`);
  }

  return { events, targetDied };
}

/**
 * Process enemy AI attack
 */
export function processEnemyAttack(
  enemy: Enemy,
  target: Player
): CombatResult & { reflectedDamage?: number } {
  if (!enemy.isAlive || !target.isAlive) {
    return { events: [], targetDied: false };
  }

  // Check for stealth buffs - stealthed players cannot be attacked
  const isStealthed = target.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth');
  if (isStealthed) {
    console.log(`[DEBUG] Enemy ${enemy.name} cannot attack stealthed player ${target.name}`);
    return { events: [], targetDied: false };
  }

  // Check for Ice Block - immune to ALL damage
  const hasIceBlock = target.buffs.some(b => b.icon === 'mage_iceblock');
  if (hasIceBlock) {
    console.log(`[DEBUG] Ice Block made ${target.name} immune to attack from ${enemy.name}`);
    return { events: [], targetDied: false };
  }

  // Check for Blessing of Protection - immune to physical damage
  const hasBlessing = target.buffs.some(b => b.icon === 'paladin_blessing');
  const isPhysicalAttack = enemy.type !== 'caster';

  if (hasBlessing && isPhysicalAttack) {
    // Physical damage blocked by Blessing of Protection - no damage event
    console.log(`[DEBUG] Blessing of Protection blocked physical attack from ${enemy.name}`);
    return { events: [], targetDied: false };
  }

  const result = processBasicAttack(enemy, target, enemy.type === 'caster');

  // Check for Power Word: Shield - absorbs damage before health
  // Check for Shield Wall buff - reduces all damage by 50%
  const hasShieldWall = target.buffs.some(b => b.icon === 'warrior_shield');
  if (hasShieldWall && result.events.length > 0 && result.events[0].damage) {
    const originalDamage = result.events[0].damage;
    const reducedDamage = Math.round(originalDamage * 0.5);
    const damageReduction = originalDamage - reducedDamage;

    // Restore health that was already subtracted, then apply reduced damage
    target.stats.health = Math.min(target.stats.maxHealth, target.stats.health + damageReduction);

    // Update the event to show reduced damage
    result.events[0].damage = reducedDamage;
    result.events[0].blocked = (result.events[0].blocked ?? 0) + damageReduction; // Track blocked amount for UI

    console.log(`[DEBUG] Shield Wall reduced damage from ${originalDamage} to ${reducedDamage}`);
  }

  // Check for Retaliation buff - reflect damage back to attacker
  const hasRetaliation = target.buffs.some(b => b.icon === 'warrior_retaliation');
  if (hasRetaliation && result.events.length > 0 && result.events[0].damage) {
    const reflectedDamage = result.events[0].damage;
    enemy.stats.health = Math.max(0, enemy.stats.health - reflectedDamage);

    if (enemy.stats.health <= 0) {
      enemy.isAlive = false;
    }

    // Add reflected damage event
    result.events.push({
      sourceId: target.id,
      targetId: enemy.id,
      damage: reflectedDamage,
      isCrit: false,
      killed: !enemy.isAlive
    });

    return { ...result, reflectedDamage };
  }

  return result;
}

/**
 * Update ability cooldowns (call every tick)
 */
export function updateCooldowns(player: Player, deltaTime: number): void {
  for (const ability of player.abilities) {
    if (ability.currentCooldown > 0) {
      ability.currentCooldown = Math.max(0, ability.currentCooldown - deltaTime);
    }
  }
}

/**
 * Regenerate mana over time
 */
export function regenerateMana(player: Player, deltaTime: number): void {
  const regenRate = 2; // 2 mana per second base
  const regenAmount = regenRate * deltaTime;
  player.stats.mana = Math.min(player.stats.maxMana, player.stats.mana + regenAmount);
}

/**
 * Check if entity is in range of another
 */
export function isInRange(
  source: Position,
  target: Position,
  range: number
): boolean {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= range;
}

/**
 * Get direction from source to target
 */
export function getDirection(source: Position, target: Position): { x: number; y: number } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: 0, y: 0 };

  return { x: dx / length, y: dy / length };
}
