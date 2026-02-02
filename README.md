# Dungeon Link

A browser-based top-down 2D dungeon crawler inspired by vanilla World of Warcraft. Push through infinite procedurally generated floors, collect loot, and upgrade abilities.

## Features

- **6 Playable Classes**: Warrior, Paladin, Rogue, Shaman, Mage, Warlock
- **5 Unique Abilities per Class**: 2 baseline + 3 boss-drop only
- **Procedural Dungeons**: 8-12 rooms per floor with random layout
- **Themed Floors**: Crypt, Inferno, Frozen, Swamp, Shadow, Treasure
- **Boss Encounters**: Scaling mechanics across floor bands
- **Rare Mob Spawns**: 10% chance per floor with extra loot
- **8 Equipment Slots**: Head, Chest, Legs, Feet, Hands, Weapon, Ring, Trinket
- **Set Items**: Archmage, Bladestorm, Bulwark sets with tiered bonuses
- **Ability Ranking System**: Upgrade abilities via duplicate drops (floor-gated)
- **Infinite Scaling**: Floors scale infinitely with difficulty and rewards

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
cd dungeon-link
npm install
```

### Running in Development

Start both server and client with one command:

```bash
npm run dev
```

This runs:
- Server on `ws://localhost:8080`
- Client on `http://localhost:3000`

### Running Separately

**Server only:**
```bash
npm run dev:server
```

**Client only:**
```bash
npm run dev:client
```

### Running Tests

```bash
npm test
```

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| 1-5 | Cast abilities |
| Click | Target enemy |
| I | Toggle inventory |
| Space | Advance to next floor (after boss) |

## Game Mechanics

### Classes

Each class has 5 abilities:
- **2 Baseline**: Available at start
- **3 Learnable**: Only from boss drops

| Class | Role | Style |
|-------|------|-------|
| Warrior | Melee DPS / Tank | High armor, cleave, bloodlust |
| Paladin | Healer / Tank Hybrid | Holy damage, healing, protection |
| Rogue | Melee DPS / Assassin | Stealth, burst damage, evasion |
| Shaman | Caster / Healer Hybrid | Chain lightning, totems, ancestral healing |
| Mage | Ranged Caster | Fire magic, mana regen, crowd control |
| Warlock | Caster / Summoner | Shadow magic, demons, lifesteal |

### Floor Themes

| Theme | Effect |
|-------|--------|
| Crypt | Standard dungeon (baseline) |
| Inferno | Fire hazards, +25% gold |
| Frozen | Chill effects, slowed movement |
| Swamp | Poison clouds, DoT effects |
| Shadow | Limited visibility |
| Treasure | More traps, guaranteed rare loot |

### Ability Ranks

Abilities can be upgraded by getting duplicate drops from bosses:

- Rank 1 → 2: Requires Floor 2+
- Rank 2 → 3: Requires Floor 3+
- Rank N → N+1: Requires Floor N+1

If a duplicate drops below the required floor, it converts to gold or a reroll token.

### Loot

**Bosses drop:**
- Gear (40-80% chance based on boss)
- Abilities (30-50% chance)
- Gold (always)

**Rare mobs drop:**
- Bonus gear and ability chances
- Extra gold

### Floor Scaling

Each floor increases:
- Enemy health by 15%
- Enemy damage by 10%
- Loot quality by 12%

### Dungeon Structure

Each floor contains:
- 8-12 procedurally generated rooms
- Start room (safe zone)
- Normal rooms with enemy packs
- Optional rare room (10% chance)
- Boss room (always furthest from start)

## Project Structure

```
dungeon-link/
├── client/               # Phaser 3 game client
│   └── src/
│       ├── scenes/       # Game scenes
│       ├── systems/      # Input, abilities, inventory
│       ├── network/      # WebSocket client
│       └── wallet/       # Crypto wallet integration
├── server/               # Node.js WebSocket server
│   └── src/
│       ├── game/         # Core game logic
│       ├── data/         # Classes, items, bosses
│       ├── utils/        # Seeded RNG
│       └── tests/        # Unit tests
└── shared/               # Shared types and constants
```

## Architecture

### Server Authority

The server is authoritative for:
- Combat damage/healing calculations
- Loot drops and ability upgrades
- Run state and progression
- Dungeon generation (seeded RNG)

### Client Responsibility

The client handles:
- Input processing and sending
- Rendering game state
- UI and feedback effects
- Sprite generation

### Network Protocol

Client → Server:
- `CREATE_RUN`: Start new run
- `PLAYER_INPUT`: Movement and abilities
- `ADVANCE_FLOOR`: Progress to next floor

Server → Client:
- `STATE_UPDATE`: Full game state
- `COMBAT_EVENT`: Damage/heal numbers
- `LOOT_DROP`: Post-boss rewards
- `FLOOR_COMPLETE`: Ready to advance

## Development

### Adding New Classes

1. Edit `shared/classes.ts`
2. Add class definition with 5 abilities
3. Update `client/src/scenes/MenuScene.ts` to include in AVAILABLE_CLASSES
4. Add class color to `shared/constants.ts`

### Adding New Bosses

1. Edit `server/src/data/bosses.ts`
2. Define floor band, stats, mechanics, loot table

### Adding New Items

Item generation is procedural based on:
- Floor level
- Rarity rolls
- Slot-specific stat weights

Modify `server/src/game/Loot.ts` to adjust generation.

## License

MIT

---

Built with Phaser 3, TypeScript, Node.js, and WebSockets.
