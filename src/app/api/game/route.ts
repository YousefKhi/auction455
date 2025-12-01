import { NextRequest, NextResponse } from "next/server";
import { gameState } from "./state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/game - Handle game actions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      case "create_room":
      case "join_room":
        return handleJoinOrCreate(data);
      case "start_game":
        return handleStartGame(data);
      case "place_bid":
        return handlePlaceBid(data);
      case "pass_bid":
        return handlePassBid(data);
      case "select_trump":
        return handleSelectTrump(data);
      case "play_card":
        return handlePlayCard(data);
      case "ready_next_round":
        return handleNextRound(data);
      case "chat":
        return handleChat(data);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET /api/game?roomId=XXX&clientId=YYY - Get current state
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (!roomId || !clientId) {
    return NextResponse.json({ error: "Missing roomId or clientId" }, { status: 400 });
  }

  const state = gameState.getState(roomId, clientId);
  return NextResponse.json(state);
}

function handleJoinOrCreate(data: any) {
  const { roomId, name, clientId } = data;
  const result = gameState.joinOrCreateRoom(roomId, name, clientId);
  return NextResponse.json(result);
}

function handleStartGame(data: any) {
  const { roomId, clientId } = data;
  const result = gameState.startGame(roomId, clientId);
  return NextResponse.json(result);
}

function handlePlaceBid(data: any) {
  const { roomId, clientId, value } = data;
  const result = gameState.placeBid(roomId, clientId, value);
  return NextResponse.json(result);
}

function handlePassBid(data: any) {
  const { roomId, clientId } = data;
  const result = gameState.passBid(roomId, clientId);
  return NextResponse.json(result);
}

function handleSelectTrump(data: any) {
  const { roomId, clientId, suit } = data;
  const result = gameState.selectTrump(roomId, clientId, suit);
  return NextResponse.json(result);
}

function handlePlayCard(data: any) {
  const { roomId, clientId, cardId } = data;
  const result = gameState.playCard(roomId, clientId, cardId);
  return NextResponse.json(result);
}

function handleNextRound(data: any) {
  const { roomId, clientId } = data;
  const result = gameState.nextRound(roomId, clientId);
  return NextResponse.json(result);
}

function handleChat(data: any) {
  const { roomId, clientId, text } = data;
  const result = gameState.addChat(roomId, clientId, text);
  return NextResponse.json(result);
}

