import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

export const socket = io(BACKEND_URL, {
  autoConnect: false,
  withCredentials: true,
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}
