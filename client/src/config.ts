// Game configuration
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;

// Server connection - uses Vite environment variables
// In development: defaults to localhost:8080
// In production: set VITE_WS_URL to your Railway server URL
const getWebSocketUrl = (): string => {
  // Check for full WebSocket URL first (production)
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // Fallback to host/port for development
  const host = import.meta.env.VITE_WS_HOST || 'localhost';
  const port = import.meta.env.VITE_WS_PORT || '8080';
  const protocol = import.meta.env.PROD ? 'wss' : 'ws';

  return `${protocol}://${host}:${port}`;
};

export const WS_URL = getWebSocketUrl();

// Legacy exports for backwards compatibility
export const WS_HOST = import.meta.env.VITE_WS_HOST || 'localhost';
export const WS_PORT = parseInt(import.meta.env.VITE_WS_PORT || '8080', 10);
