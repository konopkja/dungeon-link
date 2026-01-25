import { ClassDefinition, ClassName, AbilityType, TargetType, AbilityDefinition } from './types.js';

export const CLASSES: ClassDefinition[] = [
  // ============================================
  // WARRIOR - Melee damage dealer, high armor
  // ============================================
  {
    id: ClassName.Warrior,
    name: 'Warrior',
    description: 'A mighty melee fighter who excels in close combat.',
    color: '#c79c6e',
    baseStats: {
      health: 150, maxHealth: 150, mana: 50, maxMana: 50,
      attackPower: 15, spellPower: 0, armor: 28, crit: 5, haste: 0, lifesteal: 0, resist: 8
    },
    abilities: [
      {
        id: 'warrior_strike', name: 'Heroic Strike', description: 'A powerful melee attack.',
        classId: ClassName.Warrior, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 10, baseDamage: 25, range: 50, isBaseline: true
      },
      {
        id: 'warrior_bloodlust', name: 'Bloodlust', description: 'Enter a bloodthirsty rage, healing for a percentage of damage dealt. Duration and healing % scale with rank.',
        classId: ClassName.Warrior, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 60, manaCost: 5, range: 0, isBaseline: true
      },
      {
        id: 'warrior_whirlwind', name: 'Whirlwind', description: 'Spin and hit all nearby enemies with devastating force.',
        classId: ClassName.Warrior, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 6, manaCost: 25, baseDamage: 60, range: 80, isBaseline: false
      },
      {
        id: 'warrior_retaliation', name: 'Retaliation', description: 'For 10 seconds, reflect all damage taken back to attackers.',
        classId: ClassName.Warrior, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 60, manaCost: 5, range: 0, isBaseline: false
      },
      {
        id: 'warrior_shield', name: 'Shield Wall', description: 'Reduce damage taken temporarily.',
        classId: ClassName.Warrior, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 30, manaCost: 5, range: 0, isBaseline: false
      }
    ]
  },

  // ============================================
  // PALADIN - Holy warrior, healer/tank hybrid
  // ============================================
  {
    id: ClassName.Paladin,
    name: 'Paladin',
    description: 'A holy warrior who can heal allies and smite enemies.',
    color: '#f58cba',
    baseStats: {
      health: 140, maxHealth: 140, mana: 80, maxMana: 80,
      attackPower: 12, spellPower: 8, armor: 24, crit: 5, haste: 0, lifesteal: 0, resist: 12
    },
    abilities: [
      {
        id: 'paladin_strike', name: 'Crusader Strike', description: 'A holy-infused melee attack.',
        classId: ClassName.Paladin, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 12, baseDamage: 22, range: 50, isBaseline: true
      },
      {
        id: 'paladin_light', name: 'Flash of Light', description: 'Quickly heal an ally.',
        classId: ClassName.Paladin, type: AbilityType.Heal, targetType: TargetType.Ally,
        cooldown: 2, manaCost: 20, baseHeal: 30, range: 200, isBaseline: true
      },
      {
        id: 'paladin_judgment', name: 'Judgment', description: 'Call down holy judgment on all enemies in the room, dealing damage and stunning them. Stun duration scales with rank.',
        classId: ClassName.Paladin, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 40, manaCost: 10, baseDamage: 20, range: 400, isBaseline: false
      },
      {
        id: 'paladin_blessing', name: 'Blessing of Protection', description: 'Make an ally immune to physical damage.',
        classId: ClassName.Paladin, type: AbilityType.Buff, targetType: TargetType.Ally,
        cooldown: 45, manaCost: 5, range: 200, isBaseline: false
      },
      {
        id: 'paladin_retribution', name: 'Retribution Aura', description: 'Activate a holy aura that damages all enemies who attack you. Damage scales with rank.',
        classId: ClassName.Paladin, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 0, manaCost: 0, baseDamage: 10, range: 0, isBaseline: false
      }
    ]
  },

  // ============================================
  // HUNTER - Ranged physical damage, pets
  // ============================================
  {
    id: ClassName.Hunter,
    name: 'Hunter',
    description: 'A master of ranged combat and beast companions.',
    color: '#abd473',
    baseStats: {
      health: 90, maxHealth: 90, mana: 70, maxMana: 70,
      attackPower: 14, spellPower: 0, armor: 10, crit: 10, haste: 5, lifesteal: 0, resist: 5
    },
    abilities: [
      {
        id: 'hunter_shot', name: 'Arcane Shot', description: 'Fire an arcane-infused arrow.',
        classId: ClassName.Hunter, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 10, baseDamage: 20, range: 350, isBaseline: true
      },
      {
        id: 'hunter_multishot', name: 'Multi-Shot', description: 'Fire arrows at multiple enemies.',
        classId: ClassName.Hunter, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 6, manaCost: 20, baseDamage: 15, range: 300, isBaseline: true
      },
      {
        id: 'hunter_aimed', name: 'Aimed Shot', description: 'A carefully aimed shot dealing high damage.',
        classId: ClassName.Hunter, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 8, manaCost: 25, baseDamage: 40, range: 400, isBaseline: false
      },
      {
        id: 'hunter_trap', name: 'Explosive Trap', description: 'Place a trap that explodes when triggered.',
        classId: ClassName.Hunter, type: AbilityType.Damage, targetType: TargetType.Ground,
        cooldown: 15, manaCost: 25, baseDamage: 35, range: 100, isBaseline: false
      },
      {
        id: 'hunter_aspect', name: 'Aspect of the Hawk', description: 'Increase attack power.',
        classId: ClassName.Hunter, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 0, manaCost: 15, range: 0, isBaseline: false
      }
    ]
  },

  // ============================================
  // ROGUE - Stealth, high burst damage
  // ============================================
  {
    id: ClassName.Rogue,
    name: 'Rogue',
    description: 'A stealthy assassin who strikes from the shadows.',
    color: '#fff569',
    baseStats: {
      health: 85, maxHealth: 85, mana: 60, maxMana: 60,
      attackPower: 16, spellPower: 0, armor: 8, crit: 15, haste: 10, lifesteal: 0, resist: 0
    },
    abilities: [
      {
        id: 'rogue_stab', name: 'Sinister Strike', description: 'A quick dagger strike.',
        classId: ClassName.Rogue, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 8, baseDamage: 18, range: 50, isBaseline: true
      },
      {
        id: 'rogue_stealth', name: 'Stealth', description: 'Enter stealth (out of combat only). Your next Sinister Strike deals 100% bonus damage. Duration scales with rank.',
        classId: ClassName.Rogue, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 10, manaCost: 5, range: 0, isBaseline: true
      },
      {
        id: 'rogue_blind', name: 'Blind', description: 'Throw blinding powder at an enemy, stunning them. Stun duration scales with rank.',
        classId: ClassName.Rogue, type: AbilityType.Debuff, targetType: TargetType.Enemy,
        cooldown: 30, manaCost: 5, range: 200, isBaseline: false
      },
      {
        id: 'rogue_vanish', name: 'Vanish', description: 'Disappear from combat, entering stealth and dropping aggro. Your next attack deals 50% bonus damage. Duration scales with rank.',
        classId: ClassName.Rogue, type: AbilityType.Utility, targetType: TargetType.Self,
        cooldown: 30, manaCost: 5, range: 0, isBaseline: false
      },
      {
        id: 'rogue_bladeflurry', name: 'Blade Flurry', description: 'Double your attack speed and hit an additional nearby target with each attack.',
        classId: ClassName.Rogue, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 20, manaCost: 5, range: 0, isBaseline: false
      }
    ]
  },

  // ============================================
  // PRIEST - Healer, holy/shadow magic
  // ============================================
  {
    id: ClassName.Priest,
    name: 'Priest',
    description: 'A master of holy and shadow magic.',
    color: '#ffffff',
    baseStats: {
      health: 75, maxHealth: 75, mana: 120, maxMana: 120,
      attackPower: 0, spellPower: 15, armor: 5, crit: 5, haste: 5, lifesteal: 0, resist: 15
    },
    abilities: [
      {
        id: 'priest_smite', name: 'Smite', description: 'Blast an enemy with holy light.',
        classId: ClassName.Priest, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 12, baseDamage: 22, range: 300, isBaseline: true
      },
      {
        id: 'priest_heal', name: 'Heal', description: 'Restore health to an ally.',
        classId: ClassName.Priest, type: AbilityType.Heal, targetType: TargetType.Ally,
        cooldown: 2, manaCost: 25, baseHeal: 40, range: 250, isBaseline: true
      },
      {
        id: 'priest_shadowword', name: 'Shadow Word: Pain', description: 'Afflict the target with shadow damage over time.',
        classId: ClassName.Priest, type: AbilityType.Debuff, targetType: TargetType.Enemy,
        cooldown: 8, manaCost: 20, baseDamage: 30, range: 300, isBaseline: false
      },
      {
        id: 'priest_shield', name: 'Power Word: Shield', description: 'Shield an ally absorbing damage.',
        classId: ClassName.Priest, type: AbilityType.Buff, targetType: TargetType.Ally,
        cooldown: 12, manaCost: 5, baseHeal: 35, range: 250, isBaseline: false
      },
      {
        id: 'priest_holynova', name: 'Holy Nova', description: 'Burst of holy energy damaging enemies and healing allies.',
        classId: ClassName.Priest, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 10, manaCost: 35, baseDamage: 18, baseHeal: 15, range: 120, isBaseline: false
      }
    ]
  },

  // ============================================
  // SHAMAN - Elemental caster, totems, some healing
  // ============================================
  {
    id: ClassName.Shaman,
    name: 'Shaman',
    description: 'An elemental spellcaster who commands the forces of nature.',
    color: '#0070de',
    baseStats: {
      health: 95, maxHealth: 95, mana: 100, maxMana: 100,
      attackPower: 8, spellPower: 12, armor: 12, crit: 8, haste: 5, lifesteal: 0, resist: 10
    },
    abilities: [
      {
        id: 'shaman_chainlight', name: 'Chain Lightning', description: 'Unleash lightning that chains through all enemies in the room.',
        classId: ClassName.Shaman, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 0, manaCost: 12, baseDamage: 11, range: 400, isBaseline: true
      },
      {
        id: 'shaman_wave', name: 'Healing Wave', description: 'Heal an ally with water magic.',
        classId: ClassName.Shaman, type: AbilityType.Heal, targetType: TargetType.Ally,
        cooldown: 3, manaCost: 25, baseHeal: 35, range: 250, isBaseline: true
      },
      {
        id: 'shaman_ancestral', name: 'Ancestral Spirit', description: 'Summon ancestral protection. Heals you for 30 HP each time you are hit. Duration and number of charges scale with rank.',
        classId: ClassName.Shaman, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 20, manaCost: 20, baseHeal: 30, range: 0, isBaseline: false
      },
      {
        id: 'shaman_earthshock', name: 'Earth Shock', description: 'Shock an enemy with earth magic, interrupting.',
        classId: ClassName.Shaman, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 5, manaCost: 18, baseDamage: 20, range: 150, isBaseline: false
      },
      {
        id: 'shaman_totem', name: 'Searing Totem', description: 'Summon a totem that attacks nearby enemies.',
        classId: ClassName.Shaman, type: AbilityType.Summon, targetType: TargetType.Ground,
        cooldown: 15, manaCost: 25, baseDamage: 8, range: 100, isBaseline: false
      }
    ]
  },

  // ============================================
  // MAGE - High burst magic damage, utility
  // ============================================
  {
    id: ClassName.Mage,
    name: 'Mage',
    description: 'A master of arcane, fire, and frost magic.',
    color: '#69ccf0',
    baseStats: {
      health: 70, maxHealth: 70, mana: 130, maxMana: 130,
      attackPower: 0, spellPower: 18, armor: 3, crit: 10, haste: 5, lifesteal: 0, resist: 10
    },
    abilities: [
      {
        id: 'mage_fireball', name: 'Fireball', description: 'Hurl a ball of fire at the enemy.',
        classId: ClassName.Mage, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 15, baseDamage: 30, range: 350, isBaseline: true
      },
      {
        id: 'mage_frostbolt', name: 'Frostbolt', description: 'Launch a bolt of frost, slowing the target.',
        classId: ClassName.Mage, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 12, baseDamage: 22, range: 350, isBaseline: true
      },
      {
        id: 'mage_blizzard', name: 'Blizzard', description: 'Call down a blizzard on an area.',
        classId: ClassName.Mage, type: AbilityType.Damage, targetType: TargetType.Ground,
        cooldown: 12, manaCost: 40, baseDamage: 15, range: 350, isBaseline: false
      },
      {
        id: 'mage_pyroblast', name: 'Pyroblast', description: 'Massive fireball dealing huge damage.',
        classId: ClassName.Mage, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 15, manaCost: 45, baseDamage: 60, range: 350, isBaseline: false
      },
      {
        id: 'mage_iceblock', name: 'Ice Block', description: 'Encase yourself in ice, becoming immune.',
        classId: ClassName.Mage, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 60, manaCost: 5, range: 0, isBaseline: false
      }
    ]
  },

  // ============================================
  // WARLOCK - DoTs, demons, dark magic
  // ============================================
  {
    id: ClassName.Warlock,
    name: 'Warlock',
    description: 'A dark spellcaster who commands demons and curses.',
    color: '#9482c9',
    baseStats: {
      health: 80, maxHealth: 80, mana: 110, maxMana: 110,
      attackPower: 0, spellPower: 16, armor: 5, crit: 8, haste: 8, lifesteal: 5, resist: 5
    },
    abilities: [
      {
        id: 'warlock_bolt', name: 'Shadow Bolt', description: 'Hurl a bolt of shadow at the enemy.',
        classId: ClassName.Warlock, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 14, baseDamage: 26, range: 350, isBaseline: true
      },
      {
        id: 'warlock_soulstone', name: 'Soulstone', description: 'Create a soulstone. If you die within 10 seconds, resurrect with full health and half mana.',
        classId: ClassName.Warlock, type: AbilityType.Buff, targetType: TargetType.Self,
        cooldown: 600, manaCost: 5, range: 0, isBaseline: true
      },
      {
        id: 'warlock_summon_imp', name: 'Summon Imp', description: 'Summon a demonic imp that attacks enemies and taunts.',
        classId: ClassName.Warlock, type: AbilityType.Summon, targetType: TargetType.Self,
        cooldown: 30, manaCost: 25, baseDamage: 0, range: 0, isBaseline: false
      },
      {
        id: 'warlock_drain', name: 'Drain Life', description: 'Drain health from target, healing yourself.',
        classId: ClassName.Warlock, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 30, manaCost: 5, baseDamage: 20, baseHeal: 20, range: 250, isBaseline: false
      },
      {
        id: 'warlock_hellfire', name: 'Hellfire', description: 'Burn all nearby enemies with demonic fire. Leaves them burning for additional damage.',
        classId: ClassName.Warlock, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 15, manaCost: 10, baseDamage: 25, range: 100, isBaseline: false
      }
    ]
  },

  // ============================================
  // DRUID - Shapeshifter, versatile healer/damage
  // ============================================
  {
    id: ClassName.Druid,
    name: 'Druid',
    description: 'A shapeshifter who commands nature magic.',
    color: '#ff7d0a',
    baseStats: {
      health: 90, maxHealth: 90, mana: 100, maxMana: 100,
      attackPower: 10, spellPower: 10, armor: 10, crit: 8, haste: 5, lifesteal: 0, resist: 10
    },
    abilities: [
      {
        id: 'druid_wrath', name: 'Wrath', description: 'Hurl nature energy at the enemy.',
        classId: ClassName.Druid, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 0, manaCost: 12, baseDamage: 24, range: 300, isBaseline: true
      },
      {
        id: 'druid_rejuv', name: 'Rejuvenation', description: 'Heal an ally over time.',
        classId: ClassName.Druid, type: AbilityType.Heal, targetType: TargetType.Ally,
        cooldown: 0, manaCost: 20, baseHeal: 35, range: 250, isBaseline: true
      },
      {
        id: 'druid_moonfire', name: 'Moonfire', description: 'Burn the enemy with lunar energy.',
        classId: ClassName.Druid, type: AbilityType.Damage, targetType: TargetType.Enemy,
        cooldown: 4, manaCost: 15, baseDamage: 28, range: 300, isBaseline: false
      },
      {
        id: 'druid_swipe', name: 'Swipe', description: 'Swipe at nearby enemies in bear form.',
        classId: ClassName.Druid, type: AbilityType.Damage, targetType: TargetType.AoE,
        cooldown: 6, manaCost: 20, baseDamage: 18, range: 80, isBaseline: false
      },
      {
        id: 'druid_regrowth', name: 'Regrowth', description: 'Powerful heal with a HoT component.',
        classId: ClassName.Druid, type: AbilityType.Heal, targetType: TargetType.Ally,
        cooldown: 8, manaCost: 35, baseHeal: 50, range: 250, isBaseline: false
      }
    ]
  }
];

export function getClassById(id: ClassName): ClassDefinition | undefined {
  return CLASSES.find(c => c.id === id);
}

export function getAbilityById(abilityId: string): { ability: AbilityDefinition; classId: ClassName } | undefined {
  for (const cls of CLASSES) {
    const ability = cls.abilities.find(a => a.id === abilityId);
    if (ability) {
      return { ability, classId: cls.id };
    }
  }
  return undefined;
}

export function getBaselineAbilities(classId: ClassName): AbilityDefinition[] {
  const cls = getClassById(classId);
  if (!cls) return [];
  return cls.abilities.filter(a => a.isBaseline);
}

export function getLearnableAbilities(classId: ClassName): AbilityDefinition[] {
  const cls = getClassById(classId);
  if (!cls) return [];
  return cls.abilities.filter(a => !a.isBaseline);
}

/**
 * Calculate ability damage based on rank and player stats
 */
export function calculateAbilityDamage(
  baseDamage: number,
  rank: number,
  attackPower: number,
  spellPower: number
): { min: number; max: number; avg: number } {
  // Scale damage by rank (10% per rank)
  const scaledDamage = baseDamage * (1 + (rank - 1) * 0.1);

  // Use higher of attack power or spell power
  const powerStat = Math.max(attackPower, spellPower);

  // Add power stat contribution (50%)
  const totalDamage = scaledDamage + powerStat * 0.5;

  // Variance of ~10%
  const min = Math.round(totalDamage * 0.9);
  const max = Math.round(totalDamage * 1.1);
  const avg = Math.round(totalDamage);

  return { min, max, avg };
}

/**
 * Calculate ability healing based on rank and player stats
 */
export function calculateAbilityHeal(
  baseHeal: number,
  rank: number,
  spellPower: number
): { min: number; max: number; avg: number } {
  // Scale heal by rank (10% per rank)
  const scaledHeal = baseHeal * (1 + (rank - 1) * 0.1);

  // Add spell power contribution (50%)
  const totalHeal = scaledHeal + spellPower * 0.5;

  // Variance of ~10%
  const min = Math.round(totalHeal * 0.9);
  const max = Math.round(totalHeal * 1.1);
  const avg = Math.round(totalHeal);

  return { min, max, avg };
}
