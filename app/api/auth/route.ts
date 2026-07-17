import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    const expectedPin = process.env.ADMIN_PIN || '1234';

    if (String(pin) === String(expectedPin)) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: 'Incorrect PIN' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Auth server error' }, { status: 500 });
  }
}
