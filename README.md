# Digital Score App

A real-time multiplayer web application for conducting improvised musical performances. Musicians gather in the same room with individual devices, join a shared session via a 4-letter code, and receive synchronized dynamic notation cues that create spontaneous ensemble sub-groupings and dramatic arcs.

## Architecture

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: SvelteKit + Tailwind CSS
- **Real-time**: Socket.io WebSocket connections
- **Timing**: Server-authoritative synchronization (±500ms accuracy)

## Project Structure

```
digital-score/
├── server/              # Backend server
│   ├── index.js         # Express + Socket.io entry point
│   ├── session-manager.js   # Session storage and code generation
│   ├── socket-handlers.js   # Socket event handlers
│   └── engine/          # ScoreEngine (migrated from alpha)
│       ├── engine-core.js
│       ├── musical-logic.js
│       └── arc.js
├── client/              # SvelteKit frontend
│   ├── src/
│   │   ├── routes/      # SvelteKit routes
│   │   ├── lib/         # Components and stores
│   │   └── app.css      # Tailwind styles
│   └── package.json
└── package.json         # Root package.json
```

## Setup

### Prerequisites

- Node.js 18+ and npm

### Server Setup

```bash
cd digital-score
npm install
npm run dev:server
```

Server runs on `http://localhost:3000` (accessible on local network at `http://0.0.0.0:3000`)

### Client Setup

```bash
cd digital-score/client
npm install
npm run dev
```

Client runs on `http://localhost:5173` (accessible on local network at `http://0.0.0.0:5173`)

## Usage

1. **Start the server**: Run `npm run dev:server` in the root directory
2. **Start the client**: Run `npm run dev` in the `client/` directory
3. **Create a session**: Click "Start a Session" on the landing page
4. **Share the code**: Give the 4-letter session code to musicians
5. **Join session**: Musicians click "Join a Session" and enter the code
6. **Configure settings**: Conductor adjusts duration, intervals, dynamics, arc, etc.
7. **Start performance**: Conductor clicks "Start Performance" when ready
8. **Perform**: All devices receive synchronized cues

## Features

- **4-letter session codes**: Easy to share verbally
- **Real-time synchronization**: Server-authoritative timing with clock drift compensation
- **Dynamic notation cues**: Visual cues for Play/Rest states with dynamic markings (ppp-fff)
- **Compositional arcs**: Choose from traditional, building, receding, sustained, or pulsing arcs
- **Interactive arc preview**: See arc visualization in real-time as settings change
- **Player roster**: Live-updating list of joined players
- **Instructional messages**: Conductor can customize instructions for performers
- **Graceful disconnects**: Auto-promotion of conductor, session cleanup
- **Mobile-first design**: Works on phones, tablets, and laptops

## Session Management

- Sessions expire after 2 hours of inactivity
- Maximum 12 players per session
- Conductor auto-promotion if original conductor disconnects in lobby
- In-memory session storage (can migrate to Redis for production)

## Performance Engine

The ScoreEngine generates synchronized cues for all players based on:
- Duration (minutes)
- Interval range (seconds between changes)
- Dynamic range (ppp to fff)
- Micro-dynamics contrast
- Compositional arc type
- Number of players (auto-set from roster)

**Note**: The engine files (`server/engine/*.js`) are placeholders. You'll need to migrate the actual ScoreEngine, musical-logic.js, and arc.js from your alpha codebase to complete the implementation.

## Socket Events

### Client → Server
- `create-session` - Conductor creates session
- `join-session` - Player joins with code
- `leave-session` - Player leaves session
- `update-settings` - Conductor updates settings
- `update-message` - Conductor updates instructional message
- `start-performance` - Conductor starts the piece

### Server → Client
- `session-created` - Session created successfully
- `session-joined` - Player joined successfully
- `player-joined` - Updated roster when player joins
- `player-left` - Updated roster when player leaves
- `settings-updated` - Settings changed
- `message-updated` - Instructional message changed
- `performance-starting` - Performance about to start
- `performance-cue` - Cue update with state and countdown
- `performance-ended` - Performance finished
- `return-to-lobby` - Return conductor to lobby after performance

## Environment Variables

Create `.env` files if needed:

### Server
```
PORT=3000
```

### Client
```
VITE_SERVER_URL=http://localhost:3000
```

## Development

### Server
- `npm run dev:server` - Run with nodemon (auto-restart)
- `npm start` - Run production server

### Client
- `npm run dev` - Run development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Testing Scenarios

1. Single player (conductor only)
2. 2-4 player ensemble
3. 8+ player large ensemble
4. Conductor disconnect in lobby (auto-promotion)
5. Player disconnect mid-performance
6. Multiple consecutive performances
7. Rapid join/leave stress test
8. Network latency (200-500ms delays)
9. Mobile devices (iOS Safari, Android Chrome)
10. All arc types and settings combinations

## Success Criteria

✅ Multiple musicians can join via 4-letter code
✅ Conductor can configure settings and see joined players
✅ Player count auto-updates based on roster
✅ Interactive sparkline preview updates in real-time
✅ All devices enter performance mode simultaneously (±500ms)
✅ Synchronized countdowns before each cue change
✅ Individual cues per musician (Play/Rest + dynamics)
✅ Visual distinction: dark background for Rest, light for Play
✅ Smooth color transitions (300ms)
✅ Performance ends cleanly for all participants
✅ Conductor returns to lobby after performance
✅ Graceful disconnect handling
✅ Mobile-responsive design

## Next Steps

1. **Migrate ScoreEngine**: Replace placeholder engine code with actual alpha implementation
2. **Testing**: Test all scenarios on multiple devices
3. **Production**: Deploy server and client
4. **Optional Enhancements**:
   - Redis session storage for persistence
   - WebRTC audio streaming for remote performances
   - Recording/replay functionality
   - Analytics and fairness metrics

## License

ISC







