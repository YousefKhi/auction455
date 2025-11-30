import Link from "next/link";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Suspense } from "react";

export default function Home() {
  async function createRoom(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    const roomId = uuidv4().slice(0, 6);
    redirect(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="card p-6 md:p-8">
        <h1 className="mb-4 text-3xl font-bold">Auction 45</h1>
        <p className="text-slate-300">
          Create a room and share the link with friends. Up to 4 players,
          real‑time bidding and trick taking. No accounts needed.
        </p>
        <div className="mt-6 h-px bg-slate-800" />
        <form action={createRoom} className="mt-6 space-y-3">
          <label className="block text-sm text-slate-400">Your name</label>
          <input name="name" placeholder="e.g. Alex" className="input" />
          <button className="btn btn-primary w-full">Create Room</button>
        </form>
      </div>

      <div className="card p-6 md:p-8">
        <h2 className="text-xl font-semibold">Join a room</h2>
        <Suspense>
          <JoinForm />
        </Suspense>
      </div>
    </div>
  );
}

function JoinForm() {
  async function joinRoom(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    const roomCode = String(formData.get("room") || "").trim();
    if (!name || !roomCode) return;
    redirect(`/room/${roomCode}?name=${encodeURIComponent(name)}`);
  }

  return (
    <form action={joinRoom} className="mt-4 space-y-3">
      <label className="block text-sm text-slate-400">Your name</label>
      <input name="name" placeholder="e.g. Jamie" className="input" />
      <label className="block text-sm text-slate-400">Room code</label>
      <input name="room" placeholder="e.g. A1B2C3" className="input" />
      <button className="btn btn-ghost w-full">Join Room</button>
    </form>
  );
}

