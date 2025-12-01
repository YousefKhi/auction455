// In-memory game state (works on Vercel with limitations)
// Note: Vercel serverless functions are stateless, so this will reset on cold starts
// For production, consider using a database or Redis

import type { Card, GameState as ClientGameState, Suit } from "@/lib/types";
import { makeDeck, shuffle, dealHands } from "@/lib/game";

type Room = {
  id: string;
  phase: string;
  hostId: string | null;
  players: Map<string, { id: string; name: string; seatIndex: number; lastSeen: number }>;
  seats: (string | null)[];
  dealerSeat: number;
  currentTurn: number;
  bids: Array<{ seatIndex: number; value: number | null; passed: boolean }>;
  highestBid: { seatIndex: number; value: number } | null;
  trump: Suit | null;
  hands: Map<number, Card[]>;
  trick: { leadSeat: number; plays: Array<{ seatIndex: number; card: Card }> } | null;
  takenTricks: { teamA: number; teamB: number };
  scores: { teamA: number; teamB: number };
  message: string;
  chats: Array<{ from: string; text: string; ts: number }>;
  lastActivity: number;
};

class GameState {
  private rooms = new Map<string, Room>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up inactive rooms every 5 minutes
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  private cleanup() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivity > timeout) {
        this.rooms.delete(roomId);
      }
    }
  }

  private ensureRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        phase: "lobby",
        hostId: null,
        players: new Map(),
        seats: [null, null, null, null],
        dealerSeat: 0,
        currentTurn: 0,
        bids: [],
        highestBid: null,
        trump: null,
        hands: new Map(),
        trick: null,
        takenTricks: { teamA: 0, teamB: 0 },
        scores: { teamA: 0, teamB: 0 },
        message: "",
        chats: [],
        lastActivity: Date.now(),
      };
      this.rooms.set(roomId, room);
    }
    room.lastActivity = Date.now();
    return room;
  }

  private nextSeatWithPlayer(room: Room, startSeat: number): number {
    for (let i = 0; i < 4; i++) {
      const seat = (startSeat + i) % 4;
      if (room.seats[seat]) return seat;
    }
    return startSeat;
  }

  private teamOfSeat(seatIndex: number): "A" | "B" {
    return seatIndex % 2 === 0 ? "A" : "B";
  }

  joinOrCreateRoom(roomId: string, name: string, clientId: string) {
    const room = this.ensureRoom(roomId.toUpperCase());
    
    // Check if already in room
    const existingSeat = room.seats.findIndex(s => s === clientId);
    if (existingSeat !== -1) {
      const player = room.players.get(clientId);
      if (player) {
        player.lastSeen = Date.now();
        return { success: true, state: this.getState(room.id, clientId) };
      }
    }

    // Find empty seat
    const seatIndex = room.seats.findIndex(s => s === null);
    if (seatIndex === -1) {
      return { success: false, error: "Room is full" };
    }

    // Add player
    const player = { id: clientId, name: name || "Player", seatIndex, lastSeen: Date.now() };
    room.seats[seatIndex] = clientId;
    room.players.set(clientId, player);
    if (!room.hostId) room.hostId = clientId;

    return { success: true, state: this.getState(room.id, clientId) };
  }

  startGame(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };

    const filledSeats = room.seats.filter(s => s !== null).length;
    if (filledSeats < 2) {
      return { success: false, error: "Need at least 2 players" };
    }

    room.message = filledSeats < 4 ? `Starting with ${filledSeats} players...` : "Dealing...";
    this.startDealing(room);
    
    return { success: true, state: this.getState(room.id, clientId) };
  }

  private startDealing(room: Room) {
    const deck = shuffle(makeDeck());
    room.hands = new Map();
    const hands = dealHands(deck, 4, 5);
    for (let s = 0; s < 4; s++) {
      room.hands.set(s, room.seats[s] ? hands[s] : []);
    }
    this.startBidding(room);
  }

  private startBidding(room: Room) {
    room.phase = "bidding";
    room.bids = Array.from({ length: 4 }, (_, seatIndex) => ({ seatIndex, value: null, passed: false }));
    room.highestBid = null;
    room.trump = null;
    room.trick = null;
    room.takenTricks = { teamA: 0, teamB: 0 };
    room.message = "Bidding started";
    room.currentTurn = this.nextSeatWithPlayer(room, this.nextSeatWithPlayer(room, room.dealerSeat));
  }

  placeBid(roomId: string, clientId: string, value: number) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    const player = room.players.get(clientId);
    if (!player) return { success: false, error: "Player not found" };
    
    if (player.seatIndex !== room.currentTurn) {
      return { success: false, error: `Not your turn. Current turn: Seat ${room.currentTurn}` };
    }

    if (value < 15 || value > 45 || value % 5 !== 0) {
      return { success: false, error: "Bid must be 15..45 in steps of 5" };
    }

    const prev = room.highestBid?.value || 0;
    if (value <= prev) {
      return { success: false, error: "Bid must beat current highest" };
    }

    room.bids[player.seatIndex] = { seatIndex: player.seatIndex, value, passed: false };
    room.highestBid = { seatIndex: player.seatIndex, value };
    room.message = `Seat ${player.seatIndex} bid ${value}`;
    room.currentTurn = this.nextSeatWithPlayer(room, player.seatIndex);

    if (this.allPassed(room.bids)) {
      room.phase = "select_trump";
      room.currentTurn = room.highestBid.seatIndex;
      room.message = "Highest bidder: select trump";
    }

    return { success: true, state: this.getState(room.id, clientId) };
  }

  passBid(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    const player = room.players.get(clientId);
    if (!player) return { success: false, error: "Player not found" };
    
    if (player.seatIndex !== room.currentTurn) {
      return { success: false, error: `Not your turn` };
    }

    room.bids[player.seatIndex] = { seatIndex: player.seatIndex, value: room.bids[player.seatIndex]?.value ?? null, passed: true };
    room.message = `Seat ${player.seatIndex} passed`;
    room.currentTurn = this.nextSeatWithPlayer(room, player.seatIndex);

    if (this.allPassed(room.bids) && room.highestBid) {
      room.phase = "select_trump";
      room.currentTurn = room.highestBid.seatIndex;
      room.message = "Highest bidder: select trump";
    }

    return { success: true, state: this.getState(room.id, clientId) };
  }

  private allPassed(bids: Array<{ seatIndex: number; value: number | null; passed: boolean }>): boolean {
    return bids.filter(b => b.passed).length >= 3 && bids.some(b => b.value !== null);
  }

  selectTrump(roomId: string, clientId: string, suit: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    const player = room.players.get(clientId);
    if (!player || player.seatIndex !== room.highestBid?.seatIndex) {
      return { success: false, error: "Only highest bidder can select trump" };
    }

    if (!["S", "H", "D", "C"].includes(suit)) {
      return { success: false, error: "Invalid suit" };
    }

    room.trump = suit as Suit;
    room.currentTurn = this.nextSeatWithPlayer(room, room.dealerSeat);
    room.phase = "playing";
    room.trick = { leadSeat: room.currentTurn, plays: [] };
    room.message = `Trump selected: ${suit}`;

    return { success: true, state: this.getState(room.id, clientId) };
  }

  playCard(roomId: string, clientId: string, cardId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    const player = room.players.get(clientId);
    if (!player) return { success: false, error: "Player not found" };
    
    if (player.seatIndex !== room.currentTurn) {
      return { success: false, error: "Not your turn" };
    }

    const hand = room.hands.get(player.seatIndex) || [];
    const card = hand.find(c => c.id === cardId);
    if (!card) return { success: false, error: "Card not in hand" };

    // Check follow suit
    if (room.trick && room.trick.plays.length > 0) {
      const leadSuit = room.trick.plays[0].card.suit;
      const hasLead = hand.some(c => c.suit === leadSuit);
      if (hasLead && card.suit !== leadSuit) {
        return { success: false, error: "You must follow suit" };
      }
    }

    // Play card
    room.trick!.plays.push({ seatIndex: player.seatIndex, card });
    room.hands.set(player.seatIndex, hand.filter(c => c.id !== cardId));

    const activePlayers = room.seats.filter(s => s !== null).length;
    if (room.trick!.plays.length < activePlayers) {
      room.currentTurn = this.nextSeatWithPlayer(room, player.seatIndex);
    } else {
      // Resolve trick
      this.resolveTrick(room);
    }

    return { success: true, state: this.getState(room.id, clientId) };
  }

  private resolveTrick(room: Room) {
    const winnerSeat = this.computeTrickWinner(room.trick!.plays, room.trick!.plays[0].card.suit, room.trump!);
    const team = this.teamOfSeat(winnerSeat);
    if (team === "A") room.takenTricks.teamA += 1;
    else room.takenTricks.teamB += 1;

    const remainingCards = (room.hands.get(0) || []).length;
    if (remainingCards > 0) {
      room.trick = { leadSeat: winnerSeat, plays: [] };
      room.currentTurn = winnerSeat;
    } else {
      this.endRound(room);
    }
  }

  private computeTrickWinner(plays: Array<{ seatIndex: number; card: Card }>, lead: Suit, trump: Suit): number {
    let best = plays[0];
    for (let i = 1; i < plays.length; i++) {
      if (this.compareCards(plays[i].card, best.card, lead, trump) > 0) {
        best = plays[i];
      }
    }
    return best.seatIndex;
  }

  private compareCards(a: Card, b: Card, lead: Suit, trump: Suit): number {
    const trumpOrder = ["5","J","A","K","Q","10","9","8","7","6","4","3","2"];
    const nonTrumpOrder = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
    
    const aTrump = a.suit === trump;
    const bTrump = b.suit === trump;
    if (aTrump && !bTrump) return 1;
    if (!aTrump && bTrump) return -1;
    
    const aLead = a.suit === lead;
    const bLead = b.suit === lead;
    if (aLead && !bLead) return 1;
    if (!aLead && bLead) return -1;
    
    const order = aTrump ? trumpOrder : nonTrumpOrder;
    const ai = order.indexOf(a.rank);
    const bi = order.indexOf(b.rank);
    return ai < bi ? 1 : ai > bi ? -1 : 0;
  }

  private endRound(room: Room) {
    const bid = room.highestBid;
    const pointsA = room.takenTricks.teamA * 5;
    const pointsB = room.takenTricks.teamB * 5;
    
    if (bid) {
      const biddingTeam = this.teamOfSeat(bid.seatIndex);
      const biddingPoints = biddingTeam === "A" ? pointsA : pointsB;
      if (biddingPoints < bid.value) {
        if (biddingTeam === "A") room.scores.teamA -= bid.value;
        else room.scores.teamB -= bid.value;
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
  }

  nextRound(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    room.dealerSeat = this.nextSeatWithPlayer(room, room.dealerSeat);
    this.startDealing(room);
    
    return { success: true, state: this.getState(room.id, clientId) };
  }

  addChat(roomId: string, clientId: string, text: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: "Room not found" };
    
    const player = room.players.get(clientId);
    if (!player) return { success: false, error: "Player not found" };
    
    room.chats.push({ from: player.name, text, ts: Date.now() });
    
    return { success: true };
  }

  getState(roomId: string, clientId: string): ClientGameState {
    const room = this.rooms.get(roomId);
    if (!room) {
      return {
        roomId,
        phase: "lobby",
        hostId: null,
        players: [],
        you: null,
        hand: [],
        trump: null,
        currentTurn: 0,
        bids: [],
        highestBid: null,
        trick: null,
        takenTricks: { teamA: 0, teamB: 0 },
        dealerSeat: 0,
        scores: { teamA: 0, teamB: 0 },
        message: "",
        chats: [],
      };
    }

    const player = room.players.get(clientId);
    
    return {
      roomId: room.id,
      phase: room.phase,
      hostId: room.hostId,
      players: Array.from(room.seats).map((pid, seatIndex) => {
        if (!pid) return { id: "", name: "(empty)", seatIndex, connected: false };
        const p = room.players.get(pid);
        return { id: p!.id, name: p!.name, seatIndex, connected: true };
      }),
      you: player ? { id: player.id, seatIndex: player.seatIndex } : null,
      hand: player ? (room.hands.get(player.seatIndex) || []) : [],
      trump: room.trump,
      currentTurn: room.currentTurn,
      bids: room.bids,
      highestBid: room.highestBid,
      trick: room.trick,
      takenTricks: room.takenTricks,
      dealerSeat: room.dealerSeat,
      scores: room.scores,
      message: room.message,
      chats: room.chats,
    };
  }

  listRooms() {
    return Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      playerCount: r.seats.filter(s => s !== null).length,
      phase: r.phase,
    }));
  }
}

export const gameState = new GameState();

