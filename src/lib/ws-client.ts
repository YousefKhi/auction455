import type { ClientToServer, ServerToClient } from "./types";

export type WS = {
  send: (msg: ClientToServer) => void;
  close: () => void;
  onMessage: (fn: (msg: ServerToClient) => void) => void;
  isOpen: () => boolean;
};

export function connect(roomId: string, name: string): Promise<WS> {
  return new Promise((resolve, reject) => {
    const absoluteUrl = process.env.NEXT_PUBLIC_WS_URL;
    const pathOnSameOrigin = process.env.NEXT_PUBLIC_WS_PATH;

    const makeUrl = () => {
      if (absoluteUrl) return absoluteUrl;
      if (typeof window !== "undefined") {
        const isHttps = window.location.protocol === "https:";
        const protocol = isHttps ? "wss" : "ws";
        if (pathOnSameOrigin) {
          // Connect on same origin with a path (behind a reverse proxy)
          const origin = window.location.host; // includes hostname:port
          return `${protocol}://${origin}${pathOnSameOrigin}`;
        }
        // Default: assume WS server on port+1
        const host = window.location.hostname;
        const port = window.location.port || (isHttps ? "443" : "3000");
        const wsPort = Number(port) === 3000 ? 3001 : Number(port) + 1;
        return `${protocol}://${host}:${wsPort}`;
      }
      return "ws://localhost:3001";
    };

    const ws = new WebSocket(makeUrl());

    const listeners: Array<(msg: ServerToClient) => void> = [];
    const api: WS = {
      send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)),
      close: () => ws.close(),
      onMessage: (fn) => listeners.push(fn),
      isOpen: () => ws.readyState === ws.OPEN
    };

    ws.addEventListener("open", () => {
      // Attempt join first; if room not exist, create
      ws.send(JSON.stringify({ type: "join_room", roomId, name }));
      resolve(api);
    });
    ws.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "error" && /Room is full/.test(data.message)) {
          // try creating a room instead
          ws.send(JSON.stringify({ type: "create_room", roomId, name }));
        }
        for (const l of listeners) l(data);
      } catch {}
    });
    ws.addEventListener("error", (e) => reject(e));
  });
}

