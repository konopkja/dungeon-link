import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { ClientMessage, ServerMessage, ClassName } from '@dungeon-link/shared';
import { WS_CONFIG, GAME_CONFIG } from '@dungeon-link/shared';
import { gameStateManager } from './game/GameState.js';
import {
  handleWalletConnect,
  handleWalletDisconnect,
  handleGetCryptoVendorServices,
  handleVerifyCryptoPurchase,
  handleRequestClaimAttestation,
  handleGetPoolStatus,
  handleBossChestOpened,
  initializeCryptoState,
  cleanupCryptoState,
  resetFloorPurchases,
} from './crypto/cryptoHandler.js';
import { initializeSigner } from './crypto/attestation.js';
import { stateTracker } from './utils/stateDelta.js';

interface ClientConnection {
  ws: WebSocket;
  clientId: string;  // Unique ID for state tracking
  playerId: string | null;
  runId: string | null;
  // Rate limiting: track message timestamps
  messageTimes: number[];
}

// Rate limit: max messages per second per client
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 60; // 60 msgs/sec is generous for 20Hz game

// Save data validation limits
const MAX_PLAYER_LEVEL = 50;
const MAX_FLOOR = 30;
const MAX_GOLD = 99999;
const MAX_ABILITIES = 10;
const MAX_BACKPACK_SIZE = 20;
const VALID_CLASS_IDS = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];

/**
 * Validate save data from client to prevent fabricated characters.
 * Returns an error string if invalid, null if valid.
 */
export function validateSaveData(saveData: any): string | null {
  if (!saveData || typeof saveData !== 'object') return 'Invalid save data';
  if (typeof saveData.playerName !== 'string' || saveData.playerName.length === 0 || saveData.playerName.length > 30) {
    return 'Invalid player name';
  }
  if (!VALID_CLASS_IDS.includes(saveData.classId)) return 'Invalid class ID';
  if (typeof saveData.level !== 'number' || saveData.level < 1 || saveData.level > MAX_PLAYER_LEVEL) {
    return 'Invalid level';
  }
  if (typeof saveData.gold !== 'number' || saveData.gold < 0 || saveData.gold > MAX_GOLD) {
    return 'Invalid gold';
  }
  if (typeof saveData.highestFloor !== 'number' || saveData.highestFloor < 1 || saveData.highestFloor > MAX_FLOOR) {
    return 'Invalid floor';
  }
  if (Array.isArray(saveData.abilities) && saveData.abilities.length > MAX_ABILITIES) {
    return 'Too many abilities';
  }
  if (Array.isArray(saveData.backpack) && saveData.backpack.length > MAX_BACKPACK_SIZE) {
    return 'Backpack too large';
  }
  if (typeof saveData.xp !== 'number' || saveData.xp < 0) return 'Invalid XP';
  if (typeof saveData.lives !== 'undefined' && (typeof saveData.lives !== 'number' || saveData.lives < 0 || saveData.lives > 5)) {
    return 'Invalid lives';
  }
  return null;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private httpServer: ReturnType<typeof createServer>;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  // Index for O(1) broadcast to run instead of O(all_clients) scan
  private runClients: Map<string, Set<WebSocket>> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(port: number = WS_CONFIG.PORT) {
    // Create HTTP server for healthchecks
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Healthcheck endpoint
      if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'dungeon-link-server',
          clients: this.clients.size
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Attach WebSocket server to HTTP server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.wss.on('error', (error) => console.error('WebSocket server error:', error));

    // Start HTTP server
    this.httpServer.listen(port, () => {
      console.log(`Server started on port ${port} (HTTP + WebSocket)`);
    });

    // Initialize crypto signer
    initializeSigner();

    // Start game loop
    this.startGameLoop();
  }

  private handleConnection(ws: WebSocket): void {
    console.log('Client connected');

    // Generate unique client ID for state tracking
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const client: ClientConnection = {
      ws,
      clientId,
      playerId: null,
      runId: null,
      messageTimes: []
    };

    this.clients.set(ws, client);

    ws.on('message', (data) => {
      try {
        console.log('[DEBUG] Received message:', data.toString().substring(0, 100));
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(client, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`Client disconnected - code: ${code}, reason: ${reason || 'none'}`);
      if (client.playerId) {
        gameStateManager.removePlayer(client.playerId);

        // Clean up crypto state (single-player: always cleanup on disconnect)
        if (client.runId) {
          cleanupCryptoState(client.runId);
        }
      }
      // Clean up run-to-client index
      if (client.runId) {
        this.removeFromRunIndex(client.runId, ws);
      }
      // Clean up state tracking for this client
      stateTracker.removeClient(client.clientId);
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  /**
   * Add a WebSocket to the run-to-client index for O(1) broadcast.
   */
  private addToRunIndex(runId: string, ws: WebSocket): void {
    let clients = this.runClients.get(runId);
    if (!clients) {
      clients = new Set();
      this.runClients.set(runId, clients);
    }
    clients.add(ws);
  }

  /**
   * Remove a WebSocket from the run-to-client index.
   */
  private removeFromRunIndex(runId: string, ws: WebSocket): void {
    const clients = this.runClients.get(runId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.runClients.delete(runId);
      }
    }
  }

  /**
   * Check if client is sending messages too fast.
   * Returns true if rate limited (message should be dropped).
   */
  private isRateLimited(client: ClientConnection): boolean {
    const now = Date.now();
    // Remove timestamps outside the window
    client.messageTimes = client.messageTimes.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (client.messageTimes.length >= RATE_LIMIT_MAX_MESSAGES) {
      return true;
    }
    client.messageTimes.push(now);
    return false;
  }

  private handleMessage(client: ClientConnection, message: ClientMessage): void {
    // Rate limiting — drop messages from flooding clients
    if (this.isRateLimited(client)) {
      console.warn(`[RATE LIMIT] Client ${client.clientId} exceeded rate limit, dropping message`);
      return;
    }

    switch (message.type) {
      case 'CREATE_RUN': {
        try {
          console.log('[DEBUG] Creating run for', message.playerName, message.classId);
          const result = gameStateManager.createRun(message.playerName, message.classId);
          console.log('[DEBUG] Run created:', result.runId);
          client.playerId = result.playerId;
          client.runId = result.runId;
          this.addToRunIndex(result.runId, client.ws);

          // Initialize crypto state for this run
          initializeCryptoState(result.runId);

          console.log('[DEBUG] Sending RUN_CREATED response');
          this.send(client.ws, {
            type: 'RUN_CREATED',
            runId: result.runId,
            state: result.state
          });
          console.log('[DEBUG] RUN_CREATED sent successfully');
        } catch (error) {
          console.error('[ERROR] Failed to create run:', error);
        }
        break;
      }

      case 'CREATE_RUN_FROM_SAVE': {
        // Validate save data to prevent fabricated characters
        const validationError = validateSaveData(message.saveData);
        if (validationError) {
          console.warn(`[SECURITY] Invalid save data from ${client.clientId}: ${validationError}`);
          this.send(client.ws, {
            type: 'ERROR' as any,
            message: `Invalid save data: ${validationError}`
          });
          break;
        }

        try {
          const result = gameStateManager.createRunFromSave(message.saveData);
          client.playerId = result.playerId;
          client.runId = result.runId;
          this.addToRunIndex(result.runId, client.ws);

          // Initialize crypto state for this run
          initializeCryptoState(result.runId);

          this.send(client.ws, {
            type: 'RUN_CREATED',
            runId: result.runId,
            state: result.state
          });
        } catch (error) {
          console.error('[ERROR] Failed to create run from save:', error);
        }
        break;
      }

      // NOTE: JOIN_RUN removed - game is now single-player only

      case 'PLAYER_INPUT': {
        if (!client.playerId) return;

        const events = gameStateManager.processInput(client.playerId, message.input);

        // Broadcast combat events to all players in run
        if (events.length > 0 && client.runId) {
          for (const event of events) {
            this.broadcastToRun(client.runId, {
              type: 'COMBAT_EVENT',
              event
            });
          }
        }
        break;
      }

      case 'SET_TARGET': {
        if (!client.playerId) return;
        gameStateManager.setPlayerTarget(client.playerId, message.targetId);
        break;
      }

      case 'ADVANCE_FLOOR': {
        if (!client.runId) return;

        const state = gameStateManager.advanceFloor(client.runId);
        if (state) {
          // Reset crypto purchases for new floor
          resetFloorPurchases(client.runId);

          // Invalidate state cache for all clients in this run
          // This forces a full state update after floor change
          for (const [, c] of this.clients) {
            if (c.runId === client.runId) {
              stateTracker.invalidateClient(c.clientId);
            }
          }

          this.broadcastToRun(client.runId, {
            type: 'FLOOR_COMPLETE',
            floor: state.floor
          });

          // Send full state update (cache was just invalidated)
          this.broadcastStateToRun(client.runId, state);
        }
        break;
      }

      case 'PING': {
        this.send(client.ws, { type: 'PONG' });
        break;
      }

      case 'USE_ITEM': {
        if (!client.playerId || !client.runId) return;
        const result = gameStateManager.useItem(client.playerId, message.itemId);
        if (result.success && result.potionType) {
          // Notify player that potion was used (for sound effect)
          this.send(client.ws, {
            type: 'POTION_USED',
            playerId: client.playerId,
            potionType: result.potionType
          });
        }
        break;
      }

      case 'SWAP_EQUIPMENT': {
        if (!client.playerId) return;
        gameStateManager.swapEquipment(client.playerId, message.backpackIndex, message.slot);
        break;
      }

      case 'UNEQUIP_ITEM': {
        if (!client.playerId) return;
        gameStateManager.unequipItem(client.playerId, message.slot);
        break;
      }

      case 'INTERACT_VENDOR': {
        console.log('[DEBUG] INTERACT_VENDOR - playerId:', client.playerId, 'runId:', client.runId, 'vendorId:', message.vendorId);
        if (!client.playerId || !client.runId) {
          console.log('[DEBUG] INTERACT_VENDOR - missing playerId or runId');
          return;
        }
        const services = gameStateManager.getVendorServices(client.playerId, message.vendorId);
        console.log('[DEBUG] INTERACT_VENDOR - services:', services);
        // Always send response, even if services is null (send empty array)
        this.send(client.ws, {
          type: 'VENDOR_SERVICES',
          vendorId: message.vendorId,
          services: services || []
        });
        console.log('[DEBUG] INTERACT_VENDOR - sent VENDOR_SERVICES with', (services || []).length, 'services');
        break;
      }

      case 'PURCHASE_SERVICE': {
        if (!client.playerId || !client.runId) return;
        const result = gameStateManager.purchaseService(
          client.playerId,
          message.vendorId,
          message.serviceType,
          message.abilityId,
          message.itemId
        );
        this.send(client.ws, {
          type: 'PURCHASE_RESULT',
          success: result.success,
          message: result.message,
          newGold: result.newGold
        });
        break;
      }

      case 'PICKUP_GROUND_ITEM': {
        // Manual click-to-pickup - just pick up the item, no notification
        // The state update will show the item disappeared
        // Auto-pickup in update loop handles notifications for nearby items
        if (!client.playerId || !client.runId) return;
        gameStateManager.pickupGroundItem(client.runId, client.playerId, message.itemId);
        break;
      }

      case 'OPEN_CHEST': {
        if (!client.playerId || !client.runId) return;
        const chestResult = gameStateManager.openChest(client.runId, client.playerId, message.chestId);
        if (chestResult) {
          this.broadcastToRun(client.runId, {
            type: 'CHEST_OPENED',
            chestId: message.chestId,
            playerId: client.playerId,
            loot: chestResult.lootDescriptions
          });

          // Trigger ETH drop for boss room chests
          if (chestResult.isBossRoomChest) {
            handleBossChestOpened(client.runId, chestResult.floor, chestResult.isSolo, client.ws);
          }
        }
        break;
      }

      // Crypto messages
      case 'CONNECT_WALLET': {
        if (!client.runId) return;
        handleWalletConnect(client.runId, message.walletAddress, client.ws);
        break;
      }

      case 'DISCONNECT_WALLET': {
        if (!client.runId) return;
        handleWalletDisconnect(client.runId, client.ws);
        break;
      }

      case 'GET_CRYPTO_VENDOR_SERVICES': {
        if (!client.runId) return;
        handleGetCryptoVendorServices(client.runId, client.ws);
        break;
      }

      case 'VERIFY_CRYPTO_PURCHASE': {
        if (!client.runId) return;
        handleVerifyCryptoPurchase(
          client.runId,
          message.txHash,
          message.potionType,
          message.paymentToken,
          client.ws
        );
        break;
      }

      case 'REQUEST_CLAIM_ATTESTATION': {
        if (!client.runId) return;
        handleRequestClaimAttestation(client.runId, client.ws);
        break;
      }

      case 'GET_POOL_STATUS': {
        if (!client.runId) return;
        handleGetPoolStatus(client.runId, client.ws);
        break;
      }
    }
  }

  private startGameLoop(): void {
    const tickRate = 1000 / GAME_CONFIG.SERVER_TICK_RATE;

    this.updateInterval = setInterval(() => {
      const updates = gameStateManager.update();

      for (const [runId, { state, events, tauntEvents, collectedItems, bossPhaseEvents }] of updates) {
        // Broadcast state update only if something changed (per-client tracking)
        // This strips RunTracking and only sends relevant rooms
        this.broadcastStateToRun(runId, state);

        // Broadcast combat events
        for (const event of events) {
          this.broadcastToRun(runId, {
            type: 'COMBAT_EVENT',
            event
          });
        }

        // Broadcast taunt events
        for (const event of tauntEvents) {
          this.broadcastToRun(runId, {
            type: 'TAUNT_EVENT',
            event
          });
        }

        // Broadcast boss phase change events
        for (const event of bossPhaseEvents) {
          this.broadcastToRun(runId, {
            type: 'BOSS_PHASE_CHANGE',
            bossId: event.bossId,
            bossName: event.bossName,
            phase: event.phase,
            mechanicName: event.mechanicName
          });
        }

        // Broadcast loot drops
        if (state.pendingLoot.length > 0) {
          this.broadcastToRun(runId, {
            type: 'LOOT_DROP',
            loot: state.pendingLoot
          });
          state.pendingLoot = [];
        }

        // Broadcast item collected notifications
        for (const item of collectedItems) {
          this.broadcastToRun(runId, {
            type: 'ITEM_COLLECTED',
            playerId: item.playerId,
            itemName: item.itemName,
            itemType: item.itemType
          });
        }
      }
    }, tickRate);
  }

  // Payload size tracking for monitoring (log every 100 updates to avoid spam)
  private updateCount = 0;
  private totalFullSyncBytes = 0;
  private totalDeltaBytes = 0;
  private fullSyncCount = 0;
  private deltaCount = 0;

  /**
   * Broadcast state to run with delta optimization.
   * - First update sends full state (STATE_UPDATE) for initial sync
   * - Subsequent updates send only delta (DELTA_UPDATE) for bandwidth savings
   * - Reduces payload from ~10KB to ~500-1000 bytes after initial sync
   */
  /**
   * Broadcast state to run with delta optimization.
   * Uses run-to-client index for O(1) lookup instead of scanning all clients.
   * Serializes once and sends the raw string to avoid double JSON.stringify.
   */
  private broadcastStateToRun(runId: string, state: import('@dungeon-link/shared').RunState): void {
    const runWsSet = this.runClients.get(runId);
    if (!runWsSet || runWsSet.size === 0) return;

    for (const ws of runWsSet) {
      const client = this.clients.get(ws);
      if (!client) continue;

      if (stateTracker.needsFullSync(client.clientId)) {
        const clientState = stateTracker.prepareClientState(client.clientId, state, true);
        if (clientState !== null) {
          // Serialize once, send raw string — eliminates double stringify
          const payload = JSON.stringify({ type: 'STATE_UPDATE', state: clientState });
          this.sendRaw(ws, payload);
          stateTracker.markFullSyncSent(client.clientId, state);

          this.totalFullSyncBytes += payload.length;
          this.fullSyncCount++;
        }
      } else {
        const clientState = stateTracker.prepareClientState(client.clientId, state);
        if (clientState !== null) {
          const delta = stateTracker.generateDeltaState(state, client.clientId);
          if (delta !== null) {
            const payload = JSON.stringify({ type: 'DELTA_UPDATE', delta });
            this.sendRaw(ws, payload);

            this.totalDeltaBytes += payload.length;
            this.deltaCount++;
          }
        }
      }
    }

    // Log stats every 100 updates
    this.updateCount++;
    if (this.updateCount % 100 === 0) {
      const avgFullSync = this.fullSyncCount > 0 ? Math.round(this.totalFullSyncBytes / this.fullSyncCount) : 0;
      const avgDelta = this.deltaCount > 0 ? Math.round(this.totalDeltaBytes / this.deltaCount) : 0;
      console.log(`[WS Stats] Full syncs: ${this.fullSyncCount} (avg ${avgFullSync} bytes), Deltas: ${this.deltaCount} (avg ${avgDelta} bytes)`);
    }
  }

  /**
   * Send a pre-serialized string directly to avoid double JSON.stringify.
   */
  private sendRaw(ws: WebSocket, payload: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all clients in a run.
   * Uses run-to-client index for O(1) lookup.
   */
  private broadcastToRun(runId: string, message: ServerMessage, exclude?: WebSocket): void {
    const runWsSet = this.runClients.get(runId);
    if (!runWsSet || runWsSet.size === 0) return;

    // Serialize once for all recipients
    const payload = JSON.stringify(message);
    for (const ws of runWsSet) {
      if (ws !== exclude) {
        this.sendRaw(ws, payload);
      }
    }
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.wss.close();
    this.httpServer.close();
  }
}
