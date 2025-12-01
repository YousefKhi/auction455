import type { Card } from "./types";

/**
 * Convert card to image URL using deckofcardsapi.com
 * Format: rank + suit (e.g., "AS" for Ace of Spades)
 */
export function getCardImageUrl(card: Card): string {
  const rankMap: Record<string, string> = {
    "A": "A",
    "K": "K", 
    "Q": "Q",
    "J": "J",
    "10": "0",
    "9": "9",
    "8": "8",
    "7": "7",
    "6": "6",
    "5": "5",
    "4": "4",
    "3": "3",
    "2": "2"
  };
  
  const suitMap: Record<string, string> = {
    "S": "S",
    "H": "H",
    "D": "D",
    "C": "C"
  };
  
  const rank = rankMap[card.rank] || card.rank;
  const suit = suitMap[card.suit] || card.suit;
  
  return `https://deckofcardsapi.com/static/img/${rank}${suit}.png`;
}

export function getCardBackUrl(): string {
  return "https://deckofcardsapi.com/static/img/back.png";
}

