import type { GameState } from "./types";

export type ApiClient = {
  send: (action: string, data?: any) => Promise<any>;
  close: () => void;
  onStateUpdate: (fn: (state: GameState) => void) => void;
  onChat: (fn: (chat: { from: string; text: string; ts: number }) => void) => void;
  onError: (fn: (error: string) => void) => void;
};

export function connectApi(roomId: string, name: string): ApiClient {
  const clientId = crypto.randomUUID();
  let pollInterval: NodeJS.Timeout | null = null;
  let lastChatCount = 0;
  
  const listeners = {
    state: [] as Array<(state: GameState) => void>,
    chat: [] as Array<(chat: { from: string; text: string; ts: number }) => void>,
    error: [] as Array<(error: string) => void>,
  };

  // Join or create room immediately
  fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "join_room", roomId, name, clientId }),
  }).then(async (res) => {
    const data = await res.json();
    if (data.success && data.state) {
      listeners.state.forEach(fn => fn(data.state));
      lastChatCount = data.state.chats?.length || 0;
    }
  });

  // Poll for updates every 1 second
  const poll = async () => {
    try {
      const res = await fetch(`/api/game?roomId=${roomId}&clientId=${clientId}`);
      const state = await res.json();
      
      listeners.state.forEach(fn => fn(state));
      
      // Notify new chats
      if (state.chats && state.chats.length > lastChatCount) {
        const newChats = state.chats.slice(lastChatCount);
        newChats.forEach((chat: any) => {
          listeners.chat.forEach(fn => fn(chat));
        });
        lastChatCount = state.chats.length;
      }
    } catch (error) {
      console.error("Poll error:", error);
    }
  };

  pollInterval = setInterval(poll, 1000);

  const api: ApiClient = {
    send: async (action: string, data: any = {}) => {
      try {
        const res = await fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data, roomId, clientId }),
        });
        const result = await res.json();
        
        if (!result.success && result.error) {
          listeners.error.forEach(fn => fn(result.error));
        }
        
        if (result.state) {
          listeners.state.forEach(fn => fn(result.state));
          if (result.state.chats) {
            lastChatCount = result.state.chats.length;
          }
        }
        
        return result;
      } catch (error) {
        listeners.error.forEach(fn => fn("Network error"));
        return { success: false, error: "Network error" };
      }
    },
    
    close: () => {
      if (pollInterval) clearInterval(pollInterval);
    },
    
    onStateUpdate: (fn) => {
      listeners.state.push(fn);
    },
    
    onChat: (fn) => {
      listeners.chat.push(fn);
    },
    
    onError: (fn) => {
      listeners.error.push(fn);
    },
  };

  return api;
}

