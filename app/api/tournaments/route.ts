import { NextResponse } from 'next/server';
import { readDB, writeDB, Tournament, Stage, Group, Team, StagePlan } from '../../../lib/db';
import { generateId, generateRoundRobinMatches, generateKnockoutBracket } from '../../../lib/tournamentUtils';

export async function GET() {
  try {
    const db = await readDB();
    // Return summary of tournaments
    return NextResponse.json(db.tournaments);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const pin = request.headers.get('x-admin-pin');
    const expectedPin = process.env.ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin PIN' }, { status: 401 });
    }

    const { name, teams, stageType, groupsCount, settings, stagePlan } = await request.json();

    if (!name || !teams || !Array.isArray(teams) || teams.length < 2) {
      return NextResponse.json({ error: 'Invalid name or team list' }, { status: 400 });
    }

    if (stagePlan && Array.isArray(stagePlan)) {
      for (let i = 0; i < stagePlan.length; i++) {
        const stage = stagePlan[i];
        if (stage.type === 'single-elimination') {
          if (i !== stagePlan.length - 1) {
            return NextResponse.json({ error: 'Knockout stage must be the final stage' }, { status: 400 });
          }
          if (stage.advancingCount !== 0) {
            return NextResponse.json({ error: 'Knockout stage cannot advance teams' }, { status: 400 });
          }
        }
      }
    }

    const db = await readDB();

    const newTournamentId = `t-${generateId()}`;
    const initialStageId = `stage-${generateId()}`;
    
    let initialStage: Stage;

    const effectiveStageType = stagePlan?.[0]?.type ?? stageType;
    const effectiveGroupsCount = stagePlan?.[0]?.groupsCount ?? groupsCount;

    if (effectiveStageType === 'round-robin') {
      const gCount = Number(effectiveGroupsCount) || 1;
      const groups: Group[] = Array.from({ length: gCount }, (_, i) => ({
        id: `g-${generateId()}`,
        name: `Group ${String.fromCharCode(65 + i)}`, // Group A, Group B...
        teams: [],
        matches: []
      }));

      // Distribute teams evenly into groups
      teams.forEach((team, index) => {
        const groupIndex = index % gCount;
        groups[groupIndex].teams.push(team);
      });

      // Generate fixtures for each group
      groups.forEach(group => {
        group.matches = generateRoundRobinMatches(group.teams);
      });

      initialStage = {
        id: initialStageId,
        type: 'round-robin',
        status: 'active',
        groups,
        teams
      };
    } else {
      // Single elimination bracket
      const bracket = generateKnockoutBracket(teams);
      initialStage = {
        id: initialStageId,
        type: 'single-elimination',
        status: 'active',
        bracket,
        teams
      };
    }

    const effectiveSettings = stagePlan?.[0]?.settings ?? settings;

    const newTournament: Tournament = {
      id: newTournamentId,
      name: name.trim(),
      status: 'active',
      currentStageIndex: 0,
      stages: [initialStage],
      settings: effectiveSettings ? {
        setsCount: effectiveSettings.setsCount ?? 3,
        targetPoints: effectiveSettings.targetPoints ?? 21,
        deuceEnabled: effectiveSettings.deuceEnabled ?? true,
        deuceMaxPoints: effectiveSettings.deuceMaxPoints ?? 30,
      } : undefined,
      stagePlan: stagePlan as StagePlan[] | undefined,
    };

    db.tournaments.push(newTournament);
    await writeDB(db);

    return NextResponse.json(newTournament, { status: 201 });
  } catch (error) {
    console.error('Failed to create tournament:', error);
    return NextResponse.json({ error: 'Failed to create tournament' }, { status: 500 });
  }
}
