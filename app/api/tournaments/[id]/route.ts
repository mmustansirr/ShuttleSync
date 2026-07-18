import { NextResponse } from 'next/server';
import { readDB, writeDB, Tournament, Stage, Team, Group } from '../../../../lib/db';
import { generateId, calculateStandings, generateKnockoutBracket, generateRoundRobinMatches } from '../../../../lib/tournamentUtils';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await readDB();
    console.log("API Fetching Tournament ID:", id);
    console.log("Available Tournament IDs in DB:", db.tournaments?.map(t => t.id));
    const tournament = db.tournaments.find(t => t.id === id);
    console.log("Found Tournament:", tournament ? tournament.name : "null");

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { 
        status: 404,
        headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
      });
    }

    return NextResponse.json(tournament, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (error) {
    console.error("API GET Tournament Error:", error);
    return NextResponse.json({ error: 'Failed to fetch tournament' }, { status: 500 });
  }
}

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
    const body = await request.json();
    const { action } = body;

    const db = await readDB();
    const tIndex = db.tournaments.findIndex(t => t.id === id);

    if (tIndex === -1) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const tournament = db.tournaments[tIndex];

    if (action === 'progress') {
      const currentStage = tournament.stages[tournament.currentStageIndex];
      const hasPlan = !!tournament.stagePlan;

      // Determine next stage config from plan or request body
      let effectiveNextStageType: string;
      let effectiveAdvancingCount: number;
      let effectiveGroupsCount: number;

      if (hasPlan) {
        const currentPlan = tournament.stagePlan![tournament.currentStageIndex];
        const nextPlanIndex = tournament.currentStageIndex + 1;

        effectiveAdvancingCount = currentPlan.advancingCount;

        if (nextPlanIndex >= tournament.stagePlan!.length) {
          // No more stages in the plan — mark tournament as completed
          currentStage.status = 'completed';
          tournament.status = 'completed';
          await writeDB(db);
          return NextResponse.json(tournament);
        }

        const nextPlan = tournament.stagePlan![nextPlanIndex];
        effectiveNextStageType = nextPlan.type;
        effectiveGroupsCount = nextPlan.groupsCount;
      } else {
        const { nextStageType, advancingCount, groupsCount } = body;
        effectiveNextStageType = nextStageType;
        effectiveAdvancingCount = Number(advancingCount) || 2;
        effectiveGroupsCount = Number(groupsCount) || 1;
      }

      let advancingTeams: Team[] = [];

      // 1. Collect advancing teams from the current stage
      if (currentStage.type === 'round-robin' && currentStage.groups) {
        // A planned advancingCount is a tournament-wide total, so spread it across the
        // groups. Without a plan it keeps its legacy meaning: teams taken per group.
        const numGroups = currentStage.groups.length;
        const count = hasPlan
          ? Math.ceil(effectiveAdvancingCount / numGroups)
          : effectiveAdvancingCount;
        const totalLimit = hasPlan ? effectiveAdvancingCount : Infinity;

        const groupStandings = currentStage.groups.map(group => {
          return {
            groupName: group.name,
            standings: calculateStandings(group.teams, group.matches)
          };
        });

        const rank1Teams: Team[] = [];
        const rank2Teams: Team[] = [];
        const otherTeams: Team[] = [];

        groupStandings.forEach(({ standings }, gIdx) => {
          const group = currentStage.groups![gIdx];
          
          standings.slice(0, count).forEach((standing, rIdx) => {
            const team = group.teams.find(t => t.id === standing.teamId);
            if (team) {
              if (rIdx === 0) rank1Teams.push(team);
              else if (rIdx === 1) rank2Teams.push(team);
              else otherTeams.push(team);
            }
          });
        });

        if (currentStage.groups.length === 2 && count === 2) {
          if (rank1Teams[0]) advancingTeams.push(rank1Teams[0]); // A1
          if (rank2Teams[1]) advancingTeams.push(rank2Teams[1]); // B2
          if (rank1Teams[1]) advancingTeams.push(rank1Teams[1]); // B1
          if (rank2Teams[0]) advancingTeams.push(rank2Teams[0]); // A2
        } else {
          advancingTeams = [...rank1Teams, ...rank2Teams, ...otherTeams];
        }

        // Rounding up per-group can over-collect (e.g. 3 teams from 2 groups yields 4).
        // Teams are ordered by rank, so trimming drops the lowest-placed ones.
        if (advancingTeams.length > totalLimit) {
          advancingTeams = advancingTeams.slice(0, totalLimit);
        }
      } else if (currentStage.type === 'single-elimination' && currentStage.bracket) {
        const finalRound = currentStage.bracket.rounds[currentStage.bracket.rounds.length - 1];
        const finalMatch = finalRound.matches[0];
        if (finalMatch && finalMatch.status === 'completed' && finalMatch.winnerId) {
          const allTeams = tournament.stages[0].groups 
            ? tournament.stages[0].groups.flatMap(g => g.teams)
            : tournament.stages[0].bracket?.rounds[0].matches.flatMap(m => [m.team1Id, m.team2Id]);
          
          const winnerTeam = allTeams?.find(id => id === finalMatch.winnerId);
          tournament.status = 'completed';
          await writeDB(db);
          return NextResponse.json(tournament);
        } else {
          return NextResponse.json({ error: 'Final match is not completed' }, { status: 400 });
        }
      }

      if (advancingTeams.length < 2) {
        return NextResponse.json({ error: 'Not enough teams qualified to progress' }, { status: 400 });
      }

      currentStage.status = 'completed';

      // 2. Generate the next stage
      const newStageId = `stage-${generateId()}`;
      let nextStage: Stage;

      if (effectiveNextStageType === 'single-elimination') {
        const bracket = generateKnockoutBracket(advancingTeams);
        nextStage = {
          id: newStageId,
          type: 'single-elimination',
          status: 'active',
          bracket,
          teams: advancingTeams
        };
      } else {
        const gCount = effectiveGroupsCount;
        const groups: Group[] = Array.from({ length: gCount }, (_, i) => ({
          id: `g-${generateId()}`,
          name: `Stage ${tournament.stages.length + 1} - Group ${String.fromCharCode(65 + i)}`,
          teams: [],
          matches: []
        }));

        advancingTeams.forEach((team, index) => {
          const groupIndex = index % gCount;
          groups[groupIndex].teams.push(team);
        });

        groups.forEach(group => {
          group.matches = generateRoundRobinMatches(group.teams);
        });

        nextStage = {
          id: newStageId,
          type: 'round-robin',
          status: 'active',
          groups,
          teams: advancingTeams
        };
      }

      tournament.stages.push(nextStage);
      tournament.currentStageIndex += 1;
      await writeDB(db);
      return NextResponse.json(tournament);
    } else if (action === 'delete') {
      db.tournaments.splice(tIndex, 1);
      await writeDB(db);
      return NextResponse.json({ message: 'Tournament deleted successfully' });
    } else if (action === 'complete') {
      tournament.status = 'completed';
      await writeDB(db);
      return NextResponse.json(tournament);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update tournament:', error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}
