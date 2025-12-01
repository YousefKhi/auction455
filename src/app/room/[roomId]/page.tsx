/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { connect } from "@/lib/ws-client";
import type { Card, GameState, Suit } from "@/lib/types";
import Link from "next/link";
import { clsx } from "clsx";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const search = useSearchParams();
  const name = (search.get("name") || "").trim() || "Player";
  const roomId = String(params.roomId || "").toUpperCase();

  const [state, setState] = useState<GameState | null>(null);
  const [chat, setChat] = useState<{ from: string; text: string; ts: number }[]>([]);
  const wsRef = useRef<ReturnType<typeof connect> | null>(null);
  const wsApiRef = useRef<Awaited<ReturnType<typeof connect>> | null>(null);

  const youSeat = state?.you?.seatIndex ?? -1;
  const isHost = state?.you?.id && state.hostId === state.you.id;

  useEffect(() => {
    let mounted = true;
    const open = async () => {
      const api = await connect(roomId, name);
      if (!mounted) return;
      wsApiRef.current = api;
      api.onMessage((msg) => {
        if (msg.type === "state") setState(msg.state);
        if (msg.type === "chat") setChat((c) => [...c, msg]);
      });
    };
    open();
    return () => {
      mounted = false;
      wsApiRef.current?.close();
    };
  }, [roomId, name]);

  const send = useCallback((m: any) => {
    wsApiRef.current?.send(m);
  }, []);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
  };

  const myHand = state?.hand ?? [];
  const canStart = state?.players?.every(p => p.id) ?? false;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Room {roomId}</h1>
          <p className="text-slate-400">You are {name}{isHost ? " (Host)" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={copyInvite}>Copy invite link</button>
          <Link className="btn btn-danger" href="/">Leave</Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Players</h2>
          <Players state={state} />
          <div className="mt-4 flex items-center gap-2">
            <button
              className="btn btn-primary flex-1 disabled:cursor-not-allowed"
              disabled={!canStart || state?.phase !== "lobby"}
              onClick={() => send({ type: "start_game" })}
            >
              Start game
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-400">
            Scores — Team A: <b>{state?.scores.teamA ?? 0}</b> · Team B: <b>{state?.scores.teamB ?? 0}</b>
          </div>
        </div>

        <div className="card p-4 md:col-span-2">
          <h2 className="mb-2 font-semibold">Game</h2>
          <div className="text-slate-300">{state?.message}</div>
          <div className="mt-3">
            {state?.phase === "bidding" && <Bidding state={state} onBid={(v) => send({ type: "place_bid", value: v })} onPass={() => send({ type: "pass_bid" })} />}
            {state?.phase === "select_trump" && state?.you?.seatIndex === state?.highestBid?.seatIndex && (
              <TrumpPicker onSelect={(suit) => send({ type: "select_trump", suit })} />
            )}
            {state?.phase === "playing" && (
              <Table state={state} onPlay={(cardId) => send({ type: "play_card", cardId })} />
            )}
            {state?.phase === "round_end" && (
              <div className="space-y-3">
                <div>Round over.</div>
                <button className="btn btn-primary" onClick={() => send({ type: "ready_next_round" })}>
                  Next round
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4 md:col-span-3">
          <h2 className="mb-2 font-semibold">Your hand</h2>
          <Hand cards={myHand} disabled={state?.phase !== "playing" || state?.currentTurn !== youSeat} onPlay={(id) => send({ type: "play_card", cardId: id })} />
        </div>

        <div className="card p-4 md:col-span-3">
          <h2 className="mb-2 font-semibold">Chat</h2>
          <ChatBox chat={chat} onSend={(t) => send({ type: "chat", text: t })} />
        </div>
      </div>
    </div>
  );
}

function Players(props: { state: GameState | null }) {
  const p = props.state?.players ?? [];
  return (
    <div className="grid grid-cols-2 gap-2">
      {p.map((pl, idx) => (
        <div key={idx} className={clsx("rounded-md border p-2", pl.id ? "border-slate-700" : "border-slate-800 opacity-60")}>
          <div className="text-sm text-slate-400">Seat {pl.seatIndex}</div>
          <div className="font-medium">{pl.name}</div>
          <div className={clsx("text-xs", pl.connected ? "text-green-400" : "text-slate-500")}>
            {pl.connected ? "online" : "empty"}
          </div>
          <div className="text-xs text-slate-400">Team {pl.seatIndex % 2 === 0 ? "A" : "B"}</div>
        </div>
      ))}
    </div>
  );
}

function Bidding(props: { state: GameState; onBid: (v: number) => void; onPass: () => void }) {
  const { state, onBid, onPass } = props;
  const you = state.you?.seatIndex ?? -1;
  const isTurn = state.currentTurn === you;
  const options = [15, 20, 25, 30, 35, 40, 45];
  const highest = state.highestBid?.value ?? 0;
  const canBid = (v: number) => v > highest;
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-300">Your bid:</span>
      <div className="flex flex-wrap gap-2">
        {options.map(v => (
          <button key={v} disabled={!isTurn || !canBid(v)} className="btn btn-ghost disabled:cursor-not-allowed" onClick={() => onBid(v)}>{v}</button>
        ))}
        <button className="btn btn-danger disabled:cursor-not-allowed" disabled={!isTurn} onClick={onPass}>Pass</button>
      </div>
    </div>
  );
}

function TrumpPicker(props: { onSelect: (s: Suit) => void }) {
  const suits: { s: Suit; n: string }[] = [
    { s: "S", n: "Spades ♠" },
    { s: "H", n: "Hearts ♥" },
    { s: "D", n: "Diamonds ♦" },
    { s: "C", n: "Clubs ♣" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-300">Select trump:</span>
      {suits.map(({ s, n }) => (
        <button key={s} className="btn btn-primary" onClick={() => props.onSelect(s)}>{n}</button>
      ))}
    </div>
  );
}

function Hand(props: { cards: Card[]; onPlay: (id: string) => void; disabled?: boolean }) {
  const { cards, onPlay, disabled } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {cards.map(c => (
        <button
          key={c.id}
          disabled={disabled}
          className={clsx("rounded-md border bg-slate-800 px-3 py-2 text-left disabled:cursor-not-allowed", `s-${c.suit}`)}
          onClick={() => onPlay(c.id)}
          title={`${c.rank} of ${c.suit}`}
        >
          <div className="text-lg font-semibold">{c.rank}</div>
          <div className="text-xs text-slate-400">{suitName(c.suit)}</div>
        </button>
      ))}
    </div>
  );
}

function suitName(s: Suit) {
  return s === "S" ? "Spades" : s === "H" ? "Hearts" : s === "D" ? "Diamonds" : "Clubs";
}

function Table(props: { state: GameState; onPlay: (id: string) => void }) {
  const { state } = props;
  const trick = state.trick;
  return (
    <div className="rounded-md border border-slate-800 p-3">
      <div className="mb-2 text-sm text-slate-400">Current turn: Seat {state.currentTurn}</div>
      <div className="grid grid-cols-4 gap-2">
        {[0,1,2,3].map(seat => {
          const play = trick?.plays.find(p => p.seatIndex === seat);
          return (
            <div key={seat} className="rounded-md border border-slate-700 p-3">
              <div className="text-xs text-slate-400">Seat {seat}</div>
              {play ? (
                <div className="mt-1">
                  <div className="text-lg font-semibold">{play.card.rank}</div>
                  <div className="text-xs text-slate-400">{suitName(play.card.suit)}</div>
                </div>
              ) : (
                <div className="mt-3 text-slate-600">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatBox(props: { chat: { from: string; text: string; ts: number }[]; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div>
      <div className="mb-3 max-h-64 overflow-auto rounded border border-slate-800 p-2">
        {props.chat.length === 0 && <div className="text-sm text-slate-500">No messages yet</div>}
        {props.chat.map((m, i) => (
          <div key={i} className="text-sm">
            <span className="text-slate-400">{new Date(m.ts).toLocaleTimeString()} </span>
            <b>{m.from}:</b> {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Say hi…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (props.onSend(text), setText(""))} />
        <button className="btn btn-ghost" onClick={() => { props.onSend(text); setText(""); }}>Send</button>
      </div>
    </div>
  );
}

