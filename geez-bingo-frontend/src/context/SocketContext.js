import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  useEffect(() => {
    if (!token) return;

    const socketInstance = io(process.env.REACT_APP_WS_URL || 'http://localhost:5000', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('✅ WebSocket Connected');
      setIsConnected(true);
      setReconnectAttempts(0);
      
      // Authenticate with user data
      socketInstance.emit('authenticate', { userId: user?.id });
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ WebSocket Disconnected:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, need to manually reconnect
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('WebSocket Connection Error:', error.message);
      setReconnectAttempts(prev => prev + 1);
    });

    socketInstance.on('reconnect_attempt', (attempt) => {
      console.log(`🔁 Reconnection attempt ${attempt}`);
    });

    socketInstance.on('reconnect', (attempt) => {
      console.log(`✅ Reconnected after ${attempt} attempts`);
      setIsConnected(true);
    });

    // Game-specific events
    socketInstance.on('gameState', (data) => {
      console.log('Game state update:', data);
    });

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [token, user]);

  const value = {
    socket,
    isConnected,
    reconnectAttempts,
    emit: (event, data) => {
      if (socket && isConnected) {
        socket.emit(event, data);
      } else {
        console.warn('Socket not connected');
      }
    },
    subscribe: (event, callback) => {
      if (socket) {
        socket.on(event, callback);
        return () => socket.off(event, callback);
      }
    }
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
