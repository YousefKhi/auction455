import { NextResponse } from "next/server";
import { gameState } from "../game/state";

export const dynamic = "force-dynamic";

// GET /api/rooms - List all active rooms
export async function GET() {
  const rooms = gameState.listRooms();
  return NextResponse.json({ rooms });
}

