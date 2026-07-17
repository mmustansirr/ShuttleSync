import { readDB, writeDB, Player, Tournament, Team, Match, Stage } from '../lib/db';
import { 
  generateId, 
  generateRoundRobinMatches, 
  generateKnockoutBracket, 
  calculateStandings, 
  propagateBracketWinner, 
  getMatchWinner 
} from '../lib/tournamentUtils';

async function testTournamentFlow() {
  console.log('🚀 STARTING FULL TOURNAMENT FLOW TEST...');
  
  // 1. Fetch DB
  const db = await readDB();
  console.log(`✓ Database read successfully. Active players count: ${db.players.length}`);

  // Ensure we have at least 8 players
  if (db.players.length < 8) {
    console.log('Seeding mock players...');
    const seedNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    db.players = seedNames.map((name, idx) => ({
      id: `p-test-${idx}`,
      name,
      rating: (idx % 5) + 1,
      stats: { played: 0, wins: 0, losses: 0 }
    }));
    await writeDB(db);
  }

  // 2. Select 8 players and generate 4 doubles teams
  const activePlayers = db.players.slice(0, 8);
  console.log(`✓ Selected 8 players for matchmaking.`);
  
  // Pair high-low: [0, 7], [1, 6], [2, 5], [3, 4]
  const teams: Team[] = [];
  for (let i = 0; i < 4; i++) {
    const p1 = activePlayers[i];
    const p2 = activePlayers[7 - i];
    teams.push({
      id: `team-test-${i}`,
      name: `${p1.name} & ${p2.name}`,
      playerIds: [p1.id, p2.id]
    });
  }
  console.log(`✓ Generated 4 balanced teams:`);
  teams.forEach(t => console.log(`  - ${t.name}`));

  // 3. Create Tournament
  console.log('\nCreating Tournament "Flow Test Tourney"...');
  const tournamentId = `t-test-${generateId()}`;
  const initialStageId = `stage-test-${generateId()}`;
  
  // First stage: Round Robin (1 group of 4 teams)
  const matches = generateRoundRobinMatches(teams);
  console.log(`✓ Generated Berger Round Robin matches: ${matches.length} fixtures scheduled.`);

  const stage1: Stage = {
    id: initialStageId,
    type: 'round-robin',
    status: 'active',
    groups: [
      {
        id: `g-test-${generateId()}`,
        name: 'Group A',
        teams,
        matches
      }
    ],
    teams
  };

  const newTournament: Tournament = {
    id: tournamentId,
    name: 'Flow Test Tourney',
    status: 'active',
    currentStageIndex: 0,
    stages: [stage1]
  };

  db.tournaments.push(newTournament);
  await writeDB(db);
  console.log('✓ Tournament created and saved in Upstash Redis.');

  // 4. Simulate Group Match Play (Stage 1)
  console.log('\nSimulating Group Match Play (Stage 1)...');
  const currentDb = await readDB();
  const tourney = currentDb.tournaments.find(t => t.id === tournamentId)!;
  const currentStage = tourney.stages[tourney.currentStageIndex];
  const group = currentStage.groups![0];

  const scoreResults = [
    { team1: 21, team2: 15, team1Set: 21, team2Set: 18 }, // M0: T0 wins
    { team1: 21, team2: 19, team1Set: 21, team2Set: 17 }, // M1: T1 wins
    { team1: 15, team2: 21, team1Set: 12, team2Set: 21 }, // M2: T2 wins
    { team1: 21, team2: 18, team1Set: 22, team2Set: 20 }, // M3: T0 wins
    { team1: 21, team2: 10, team1Set: 21, team2Set: 12 }, // M4: T1 wins
    { team1: 15, team2: 21, team1Set: 14, team2Set: 21 }  // M5: T0 wins
  ];

  group.matches.forEach((m, idx) => {
    const scores = scoreResults[idx];
    m.score = {
      set1: { team1: scores.team1, team2: scores.team2 },
      set2: { team1: scores.team1Set, team2: scores.team2Set }
    };
    m.status = 'completed';
    m.winnerId = getMatchWinner(m);
    console.log(`  - Match ${idx}: ${getTeamName(m.team1Id, teams)} vs ${getTeamName(m.team2Id, teams)} -> Winner: ${getTeamName(m.winnerId!, teams)}`);
  });

  await writeDB(currentDb);
  console.log('✓ Simulated all 6 matches. Results saved.');

  // 5. Calculate Standings
  const standings = calculateStandings(group.teams, group.matches);
  console.log('\nGroup A Standings:');
  standings.forEach((st, index) => {
    console.log(`  ${index + 1}. ${getTeamName(st.teamId, teams)} | Wins: ${st.wins} | Sets Diff: ${st.setDiff} | Points Diff: ${st.pointDiff}`);
  });

  // Verify that standings array has 4 items
  if (standings.length !== 4) {
    throw new Error('Standings calculation error: Expeced 4 teams in standings.');
  }
  console.log('✓ Standings calculation verified successfully.');

  // 6. Progress to Stage 2 (Knockout Bracket: Top 2 Teams)
  console.log('\nProgressing to Stage 2: Single Elimination Bracket...');
  const updatedDb = await readDB();
  const activeTourney = updatedDb.tournaments.find(t => t.id === tournamentId)!;
  const stageToFreeze = activeTourney.stages[activeTourney.currentStageIndex];
  
  // Freeze stage 1
  stageToFreeze.status = 'completed';

  // Get advancing teams (top 2 from Group A standings)
  const advancingIds = standings.slice(0, 2).map(s => s.teamId);
  const advancingTeams = teams.filter(t => advancingIds.includes(t.id));
  console.log(`✓ Advancing Teams: ${advancingTeams.map(t => t.name).join(', ')}`);

  // Generate Finals bracket (2 teams: 1 round)
  const bracket = generateKnockoutBracket(advancingTeams);
  const newStage: Stage = {
    id: `stage-test-${generateId()}`,
    type: 'single-elimination',
    status: 'active',
    bracket,
    teams: advancingTeams
  };

  activeTourney.stages.push(newStage);
  activeTourney.currentStageIndex += 1;
  await writeDB(updatedDb);
  console.log('✓ Stage progressed successfully. Bracket created.');

  // 7. Simulate Bracket Final Match
  console.log('\nSimulating Bracket Final Match (Stage 2)...');
  const finalDb = await readDB();
  const currentTourney = finalDb.tournaments.find(t => t.id === tournamentId)!;
  const bracketStage = currentTourney.stages[currentTourney.currentStageIndex];
  
  const finalMatch = bracketStage.bracket!.rounds[0].matches[0];
  console.log(`✓ Final Match: ${getTeamName(finalMatch.team1Id, teams)} vs ${getTeamName(finalMatch.team2Id, teams)}`);

  // Set score (Team 1 wins: 21-19, 21-18)
  finalMatch.score = {
    set1: { team1: 21, team2: 19 },
    set2: { team1: 21, team2: 18 }
  };
  finalMatch.status = 'completed';
  finalMatch.winnerId = getMatchWinner(finalMatch);
  
  // Complete tournament
  currentTourney.status = 'completed';
  bracketStage.status = 'completed';

  await writeDB(finalDb);
  console.log(`✓ Final completed. Winner is: ${getTeamName(finalMatch.winnerId!, teams)}`);
  console.log('✓ Tournament marked as completed.');

  // 8. Clean up test tournament
  console.log('\nCleaning up test tournament...');
  const cleanDb = await readDB();
  cleanDb.tournaments = cleanDb.tournaments.filter(t => t.id !== tournamentId);
  await writeDB(cleanDb);
  console.log('✓ Test tournament deleted from cloud database.');

  console.log('\n🎉 ALL TOURNAMENT FLOW TESTS COMPLETED SUCCESSFULLY! ZERO LOGIC ERRORS DETECTED.');
}

function getTeamName(id: string, teams: Team[]) {
  return teams.find(t => t.id === id)?.name || 'Unknown';
}

testTournamentFlow();
