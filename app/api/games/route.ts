import { NextResponse } from 'next/server';
import { readDB, writeDB, SocialMatch } from '../../../lib/db';
import { generateId, updateEloRatings } from '../../../lib/tournamentUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await readDB();
    
    // Ensure sessions is initialized
    if (!db.sessions) {
      db.sessions = { activePlayers: [], courtQueue: [], completedMatches: [] };
      await writeDB(db);
    }
    
    return NextResponse.json(db.sessions, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch social session data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const pin = request.headers.get('x-admin-pin');
    const expectedPin = process.env.ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
    }

    const db = await readDB();
    if (!db.sessions) {
      db.sessions = { activePlayers: [], courtQueue: [], completedMatches: [] };
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'checkIn') {
      const { playerIds } = body;
      if (!playerIds || !Array.isArray(playerIds)) {
        return NextResponse.json({ error: 'Invalid playerIds' }, { status: 400 });
      }
      
      // Add players without duplication
      playerIds.forEach(id => {
        if (!db.sessions.activePlayers.includes(id)) {
          db.sessions.activePlayers.push(id);
        }
      });
      await writeDB(db);
      return NextResponse.json(db.sessions);

    } else if (action === 'checkOut') {
      const { playerId } = body;
      db.sessions.activePlayers = db.sessions.activePlayers.filter(id => id !== playerId);
      
      // Also remove from any pending queue
      db.sessions.courtQueue = db.sessions.courtQueue.filter(
        m => m.status === 'live' || (!m.team1Players.includes(playerId) && !m.team2Players.includes(playerId))
      );
      
      await writeDB(db);
      return NextResponse.json(db.sessions);

    } else if (action === 'suggestMatch') {
      const { court, gameType } = body;
      const isSingles = gameType === 'singles';
      const activePlayers = db.sessions.activePlayers;
      
      const requiredPlayers = isSingles ? 2 : 4;
      if (activePlayers.length < requiredPlayers) {
        return NextResponse.json({ 
          error: `At least ${requiredPlayers} checked-in players are needed to matchmake ${isSingles ? 'Singles' : 'Doubles'}` 
        }, { status: 400 });
      }

      // Calculate play history (how many matches each active player has played)
      const playCounts: Record<string, number> = {};
      activePlayers.forEach(id => {
        playCounts[id] = 0;
      });

      db.sessions.completedMatches.forEach(m => {
        m.team1Players.forEach(id => { if (id in playCounts) playCounts[id]++; });
        m.team2Players.forEach(id => { if (id in playCounts) playCounts[id]++; });
      });

      db.sessions.courtQueue.forEach(m => {
        m.team1Players.forEach(id => { if (id in playCounts) playCounts[id]++; });
        m.team2Players.forEach(id => { if (id in playCounts) playCounts[id]++; });
      });

      // Sort active players by play count ascending, then by rating descending (as a tie breaker)
      const sortedCandidates = [...activePlayers].sort((a, b) => {
        const countA = playCounts[a];
        const countB = playCounts[b];
        if (countA !== countB) return countA - countB;
        
        const ratingA = db.players.find(p => p.id === a)?.rating || 3;
        const ratingB = db.players.find(p => p.id === b)?.rating || 3;
        return ratingB - ratingA;
      });

      let team1: string[] = [];
      let team2: string[] = [];

      if (isSingles) {
        // Select top 2 players
        const selectedIds = sortedCandidates.slice(0, 2);
        const candidates = db.players.filter(p => selectedIds.includes(p.id));
        
        // Match them against each other
        team1 = [candidates[0].id];
        team2 = [candidates[1].id];
      } else {
        // Select top 4 players
        const selectedIds = sortedCandidates.slice(0, 4);
        const candidates = db.players.filter(p => selectedIds.includes(p.id));

        // Balance matchmaking: pair highest and lowest rating, and middle two ratings
        candidates.sort((a, b) => b.rating - a.rating);

        team1 = [candidates[0].id, candidates[3].id];
        team2 = [candidates[1].id, candidates[2].id];
      }

      const suggestedMatch = {
        id: `s-${generateId()}`,
        team1Players: team1,
        team2Players: team2,
        court: court || 'Court 1',
        status: 'pending' as const,
        score: [{ team1: 0, team2: 0 }]
      };

      db.sessions.courtQueue.push(suggestedMatch);
      await writeDB(db);
      return NextResponse.json(db.sessions);

    } else if (action === 'updateMatch') {
      const { matchId, score, status, court } = body;
      const matchIndex = db.sessions.courtQueue.findIndex(m => m.id === matchId);

      if (matchIndex === -1) {
        return NextResponse.json({ error: 'Match not found in queue' }, { status: 404 });
      }

      const match = db.sessions.courtQueue[matchIndex];

      if (court) match.court = court;
      if (status) match.status = status;
      if (score) match.score = score;

      if (status === 'completed') {
        if (!score || !Array.isArray(score) || score.length === 0) {
          return NextResponse.json({ error: 'Scores are required to complete match' }, { status: 400 });
        }

        // Move to completed
        const completedMatch: SocialMatch = {
          id: match.id,
          team1Players: match.team1Players,
          team2Players: match.team2Players,
          score: score,
          court: match.court,
          status: 'completed',
          timestamp: new Date().toISOString()
        };

        // Remove from queue
        db.sessions.courtQueue.splice(matchIndex, 1);
        db.sessions.completedMatches.push(completedMatch);

        // Update player statistics
        let t1Sets = 0;
        let t2Sets = 0;
        score.forEach((s: { team1: number; team2: number }) => {
          if (s.team1 > s.team2) t1Sets++;
          if (s.team2 > s.team1) t2Sets++;
        });

        const team1Won = t1Sets > t2Sets;

        const updatePlayerStats = (id: string, won: boolean) => {
          const player = db.players.find(p => p.id === id);
          if (player) {
            player.stats.played += 1;
            if (won) player.stats.wins += 1;
            else player.stats.losses += 1;
          }
        };

        match.team1Players.forEach(id => updatePlayerStats(id, team1Won));
        match.team2Players.forEach(id => updatePlayerStats(id, !team1Won));

        // Calculate and update Elo Ratings
        updateEloRatings(db.players, match.team1Players, match.team2Players, team1Won);
      }

      await writeDB(db);
      return NextResponse.json(db.sessions);
    } else if (action === 'reset') {
      db.sessions = {
        activePlayers: [],
        courtQueue: [],
        completedMatches: []
      };
      await writeDB(db);
      return NextResponse.json(db.sessions);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update social games:', error);
    return NextResponse.json({ error: 'Failed to update social games' }, { status: 500 });
  }
}
