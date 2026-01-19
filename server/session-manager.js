// Session storage and management
const activeSessions = new Map();

// Session model structure
// {
//   code: "ABCD",              // 4-letter uppercase code
//   conductorId: "socket_id",  // Socket ID of conductor
//   players: [                 // Array of player objects
//     {
//       id: "socket_id",
//       nickname: "Alex",      // Optional player name
//       joinedAt: timestamp
//     }
//   ],
//   settings: {                // Conductor's chosen settings
//     durationMin: 8,
//     interval: [30, 60],
//     dynRangeIdx: [0, 7],
//     contrast: 0.6,
//     arc: "traditional",
//     numPlayers: null        // Auto-set to players.length when performance starts
//   },
//   instructionalMessage: "When the performance begins...", // Editable by conductor
//   state: "lobby" | "performing" | "ended",
//   performanceStartTime: null,  // Server timestamp when piece begins
//   createdAt: timestamp,
//   engine: null              // ScoreEngine instance (when performing)
// }

/**
 * Generate a unique 4-letter uppercase session code
 */
function generateSessionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  
  // Generate random code
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  
  // Check for collisions (very unlikely but handle it)
  if (activeSessions.has(code)) {
    return generateSessionCode(); // Recursively try again
  }
  
  return code;
}

/**
 * Create a new session
 */
function createSession(conductorId, settings = {}, instructionalMessage = '') {
  const code = generateSessionCode();
  const defaultMessage = instructionalMessage || `When the performance begins, you will receive visual cues indicating when to play and at what dynamic level. Listen carefully to your fellow musicians and respond to the dynamics shown on your screen. Rests are as important as playing - use them to listen and prepare. The piece will end automatically after ${settings.durationMin || 8} minutes.`;
  
  const session = {
    code,
    conductorId,
    players: [
      {
        id: conductorId,
        nickname: 'Player 1', // Default nickname based on join order
        joinedAt: Date.now()
      }
    ],
    settings: {
      durationMin: settings.durationMin || 8,
      interval: settings.interval || [30, 60],
      dynRangeIdx: settings.dynRangeIdx || [0, 7],
      contrast: settings.contrast !== undefined ? settings.contrast : 0.6,
      arc: settings.arc || 'traditional',
      numPlayers: null // Will be set when performance starts
    },
    instructionalMessage: defaultMessage,
    state: 'lobby',
    performanceStartTime: null,
    createdAt: Date.now(),
    engine: null
  };
  
  activeSessions.set(code, session);
  return session;
}

/**
 * Get session by code
 */
function getSession(code) {
  return activeSessions.get(code);
}

/**
 * Add player to session
 */
function addPlayerToSession(code, playerId, nickname = null) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  // Check if player already exists
  if (session.players.some(p => p.id === playerId)) {
    return session;
  }
  
  // Check session capacity (max 12 players)
  if (session.players.length >= 12) {
    return null; // Session full
  }
  
  // Set default nickname based on join order if not provided
  const playerNumber = session.players.length + 1;
  const defaultNickname = `Player ${playerNumber}`;
  
  session.players.push({
    id: playerId,
    nickname: nickname || defaultNickname,
    joinedAt: Date.now()
  });
  
  return session;
}

/**
 * Update player nickname
 */
function updatePlayerNickname(code, playerId, nickname) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  const player = session.players.find(p => p.id === playerId);
  if (player) {
    // Ensure nickname is not null or empty
    player.nickname = (nickname && nickname.trim()) || `Player ${session.players.indexOf(player) + 1}`;
    return session;
  }
  
  return null;
}

/**
 * Remove player from session
 */
function removePlayerFromSession(code, playerId) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  session.players = session.players.filter(p => p.id !== playerId);
  
  // If no players left, delete session
  if (session.players.length === 0) {
    activeSessions.delete(code);
    return null;
  }
  
  return session;
}

/**
 * Get player index in session
 */
function getPlayerIndex(session, playerId) {
  return session.players.findIndex(p => p.id === playerId);
}

/**
 * Update session settings
 */
function updateSessionSettings(code, settings) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  Object.assign(session.settings, settings);
  return session;
}

/**
 * Update instructional message
 */
function updateInstructionalMessage(code, message) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  session.instructionalMessage = message;
  return session;
}

/**
 * Set session state
 */
function setSessionState(code, state) {
  const session = activeSessions.get(code);
  if (!session) return null;
  
  session.state = state;
  if (state === 'performing') {
    session.performanceStartTime = Date.now();
  }
  
  return session;
}

/**
 * Cleanup expired sessions (2 hours of inactivity)
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  
  for (const [code, session] of activeSessions.entries()) {
    // If session is inactive and older than 2 hours
    if (session.state !== 'performing' && (now - session.createdAt) > twoHours) {
      activeSessions.delete(code);
      console.log(`Cleaned up expired session: ${code}`);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

export {
  activeSessions,
  createSession,
  getSession,
  addPlayerToSession,
  removePlayerFromSession,
  getPlayerIndex,
  updateSessionSettings,
  updateInstructionalMessage,
  setSessionState,
  updatePlayerNickname
};

