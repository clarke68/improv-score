import { io } from 'socket.io-client';
import { writable, derived } from 'svelte/store';

// Socket connection state
export const socketStore = writable(null);
export const isConnected = writable(false);

// Session state
export const sessionCode = writable(null);
export const isConductor = writable(false);
export const players = writable([]);
export const sessionSettings = writable(null);
export const instructionalMessage = writable('');
export const sessionState = writable(null); // 'lobby' | 'performing' | 'ended'

// Performance state
export const performanceCues = writable(null);
export const performanceCountdowns = writable(null);
export const serverTime = writable(Date.now());

// Pending performance state for late joiners (temporary storage)
export const pendingPerformanceState = writable(null);

// Initialize socket connection
// Use env URL if set and not localhost; otherwise when loaded from production domain, use Railway URL
const DEFAULT_SERVER = 'http://localhost:3000';
const PRODUCTION_SERVER = 'https://improv-score-production.up.railway.app';

function getServerUrl() {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }
  // When app is loaded from non-localhost (e.g. production), use production server
  if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return PRODUCTION_SERVER;
  }
  return envUrl || DEFAULT_SERVER;
}

const SERVER_URL = getServerUrl();

let socketInstance = null;

export function initSocket() {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  socketInstance = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  socketInstance.on('connect', () => {
    console.log('Connected to server:', socketInstance.id);
    isConnected.set(true);
  });

  socketInstance.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected.set(false);
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Connection error:', error);
    isConnected.set(false);
  });

  socketStore.set(socketInstance);
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    socketStore.set(null);
    isConnected.set(false);
    sessionCode.set(null);
    isConductor.set(false);
    players.set([]);
    sessionSettings.set(null);
    instructionalMessage.set('');
    sessionState.set(null);
    performanceCues.set(null);
    performanceCountdowns.set(null);
  }
}

