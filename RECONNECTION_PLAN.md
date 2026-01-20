# Reconnection with Fairness Preservation - Implementation Plan

## Overview

Currently, when a player disconnects during a performance, they are immediately removed from the session. If they reconnect, they are treated as a "late joiner" and cannot participate in the current performance, losing all their fairness tracking data.

This document outlines a plan to implement reconnection that preserves fairness counts for players who disconnect and reconnect during the same performance, while still treating truly new late joiners appropriately.

## Goals

1. **Preserve Fairness**: Players who disconnect/reconnect during a performance should retain their original player index and fairness tracking data
2. **Distinguish Late Joiners**: Players who were never in the session when the performance started should still be treated as late joiners
3. **Maintain Performance Integrity**: Reconnection should not break or disrupt the ongoing performance

## Current Behavior

- Player disconnects → Immediately removed from `session.players` array
- Engine arrays (`previousStates`, `playCounts`, `playStreaks`, etc.) remain unchanged (still sized for original player count)
- Fairness tracking tied to array index, not persistent player identity
- Player rejoins → Gets new socket.id and new player index
- Engine arrays still reference old index (now unused/ghost slot)
- New index has zero fairness counts → Treated as completely new player

## Proposed Solution

### 1. Persistent Player Identity

**Problem**: Currently using `socket.id` as player identifier, which changes on reconnect.

**Solution**: Add persistent player token/ID system:
- Generate unique token when player first joins session
- Store token in player object: `{ id: socket.id, token: "uuid", nickname: "...", ... }`
- Use token as primary identifier for reconnection matching

**Implementation**:
- Add token generation function in `session-manager.js`
- Modify `addPlayerToSession()` to generate/store token
- Client stores token in localStorage for reconnection attempts

### 2. Track Performance Participation

**Problem**: Need to know who was in the session when performance started.

**Solution**: Add participation tracking:
- When performance starts, mark all current players with `participatedInCurrentPerformance: true`
- Store `originalIndex` for each player (their position when performance started)
- Track `performanceStartTime` at player level (or use session-level timestamp)

**Implementation**:
- In `start-performance` handler, iterate through `session.players` and mark participation
- Store original index for each player
- Add these fields to player object structure

### 3. Disconnect Handling During Performance

**Problem**: Currently removes player immediately, losing their slot.

**Solution**: Mark as disconnected but preserve slot during performance:
- If `session.state === 'performing'`: Mark player as `disconnected: true`, keep in `session.players`
- Keep their original index intact
- Engine arrays remain unchanged (slot still exists)
- Only remove if performance ends or session closes

**Implementation**:
- Modify `handleDisconnect()` in `socket-handlers.js`
- Add check for performance state before removing
- Set `player.disconnected = true` and `player.id = null` (clear socket reference)
- Keep player object in array at original index

### 4. Reconnection Detection

**Problem**: Need to distinguish reconnection from late join.

**Solution**: Check player history on join:
- When player joins during performance, check if they have a matching token in `session.players`
- If found with `participatedInCurrentPerformance: true` → Reconnection
- If not found → Late joiner

**Implementation**:
- In `join-session` handler, check for existing player by token
- If reconnecting: Restore their slot (update socket.id, clear disconnected flag, restore original index)
- If late joining: Add as new player with `joinedLate: true` flag

### 5. Restore Original Slot

**Problem**: Need to put reconnecting player back at their original index.

**Solution**: Preserve array position:
- Player object already exists in array at correct index (we didn't remove it)
- Just update socket.id and clear disconnected flag
- Engine arrays already reference correct index
- No need to resize or reorder

**Implementation**:
- Find player by token in existing `session.players` array
- Update `player.id = socket.id` (new socket)
- Set `player.disconnected = false`
- Restore socket room membership
- Send reconnected state (not late-join state)

## Implementation Steps

### Phase 1: Add Persistent Identity
1. Add token generation utility
2. Modify `addPlayerToSession()` to generate/store tokens
3. Client stores token in localStorage on successful join
4. Client attempts to send token on reconnection

### Phase 2: Track Participation
1. Add `participatedInCurrentPerformance` and `originalIndex` to player model
2. Mark all players when performance starts
3. Store original indices

### Phase 3: Modify Disconnect Handling
1. Update `handleDisconnect()` to check performance state
2. Mark as disconnected instead of removing during performance
3. Test edge cases (conductor disconnect, multiple disconnects)

### Phase 4: Implement Reconnection Detection
1. Add token-based player lookup in `join-session`
2. Distinguish reconnection vs late join
3. Restore original slot for reconnectors
4. Send appropriate state (reconnected vs late-joined)

### Phase 5: Client-Side Updates
1. Update client to send token on reconnection attempt
2. Handle `reconnected` event (different from `session-joined`)
3. Restore previous state without late-joiner restrictions

## Edge Cases to Handle

1. **Multiple Disconnects/Reconnects**: Same player disconnects multiple times
2. **Conductor Disconnect/Reconnect**: Should restore conductor role if still available
3. **Disconnect in Lobby, Reconnect During Performance**: Should be late joiner (never participated)
4. **Performance Ends While Disconnected**: Player misses entire performance, can join next one
5. **Token Conflicts**: Multiple players somehow get same token (very unlikely with UUID)
6. **Session Cleanup**: When to actually remove disconnected players (after performance ends?)

## Testing Scenarios

1. Player disconnects mid-performance, reconnects → Should restore to same slot with fairness intact
2. Player disconnects in lobby, rejoins during performance → Should be late joiner
3. Player disconnects, performance ends, rejoins → Should be able to join next performance normally
4. Multiple players disconnect/reconnect simultaneously → Should all restore correctly
5. Conductor disconnects/reconnects during performance → Should restore as regular player (conductor promotion may have occurred)

## Risk Assessment

**Low Risk**:
- Token generation and storage
- Participation tracking
- Client-side token storage

**Medium Risk**:
- Disconnect handling changes (could affect other code that assumes removal)
- Reconnection detection logic (edge cases)

**Higher Risk**:
- Ensuring engine arrays stay consistent with player slots
- Handling all edge cases correctly
- Testing thoroughly

## Future Enhancements

- Token expiration/rotation for security
- Session persistence across server restarts (Redis)
- Better handling of conductor role restoration
- Analytics on disconnect/reconnect patterns

## References

- Current implementation: `server/socket-handlers.js`, `server/session-manager.js`
- Engine fairness tracking: `server/engine/engine-core.js`
- Client socket handling: `client/src/lib/stores/socket.js`

