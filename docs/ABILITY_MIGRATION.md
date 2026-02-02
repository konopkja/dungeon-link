# Ability Migration System

This document explains how to safely rename or migrate abilities in Dungeon Link without breaking existing player saves.

## The Problem

When an ability is renamed (e.g., `mage_frostbolt` → `mage_meditation`), players with existing saved characters will have the OLD ability ID stored in their localStorage. If this isn't handled properly:

1. The ability displays as "Unknown" in the UI
2. The ability cannot be cast properly
3. Tooltips show incorrect information

## Architecture Overview

Ability migration happens in **THREE** places:

```
┌─────────────────────────────────────────────────────────────────┐
│                        SAVE DATA FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  localStorage ──► Server (createRunFromSave) ──► Client UI      │
│       │                    │                         │          │
│       │                    │                         │          │
│  Old ability ID      Migration #1              Migration #2     │
│  "mage_frostbolt"    transforms to             Client-side      │
│                      "mage_meditation"         fallback for     │
│                                                display          │
│                                                                 │
│                      Migration #3                               │
│                      GameScene tooltip                          │
│                      description fallback                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Migration Locations

### 1. Server-side Migration (Primary)
**File:** `server/src/game/GameState.ts`
**Function:** `createRunFromSave()`

This is the PRIMARY migration point. When a player loads their saved character, the server transforms old ability IDs to new ones before creating the player object.

```typescript
// In createRunFromSave()
const migratedAbilities = saveData.abilities.map(ability => {
  // Migrate mage_frostbolt -> mage_meditation
  if (ability.abilityId === 'mage_frostbolt') {
    console.log(`[DEBUG] Migrating ability mage_frostbolt -> mage_meditation`);
    return { ...ability, abilityId: 'mage_meditation' };
  }
  return ability;
});
```

### 2. Client-side Migration (AbilitySystem)
**File:** `client/src/systems/AbilitySystem.ts`
**Constant:** `ABILITY_MIGRATIONS`

This is a FALLBACK for cases where:
- The server hasn't been restarted after deployment
- There's a timing issue between client and server
- Old ability IDs are still in the network state

```typescript
const ABILITY_MIGRATIONS: Record<string, string> = {
  'mage_frostbolt': 'mage_meditation',
  'mage_blizzard': 'mage_blaze',
  // ... other migrations
};
```

### 3. Client-side Migration (GameScene)
**File:** `client/src/scenes/GameScene.ts`
**Function:** `getAbilityDescription()`

This handles tooltip descriptions for abilities, ensuring the correct description is shown even with old ability IDs.

```typescript
private getAbilityDescription(abilityId: string, rank: number = 1): string {
  const ABILITY_MIGRATIONS: Record<string, string> = {
    'mage_frostbolt': 'mage_meditation',
    // ... other migrations
  };
  const migratedId = ABILITY_MIGRATIONS[abilityId] ?? abilityId;
  // ... rest of function uses migratedId
}
```

## How to Rename an Ability

Follow this checklist when renaming any ability:

### Step 1: Update the Ability Definition
**File:** `shared/classes.ts`

Change the ability ID in the class definition:

```typescript
// Before
{ id: 'mage_frostbolt', name: 'Frostbolt', ... }

// After
{ id: 'mage_meditation', name: 'Meditation', ... }
```

### Step 2: Add Server-side Migration
**File:** `server/src/game/GameState.ts`

Add migration in `createRunFromSave()`:

```typescript
// Migrate mage_frostbolt -> mage_meditation
if (ability.abilityId === 'mage_frostbolt') {
  console.log(`[DEBUG] Migrating ability mage_frostbolt -> mage_meditation`);
  return { ...ability, abilityId: 'mage_meditation' };
}
```

### Step 3: Add Client-side Migration (AbilitySystem)
**File:** `client/src/systems/AbilitySystem.ts`

Add to `ABILITY_MIGRATIONS` constant:

```typescript
const ABILITY_MIGRATIONS: Record<string, string> = {
  'mage_frostbolt': 'mage_meditation',
  // ... existing migrations
};
```

### Step 4: Add Client-side Migration (GameScene)
**File:** `client/src/scenes/GameScene.ts`

Add to `ABILITY_MIGRATIONS` in `getAbilityDescription()`:

```typescript
const ABILITY_MIGRATIONS: Record<string, string> = {
  'mage_frostbolt': 'mage_meditation',
  // ... existing migrations
};
```

### Step 5: Update Any Hardcoded References
Search the codebase for the old ability ID:

```bash
grep -r "mage_frostbolt" --include="*.ts" --include="*.tsx"
```

Update any hardcoded references in:
- Combat logic (`Combat.ts`)
- Effect spawning (`GameScene.ts`)
- Buff handling (`GameState.ts`)

### Step 6: Update Tests
**File:** `server/src/tests/ability-migration.test.ts`

1. Add the migration to `ABILITY_MIGRATIONS` constant in the test file
2. Add the new ability ID to `REQUIRED_ABILITIES` array
3. Run the tests to verify everything is correct

### Step 7: Run Tests
```bash
npm test
```

Ensure all ability migration tests pass.

## Current Migration Map

| Old ID | New ID | Reason |
|--------|--------|--------|
| `mage_frostbolt` | `mage_meditation` | Reworked to mana restore ability |
| `mage_blizzard` | `mage_blaze` | Changed from AoE freeze to chain fire |
| `rogue_backstab` | `rogue_stealth` | Changed from damage to stealth buff |
| `rogue_eviscerate` | `rogue_blind` | Changed from finisher to stun |
| `shaman_bolt` | `shaman_chainlight` | Clarified as chain lightning |
| `paladin_consecration` | `paladin_retribution` | Changed from ground AoE to reflect damage |

## Testing Your Migration

After implementing all steps, verify the migration works:

1. **Create a save with the old ability** (if possible, or use a player who has it)
2. **Deploy the changes** to the server
3. **Load the saved character** and verify:
   - Ability displays correct name (not "Unknown")
   - Ability tooltip shows correct description
   - Ability can be cast and works correctly
   - Ability cooldown and mana cost are correct

## Common Issues

### "Unknown" Ability Display
**Cause:** Migration not added to all three locations
**Fix:** Ensure migration exists in GameState.ts, AbilitySystem.ts, and GameScene.ts

### Ability Works But Wrong Description
**Cause:** Missing migration in GameScene.ts `getAbilityDescription()`
**Fix:** Add migration to the `ABILITY_MIGRATIONS` constant in that function

### Server Restart Required
**Issue:** Changes aren't taking effect
**Cause:** Server running old code
**Fix:** Restart the server after deployment

### Client Cache Issues
**Issue:** Old client code still running
**Cause:** Browser cache
**Fix:** Hard refresh (Ctrl+Shift+R) or clear browser cache

## Best Practices

1. **Never delete migrations** - Old saves may still exist months later
2. **Keep migrations in sync** - All three locations must have the same mappings
3. **Log migrations** - Use console.log to track when migrations happen
4. **Test with old saves** - Keep test saves with old ability IDs for regression testing
5. **Run tests before deployment** - The ability-migration.test.ts file catches mismatches
