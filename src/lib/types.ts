export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // unique per deck instance
}

export type Phase = "lobby" | "bidding" | "select_trump" | "playing" | "round_end";

export interface PlayerSummary {
  id: string;
  name: string;
  seatIndex: number; // 0..3
  connected: boolean;
}

export interface Trick {
  leadSeat: number;
  plays: { seatIndex: number; card: Card }[];
}

export interface GameState {
  roomId: string;
  phase: Phase;
  hostId: string | null;
  players: PlayerSummary[]; // ordered by seat index
  you: { id: string; seatIndex: number } | null;
  hand: Card[];
  trump: Suit | null;
  currentTurn: number; // seat index
  bids: { seatIndex: number; value: number | null; passed: boolean }[];
  highestBid: { seatIndex: number; value: number } | null;
  trick: Trick | null;
  takenTricks: { teamA: number; teamB: number };
  dealerSeat: number;
  scores: { teamA: number; teamB: number };
  message?: string;
}

export type ClientToServer =
  | { type: "create_room"; name: string; roomId?: string }
  | { type: "join_room"; name: string; roomId: string }
  | { type: "start_game" }
  | { type: "place_bid"; value: number }
  | { type: "pass_bid" }
  | { type: "select_trump"; suit: Suit }
  | { type: "play_card"; cardId: string }
  | { type: "chat"; text: string }
  | { type: "ready_next_round" }
  | { type: "leave_room" };

export type ServerToClient =
  | { type: "state"; state: GameState }
  | { type: "chat"; from: string; text: string; ts: number }
  | { type: "error"; message: string };

