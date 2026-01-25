import { Room, Dungeon, Enemy, EnemyType, Position, Trap, Chest, TrapType, FloorTheme } from '@dungeon-link/shared';
import { GAME_CONFIG, SPRITE_CONFIG } from '@dungeon-link/shared';
import { SeededRNG, createFloorRNG } from '../utils/SeededRNG.js';
import { getEnemiesForFloor, getEnemyById, createRareVariant, ENEMIES } from '../data/enemies.js';
import { getBossesForFloor } from '../data/bosses.js';
import { scaleEnemyStats } from '../data/scaling.js';
import { getFloorTheme, getThemeModifiers } from '../data/floorThemes.js';

interface RoomConnection {
  from: string;
  to: string;
}

/**
 * Generate a procedural dungeon floor
 */
export function generateDungeon(
  runId: string,
  floor: number,
  partySize: number = 1,
  averageItemPower: number = 0
): Dungeon {
  const rng = createFloorRNG(runId, floor);

  // Determine number of rooms
  const numRooms = rng.nextInt(GAME_CONFIG.MIN_ROOMS_PER_FLOOR, GAME_CONFIG.MAX_ROOMS_PER_FLOOR);

  // Generate room layout
  const rooms = generateRooms(rng, numRooms, floor);

  // Connect rooms
  connectRooms(rng, rooms);

  // Assign room types (start, normal, boss, potentially rare)
  assignRoomTypes(rng, rooms, floor);

  // Populate rooms with enemies
  populateRooms(rng, rooms, floor, partySize, averageItemPower);

  // Determine floor theme
  const theme = getFloorTheme(floor);
  const themeModifiers = getThemeModifiers(theme, floor);

  // Place traps and chests (modified by theme)
  placeTrapsAndChests(rng, rooms, floor, themeModifiers.trapMultiplier, theme);

  // FINAL VALIDATION: Ensure there's a path from start to boss
  const startRoom = rooms.find(r => r.type === 'start');
  const bossRoom = rooms.find(r => r.type === 'boss');
  if (startRoom && bossRoom && !hasPath(rooms, startRoom.id, bossRoom.id)) {
    console.error(`[DUNGEON] CRITICAL: No path from start to boss! Forcing connection.`);
    // Emergency fix: directly connect start to boss through intermediate rooms
    let current = startRoom;
    while (!current.connectedTo.includes(bossRoom.id)) {
      // Find the room closest to boss that we can reach from current
      let bestNext: Room | null = null;
      let bestDist = Infinity;

      for (const connId of current.connectedTo) {
        const connRoom = rooms.find(r => r.id === connId);
        if (connRoom) {
          const dist = getDistance(connRoom, bossRoom);
          if (dist < bestDist) {
            bestDist = dist;
            bestNext = connRoom;
          }
        }
      }

      if (!bestNext || bestNext === current) {
        // No progress possible, force direct connection
        current.connectedTo.push(bossRoom.id);
        bossRoom.connectedTo.push(current.id);
        console.log(`[DUNGEON] Emergency: Connected ${current.id} directly to boss`);
        break;
      }
      current = bestNext;
    }
  }

  console.log(`[DUNGEON] Generated floor ${floor} with theme: ${theme}`);

  return {
    floor,
    seed: runId,
    rooms,
    currentRoomId: rooms.find(r => r.type === 'start')!.id,
    bossDefeated: false,
    theme,
    themeModifiers
  };
}

/**
 * Generate room positions and sizes
 */
function generateRooms(rng: SeededRNG, count: number, floor: number): Room[] {
  const rooms: Room[] = [];
  const gridSize = Math.ceil(Math.sqrt(count)) + 1;
  const cellSize = GAME_CONFIG.ROOM_MAX_SIZE + GAME_CONFIG.CORRIDOR_WIDTH * 2;

  // Create a grid of possible positions
  const positions: Position[] = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      positions.push({ x: x * cellSize, y: y * cellSize });
    }
  }

  // Shuffle and pick positions
  const shuffledPositions = rng.shuffle(positions);

  for (let i = 0; i < count; i++) {
    const pos = shuffledPositions[i];

    // First room (start room) should be larger to fit both trainer and shop vendors
    const isStartRoom = i === 0;
    const minSize = isStartRoom ? 280 : GAME_CONFIG.ROOM_MIN_SIZE;
    const maxSize = isStartRoom ? 320 : GAME_CONFIG.ROOM_MAX_SIZE;

    const width = rng.nextInt(minSize, maxSize);
    const height = rng.nextInt(minSize, maxSize);

    rooms.push({
      id: `room_${floor}_${i}`,
      x: pos.x + rng.nextInt(0, GAME_CONFIG.CORRIDOR_WIDTH),
      y: pos.y + rng.nextInt(0, GAME_CONFIG.CORRIDOR_WIDTH),
      width,
      height,
      type: 'normal',
      enemies: [],
      cleared: false,
      connectedTo: []
    });
  }

  return rooms;
}

/**
 * Connect rooms to create a connected graph
 */
function connectRooms(rng: SeededRNG, rooms: Room[]): void {
  // Create minimum spanning tree using Prim's algorithm
  const connected = new Set<string>([rooms[0].id]);
  const edges: RoomConnection[] = [];

  while (connected.size < rooms.length) {
    let bestEdge: RoomConnection | null = null;
    let bestDistance = Infinity;

    for (const room of rooms) {
      if (!connected.has(room.id)) continue;

      for (const other of rooms) {
        if (connected.has(other.id)) continue;

        const dist = getDistance(room, other);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestEdge = { from: room.id, to: other.id };
        }
      }
    }

    if (bestEdge) {
      edges.push(bestEdge);
      connected.add(bestEdge.to);
    }
  }

  // Add some extra connections for variety
  const extraConnections = rng.nextInt(1, Math.floor(rooms.length / 3));
  for (let i = 0; i < extraConnections; i++) {
    const from = rng.pick(rooms);
    const to = rng.pick(rooms);
    if (from.id !== to.id && !from.connectedTo.includes(to.id)) {
      edges.push({ from: from.id, to: to.id });
    }
  }

  // Apply connections
  for (const edge of edges) {
    const fromRoom = rooms.find(r => r.id === edge.from)!;
    const toRoom = rooms.find(r => r.id === edge.to)!;

    if (!fromRoom.connectedTo.includes(toRoom.id)) {
      fromRoom.connectedTo.push(toRoom.id);
    }
    if (!toRoom.connectedTo.includes(fromRoom.id)) {
      toRoom.connectedTo.push(fromRoom.id);
    }
  }
}

function getDistance(a: Room, b: Room): number {
  const dx = (a.x + a.width / 2) - (b.x + b.width / 2);
  const dy = (a.y + a.height / 2) - (b.y + b.height / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if there's a path from start room to target room using BFS
 */
function hasPath(rooms: Room[], startRoomId: string, targetRoomId: string): boolean {
  const visited = new Set<string>();
  const queue: string[] = [startRoomId];
  visited.add(startRoomId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === targetRoomId) return true;

    const currentRoom = rooms.find(r => r.id === currentId);
    if (!currentRoom) continue;

    for (const connectedId of currentRoom.connectedTo) {
      if (!visited.has(connectedId)) {
        visited.add(connectedId);
        queue.push(connectedId);
      }
    }
  }

  return false;
}

/**
 * Ensure all rooms are connected to the start room
 * Returns any rooms that were disconnected and reconnected
 */
function ensureFullConnectivity(rooms: Room[]): void {
  const startRoom = rooms.find(r => r.type === 'start');
  if (!startRoom) return;

  // Find all rooms reachable from start
  const reachable = new Set<string>();
  const queue: string[] = [startRoom.id];
  reachable.add(startRoom.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentRoom = rooms.find(r => r.id === currentId);
    if (!currentRoom) continue;

    for (const connectedId of currentRoom.connectedTo) {
      if (!reachable.has(connectedId)) {
        reachable.add(connectedId);
        queue.push(connectedId);
      }
    }
  }

  // Find unreachable rooms
  const unreachable = rooms.filter(r => !reachable.has(r.id));

  if (unreachable.length === 0) return;

  console.log(`[DUNGEON] Found ${unreachable.length} unreachable rooms, reconnecting...`);

  // Connect each unreachable room to the nearest reachable room
  for (const room of unreachable) {
    let nearestReachable: Room | null = null;
    let nearestDist = Infinity;

    for (const reachableId of reachable) {
      const reachableRoom = rooms.find(r => r.id === reachableId);
      if (!reachableRoom) continue;

      const dist = getDistance(room, reachableRoom);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestReachable = reachableRoom;
      }
    }

    if (nearestReachable) {
      // Add bidirectional connection
      if (!room.connectedTo.includes(nearestReachable.id)) {
        room.connectedTo.push(nearestReachable.id);
      }
      if (!nearestReachable.connectedTo.includes(room.id)) {
        nearestReachable.connectedTo.push(room.id);
      }
      // Now this room is reachable, add it to the set
      reachable.add(room.id);
      console.log(`[DUNGEON] Reconnected room ${room.id} to ${nearestReachable.id}`);
    }
  }
}

/**
 * Check if two rooms overlap (with padding for corridors)
 */
function roomsOverlap(a: Room, b: Room, padding: number = 20): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  );
}

/**
 * Adjust boss room position to avoid overlapping with other rooms
 */
function adjustBossRoomPosition(
  bossRoom: Room,
  allRooms: Room[],
  originalWidth: number,
  originalHeight: number
): void {
  const padding = GAME_CONFIG.CORRIDOR_WIDTH;

  // Check for overlaps with other rooms
  const overlappingRooms = allRooms.filter(
    r => r.id !== bossRoom.id && roomsOverlap(bossRoom, r, padding)
  );

  if (overlappingRooms.length === 0) {
    return; // No overlaps, position is fine
  }

  console.log(`[DUNGEON] Boss room overlaps with ${overlappingRooms.length} rooms, adjusting position`);

  // Try different directions to shift the boss room
  const widthIncrease = bossRoom.width - originalWidth;
  const heightIncrease = bossRoom.height - originalHeight;

  // Try shifting in different directions to resolve overlaps
  const shifts = [
    { dx: -widthIncrease, dy: 0 },      // Shift left
    { dx: 0, dy: -heightIncrease },     // Shift up
    { dx: -widthIncrease / 2, dy: -heightIncrease / 2 }, // Shift diagonal
    { dx: widthIncrease, dy: 0 },       // Shift right (expand other direction)
    { dx: 0, dy: heightIncrease },      // Shift down
  ];

  for (const shift of shifts) {
    const testX = bossRoom.x + shift.dx;
    const testY = bossRoom.y + shift.dy;

    // Create a test room to check overlap
    const testRoom = { ...bossRoom, x: testX, y: testY };

    const stillOverlaps = allRooms.some(
      r => r.id !== bossRoom.id && roomsOverlap(testRoom, r, padding)
    );

    if (!stillOverlaps && testX >= 0 && testY >= 0) {
      bossRoom.x = testX;
      bossRoom.y = testY;
      console.log(`[DUNGEON] Boss room shifted by (${shift.dx}, ${shift.dy})`);
      return;
    }
  }

  // If no shift works, reduce the boss room size to avoid overlap
  console.log(`[DUNGEON] Could not shift boss room, reducing size to avoid overlap`);
  bossRoom.width = originalWidth + Math.floor((bossRoom.width - originalWidth) / 2);
  bossRoom.height = originalHeight + Math.floor((bossRoom.height - originalHeight) / 2);

  // Check again and further reduce if needed
  const stillOverlaps = allRooms.some(
    r => r.id !== bossRoom.id && roomsOverlap(bossRoom, r, padding)
  );

  if (stillOverlaps) {
    // Last resort: keep original size
    bossRoom.width = originalWidth;
    bossRoom.height = originalHeight;
    console.log(`[DUNGEON] Boss room reverted to original size`);
  }
}

/**
 * Assign special room types
 */
function assignRoomTypes(rng: SeededRNG, rooms: Room[], floor: number): void {
  // First room is start
  rooms[0].type = 'start';
  rooms[0].cleared = true;

  // Find the room furthest from start for boss
  let maxDist = 0;
  let bossRoom = rooms[rooms.length - 1];

  for (const room of rooms) {
    if (room.id === rooms[0].id) continue;
    const dist = getDistance(rooms[0], room);
    if (dist > maxDist) {
      maxDist = dist;
      bossRoom = room;
    }
  }
  bossRoom.type = 'boss';

  // Make boss room larger - now 2x size for more epic boss fights
  const originalWidth = bossRoom.width;
  const originalHeight = bossRoom.height;

  // Increase boss room size by 100% (double)
  bossRoom.width = Math.floor(bossRoom.width * 2);
  bossRoom.height = Math.floor(bossRoom.height * 2);

  // Check for overlaps with other rooms
  const padding = GAME_CONFIG.CORRIDOR_WIDTH;
  let overlappingRooms = rooms.filter(
    r => r.id !== bossRoom.id && r.type !== 'start' && roomsOverlap(bossRoom, r, padding)
  );

  // If there are overlapping rooms, remove them to make space for the boss room
  if (overlappingRooms.length > 0) {
    console.log(`[DUNGEON] Boss room overlaps with ${overlappingRooms.length} rooms, removing them to make space`);

    // Collect IDs of rooms to remove
    const roomsToRemove = new Set(overlappingRooms.map(r => r.id));

    // Remove overlapping rooms (except start room)
    for (const overlapRoom of overlappingRooms) {
      const index = rooms.findIndex(r => r.id === overlapRoom.id);
      if (index !== -1) {
        rooms.splice(index, 1);
        console.log(`[DUNGEON] Removed room ${overlapRoom.id} to make space for boss room`);
      }
    }

    // Clean up connections to removed rooms
    for (const room of rooms) {
      room.connectedTo = room.connectedTo.filter(id => !roomsToRemove.has(id));
    }

    // If boss room lost connections, connect it to nearest remaining room
    if (bossRoom.connectedTo.length === 0) {
      let nearestRoom: Room | null = null;
      let nearestDist = Infinity;
      for (const room of rooms) {
        if (room.id === bossRoom.id) continue;
        const dist = getDistance(bossRoom, room);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestRoom = room;
        }
      }
      if (nearestRoom) {
        bossRoom.connectedTo.push(nearestRoom.id);
        nearestRoom.connectedTo.push(bossRoom.id);
        console.log(`[DUNGEON] Re-connected boss room to ${nearestRoom.id}`);
      }
    }

    // Re-check for any remaining overlaps after removal
    overlappingRooms = rooms.filter(
      r => r.id !== bossRoom.id && r.type !== 'start' && roomsOverlap(bossRoom, r, padding)
    );

    // If still overlapping (with start room proximity), try to shift the boss room
    if (overlappingRooms.length > 0) {
      adjustBossRoomPosition(bossRoom, rooms, originalWidth, originalHeight);
    }

    // CRITICAL: Ensure full connectivity after room removal
    // This fixes the bug where removing rooms could disconnect parts of the dungeon
    ensureFullConnectivity(rooms);
  }

  // Chance to spawn rare mob in one room
  if (rng.chance(GAME_CONFIG.RARE_MOB_SPAWN_CHANCE)) {
    const normalRooms = rooms.filter(r => r.type === 'normal');
    if (normalRooms.length > 0) {
      const rareRoom = rng.pick(normalRooms);
      rareRoom.type = 'rare';
    }
  }
}

/**
 * Populate rooms with enemies
 */
function populateRooms(
  rng: SeededRNG,
  rooms: Room[],
  floor: number,
  partySize: number,
  averageItemPower: number
): void {
  const availableEnemies = getEnemiesForFloor(floor);
  const availableBosses = getBossesForFloor(floor);

  for (const room of rooms) {
    if (room.type === 'start') continue;

    if (room.type === 'boss') {
      // Boss room
      const bossDef = rng.pick(availableBosses);
      const scaled = scaleEnemyStats(bossDef.baseHealth, bossDef.baseDamage, floor, partySize, averageItemPower);

      room.enemies = [{
        id: `enemy_${room.id}_boss`,
        type: EnemyType.Melee, // Bosses are special
        name: bossDef.name,
        position: {
          x: room.x + room.width / 2,
          y: room.y + room.height / 2
        },
        stats: {
          health: scaled.health,
          maxHealth: scaled.health,
          mana: 100,
          maxMana: 100,
          attackPower: scaled.damage,
          spellPower: scaled.damage,
          armor: 10 + floor * 2,
          crit: 5,
          haste: 0,
          lifesteal: 0,
          resist: 5 + floor
        },
        isAlive: true,
        targetId: null,
        isBoss: true,
        isRare: false,
        bossId: bossDef.id,
        bossMechanics: bossDef.mechanics,
        debuffs: []
      }];
    } else if (room.type === 'rare') {
      // Rare mob room - normal enemies plus one rare
      const numEnemies = rng.nextInt(
        GAME_CONFIG.ENEMIES_PER_ROOM_MIN,
        GAME_CONFIG.ENEMIES_PER_ROOM_MAX - 1
      );

      room.enemies = generateEnemyPack(rng, room, floor, numEnemies, availableEnemies, partySize, averageItemPower);

      // Add rare mob
      const baseEnemy = rng.pick(availableEnemies);
      const rareEnemy = createRareVariant(baseEnemy, floor);
      const scaled = scaleEnemyStats(rareEnemy.baseHealth, rareEnemy.baseDamage, floor, partySize, averageItemPower);
      const rareSpawnPos = getRandomPosition(rng, room);

      room.enemies.push({
        id: `enemy_${room.id}_rare`,
        type: rareEnemy.type,
        name: rareEnemy.name,
        position: { ...rareSpawnPos },
        spawnPosition: { ...rareSpawnPos },
        originalRoomId: room.id,
        stats: {
          health: scaled.health,
          maxHealth: scaled.health,
          mana: 50,
          maxMana: 50,
          attackPower: scaled.damage,
          spellPower: scaled.damage,
          armor: 5 + floor,
          crit: 10,
          haste: 5,
          lifesteal: 0,
          resist: 5
        },
        isAlive: true,
        targetId: null,
        isBoss: false,
        isRare: true,
        debuffs: []
      });
    } else {
      // Normal room
      const numEnemies = rng.nextInt(
        GAME_CONFIG.ENEMIES_PER_ROOM_MIN,
        GAME_CONFIG.ENEMIES_PER_ROOM_MAX
      );

      room.enemies = generateEnemyPack(rng, room, floor, numEnemies, availableEnemies, partySize, averageItemPower);

      // 20% chance to add an elite enemy on floors 3+ (stronger but not as rare as rare mobs)
      if (floor >= 3 && rng.chance(0.20)) {
        const baseEnemy = rng.pick(availableEnemies);
        const scaled = scaleEnemyStats(baseEnemy.baseHealth * 1.8, baseEnemy.baseDamage * 1.3, floor, partySize, averageItemPower);
        const eliteSpawnPos = getRandomPosition(rng, room);

        room.enemies.push({
          id: `enemy_${room.id}_elite`,
          type: baseEnemy.type,
          name: `Elite ${baseEnemy.name}`,
          position: { ...eliteSpawnPos },
          spawnPosition: { ...eliteSpawnPos },
          originalRoomId: room.id,
          stats: {
            health: scaled.health,
            maxHealth: scaled.health,
            mana: 40,
            maxMana: 40,
            attackPower: scaled.damage,
            spellPower: scaled.damage,
            armor: 4 + floor,
            crit: 8,
            haste: 3,
            lifesteal: 0,
            resist: 4
          },
          isAlive: true,
          targetId: null,
          isBoss: false,
          isRare: false,
          isElite: true,
          debuffs: []
        });
      }
    }
  }

  // Add patrolling enemies (10% chance per connected room pair on floors 2+)
  if (floor >= 2) {
    spawnPatrollingEnemies(rng, rooms, floor, availableEnemies, partySize, averageItemPower);
  }
}

/**
 * Spawn patrolling enemies that move between connected rooms
 * Guarantees patrol enemies on floor 2+ with increasing numbers
 */
function spawnPatrollingEnemies(
  rng: SeededRNG,
  rooms: Room[],
  floor: number,
  availableEnemies: import('@dungeon-link/shared').EnemyDefinition[],
  partySize: number,
  averageItemPower: number
): void {
  // Find connected room pairs (excluding start, boss, and rare rooms)
  const normalRooms = rooms.filter(r => r.type === 'normal');

  // Get rooms that have connections to other normal rooms
  const roomsWithConnections = normalRooms.filter(
    r => r.connectedTo.some(id => rooms.find(room => room.id === id && room.type === 'normal'))
  );

  if (roomsWithConnections.length === 0) return;

  // Spawn 1-3 patrolling enemies based on floor level
  // Floor 2-3: 1 patroller, Floor 4-6: 2 patrollers, Floor 7+: 3 patrollers
  const numPatrollers = floor <= 3 ? 1 : floor <= 6 ? 2 : 3;

  const usedRooms = new Set<string>();

  for (let i = 0; i < numPatrollers; i++) {
    // Find a room not already used for patrol
    const availablePatrolRooms = roomsWithConnections.filter(r => !usedRooms.has(r.id));
    if (availablePatrolRooms.length === 0) break;

    const patrolRoom = rng.pick(availablePatrolRooms);
    usedRooms.add(patrolRoom.id);

    // Build a longer patrol route (2-4 rooms)
    const patrolRoute: string[] = [patrolRoom.id];
    let currentRoomForRoute = patrolRoom;
    const routeLength = rng.nextInt(2, 4); // 2-4 rooms in route

    for (let j = 1; j < routeLength; j++) {
      const connectedNormalRooms = currentRoomForRoute.connectedTo.filter(
        id => {
          const room = rooms.find(r => r.id === id);
          return room && room.type === 'normal' && !patrolRoute.includes(id);
        }
      );

      if (connectedNormalRooms.length === 0) break;

      const nextRoomId = rng.pick(connectedNormalRooms);
      patrolRoute.push(nextRoomId);
      currentRoomForRoute = rooms.find(r => r.id === nextRoomId) as Room;
    }

    if (patrolRoute.length < 2) continue; // Need at least 2 rooms

    // Create a patrolling enemy
    const enemyDef = rng.pick(availableEnemies);
    const scaled = scaleEnemyStats(
      enemyDef.baseHealth * 1.5, // Patrollers are slightly tougher
      enemyDef.baseDamage * 1.2,
      floor,
      partySize,
      averageItemPower
    );
    const patrolSpawnPos = getRandomPosition(rng, patrolRoom);

    const patroller: import('@dungeon-link/shared').Enemy = {
      id: `enemy_patrol_${rng.nextInt(10000, 99999)}`,
      type: enemyDef.type,
      name: `Patrolling ${enemyDef.name}`,
      position: { ...patrolSpawnPos },
      spawnPosition: { ...patrolSpawnPos },
      originalRoomId: patrolRoom.id,
      stats: {
        health: scaled.health,
        maxHealth: scaled.health,
        mana: 30,
        maxMana: 30,
        attackPower: scaled.damage,
        spellPower: Math.round(scaled.damage * 0.5),
        armor: 5 + floor,
        crit: 5,
        haste: 10, // Patrollers are faster
        lifesteal: 0,
        resist: 3
      },
      isAlive: true,
      targetId: null,
      isBoss: false,
      isRare: false,
      debuffs: [],
      // Patrol properties
      isPatrolling: true,
      patrolRoute,
      currentRoomId: patrolRoom.id,
      patrolTargetRoomId: patrolRoute[1]
    };

    // Add to the starting room
    patrolRoom.enemies.push(patroller);
    console.log(`[DEBUG] Spawned patrolling enemy in room ${patrolRoom.id}, route: ${patrolRoute.join(' -> ')}`);
  }
}

function generateEnemyPack(
  rng: SeededRNG,
  room: Room,
  floor: number,
  count: number,
  availableEnemies: ReturnType<typeof getEnemiesForFloor>,
  partySize: number,
  averageItemPower: number
): Enemy[] {
  const enemies: Enemy[] = [];

  for (let i = 0; i < count; i++) {
    const enemyDef = rng.pick(availableEnemies);
    const scaled = scaleEnemyStats(enemyDef.baseHealth, enemyDef.baseDamage, floor, partySize, averageItemPower);
    const spawnPos = getRandomPosition(rng, room);

    enemies.push({
      id: `enemy_${room.id}_${i}`,
      type: enemyDef.type,
      name: enemyDef.name,
      position: { ...spawnPos },
      spawnPosition: { ...spawnPos },
      originalRoomId: room.id,
      stats: {
        health: scaled.health,
        maxHealth: scaled.health,
        mana: 30,
        maxMana: 30,
        attackPower: scaled.damage,
        spellPower: scaled.damage,
        armor: 3 + floor,
        crit: 5,
        haste: 0,
        lifesteal: 0,
        resist: 2
      },
      isAlive: true,
      targetId: null,
      isBoss: false,
      isRare: false,
      debuffs: []
    });
  }

  return enemies;
}

function getRandomPosition(rng: SeededRNG, room: Room): Position {
  const padding = SPRITE_CONFIG.ENEMY_SIZE;
  return {
    x: rng.nextInt(room.x + padding, room.x + room.width - padding),
    y: rng.nextInt(room.y + padding, room.y + room.height - padding)
  };
}

/**
 * Get spawn position for players in start room
 */
export function getPlayerSpawnPosition(dungeon: Dungeon, playerIndex: number): Position {
  const startRoom = dungeon.rooms.find(r => r.type === 'start')!;
  const spacing = SPRITE_CONFIG.PLAYER_SIZE * 2;
  const centerX = startRoom.x + startRoom.width / 2;
  const centerY = startRoom.y + startRoom.height / 2;

  // Arrange players in a circle around center
  const angle = (playerIndex * 2 * Math.PI) / 5; // Max 5 players
  const radius = spacing;

  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  };
}

/**
 * Place traps and chests in rooms
 * @param trapMultiplier - Theme-based multiplier for trap frequency (1.0 = normal, 3.0 = triple traps)
 */
function placeTrapsAndChests(rng: SeededRNG, rooms: Room[], floor: number, trapMultiplier: number = 1.0, theme?: FloorTheme): void {
  const isTreasureTheme = theme === FloorTheme.Treasure;

  for (const room of rooms) {
    room.traps = [];
    room.chests = [];

    // No traps or chests in start room
    if (room.type === 'start') continue;

    // Place chests (1-2 per floor, not in every room)
    // Higher chance in boss and rare rooms
    // Treasure theme: more chests everywhere
    const chestChance = room.type === 'boss' ? 1.0 :
                        room.type === 'rare' ? 0.8 :
                        isTreasureTheme ? 0.5 : 0.15;
    if (rng.chance(chestChance)) {
      const lootTier = room.type === 'boss' ? 'epic' :
                       room.type === 'rare' ? 'rare' :
                       rng.chance(0.2) ? 'rare' : 'common';

      // Treasure theme: 40% chance for non-boss chests to be mimics
      const isMimic = isTreasureTheme && room.type !== 'boss' && rng.chance(0.4);

      const chest = {
        id: `chest_${room.id}_1`,
        position: {
          x: room.x + rng.nextInt(40, room.width - 40),
          y: room.y + rng.nextInt(40, room.height - 40)
        },
        isOpen: false,
        isLocked: false, // TODO: Re-enable when key system is implemented: lootTier === 'epic' && rng.chance(0.5)
        lootTier: lootTier as 'common' | 'rare' | 'epic',
        isMimic
      };
      room.chests.push(chest);
    }

    // Treasure theme: extra chests in normal rooms
    if (isTreasureTheme && room.type === 'normal' && rng.chance(0.3)) {
      const isMimic = rng.chance(0.5); // 50% of extra chests are mimics
      room.chests.push({
        id: `chest_${room.id}_2`,
        position: {
          x: room.x + rng.nextInt(40, room.width - 40),
          y: room.y + rng.nextInt(40, room.height - 40)
        },
        isOpen: false,
        isLocked: false,
        lootTier: rng.chance(0.3) ? 'rare' : 'common',
        isMimic
      });
    }

    // Place traps starting from floor 2+
    if (floor < 2) continue;

    // Base spike trap chance, modified by theme multiplier
    const baseSpikeChance = 0.30;
    const adjustedSpikeChance = Math.min(0.9, baseSpikeChance * trapMultiplier);

    // Spike traps in normal rooms
    if (room.type === 'normal' && rng.chance(adjustedSpikeChance)) {
      const numSpikes = rng.nextInt(1, 3); // 1-3 spike traps
      for (let i = 0; i < numSpikes; i++) {
        room.traps.push({
          id: `trap_${room.id}_spike_${i}`,
          type: TrapType.Spikes,
          position: {
            x: room.x + rng.nextInt(50, room.width - 50),
            y: room.y + rng.nextInt(50, room.height - 50)
          },
          isActive: false,
          cooldown: 0,
          damage: 10 + floor * 3, // Scales with floor
          activeDuration: 1.5,    // Spikes up for 1.5 seconds
          inactiveDuration: 2.0   // Spikes down for 2 seconds
        });
      }
    }

    // Flamethrower traps in later floors (floor 4+) and boss rooms
    const baseFlameChance = 0.20;
    const adjustedFlameChance = Math.min(0.8, baseFlameChance * trapMultiplier);
    if ((floor >= 4 && room.type === 'normal' && rng.chance(adjustedFlameChance)) ||
        (room.type === 'boss' && floor >= 3)) {
      const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];
      const numFlames = room.type === 'boss' ? 2 : 1;

      for (let i = 0; i < numFlames; i++) {
        const direction = rng.pick(directions);
        let pos: Position;

        // Position flame thrower against a wall based on direction
        switch (direction) {
          case 'up':
            pos = { x: room.x + rng.nextInt(50, room.width - 50), y: room.y + room.height - 20 };
            break;
          case 'down':
            pos = { x: room.x + rng.nextInt(50, room.width - 50), y: room.y + 20 };
            break;
          case 'left':
            pos = { x: room.x + room.width - 20, y: room.y + rng.nextInt(50, room.height - 50) };
            break;
          case 'right':
            pos = { x: room.x + 20, y: room.y + rng.nextInt(50, room.height - 50) };
            break;
        }

        room.traps.push({
          id: `trap_${room.id}_flame_${i}`,
          type: TrapType.Flamethrower,
          position: pos,
          isActive: false,
          cooldown: rng.nextFloat(0, 3), // Stagger activation times
          damage: 15 + floor * 5, // Fire does more damage
          activeDuration: 2.0,    // Fire burst for 2 seconds
          inactiveDuration: 3.0,  // Cooldown for 3 seconds
          direction
        });
      }
    }
  }
}
