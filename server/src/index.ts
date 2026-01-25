import { GameWebSocketServer } from './WebSocketServer.js';
import { WS_CONFIG } from '@dungeon-link/shared';

console.log('Starting Dungeon Link Server...');

// Use PORT from environment (Railway sets this) or fallback to config
const port = parseInt(process.env.PORT || String(WS_CONFIG.PORT), 10);

const server = new GameWebSocketServer(port);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  server.stop();
  process.exit(0);
});

console.log(`Server running on port ${port}`);
console.log('Waiting for connections...');
