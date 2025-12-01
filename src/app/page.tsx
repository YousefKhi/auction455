"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState<Array<{ id: string; playerCount: number; phase: string }>>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch("/api/rooms");
        const data = await res.json();
        setRooms(data.rooms || []);
      } catch (error) {
        console.error("Failed to fetch rooms:", error);
      }
    };

    fetchRooms();
    
    // Refresh room list every 3 seconds
    const interval = setInterval(fetchRooms, 3000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  const createRoom = () => {
    if (!name.trim()) return;
    const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  };

  const joinRoom = (roomId: string) => {
    if (!name.trim()) {
      alert("Please enter your name first");
      return;
    }
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="card p-6 md:p-8">
        <h1 className="mb-4 text-3xl font-bold">Auction 45</h1>
        <p className="text-slate-300">
          Create a room or join an active game. Up to 4 players,
          real‑time bidding and trick taking. No accounts needed.
        </p>
        <div className="mt-6 h-px bg-slate-800" />
        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-400">Your name</label>
          <input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex" 
            className="input"
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
          />
          <button onClick={createRoom} className="btn btn-primary w-full">
            Create New Room
          </button>
        </div>
      </div>

      <div className="card p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-4">Active Rooms</h2>
        {rooms.length === 0 ? (
          <p className="text-slate-400 text-sm">No active rooms. Create one to get started!</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                <div>
                  <div className="font-mono font-semibold text-lg">{room.id}</div>
                  <div className="text-sm text-slate-400">
                    {room.playerCount}/4 players · {room.phase}
                  </div>
                </div>
                <button
                  onClick={() => joinRoom(room.id)}
                  className="btn btn-ghost text-sm px-3 py-1"
                  disabled={room.playerCount >= 4}
                >
                  {room.playerCount >= 4 ? "Full" : "Join"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
