import { NextResponse } from 'next/server';
import { readDB, writeDB, Player } from '../../../lib/db';
import { generateId } from '../../../lib/tournamentUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await readDB();
    return NextResponse.json(db.players, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const pin = request.headers.get('x-admin-pin');
    const expectedPin = process.env.ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
    }

    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    const db = await readDB();
    const newPlayer: Player = {
      id: `p-${generateId()}`,
      name: name.trim(),
      rating: 1200,
      stats: { played: 0, wins: 0, losses: 0 }
    };

    db.players.push(newPlayer);
    await writeDB(db);

    return NextResponse.json(newPlayer, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}
