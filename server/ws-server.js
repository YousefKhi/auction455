const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 3001;
const HOST = process.env.WS_HOST || "0.0.0.0";

/** Game helpers (CommonJS clone of src/lib/game.ts essentials) */
const suits = ["S", "H", "D", "C"];
const ranks = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const trumpOrder = ["5","J","A","K","Q","10","9","8","7","6","4","3","2"];
const nonTrumpOrder = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
function makeDeck() {
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ suit: s, rank: r, id: uuidv4() });
  return deck;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function dealHands(deck, nPlayers = 4, handSize = 5) {
  const hands = Array.from({ length: nPlayers }, () => []);
  let idx = 0;
  for (let r = 0; r < handSize; r++) {
    for (let p = 0; p < nPlayers; p++) {
      hands[p].push(deck[idx++]);
    }
  }
  return hands;
}
function teamOfSeat(seatIndex) { return seatIndex % 2 === 0 ? "A" : "B"; }
function seatLeftOf(seat) { return (seat + 1) % 4; }
function compareCards(a, b, lead, trump) {
  const aTrump = trump && a.suit === trump;
  const bTrump = trump && b.suit === trump;
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;
  const aLead = a.suit === lead;
  const bLead = b.suit === lead;
  if (aLead && !bLead) return 1;
  if (!aLead && bLead) return -1;
  const order = aTrump && bTrump ? trumpOrder : nonTrumpOrder;
  const ai = order.indexOf(a.rank);
  const bi = order.indexOf(b.rank);
  return ai < bi ? 1 : ai > bi ? -1 : 0;
}
function computeTrickWinner(plays, lead, trump) {
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) {
    if (compareCards(plays[i].card, best.card, lead, trump) > 0) best = plays[i];
  }
  return best.seatIndex;
}

/** In-memory rooms */
const rooms = new Map();

function broadcast(room, data) {
  const text = JSON.stringify(data);
  for (const s of room.sockets.values()) {
    try { s.send(text); } catch {}
  }
}

function currentState(room, forClientId) {
  const you = room.players.get(forClientId) || null;
  return {
    type: "state",
    state: {
      roomId: room.id,
      phase: room.phase,
      hostId: room.hostId,
      players: Array.from(room.seats).map((pid, seatIndex) => {
        if (!pid) return { id: "", name: "(empty)", seatIndex, connected: false };
        const p = room.players.get(pid);
        return { id: p.id, name: p.name, seatIndex, connected: !!room.sockets.get(pid) };
      }),
      you: you ? { id: you.id, seatIndex: you.seatIndex } : null,
      hand: you ? (room.hands.get(you.seatIndex) || []) : [],
      trump: room.trump,
      currentTurn: room.currentTurn,
      bids: room.bids,
      highestBid: room.highestBid,
      trick: room.trick,
      takenTricks: room.takenTricks,
      dealerSeat: room.dealerSeat,
      scores: room.scores,
      message: room.message || undefined
    }
  };
}

function sendStateToAll(room) {
  for (const clientId of room.players.keys()) {
    const s = room.sockets.get(clientId);
    if (s && s.readyState === 1) {
      s.send(JSON.stringify(currentState(room, clientId)));
    }
  }
}

function ensureRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      phase: "lobby",
      hostId: null,
      players: new Map(), // clientId -> {id, name, seatIndex}
      sockets: new Map(), // clientId -> ws
      seats: [null, null, null, null], // clientId per seatIndex
      dealerSeat: 0,
      currentTurn: 0,
      bids: [],
      highestBid: null,
      trump: null,
      deck: [],
      hands: new Map(), // seatIndex -> Card[]
      trick: null,
      takenTricks: { teamA: 0, teamB: 0 },
      scores: { teamA: 0, teamB: 0 },
      message: ""
    };
    rooms.set(roomId, room);
  }
  return room;
}

function nextSeatWithPlayer(room, startSeat) {
  for (let i = 0; i < 4; i++) {
    const seat = (startSeat + i) % 4;
    if (room.seats[seat]) return seat;
  }
  return startSeat;
}

function startBidding(room) {
  room.phase = "bidding";
  room.bids = Array.from({ length: 4 }, (_, seatIndex) => ({ seatIndex, value: null, passed: false }));
  room.highestBid = null;
  room.trump = null;
  room.trick = null;
  room.takenTricks = { teamA: 0, teamB: 0 };
  room.message = "Bidding started";
  room.currentTurn = nextSeatWithPlayer(room, seatLeftOf(room.dealerSeat));
}

function startDealing(room) {
  room.deck = shuffle(makeDeck());
  room.hands = new Map();
  const hands = dealHands(room.deck, 4, 5);
  for (let s = 0; s < 4; s++) room.hands.set(s, hands[s]);
  startBidding(room);
}

function startTricks(room) {
  room.phase = "playing";
  room.trick = { leadSeat: room.currentTurn, plays: [] };
  room.message = "Trump selected: " + room.trump;
}

function allPassed(bids) {
  return bids.filter(b => b.passed).length >= 3 && bids.some(b => b.value !== null);
}

function canPlayCard(room, seatIndex, cardId) {
  const hand = room.hands.get(seatIndex) || [];
  const card = hand.find(c => c.id === cardId);
  if (!card) return false;
  if (!room.trick) return true;
  const lead = room.trick.plays.length === 0 ? null : room.trick.plays[0].card.suit;
  if (!lead) return true;
  const hasLead = hand.some(c => c.suit === lead);
  if (!hasLead) return true;
  return card.suit === lead;
}

const wss = new WebSocketServer({ host: HOST, port: PORT });
console.log(`[ws] WebSocket server listening on ws://${HOST}:${PORT}`);

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  let room = null;
  let player = null;

  function safeSend(obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "create_room") {
      const roomId = (msg.roomId || uuidv4().slice(0,6)).toUpperCase();
      room = ensureRoom(roomId);
      // assign first available seat
      const seatIndex = room.seats.findIndex(s => s === null);
      if (seatIndex === -1) return safeSend({ type: "error", message: "Room is full" });
      player = { id: clientId, name: msg.name || "Player", seatIndex };
      room.seats[seatIndex] = clientId;
      room.players.set(clientId, player);
      room.sockets.set(clientId, ws);
      if (!room.hostId) room.hostId = clientId;
      safeSend(currentState(room, clientId));
      sendStateToAll(room);
      return;
    }

    if (msg.type === "join_room") {
      const rid = String(msg.roomId || "").toUpperCase();
      room = ensureRoom(rid);
      const seatIndex = room.seats.findIndex(s => s === null);
      if (seatIndex === -1) return safeSend({ type: "error", message: "Room is full" });
      player = { id: clientId, name: msg.name || "Player", seatIndex };
      room.seats[seatIndex] = clientId;
      room.players.set(clientId, player);
      room.sockets.set(clientId, ws);
      safeSend(currentState(room, clientId));
      sendStateToAll(room);
      return;
    }

    if (!room || !player) {
      return safeSend({ type: "error", message: "Join or create a room first." });
    }

    if (msg.type === "start_game") {
      if (room.hostId !== clientId) return safeSend({ type: "error", message: "Only host can start." });
      if (room.seats.some(s => !s)) return safeSend({ type: "error", message: "Need 4 players." });
      room.message = "Dealing...";
      startDealing(room);
      sendStateToAll(room);
      return;
    }

    if (msg.type === "place_bid" && room.phase === "bidding") {
      if (player.seatIndex !== room.currentTurn) return;
      const value = Number(msg.value || 0);
      if (value < 15 || value > 45 || value % 5 !== 0) {
        return safeSend({ type: "error", message: "Bid must be 15..45 in steps of 5." });
      }
      const prev = room.highestBid?.value || 0;
      if (value <= prev) return safeSend({ type: "error", message: "Bid must beat current highest." });
      room.bids[player.seatIndex] = { seatIndex: player.seatIndex, value, passed: false };
      room.highestBid = { seatIndex: player.seatIndex, value };
      // next turn
      room.currentTurn = seatLeftOf(room.currentTurn);
      // if everyone else passed already, auto finish bidding when it cycles
      if (allPassed(room.bids)) {
        room.phase = "select_trump";
        room.currentTurn = room.highestBid.seatIndex;
        room.message = "Highest bidder: select trump";
      }
      sendStateToAll(room);
      return;
    }

    if (msg.type === "pass_bid" && room.phase === "bidding") {
      if (player.seatIndex !== room.currentTurn) return;
      room.bids[player.seatIndex] = { seatIndex: player.seatIndex, value: room.bids[player.seatIndex]?.value ?? null, passed: true };
      // next
      const next = seatLeftOf(room.currentTurn);
      room.currentTurn = next;
      if (allPassed(room.bids) && room.highestBid) {
        room.phase = "select_trump";
        room.currentTurn = room.highestBid.seatIndex;
        room.message = "Highest bidder: select trump";
      }
      sendStateToAll(room);
      return;
    }

    if (msg.type === "select_trump" && room.phase === "select_trump") {
      if (player.seatIndex !== room.highestBid?.seatIndex) return;
      const suit = String(msg.suit);
      if (!suits.includes(suit)) return;
      room.trump = suit;
      room.currentTurn = seatLeftOf(room.dealerSeat);
      startTricks(room);
      sendStateToAll(room);
      return;
    }

    if (msg.type === "play_card" && room.phase === "playing") {
      if (player.seatIndex !== room.currentTurn) return;
      const hand = room.hands.get(player.seatIndex) || [];
      const card = hand.find(c => c.id === msg.cardId);
      if (!card) return;
      // must follow suit if possible
      const leadSuit = room.trick.plays.length ? room.trick.plays[0].card.suit : null;
      const hasLead = leadSuit ? hand.some(c => c.suit === leadSuit) : false;
      if (leadSuit && hasLead && card.suit !== leadSuit) {
        return safeSend({ type: "error", message: "You must follow suit." });
      }
      // play
      room.trick.plays.push({ seatIndex: player.seatIndex, card });
      room.hands.set(player.seatIndex, hand.filter(c => c.id !== card.id));
      if (room.trick.plays.length < 4) {
        room.currentTurn = seatLeftOf(room.currentTurn);
        sendStateToAll(room);
        return;
      }
      // resolve trick
      const lead = room.trick.plays[0].card.suit;
      const winnerSeat = computeTrickWinner(room.trick.plays, lead, room.trump);
      const team = teamOfSeat(winnerSeat);
      if (team === "A") room.takenTricks.teamA += 1; else room.takenTricks.teamB += 1;
      // next trick
      const remainingCards = (room.hands.get(0) || []).length;
      if (remainingCards > 0) {
        room.trick = { leadSeat: winnerSeat, plays: [] };
        room.currentTurn = winnerSeat;
        sendStateToAll(room);
      } else {
        // round ends, score
        const bid = room.highestBid;
        const pointsA = room.takenTricks.teamA * 5;
        const pointsB = room.takenTricks.teamB * 5;
        if (bid) {
          const biddingTeam = teamOfSeat(bid.seatIndex);
          const biddingPoints = biddingTeam === "A" ? pointsA : pointsB;
          if (biddingPoints < bid.value) {
            if (biddingTeam === "A") room.scores.teamA -= bid.value; else room.scores.teamB -= bid.value;
          } else {
            room.scores.teamA += pointsA;
            room.scores.teamB += pointsB;
          }
        } else {
          room.scores.teamA += pointsA;
          room.scores.teamB += pointsB;
        }
        room.phase = "round_end";
        room.message = `Round over. A:${room.takenTricks.teamA} B:${room.takenTricks.teamB}. Scores A:${room.scores.teamA} B:${room.scores.teamB}`;
        sendStateToAll(room);
      }
      return;
    }

    if (msg.type === "ready_next_round" && room.phase === "round_end") {
      // rotate dealer
      room.dealerSeat = seatLeftOf(room.dealerSeat);
      startDealing(room);
      sendStateToAll(room);
      return;
    }

    if (msg.type === "chat") {
      broadcast(room, { type: "chat", from: player.name, text: String(msg.text || ""), ts: Date.now() });
      return;
    }
  });

  ws.on("close", () => {
    if (!room || !player) return;
    room.sockets.delete(player.id);
    // keep seat for reconnection during session; cleanup aggressively if all gone
    const someoneConnected = Array.from(room.sockets.values()).length > 0;
    if (!someoneConnected) {
      rooms.delete(room.id);
    } else {
      sendStateToAll(room);
    }
  });
});

