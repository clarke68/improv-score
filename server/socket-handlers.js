import {
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
} from './session-manager.js';
import { ScoreEngine } from './engine/engine-core.js';
import { PerformanceSimulator } from './engine/simulator.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Helper to find session by conductor ID
    function findSessionByConductor(conductorId) {
      for (const [code, session] of activeSessions.entries()) {
        if (session.conductorId === conductorId) {
          return session;
        }
      }
      return null;
    }

    // Helper to find sessions containing a player ID
    function findSessionsByPlayer(playerId) {
      const sessions = [];
      for (const [code, session] of activeSessions.entries()) {
        if (session.players.some(p => p.id === playerId)) {
          sessions.push({ code, session });
        }
      }
      return sessions;
    }

    // Create session (conductor)
    socket.on('create-session', ({ settings, instructionalMessage }) => {
      try {
        const session = createSession(socket.id, settings, instructionalMessage);
        socket.join(`session-${session.code}`);
        
        socket.emit('session-created', {
          code: session.code,
          conductorId: session.conductorId,
          players: session.players,
          instructionalMessage: session.instructionalMessage
        });
        
        console.log(`Session created: ${session.code} by ${socket.id}`);
      } catch (error) {
        console.error('Error creating session:', error);
        socket.emit('error', { message: 'Failed to create session' });
      }
    });

    // Helper to get current performance state for late joiners/reconnectors
    function getCurrentPerformanceState(session, playerIndex) {
      if (!session.engine || !session.performanceStartTime) {
        return null;
      }
      
      const now = Date.now();
      const durationMs = session.settings.durationMin * 60 * 1000;
      const performanceStartMs = session.performanceStartTime;
      const elapsedMs = Math.max(0, now - performanceStartMs);
      const remainingMs = Math.max(0, durationMs - elapsedMs);
      
      const cues = session.engine.getCurrentCues(session.players.length);
      const countdowns = session.engine.getCurrentCountdowns(session.players.length);
      
      return {
        cues,
        countdowns,
        startTime: performanceStartMs,
        elapsed: elapsedMs,
        remaining: remainingMs,
        duration: durationMs
      };
    }

    // Join session (performer)
    socket.on('join-session', ({ code, nickname }) => {
      try {
        // Validate code format
        if (!code || typeof code !== 'string' || code.length !== 4 || !/^[A-Z]{4}$/.test(code)) {
          socket.emit('session-not-found', { code });
          return;
        }

        const session = getSession(code.toUpperCase());
        if (!session) {
          socket.emit('session-not-found', { code });
          return;
        }

        // Check if session has ended
        if (session.state === 'ended') {
          socket.emit('session-ended', { code });
          return;
        }

        // Check if session is full
        if (session.players.length >= 12) {
          socket.emit('session-full', { code });
          return;
        }

        // Add player to session
        const updatedSession = addPlayerToSession(code, socket.id, nickname);
        if (!updatedSession) {
          socket.emit('session-full', { code });
          return;
        }

        socket.join(`session-${code}`);
        
        // Notify all players in session
        io.to(`session-${code}`).emit('player-joined', {
          players: updatedSession.players
        });

        const playerIndex = getPlayerIndex(updatedSession, socket.id);
        const isLateJoin = updatedSession.state === 'performing';

        // Send session details to the new player
        const sessionData = {
          code: updatedSession.code,
          settings: updatedSession.settings,
          instructionalMessage: updatedSession.instructionalMessage,
          players: updatedSession.players,
          isConductor: updatedSession.conductorId === socket.id
        };

        // If joining during performance, include performance state
        if (isLateJoin) {
          const performanceState = getCurrentPerformanceState(updatedSession, playerIndex);
          if (performanceState) {
            sessionData.performanceState = {
              inProgress: true,
              startTime: performanceState.startTime,
              serverTime: Date.now(),
              remaining: performanceState.remaining,
              duration: performanceState.duration,
              elapsed: performanceState.elapsed,
              currentCues: performanceState.cues,
              currentCountdowns: performanceState.countdowns,
              joinedLate: true
            };
          }
        }

        socket.emit('session-joined', sessionData);

        // If performance is in progress, immediately send current cue
        if (isLateJoin && updatedSession.engine) {
          const cues = updatedSession.engine.getCurrentCues(updatedSession.players.length);
          const countdowns = updatedSession.engine.getCurrentCountdowns(updatedSession.players.length);
          socket.emit('performance-cue', {
            cues: cues,
            countdowns: countdowns,
            serverTime: Date.now()
          });
        }

        console.log(`Player ${socket.id} joined session ${code}${isLateJoin ? ' (late join during performance)' : ''}`);
      } catch (error) {
        console.error('Error joining session:', error);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Leave session
    socket.on('leave-session', ({ code }) => {
      handleLeaveSession(socket, code);
    });

    // Update settings (conductor only)
    socket.on('update-settings', ({ code, settings }) => {
      try {
        const session = getSession(code);
        if (!session || session.conductorId !== socket.id) {
          return; // Not authorized
        }

        const updatedSession = updateSessionSettings(code, settings);
        if (updatedSession) {
          // Broadcast to all players in session
          io.to(`session-${code}`).emit('settings-updated', {
            settings: updatedSession.settings
          });
        }
      } catch (error) {
        console.error('Error updating settings:', error);
      }
    });

    // Update instructional message (conductor only)
    socket.on('update-message', ({ code, message }) => {
      try {
        const session = getSession(code);
        if (!session || session.conductorId !== socket.id) {
          return; // Not authorized
        }

        const updatedSession = updateInstructionalMessage(code, message);
        if (updatedSession) {
          // Broadcast to all players in session
          io.to(`session-${code}`).emit('message-updated', {
            message: updatedSession.instructionalMessage
          });
        }
      } catch (error) {
        console.error('Error updating message:', error);
      }
    });

    // Update player nickname
    socket.on('update-nickname', ({ code, nickname }) => {
      try {
        const session = getSession(code);
        if (!session) {
          return;
        }

        // Ensure nickname is not null or empty - use default based on player number
        const playerIndex = getPlayerIndex(session, socket.id);
        const playerNumber = playerIndex >= 0 ? playerIndex + 1 : session.players.length;
        const defaultNickname = `Player ${playerNumber}`;
        const trimmedNickname = (nickname && nickname.trim()) || defaultNickname;
        
        const updatedSession = updatePlayerNickname(code, socket.id, trimmedNickname);
        if (updatedSession) {
          // Broadcast updated roster to all players in session
          io.to(`session-${code}`).emit('player-joined', {
            players: updatedSession.players
          });
        }
      } catch (error) {
        console.error('Error updating nickname:', error);
      }
    });

    // Simulate performance (conductor only, for testing)
    socket.on('simulate-performance', async ({ code, settings }) => {
      try {
        const session = getSession(code);
        if (!session || session.conductorId !== socket.id) {
          return; // Not authorized
        }

        // Use provided settings or session settings
        const simSettings = settings || session.settings;
        simSettings.numPlayers = simSettings.numPlayers || session.players.length || 8;

        console.log(`Starting simulation for session ${code} with ${simSettings.numPlayers} players`);

        // Create and run simulator
        const simulator = new PerformanceSimulator(simSettings);
        const result = await simulator.simulate();
        const report = simulator.generateReport();

        // Send results back to conductor
        socket.emit('simulation-complete', {
          success: true,
          report: report
        });
      } catch (error) {
        console.error('Error running simulation:', error);
        socket.emit('simulation-complete', {
          success: false,
          error: error.message
        });
      }
    });

    // Start performance (conductor only)
    socket.on('start-performance', ({ code }) => {
      try {
        const session = getSession(code);
        if (!session || session.conductorId !== socket.id) {
          return; // Not authorized
        }

        if (session.players.length < 1) {
          socket.emit('error', { message: 'Need at least 1 player to start' });
          return;
        }

        // Auto-set numPlayers from actual roster
        session.settings.numPlayers = session.players.length;
        
        // Set session state to performing
        setSessionState(code, 'performing');

        // Emit performance-starting event to all players
        const serverTime = Date.now();
        io.to(`session-${code}`).emit('performance-starting', {
          serverTime: serverTime,
          settings: session.settings,
          instructionalMessage: session.instructionalMessage
        });

        console.log(`Performance starting for session ${code} with ${session.players.length} players`);

        // Create ScoreEngine
        const engine = new ScoreEngine({
          onRender: (cues, countdowns, renderTime) => {
            // Broadcast cues to all players in session
            io.to(`session-${code}`).emit('performance-cue', {
              cues: cues,
              countdowns: countdowns,
              serverTime: renderTime || Date.now()
            });
          },
          onEnd: (cues) => {
            // Performance ended - notify all players
            session.players.forEach(player => {
              const role = player.id === session.conductorId ? 'conductor' : 'performer';
              io.to(player.id).emit('performance-ended', { role });
            });
            
            setSessionState(code, 'ended');
            session.engine = null;
            
            // Broadcast updated player list to all players in session
            // This ensures late joiners appear in everyone's lobby
            io.to(`session-${code}`).emit('player-joined', {
              players: session.players
            });
            
            // After 10 seconds, return conductor to lobby
            setTimeout(() => {
              if (session.state === 'ended' && session.conductorId) {
                io.to(session.conductorId).emit('return-to-lobby', {
                  settings: session.settings,
                  players: session.players,
                  instructionalMessage: session.instructionalMessage
                });
                setSessionState(code, 'lobby');
              }
            }, 10000);
          },
          settings: session.settings
        });
        
        session.engine = engine;
        
        // Delay engine start by 5 seconds to match lobby countdown
        // This ensures the first cue countdown starts when clients arrive at the performance page
        setTimeout(() => {
          engine.startPiece(session.settings);
        }, 5000);
      } catch (error) {
        console.error('Error starting performance:', error);
        socket.emit('error', { message: 'Failed to start performance' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      handleDisconnect(socket);
    });

    // Helper function to handle leaving session
    function handleLeaveSession(socket, code) {
      try {
        const session = getSession(code);
        if (!session) return;

        const updatedSession = removePlayerFromSession(code, socket.id);
        socket.leave(`session-${code}`);

        if (updatedSession) {
          // Notify remaining players
          io.to(`session-${code}`).emit('player-left', {
            players: updatedSession.players
          });
        }
      } catch (error) {
        console.error('Error leaving session:', error);
      }
    }

    // Helper function to handle disconnect
    function handleDisconnect() {
      // Find all sessions this socket was part of
      const playerSessions = findSessionsByPlayer(socket.id);
      
      for (const { code, session } of playerSessions) {
        if (session.conductorId === socket.id) {
          // Conductor disconnected
          if (session.state === 'lobby') {
            // Auto-promote first remaining player to conductor
            const remainingPlayers = session.players.filter(p => p.id !== socket.id);
            if (remainingPlayers.length > 0) {
              session.conductorId = remainingPlayers[0].id;
              io.to(`session-${code}`).emit('conductor-promoted', {
                newConductorId: session.conductorId
              });
              console.log(`Conductor promoted: ${session.conductorId} for session ${code}`);
            }
          } else if (session.state === 'performing') {
            // Conductor is just another player during performance
            // Handle same as performer disconnect
          }
        }

        // Remove player from session
        const updatedSession = removePlayerFromSession(code, socket.id);
        
        if (updatedSession) {
          io.to(`session-${code}`).emit('player-left', {
            players: updatedSession.players
          });
        }

        console.log(`Player ${socket.id} disconnected from session ${code}`);
      }
    }
  });
}

