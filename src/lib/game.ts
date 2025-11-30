import { v4 as uuidv4 } from "uuid";
import type { Card, GameState, Rank, Suit } from "./types";

export function makeDeck(): Card[] {
  const suits: Suit[] = ["S", "H", "D", "C"];
  const ranks: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
  const deck: Card[] = [];
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ suit: s, rank: r, id: uuidv4() });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(deck: Card[], numPlayers = 4, handSize = 5): Card[][] {
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  let idx = 0;
  for (let r = 0; r < handSize; r++) {
    for (let p = 0; p < numPlayers; p++) {
      hands[p].push(deck[idx++]);
    }
  }
  return hands;
}

// Simplified Auction 45 ranking:
// - Trump suit: 5 > J > A > K > Q > 10 > 9 > 8 > 7 > 6 > 4 > 3 > 2
// - Non-trump: A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2
const nonTrumpOrder: Rank[] = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const trumpOrder: Rank[] = ["5","J","A","K","Q","10","9","8","7","6","4","3","2"];

export function compareCards(a: Card, b: Card, lead: Suit, trump: Suit | null): number {
  if (a.id === b.id) return 0;
  // trump beats non-trump
  const aIsTrump = trump && a.suit === trump;
  const bIsTrump = trump && b.suit === trump;
  if (aIsTrump && !bIsTrump) return 1;
  if (!aIsTrump && bIsTrump) return -1;
  // if neither trump, follow lead suit
  const aFollows = a.suit === lead;
  const bFollows = b.suit === lead;
  if (aFollows && !bFollows) return 1;
  if (!aFollows && bFollows) return -1;
  // same category: compare by order
  const order = aIsTrump && bIsTrump ? trumpOrder : nonTrumpOrder;
  const ai = order.indexOf(a.rank);
  const bi = order.indexOf(b.rank);
  return ai < bi ? 1 : ai > bi ? -1 : 0;
}

export function teamOfSeat(seatIndex: number): "A" | "B" {
  return seatIndex % 2 === 0 ? "A" : "B";
}

export function seatLeftOf(seat: number): number {
  return (seat + 1) % 4;
}

export function canPlay(card: Card, hand: Card[], trickLead: Suit | null, trump: Suit | null): boolean {
  if (!trickLead) return true;
  const hasLead = hand.some(c => c.suit === trickLead);
  if (!hasLead) return true;
  return card.suit === trickLead;
}

export function removeCard(hand: Card[], cardId: string): Card[] {
  return hand.filter(c => c.id !== cardId);
}

export function computeTrickWinner(plays: { seatIndex: number; card: Card }[], lead: Suit, trump: Suit | null): number {
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) {
    if (compareCards(plays[i].card, best.card, lead, trump) > 0) {
      best = plays[i];
    }
  }
  return best.seatIndex;
}

export function scoreRound(
  taken: { teamA: number; teamB: number },
  highestBid: { seatIndex: number; value: number } | null
): { teamA: number; teamB: number } {
  // Each trick = 5 points. Bidding team must meet or exceed bid, else they lose bid points.
  const pointsA = taken.teamA * 5;
  const pointsB = taken.teamB * 5;
  if (!highestBid) return { teamA: pointsA, teamB: pointsB };
  const biddingTeam = teamOfSeat(highestBid.seatIndex);
  const bid = highestBid.value;
  const teamPoints = biddingTeam === "A" ? pointsA : pointsB;
  if (teamPoints >= bid) {
    return { teamA: pointsA, teamB: pointsB };
  }
  // deduct bid from bidding team score
  return biddingTeam === "A"
    ? { teamA: -bid, teamB: pointsB }
    : { teamA: pointsA, teamB: -bid };
}

