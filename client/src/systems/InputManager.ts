import Phaser from 'phaser';
import { wsClient } from '../network/WebSocketClient';

export interface InputState {
  moveX: number;
  moveY: number;
  targetX: number;
  targetY: number;
  abilities: boolean[];
}

export class InputManager {
  private scene: Phaser.Scene;
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    THREE: Phaser.Input.Keyboard.Key;
    FOUR: Phaser.Input.Keyboard.Key;
    FIVE: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  public currentInput: InputState = {
    moveX: 0,
    moveY: 0,
    targetX: 0,
    targetY: 0,
    abilities: [false, false, false, false, false]
  };

  public targetEntityId: string | null = null;
  private lastSentInput: { moveX: number; moveY: number } = { moveX: 0, moveY: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Create keyboard keys
    this.keys = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      ONE: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      TWO: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      THREE: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      FOUR: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      FIVE: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
      SPACE: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    };

    // Setup ability key handlers
    this.setupAbilityKeys();
  }

  private setupAbilityKeys(): void {
    // Ability keys 1-5
    [this.keys.ONE, this.keys.TWO, this.keys.THREE, this.keys.FOUR, this.keys.FIVE].forEach((key, index) => {
      key.on('down', () => {
        this.currentInput.abilities[index] = true;
      });
      key.on('up', () => {
        this.currentInput.abilities[index] = false;
      });
    });
  }

  /**
   * Update input state (call every frame)
   */
  update(): void {
    // Movement
    this.currentInput.moveX = 0;
    this.currentInput.moveY = 0;

    if (this.keys.W.isDown) this.currentInput.moveY = -1;
    if (this.keys.S.isDown) this.currentInput.moveY = 1;
    if (this.keys.A.isDown) this.currentInput.moveX = -1;
    if (this.keys.D.isDown) this.currentInput.moveX = 1;

    // Normalize diagonal movement
    if (this.currentInput.moveX !== 0 && this.currentInput.moveY !== 0) {
      const factor = 1 / Math.sqrt(2);
      this.currentInput.moveX *= factor;
      this.currentInput.moveY *= factor;
    }

    // Mouse position (for targeting)
    this.currentInput.targetX = this.scene.input.mousePointer.worldX;
    this.currentInput.targetY = this.scene.input.mousePointer.worldY;

    // Send input to server if changed
    this.sendInputToServer();
  }

  /**
   * Send input to server
   */
  private sendInputToServer(): void {
    const { moveX, moveY } = this.currentInput;

    // Only send if movement changed
    if (moveX !== this.lastSentInput.moveX || moveY !== this.lastSentInput.moveY) {
      wsClient.sendInput(moveX, moveY);
      this.lastSentInput = { moveX, moveY };
    }
  }

  /**
   * Cast ability by index
   */
  castAbility(index: number): void {
    const player = wsClient.getCurrentPlayer();
    if (!player || index >= player.abilities.length) return;

    const ability = player.abilities[index];

    // Check cooldown and mana before sending to prevent spam
    if (ability.currentCooldown > 0) return;

    wsClient.sendInput(
      this.currentInput.moveX,
      this.currentInput.moveY,
      ability.abilityId,
      this.targetEntityId ?? undefined
    );
  }

  /**
   * Set target entity
   */
  setTarget(entityId: string | null): void {
    this.targetEntityId = entityId;
    // Send target to server for auto-attack
    wsClient.setTarget(entityId);
  }

  /**
   * Check if ability key just pressed
   */
  isAbilityKeyJustPressed(index: number): boolean {
    const keys = [this.keys.ONE, this.keys.TWO, this.keys.THREE, this.keys.FOUR, this.keys.FIVE];
    return Phaser.Input.Keyboard.JustDown(keys[index]);
  }

  /**
   * Check if space just pressed (for advancing floors, etc)
   */
  isSpaceJustPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
  }

  /**
   * Destroy input manager
   */
  destroy(): void {
    // Clean up keys
    Object.values(this.keys).forEach(key => key.destroy());
  }
}
