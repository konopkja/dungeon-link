# Dungeon Link

A browser-based top-down 2D dungeon crawler inspired by vanilla World of Warcraft. Push through infinite procedurally generated floors, collect loot, and upgrade abilities. Play solo or invite up to 4 friends with a shareable link.

## Features

- **9 Classic Classes**: Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid
- **5 Unique Abilities per Class**: 2 baseline + 3 boss-drop only
- **Procedural Dungeons**: 8-12 rooms per floor with random layout
- **8 Boss Encounters**: Scaling mechanics across floor bands
- **Rare Mob Spawns**: 10% chance per floor with extra loot
- **8 Equipment Slots**: Head, Chest, Legs, Feet, Hands, Weapon, Ring, Trinket
- **Ability Ranking System**: Upgrade abilities via duplicate drops (floor-gated)
- **Multiplayer Co-op**: Up to 5 players via invite link
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

## Multiplayer

1. Start a game and select your class
2. Click "Copy Invite" in the top-right corner
3. Share the link with friends
4. They'll join your run automatically

Party scaling adjusts enemy health and damage based on:
- Number of players
- Average party item power

## Game Mechanics

### Classes

Each class has 5 abilities:
- **2 Baseline**: Available at level 1
- **3 Learnable**: Only from boss drops

| Class | Role | Style |
|-------|------|-------|
| Warrior | Melee DPS | High armor, cleave |
| Paladin | Hybrid | Heal + melee |
| Hunter | Ranged DPS | High mobility |
| Rogue | Melee DPS | Burst damage |
| Priest | Healer | Holy/Shadow magic |
| Shaman | Hybrid | Elemental + heal |
| Mage | Ranged DPS | High burst magic |
| Warlock | Ranged DPS | DoTs, curses |
| Druid | Hybrid | Versatile |

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
- Cosmetics (rare)

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
│       └── sprites/      # Runtime sprite generator
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
- `JOIN_RUN`: Join via invite link
- `PLAYER_INPUT`: Movement and abilities
- `ADVANCE_FLOOR`: Progress to next floor

Server → Client:
- `STATE_UPDATE`: Full game state
- `COMBAT_EVENT`: Damage/heal numbers
- `LOOT_DROP`: Post-boss rewards
- `FLOOR_COMPLETE`: Ready to advance

## Hosting

### Local Network

To play with friends on the same network:

1. Find your local IP (e.g., `192.168.1.100`)
2. Start the server
3. Share: `http://192.168.1.100:3000?run=<RUN_ID>`

### Internet Hosting

For public hosting, you'll need to:

1. Deploy the server (supports any Node.js host)
2. Deploy the client (static hosting)
3. Configure WebSocket URL in client
4. Set up SSL for secure connections

## Development

### Adding New Classes

1. Edit `server/src/data/classes.ts`
2. Add class definition with 5 abilities
3. Update `shared/types.ts` if needed
4. Add class color to `shared/constants.ts`

### Adding New Bosses

1. Edit `server/src/data/bosses.ts`
2. Define floor band, stats, mechanics, loot table

### Adding New Items

Item generation is procedural based on:
- Floor level
- Rarity rolls
- Slot-specific stat weights

Modify `server/src/data/items.ts` to adjust generation.

## License

MIT

---

Built with Phaser 3, TypeScript, Node.js, and WebSockets.
