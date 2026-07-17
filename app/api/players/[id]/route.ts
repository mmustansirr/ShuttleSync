import { NextResponse } from 'next/server';
import { readDB, writeDB } from '../../../../lib/db';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const pin = request.headers.get('x-admin-pin');
    const expectedPin = process.env.ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
    }

    const { id } = await params;
    const { name, rating, stats } = await request.json();
    const db = await readDB();
    const playerIndex = db.players.findIndex(p => p.id === id);

    if (playerIndex === -1) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (name) db.players[playerIndex].name = name.trim();
    if (rating !== undefined) db.players[playerIndex].rating = Number(rating);
    if (stats) db.players[playerIndex].stats = stats;

    await writeDB(db);
    return NextResponse.json(db.players[playerIndex]);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const pin = request.headers.get('x-admin-pin');
    const expectedPin = process.env.ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
    }

    const { id } = await params;
    const db = await readDB();
    const playerIndex = db.players.findIndex(p => p.id === id);

    if (playerIndex === -1) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Remove player
    db.players.splice(playerIndex, 1);
    await writeDB(db);

    return NextResponse.json({ message: 'Player deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete player' }, { status: 500 });
  }
}
