import { useEffect, useState, useCallback } from 'react';
import { getWebSocketClient } from '../api/websocket';

interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
}

export function useWebSocket(options?: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  useEffect(() => {
    const wsClient = getWebSocketClient();

    // Register connect/disconnect callbacks
    wsClient.onConnect(handleConnect);
    wsClient.onDisconnect(handleDisconnect);

    // Add message handler if provided
    const messageHandler = options?.onMessage;
    if (messageHandler) {
      wsClient.addMessageHandler(messageHandler);
    }

    // Connect
    wsClient.connect();

    // Update initial connection status
    setIsConnected(wsClient.isConnected());

    // Cleanup
    return () => {
      if (messageHandler) {
        wsClient.removeMessageHandler(messageHandler);
      }
    };
  }, [options?.onMessage, handleConnect, handleDisconnect]);

  return { isConnected };
}
