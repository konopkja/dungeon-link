import Phaser from 'phaser';
import { wsClient } from '../network/WebSocketClient';

/**
 * UI Scene - runs parallel to GameScene for HUD elements
 * Currently integrated into GameScene for simplicity
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // UI is currently handled in GameScene
    // This scene can be used for more complex overlays in the future
  }

  update(): void {
    // Update UI elements
  }
}
