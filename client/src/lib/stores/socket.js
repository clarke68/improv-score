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

// Initialize socket connection
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

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

