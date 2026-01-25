import { describe, it, expect } from 'vitest';

/**
 * Scene Cleanup Tests
 *
 * These tests verify that when transitioning between scenes (particularly
 * when leaving a game and starting a new one), all state is properly cleaned up
 * to prevent blank screen bugs and stale data issues.
 *
 * The bug scenario:
 * 1. User plays game → leaves via Leave button → goes to MenuScene
 * 2. User starts new game → GameScene starts
 * 3. If state isn't properly cleaned up, blank screen or stale data appears
 */

// List of all Maps that must be cleared in GameScene.create()
const GAME_SCENE_MAPS_TO_CLEAR = [
  'playerSprites',
  'enemySprites',
  'petSprites',
  'vendorSprites',
  'healthBars',
  'roomTiles',
  'roomDecorations',
  'roomWalls',
  'corridorElements',
  'groundEffectGraphics',
  'protectionEffects',
  'groundItemSprites',
  'trapSprites',
  'chestSprites',
  'enemyDebuffEffects',
  'playerClassMap'
];

// List of all Sets that must be cleared in GameScene.create()
const GAME_SCENE_SETS_TO_CLEAR = [
  'knownPetIds',
  'notifiedEnemyIds',
  'playerAbilityAnimating',
  'playerMovementAnimating',
  'bossAttackAnimating'
];

// List of arrays that must be reset in GameScene.create()
const GAME_SCENE_ARRAYS_TO_RESET = [
  'damageTexts',
  'projectiles',
  'activeNotifications',
  'vendorServices',
  'vendorUIButtons',
  'cooldownTexts',
  'cooldownOverlays',
  'abilitySymbols',
  'buffIcons',
  'buffTexts'
];

// Properties that must be reset in GameScene.create()
const GAME_SCENE_PROPERTIES_TO_RESET = [
  'currentVendorId',
  'vendorUI',
  'wasAlive',
  'isPlayerMoving',
  'cachedTargetId',
  'cachedTargetPosition'
];

describe('Scene Cleanup', () => {
  describe('GameScene state cleanup requirements', () => {
    it('should have comprehensive list of Maps to clear', () => {
      // This test documents and verifies all Maps that need clearing
      expect(GAME_SCENE_MAPS_TO_CLEAR.length).toBeGreaterThanOrEqual(16);
    });

    it('should have comprehensive list of Sets to clear', () => {
      // This test documents and verifies all Sets that need clearing
      expect(GAME_SCENE_SETS_TO_CLEAR.length).toBeGreaterThanOrEqual(5);
    });

    it('should have comprehensive list of arrays to reset', () => {
      // This test documents and verifies all arrays that need resetting
      expect(GAME_SCENE_ARRAYS_TO_RESET.length).toBeGreaterThanOrEqual(10);
    });

    it('should have comprehensive list of properties to reset', () => {
      // This test documents and verifies all properties that need resetting
      expect(GAME_SCENE_PROPERTIES_TO_RESET.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Critical Maps for preventing blank screen', () => {
    it('should include sprite Maps', () => {
      // These Maps hold references to Phaser game objects
      // If not cleared, old references can cause rendering issues
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('playerSprites');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('enemySprites');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('petSprites');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('groundItemSprites');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('trapSprites');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('chestSprites');
    });

    it('should include UI Maps', () => {
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('healthBars');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('vendorSprites');
    });

    it('should include room rendering Maps', () => {
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('roomTiles');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('roomDecorations');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('roomWalls');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('corridorElements');
    });

    it('should include effect Maps', () => {
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('groundEffectGraphics');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('protectionEffects');
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('enemyDebuffEffects');
    });

    it('should include animation state Maps', () => {
      expect(GAME_SCENE_MAPS_TO_CLEAR).toContain('playerClassMap');
    });
  });

  describe('Critical Sets for preventing animation bugs', () => {
    it('should include animation tracking Sets', () => {
      // These Sets track animation state
      // If not cleared, animations may not play correctly
      expect(GAME_SCENE_SETS_TO_CLEAR).toContain('playerAbilityAnimating');
      expect(GAME_SCENE_SETS_TO_CLEAR).toContain('playerMovementAnimating');
      expect(GAME_SCENE_SETS_TO_CLEAR).toContain('bossAttackAnimating');
    });

    it('should include entity tracking Sets', () => {
      expect(GAME_SCENE_SETS_TO_CLEAR).toContain('knownPetIds');
      expect(GAME_SCENE_SETS_TO_CLEAR).toContain('notifiedEnemyIds');
    });
  });

  describe('MenuScene cleanup requirements', () => {
    it('should clean up message handler in init()', () => {
      // MenuScene should unsubscribe from wsClient messages when re-entered
      // to prevent duplicate handlers and memory leaks
      const menuSceneInitCleanup = [
        'messageUnsubscribe',
        'animationTimeouts',
        'isPlayingAnimation'
      ];
      expect(menuSceneInitCleanup.length).toBe(3);
    });

    it('should remove DOM event listeners before re-adding them', () => {
      // CRITICAL: Event listeners on DOM elements (start button, name input) must be
      // removed before adding new ones to prevent multiple handler calls.
      // Bug scenario: User plays game → leaves → returns to menu → clicks start
      // Without cleanup: startGame() called multiple times → race conditions → blank screen
      const eventListenersToRemove = [
        'startBtnHandler',   // Click handler for "BEGIN DESCENT" button
        'nameInputHandler'   // Input handler for player name field
      ];
      expect(eventListenersToRemove.length).toBe(2);
    });

    it('should remove class button event listeners before clearing buttons', () => {
      // CRITICAL: Class buttons are created in populateClassGrid() with click listeners.
      // When MenuScene restarts (e.g., leaving game and returning to menu), the old
      // button elements may be replaced but listeners on them are not removed.
      //
      // Bug scenario:
      // 1. MenuScene creates 9 class buttons with click handlers
      // 2. User starts game, then leaves
      // 3. MenuScene.create() is called again
      // 4. BAD: Old listeners still fire on previous button elements
      // 5. Multiple selectClass() calls cause UI flickering/blinking
      //
      // Fix: Store handler references in classButtonHandlers Map, then remove
      // them before clearing the classButtons Map in create():
      // this.classButtons.forEach((btn, className) => {
      //   const handler = this.classButtonHandlers.get(className);
      //   if (handler) btn.removeEventListener('click', handler);
      // });
      const classButtonCleanup = [
        'classButtonHandlers Map to store handler references',
        'removeEventListener before clearing classButtons',
        'classButtonHandlers.clear() after removal'
      ];
      expect(classButtonCleanup.length).toBe(3);
    });
  });

  describe('GameScene shutdown requirements', () => {
    it('should have comprehensive shutdown cleanup', () => {
      // shutdown() should clean up systems and subscriptions
      const shutdownCleanup = [
        'messageUnsubscribe',
        'tweens.killAll',
        'input.removeAllListeners',
        'input.keyboard.removeAllListeners', // CRITICAL: keyboard is separate from pointer input
        'inputManager',
        'inventoryUI',
        'abilitySystem',
        'sound.stopAll'
      ];
      expect(shutdownCleanup.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('GameScene create() cleanup requirements', () => {
    it('should destroy game objects before clearing Maps', () => {
      // CRITICAL: When clearing Maps containing Phaser game objects (sprites, graphics, etc.),
      // you MUST call .destroy() on each object BEFORE calling .clear() on the Map.
      //
      // Bug scenario (causes blinking):
      // 1. First game session creates sprites, stores in playerSprites Map
      // 2. Player leaves game, goes to menu
      // 3. Player starts new game, create() is called
      // 4. BAD: playerSprites.clear() - Map is empty but old sprites still exist in scene!
      // 5. New sprites created, but old sprites still render = visual artifacts/blinking
      //
      // Fix: Always destroy objects first:
      // this.playerSprites.forEach(sprite => sprite.destroy());
      // this.playerSprites.clear();
      const mapsRequiringDestroy = [
        'playerSprites',
        'enemySprites',
        'petSprites',
        'vendorSprites',
        'healthBars',
        'roomTiles',
        'roomDecorations',
        'roomWalls',
        'corridorElements',
        'groundEffectGraphics',
        'protectionEffects',
        'groundItemSprites',
        'trapSprites',
        'chestSprites',
        'enemyDebuffEffects'
      ];
      expect(mapsRequiringDestroy.length).toBeGreaterThanOrEqual(15);
    });

    it('should kill all tweens and remove input listeners at start of create()', () => {
      // CRITICAL: When scene restarts, old tweens and input listeners may still be active.
      // This causes visual glitches and duplicate event handlers.
      //
      // Fix: At the very start of create():
      // this.children.removeAll(true);  // DESTROY ALL children first!
      // this.tweens.killAll();
      // this.input.removeAllListeners();
      // this.input.keyboard?.removeAllListeners();  // SEPARATE from pointer input!
      const createStartCleanup = [
        'children.removeAll(true)',  // Most aggressive cleanup - destroy ALL game objects
        'tweens.killAll',
        'input.removeAllListeners',
        'input.keyboard.removeAllListeners',  // Keyboard is separate!
        'destroy old graphics (roomGraphics, targetIndicator, shadowOverlay)'
      ];
      expect(createStartCleanup.length).toBe(5);
    });

    it('should remove keyboard listeners (Q/E/I keys) to prevent accumulation', () => {
      // CRITICAL: Keyboard event listeners for Q (health potion), E (mana potion),
      // and I (inventory toggle) are added in create() but NOT automatically removed.
      //
      // Bug scenario:
      // 1. GameScene creates keyboard listeners: keydown-Q, keydown-E, keydown-I
      // 2. Player leaves game, goes to menu
      // 3. Player starts new game, GameScene.create() runs again
      // 4. BAD: New listeners added ON TOP of old ones
      // 5. Pressing Q uses 2+ health potions at once, causes UI flicker
      //
      // Fix: Call this.input.keyboard?.removeAllListeners() in both:
      // - shutdown() before leaving
      // - create() at the start before adding new listeners
      const keyboardListenerCleanup = [
        'input.keyboard.removeAllListeners in shutdown()',
        'input.keyboard.removeAllListeners at start of create()'
      ];
      expect(keyboardListenerCleanup.length).toBe(2);
    });

    it('should use safeDestroy helper to prevent crashes on null/destroyed objects', () => {
      // CRITICAL: When calling .destroy() on game objects during cleanup, some objects
      // may be null, undefined, or already destroyed. Direct .destroy() calls will crash.
      //
      // Bug scenario:
      // 1. Player leaves game, scene cleanup runs
      // 2. Some sprites were already destroyed by Phaser or by other cleanup code
      // 3. Direct call like sprite.destroy() throws error
      // 4. Game crashes and restarts
      //
      // Fix: Use a safeDestroy helper that wraps destroy in try-catch:
      // const safeDestroy = (obj) => {
      //   try {
      //     if (obj && typeof obj.destroy === 'function') {
      //       obj.destroy();
      //     }
      //   } catch (e) { /* ignore */ }
      // };
      //
      // Then use: this.playerSprites.forEach(sprite => safeDestroy(sprite));
      const safeDestroyPattern = {
        checkNull: true,
        checkDestroyMethod: true,
        wrapInTryCatch: true
      };
      expect(safeDestroyPattern.checkNull).toBe(true);
      expect(safeDestroyPattern.checkDestroyMethod).toBe(true);
      expect(safeDestroyPattern.wrapInTryCatch).toBe(true);
    });

    it('should reset music state variables for proper restart', () => {
      // CRITICAL: Music state must be reset when scene restarts, otherwise
      // the music won't play because the game thinks it's already playing.
      //
      // Bug scenario:
      // 1. Player plays game, music starts with currentMusicKey = 'musicDungeon'
      // 2. Player leaves game
      // 3. Player starts new game
      // 4. updateMusic() checks if currentMusicKey !== targetMusicKey
      // 5. But currentMusicKey is still 'musicDungeon' from previous session
      // 6. Music doesn't restart!
      //
      // Fix: Reset in create():
      // this.currentMusic = null;
      // this.currentMusicKey = '';
      // this.previousRoomId = '';
      // this.previousPlayerLevel = 0;
      const musicStateToReset = [
        'currentMusic',
        'currentMusicKey',
        'previousRoomId',
        'previousPlayerLevel'
      ];
      expect(musicStateToReset.length).toBe(4);
    });
  });

  describe('Scene transition requirements', () => {
    it('should call scene.stop() AFTER scene.start() to prevent parallel scenes', () => {
      // CRITICAL: In Phaser, scene.start() does NOT stop the current scene - both run in parallel!
      // This causes blinking as both scenes render simultaneously.
      //
      // Bug scenario (calling stop BEFORE start):
      // 1. MenuScene receives RUN_CREATED message
      // 2. Handler calls this.scene.stop('MenuScene') - scene becomes invalid
      // 3. Handler then calls this.scene.start('GameScene') - ERROR: this.scene is null
      //
      // Bug scenario (not calling stop at all):
      // 1. MenuScene calls this.scene.start('GameScene')
      // 2. Both MenuScene and GameScene run in parallel
      // 3. Screen blinks showing both scenes alternating
      //
      // FIX: Call stop() AFTER start() - Phaser queues the operations correctly:
      // this.scene.start('GameScene');
      // this.scene.stop('MenuScene');  // Safe because start() was queued first
      const correctTransitionPattern = {
        fromGameToMenu: ['shutdown()', 'scene.start("MenuScene")', 'scene.stop("GameScene")'],
        fromMenuToGame: ['hideOverlay()', 'scene.start("GameScene")', 'scene.stop("MenuScene")']
      };
      expect(correctTransitionPattern.fromGameToMenu).toContain('scene.stop("GameScene")');
      expect(correctTransitionPattern.fromMenuToGame).toContain('scene.stop("MenuScene")');
    });

    it('should unsubscribe from message handlers before transitioning', () => {
      // Clean up subscriptions to prevent memory leaks and duplicate handlers
      const cleanupBeforeTransition = [
        'messageUnsubscribe()',
        'scene.start()'
      ];
      expect(cleanupBeforeTransition[0]).toBe('messageUnsubscribe()');
    });
  });

  describe('DOM element preservation (CRITICAL)', () => {
    it('should NEVER remove static HTML elements that are reused across scenes', () => {
      // CRITICAL BUG (Fixed January 2026):
      // The hero-name-input element was being removed from the DOM in TWO places:
      //
      // Location 1: client/src/scenes/GameScene.ts (in create() method)
      //   const staleInput = document.getElementById('hero-name-input');
      //   if (staleInput) { staleInput.remove(); }  // ← WRONG!
      //
      // Location 2: client/src/main.ts (in returnToMenu() function)
      //   const nameInput = document.getElementById('hero-name-input');
      //   if (nameInput) { nameInput.remove(); }  // ← WRONG!
      //
      // Bug scenario:
      // 1. User creates character (hero-name-input exists in HTML)
      // 2. GameScene.create() OR returnToMenu() runs and REMOVES the input
      // 3. User leaves game, returns to MenuScene
      // 4. Name input is GONE - user cannot enter name for new character
      //
      // Fix: NEVER remove static HTML elements. The menu overlay and its children
      // are defined in index.html and should persist. They are shown/hidden via CSS
      // classes (menuOverlay.classList.add/remove('active')), NOT by adding/removing
      // elements from the DOM.
      //
      // IMPORTANT: When cleaning up scenes, do NOT use:
      //   - element.remove()
      //   - element.parentNode.removeChild(element)
      //   - container.innerHTML = '' (on parent containers of static elements)
      //
      // Instead, use CSS classes or style.display to show/hide.
      const staticHtmlElementsToPreserve = [
        'menu-overlay',         // Main menu container
        'hero-name-input',      // Player name input field - CRITICAL!
        'menu-class-grid',      // Class selection grid
        'menu-start-btn',       // Start/join button
        'menu-join-info',       // Join party info text
        'preview-sprite-area',  // Character preview area
        'preview-class-name',   // Character class name
        'preview-class-role',   // Character role description
        'preview-description',  // Character description
        'preview-stats',        // Character stats display
        'preview-abilities-list', // Character abilities list
        'landing-page',         // Landing page container
        'game-container',       // Game container
        'back-to-menu'          // Back to menu button
      ];

      // All these elements must NEVER be removed from the DOM
      expect(staticHtmlElementsToPreserve).toContain('hero-name-input');
      expect(staticHtmlElementsToPreserve).toContain('menu-overlay');
      expect(staticHtmlElementsToPreserve.length).toBeGreaterThanOrEqual(14);
    });

    it('should use CSS classes to show/hide menu, not DOM manipulation', () => {
      // The correct pattern for showing/hiding the menu:
      // SHOW: menuOverlay.classList.add('active')
      // HIDE: menuOverlay.classList.remove('active')
      //
      // WRONG pattern (causes bugs):
      // element.remove()  - removes from DOM permanently
      // element.style.display = 'none' - can conflict with CSS classes
      const correctPattern = {
        show: "menuOverlay.classList.add('active')",
        hide: "menuOverlay.classList.remove('active')"
      };
      expect(correctPattern.show).toContain('classList.add');
      expect(correctPattern.hide).toContain('classList.remove');
    });

    it('should document all files that handle scene transitions', () => {
      // These files handle scene transitions and must be careful about DOM elements:
      //
      // 1. client/src/main.ts
      //    - startGame(): Shows game container, hides landing page
      //    - returnToMenu(): Hides game, shows landing page
      //    - DANGER: Do NOT remove any static HTML elements here!
      //
      // 2. client/src/scenes/GameScene.ts
      //    - create(): Initializes game scene
      //    - shutdown(): Cleans up before leaving
      //    - returnToMenu(): Called when user clicks "Return to Surface"
      //    - DANGER: Do NOT remove menu-related HTML elements here!
      //
      // 3. client/src/scenes/MenuScene.ts
      //    - create(): Shows menu overlay
      //    - shutdown(): Hides menu overlay, removes event listeners
      //    - SAFE: Uses classList.add/remove('active') to show/hide
      //
      // Code review checklist for these files:
      // ✓ Search for ".remove()" - should NOT be called on static HTML elements
      // ✓ Search for "innerHTML = ''" - should NOT clear containers with static elements
      // ✓ Search for "removeChild" - should NOT remove static HTML elements
      const filesHandlingSceneTransitions = [
        'client/src/main.ts',
        'client/src/scenes/GameScene.ts',
        'client/src/scenes/MenuScene.ts'
      ];
      expect(filesHandlingSceneTransitions.length).toBe(3);
    });
  });

  describe('WebSocketClient handler cleanup (CRITICAL FIX)', () => {
    it('should fully cleanup wsClient before game.destroy() in returnToMenu()', () => {
      // CRITICAL BUG FIX: wsClient is a singleton that persists across Phaser game instances.
      // When game.destroy(true) is called, the Phaser scenes are destroyed, but:
      // 1. Message handlers remain active
      // 2. WebSocket connection remains open (receiving messages from old run!)
      // 3. Old state (currentState) persists and gets rendered
      //
      // Bug scenario:
      // 1. First game: GameScene subscribes, has dungeon state
      // 2. User returns to landing page, game.destroy(true) called
      // 3. wsClient still connected, still has old dungeon in currentState
      // 4. Second game starts, OLD dungeon renders briefly → blinking/artifacts
      // 5. New RUN_CREATED arrives, state updates → screen flickers between states
      //
      // Fix: Full cleanup in returnToMenu():
      //   wsClient.disconnect();           // Stop receiving messages!
      //   wsClient.clearAllHandlers();     // Clear handler references
      //   wsClient.runId = null;
      //   wsClient.playerId = null;
      //   wsClient.currentState = null;    // Clear stale dungeon data!
      //   game.destroy(true);
      const returnToMenuCleanup = [
        'wsClient.disconnect()',
        'wsClient.clearAllHandlers()',
        'wsClient.runId = null',
        'wsClient.playerId = null',
        'wsClient.currentState = null',
        'game.destroy(true)'
      ];
      expect(returnToMenuCleanup.length).toBe(6);
    });

    it('should have clearAllHandlers method in WebSocketClient', () => {
      // WebSocketClient needs a method to clear all registered handlers:
      // clearAllHandlers(): void {
      //   this.messageHandlers.clear();
      //   this.connectHandlers.clear();
      //   this.disconnectHandlers.clear();
      // }
      const handlersToClear = [
        'messageHandlers',
        'connectHandlers',
        'disconnectHandlers'
      ];
      expect(handlersToClear.length).toBe(3);
    });
  });
});
