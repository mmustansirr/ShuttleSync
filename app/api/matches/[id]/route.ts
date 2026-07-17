import { NextResponse } from 'next/server';
import { readDB, writeDB, Match, MatchScore } from '../../../../lib/db';
import { getMatchWinner, propagateBracketWinner } from '../../../../lib/tournamentUtils';

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

    const { id: matchId } = await params;
    const { tournamentId, score, status, court } = await request.json();

    if (!tournamentId) {
      return NextResponse.json({ error: 'Missing tournamentId' }, { status: 400 });
    }

    const db = await readDB();
    const tournament = db.tournaments.find(t => t.id === tournamentId);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const currentStage = tournament.stages[tournament.currentStageIndex];
    let matchToUpdate: Match | undefined;

    // 1. Find match in current stage
    if (currentStage.type === 'round-robin' && currentStage.groups) {
      for (const group of currentStage.groups) {
        const found = group.matches.find(m => m.id === matchId);
        if (found) {
          matchToUpdate = found;
          break;
        }
      }
    } else if (currentStage.type === 'single-elimination' && currentStage.bracket) {
      for (const round of currentStage.bracket.rounds) {
        const found = round.matches.find(m => m.id === matchId);
        if (found) {
          matchToUpdate = found;
          break;
        }
      }
    }

    if (!matchToUpdate) {
      return NextResponse.json({ error: 'Match not found in current stage' }, { status: 404 });
    }

    const wasCompleted = matchToUpdate.status === 'completed';

    // Prevent overwriting a completed match with stale 'live' or 'pending' status
    if (matchToUpdate.status === 'completed' && status !== 'completed') {
      return NextResponse.json({ error: 'Match is already completed and locked' }, { status: 400 });
    }

    // 2. Update match details
    if (score) matchToUpdate.score = score;
    if (status) matchToUpdate.status = status;
    if (court !== undefined) matchToUpdate.court = court;

    // 3. If completed, set winner
    if (status === 'completed') {
      // Find which stage index the match belongs to
      let matchStageIndex = tournament.currentStageIndex;
      for (let si = 0; si < tournament.stages.length; si++) {
        const stage = tournament.stages[si];
        if (stage.type === 'round-robin' && stage.groups) {
          for (const g of stage.groups) {
            if (g.matches.some(m => m.id === matchId)) { matchStageIndex = si; break; }
          }
        } else if (stage.type === 'single-elimination' && stage.bracket) {
          for (const r of stage.bracket.rounds) {
            if (r.matches.some(m => m.id === matchId)) { matchStageIndex = si; break; }
          }
        }
      }

      // Per-stage scoring
      const stageSettings = tournament.stagePlan?.[matchStageIndex]?.settings;
      const setsCount = stageSettings?.setsCount ?? tournament.settings?.setsCount ?? 3;
      const winnerId = getMatchWinner(matchToUpdate, setsCount);
      if (winnerId) {
        matchToUpdate.winnerId = winnerId;
        
        // If single-elimination, propagate to next round
        if (currentStage.type === 'single-elimination' && currentStage.bracket) {
          currentStage.bracket.rounds = propagateBracketWinner(
            currentStage.bracket.rounds,
            matchId,
            winnerId
          );
        }

        // Update player statistics only if transitioning to completed
        if (!wasCompleted) {
          const allTeams = tournament.stages[0].teams || [];
          const t1Obj = allTeams.find(t => t.id === matchToUpdate.team1Id);
          const t2Obj = allTeams.find(t => t.id === matchToUpdate.team2Id);

          if (t1Obj && t2Obj) {
            const team1Won = winnerId === matchToUpdate.team1Id;
            
            const updatePlayerStats = (id: string, won: boolean) => {
              const player = db.players.find(p => p.id === id);
              if (player) {
                player.stats.played += 1;
                if (won) player.stats.wins += 1;
                else player.stats.losses += 1;
              }
            };

            t1Obj.playerIds.forEach(id => updatePlayerStats(id, team1Won));
            t2Obj.playerIds.forEach(id => updatePlayerStats(id, !team1Won));
          }
        }
      } else {
        const requiredSets = setsCount === 1 ? 1 : 2;
        return NextResponse.json({ error: `Cannot complete match: No winner decided yet (need ${requiredSets} set(s) won).` }, { status: 400 });
      }
    } else {
      // Clear winner if status changed back to pending/live
      matchToUpdate.winnerId = undefined;
    }

    await writeDB(db);
    return NextResponse.json({ match: matchToUpdate, tournament });
  } catch (error) {
    console.error('Failed to update match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}
