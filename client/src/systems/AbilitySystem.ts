import Phaser from 'phaser';
import { PlayerAbility, AbilityType, CLASSES } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';

export interface AbilityUIData {
  abilityId: string;
  name: string;
  rank: number;
  cooldown: number;
  maxCooldown: number;
  manaCost: number;
  type: AbilityType;
  keybind: string;
  description?: string;
}

// Migration map for old ability IDs -> new ability IDs
const ABILITY_MIGRATIONS: Record<string, string> = {
  'mage_frostbolt': 'mage_meditation',
  'mage_blizzard': 'mage_blaze',
  'rogue_backstab': 'rogue_stealth',
  'rogue_eviscerate': 'rogue_blind',
  'shaman_bolt': 'shaman_chainlight',
  'paladin_consecration': 'paladin_retribution',
};

export class AbilitySystem {
  private scene: Phaser.Scene;
  private abilityData: Map<string, { name: string; cooldown: number; manaCost: number; type: AbilityType; description: string }> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadAbilityData();
  }

  /**
   * Migrate old ability ID to new one if needed
   */
  private migrateAbilityId(abilityId: string): string {
    return ABILITY_MIGRATIONS[abilityId] ?? abilityId;
  }

  /**
   * Load ability definitions from shared classes - ensures consistency with server
   */
  private loadAbilityData(): void {
    // Import abilities directly from shared CLASSES to stay in sync
    for (const classDefinition of CLASSES) {
      for (const ability of classDefinition.abilities) {
        this.abilityData.set(ability.id, {
          name: ability.name,
          cooldown: ability.cooldown,
          manaCost: ability.manaCost,
          type: ability.type,
          description: ability.description
        });
      }
    }
  }

  /**
   * Get dynamic description with actual values based on rank
   */
  getDynamicDescription(abilityId: string, rank: number): string {
    switch (abilityId) {
      case 'warrior_bloodlust': {
        const healPercent = 15 + rank * 5; // 20/25/30/35/40%
        const duration = 8 + rank * 2; // 10/12/14/16/18s
        return `Enter a bloodlust frenzy for ${duration}s. Heal for ${healPercent}% of damage dealt.\nEnables Whirlwind combo!`;
      }
      case 'rogue_blind': {
        const duration = 6 + rank * 2; // 8/10/12/14/16s
        return `Blinds the target with a powder, stunning them for ${duration} seconds.`;
      }
      case 'rogue_stealth': {
        const duration = 8 + rank * 2; // 10/12/14/16/18s
        return `Enter stealth for ${duration}s. Your next Sinister Strike deals 100% bonus damage.`;
      }
      case 'rogue_vanish': {
        const duration = 4 + rank; // 5/6/7/8/9s
        return `Vanish into the shadows for ${duration}s, dropping all aggro. Your next attack deals 50% bonus damage.`;
      }
      case 'shaman_ancestral': {
        const duration = 6 + rank * 2; // 8/10/12/14/16s
        const stacks = 2 + rank; // 3/4/5/6/7 stacks
        return `Summon ancestral protection for ${duration}s. Heals you for 30 HP each time you are hit, up to ${stacks} times.`;
      }
      case 'paladin_judgment': {
        const stunDuration = 1 + rank; // 2/3/4/5/6s
        return `Call down holy judgment on all enemies in the room, dealing damage and stunning them for ${stunDuration} seconds.\nEnables Crusader Strike combo!`;
      }
      case 'paladin_retribution': {
        const reflectDamage = 5 + rank * 5; // 10/15/20/25/30
        return `Activate a holy aura that damages all enemies who attack you for ${reflectDamage} damage.`;
      }
      case 'mage_pyroblast': {
        return `Massive fireball that stuns the target for 3 seconds.\nEnables Fireball and Blaze combos!`;
      }
      case 'warlock_hellfire': {
        return `Burn all nearby enemies with demonic fire. Leaves them burning for additional damage.\nEnables Drain Life combo!`;
      }
      case 'paladin_strike': {
        return `A holy-infused melee attack.\nCOMBO: +50% damage and 30% self-heal on Judgment-stunned targets!`;
      }
      case 'warrior_whirlwind': {
        return `Spin and hit all nearby enemies with devastating force.\nCOMBO: +25% healing during Bloodlust!`;
      }
      case 'mage_fireball': {
        return `Hurl a ball of fire at the enemy.\nCOMBO: +50% damage on Pyroblast-stunned targets!`;
      }
      case 'mage_blaze': {
        const damageBonus = (rank - 1) * 15;
        return `Fire bounces between enemies, hitting up to 5 targets.${damageBonus > 0 ? ` +${damageBonus}% damage.` : ''}\nCOMBO: Stuns all enemies if primary target is Pyroblast-stunned!`;
      }
      case 'warlock_drain': {
        return `Drain health from target, healing yourself and your Imp (50%).\nCOMBO: Drains ALL burning enemies if target has Hellfire!`;
      }
      case 'warlock_summon_imp': {
        // Calculate Imp stats based on floor and rank
        const floor = wsClient.currentState?.floor ?? 1;
        const rankBonus = 1 + (rank - 1) * 0.1; // 10% per rank
        const baseHealth = 100 + floor * 10;
        const baseSpell = 12 + floor * 3;
        const impHealth = Math.round(baseHealth * rankBonus);
        const impDamage = Math.round(baseSpell * rankBonus);
        return `Summon a demonic imp that attacks with fire magic and taunts nearby foes every 5s.\nImp HP: ${impHealth} | Damage: ${impDamage}`;
      }
      default:
        return this.abilityData.get(abilityId)?.description ?? '';
    }
  }

  /**
   * Get ability UI data for current player
   */
  getPlayerAbilities(): AbilityUIData[] {
    const player = wsClient.getCurrentPlayer();
    if (!player) return [];

    return player.abilities.map((pa, index) => {
      // Migrate old ability IDs to new ones for display
      const migratedId = this.migrateAbilityId(pa.abilityId);
      const data = this.abilityData.get(migratedId);
      return {
        abilityId: pa.abilityId, // Keep original for server communication
        name: data?.name ?? 'Unknown',
        rank: pa.rank,
        cooldown: pa.currentCooldown,
        maxCooldown: data?.cooldown ?? 0,
        manaCost: data?.manaCost ?? 0,
        type: data?.type ?? AbilityType.Damage,
        keybind: String(index + 1),
        description: this.getDynamicDescription(migratedId, pa.rank)
      };
    });
  }

  /**
   * Get ability name by ID
   */
  getAbilityName(abilityId: string): string {
    const migratedId = this.migrateAbilityId(abilityId);
    return this.abilityData.get(migratedId)?.name ?? 'Unknown';
  }

  /**
   * Get ability description by ID (optionally with rank for dynamic values)
   */
  getAbilityDescription(abilityId: string, rank?: number): string {
    const migratedId = this.migrateAbilityId(abilityId);
    if (rank !== undefined) {
      return this.getDynamicDescription(migratedId, rank);
    }
    return this.abilityData.get(migratedId)?.description ?? '';
  }

  /**
   * Get ability icon texture key based on type
   */
  getAbilityIconKey(type: AbilityType): string {
    switch (type) {
      case AbilityType.Damage:
        return 'ability_damage';
      case AbilityType.Heal:
        return 'ability_heal';
      case AbilityType.Buff:
        return 'ability_buff';
      case AbilityType.Debuff:
        return 'ability_debuff';
      default:
        return 'ability_damage';
    }
  }

  /**
   * Check if ability can be used
   */
  canUseAbility(abilityId: string): boolean {
    const player = wsClient.getCurrentPlayer();
    if (!player) return false;

    const playerAbility = player.abilities.find(a => a.abilityId === abilityId);
    if (!playerAbility) return false;

    const migratedId = this.migrateAbilityId(abilityId);
    const data = this.abilityData.get(migratedId);
    if (!data) return false;

    return playerAbility.currentCooldown <= 0 && player.stats.mana >= data.manaCost;
  }
}
