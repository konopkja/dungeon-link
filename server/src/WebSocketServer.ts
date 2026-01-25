import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { ClientMessage, ServerMessage, ClassName } from '@dungeon-link/shared';
import { WS_CONFIG, GAME_CONFIG } from '@dungeon-link/shared';
import { gameStateManager } from './game/GameState.js';

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  runId: string | null;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private httpServer: ReturnType<typeof createServer>;
  private clients: Map<WebSocket, ClientConnection> = new Map();
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

    // Start game loop
    this.startGameLoop();
  }

  private handleConnection(ws: WebSocket): void {
    console.log('Client connected');

    const client: ClientConnection = {
      ws,
      playerId: null,
      runId: null
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

        // Notify other players in the run
        if (client.runId) {
          this.broadcastToRun(client.runId, {
            type: 'PLAYER_LEFT',
            playerId: client.playerId
          }, client.ws);
        }
      }
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private handleMessage(client: ClientConnection, message: ClientMessage): void {
    switch (message.type) {
      case 'CREATE_RUN': {
        try {
          console.log('[DEBUG] Creating run for', message.playerName, message.classId);
          const result = gameStateManager.createRun(message.playerName, message.classId);
          console.log('[DEBUG] Run created:', result.runId);
          client.playerId = result.playerId;
          client.runId = result.runId;

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
        const result = gameStateManager.createRunFromSave(message.saveData);
        client.playerId = result.playerId;
        client.runId = result.runId;

        this.send(client.ws, {
          type: 'RUN_CREATED',
          runId: result.runId,
          state: result.state
        });
        break;
      }

      case 'JOIN_RUN': {
        const result = gameStateManager.joinRun(message.runId, message.playerName, message.classId);

        if (!result) {
          this.send(client.ws, {
            type: 'JOIN_ERROR',
            message: 'Run not found or full'
          });
          return;
        }

        client.playerId = result.playerId;
        client.runId = message.runId;

        // Send join confirmation to new player
        this.send(client.ws, {
          type: 'RUN_JOINED',
          playerId: result.playerId,
          state: result.state
        });

        // Notify existing players
        const newPlayer = result.state.players.find(p => p.id === result.playerId);
        if (newPlayer) {
          this.broadcastToRun(message.runId, {
            type: 'PLAYER_JOINED',
            player: newPlayer
          }, client.ws);
        }
        break;
      }

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
          this.broadcastToRun(client.runId, {
            type: 'FLOOR_COMPLETE',
            floor: state.floor
          });

          this.broadcastToRun(client.runId, {
            type: 'STATE_UPDATE',
            state
          });
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
        }
        break;
      }
    }
  }

  private startGameLoop(): void {
    const tickRate = 1000 / GAME_CONFIG.SERVER_TICK_RATE;

    this.updateInterval = setInterval(() => {
      const updates = gameStateManager.update();

      for (const [runId, { state, events, collectedItems }] of updates) {
        // Broadcast state update
        this.broadcastToRun(runId, {
          type: 'STATE_UPDATE',
          state
        });

        // Broadcast combat events
        for (const event of events) {
          this.broadcastToRun(runId, {
            type: 'COMBAT_EVENT',
            event
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

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToRun(runId: string, message: ServerMessage, exclude?: WebSocket): void {
    for (const [ws, client] of this.clients) {
      if (client.runId === runId && ws !== exclude) {
        this.send(ws, message);
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
