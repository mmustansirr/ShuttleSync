import { Player, Team, Match, Group, Stage, MatchScore, Tournament } from './db';

// Generates unique IDs
export const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * Creates balanced doubles teams from a list of player IDs based on their ratings.
 * Pairs highest rating with lowest rating, and so on.
 */
export function generateBalancedTeams(players: Player[]): { teams: Team[]; leftovers: Player[] } {
  // Sort players by rating descending
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);
  const teams: Team[] = [];
  const leftovers: Player[] = [];

  const len = sortedPlayers.length;
  const numTeams = Math.floor(len / 2);

  // We pair from outer ends: i-th highest with i-th lowest
  for (let i = 0; i < numTeams; i++) {
    const p1 = sortedPlayers[i];
    const p2 = sortedPlayers[len - 1 - i];
    teams.push({
      id: `team-${generateId()}`,
      name: `${p1.name} & ${p2.name}`,
      playerIds: [p1.id, p2.id],
    });
  }

  // If there's an odd player out, it will be in the middle of the sorted array
  if (len % 2 !== 0) {
    leftovers.push(sortedPlayers[numTeams]);
  }

  return { teams, leftovers };
}

/**
 * Generates Round Robin matches using the circle method.
 * Every team plays every other team exactly once.
 */
export function generateRoundRobinMatches(teams: Team[]): Match[] {
  if (teams.length < 2) return [];

  const tempTeams = [...teams];
  const isOdd = tempTeams.length % 2 !== 0;
  
  // If odd, add a dummy team for byes
  if (isOdd) {
    tempTeams.push({ id: 'bye', name: 'BYE', playerIds: [] });
  }

  const numTeams = tempTeams.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const matches: Match[] = [];

  for (let round = 0; round < numRounds; round++) {
    for (let matchIndex = 0; matchIndex < matchesPerRound; matchIndex++) {
      const home = (round + matchIndex) % (numTeams - 1);
      let away = (numTeams - 1 - matchIndex + round) % (numTeams - 1);

      // Fix the last element for the rotation
      if (matchIndex === 0) {
        away = numTeams - 1;
      }

      const teamHome = tempTeams[home];
      const teamAway = tempTeams[away];

      // Skip matches involving the dummy bye team
      if (teamHome.id !== 'bye' && teamAway.id !== 'bye') {
        matches.push({
          id: `m-${generateId()}`,
          team1Id: teamHome.id,
          team2Id: teamAway.id,
          score: {
            set1: { team1: 0, team2: 0 },
            set2: { team1: 0, team2: 0 }
          },
          status: 'pending'
        });
      }
    }
  }

  return matches;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  pointsWon: number;
  pointsLost: number;
  pointDiff: number;
  rankPoints: number; // 2 for Win, 0 for Loss (or similar)
}

/**
 * Calculates standings for a group.
 */
export function calculateStandings(teams: Team[], matches: Match[]): TeamStanding[] {
  const standingsMap: Record<string, TeamStanding> = {};

  // Initialize
  teams.forEach(team => {
    standingsMap[team.id] = {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      setDiff: 0,
      pointsWon: 0,
      pointsLost: 0,
      pointDiff: 0,
      rankPoints: 0
    };
  });

  matches.forEach(match => {
    if (match.status !== 'completed' || !match.winnerId) return;

    const t1 = standingsMap[match.team1Id];
    const t2 = standingsMap[match.team2Id];

    // If a team was deleted or not in list, skip
    if (!t1 || !t2) return;

    t1.played += 1;
    t2.played += 1;

    // Calculate winner
    if (match.winnerId === match.team1Id) {
      t1.wins += 1;
      t1.rankPoints += 2;
      t2.losses += 1;
    } else {
      t2.wins += 1;
      t2.rankPoints += 2;
      t1.losses += 1;
    }

    // Set & Point Calculations
    let t1Sets = 0;
    let t2Sets = 0;

    const sets = [match.score.set1, match.score.set2, match.score.set3].filter(Boolean) as { team1: number; team2: number }[];

    sets.forEach(set => {
      // Accumulate points
      t1.pointsWon += set.team1;
      t1.pointsLost += set.team2;
      t2.pointsWon += set.team2;
      t2.pointsLost += set.team1;

      // Accumulate sets
      if (set.team1 > set.team2) {
        t1Sets += 1;
      } else if (set.team2 > set.team1) {
        t2Sets += 1;
      }
    });

    t1.setsWon += t1Sets;
    t1.setsLost += t2Sets;
    t2.setsWon += t2Sets;
    t2.setsLost += t1Sets;
  });

  // Calculate differentials
  Object.values(standingsMap).forEach(s => {
    s.setDiff = s.setsWon - s.setsLost;
    s.pointDiff = s.pointsWon - s.pointsLost;
  });

  // Sort: wins DESC, setDiff DESC, pointDiff DESC, pointsWon DESC
  return Object.values(standingsMap).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsWon - a.pointsWon;
  });
}

/**
 * Helper to determine match winner based on sets.
 * setsCount=1 → first set winner wins the match.
 * setsCount=3 → standard best-of-3 (need 2 sets).
 * Returns team1Id, team2Id or undefined (if not decided yet).
 */
export function getMatchWinner(match: Match, setsCount: 1 | 3 = 3): string | undefined {
  let t1Sets = 0;
  let t2Sets = 0;

  const sets = [match.score.set1, match.score.set2, match.score.set3].filter(Boolean) as { team1: number; team2: number }[];
  
  sets.forEach(set => {
    if (set.team1 === 0 && set.team2 === 0) return;
    if (set.team1 > set.team2) t1Sets++;
    if (set.team2 > set.team1) t2Sets++;
  });

  const requiredSets = setsCount === 1 ? 1 : 2;

  if (t1Sets >= requiredSets) return match.team1Id;
  if (t2Sets >= requiredSets) return match.team2Id;

  return undefined;
}

/**
 * Generates a single-elimination bracket for the specified teams.
 * Supports powers of 2: 2, 4, 8, 16.
 */
export function generateKnockoutBracket(teams: Team[]): Stage['bracket'] {
  const numTeams = teams.length;
  // Determine standard power of 2 bracket size
  // e.g. 2, 4, 8, 16
  const rounds: { name: string; matches: Match[] }[] = [];

  let roundSize = numTeams;
  if (roundSize !== 2 && roundSize !== 4 && roundSize !== 8 && roundSize !== 16) {
    // Round to nearest power of 2 less or equal
    if (roundSize > 8) roundSize = 8;
    else if (roundSize > 4) roundSize = 4;
    else roundSize = 2;
  }

  const selectedTeams = teams.slice(0, roundSize);
  
  // Define rounds names
  const roundNames: Record<number, string> = {
    8: 'Quarterfinals',
    4: 'Semifinals',
    2: 'Final'
  };

  let currentSize = roundSize;

  while (currentSize >= 2) {
    const name = roundNames[currentSize] || (currentSize === 16 ? 'Round of 16' : `Round of ${currentSize}`);
    const matches: Match[] = [];
    const numMatches = currentSize / 2;

    for (let i = 0; i < numMatches; i++) {
      let team1Id = '';
      let team2Id = '';

      // For the first round, populate actual teams (using standard seeding: 1 vs N, 2 vs N-1, etc.)
      if (currentSize === roundSize) {
        team1Id = selectedTeams[i]?.id || '';
        team2Id = selectedTeams[selectedTeams.length - 1 - i]?.id || '';
      }

      matches.push({
        id: `bracket-${currentSize}-${i}`,
        team1Id,
        team2Id,
        score: {
          set1: { team1: 0, team2: 0 },
          set2: { team1: 0, team2: 0 }
        },
        status: 'pending'
      });
    }

    rounds.push({ name, matches });
    currentSize /= 2;
  }

  return { rounds };
}

/**
 * Propagates winners in a knockout bracket.
 * If a match in round R is completed, its winner should go to match M in round R+1.
 */
export function propagateBracketWinner(rounds: NonNullable<Stage['bracket']>['rounds'], completedMatchId: string, winnerId: string): NonNullable<Stage['bracket']>['rounds'] {
  const newRounds = [...rounds];
  
  // Find which round the match belongs to
  let roundIndex = -1;
  let matchIndex = -1;

  for (let r = 0; r < newRounds.length; r++) {
    const mIdx = newRounds[r].matches.findIndex(m => m.id === completedMatchId);
    if (mIdx !== -1) {
      roundIndex = r;
      matchIndex = mIdx;
      break;
    }
  }

  if (roundIndex === -1 || roundIndex === newRounds.length - 1) {
    // Not found, or it's the final round (nowhere to propagate)
    return newRounds;
  }

  // The next round is roundIndex + 1
  // The match in the next round is index Math.floor(matchIndex / 2)
  // Whether they are team1 or team2 in the next match is based on (matchIndex % 2 === 0)
  const nextRound = newRounds[roundIndex + 1];
  const nextMatchIndex = Math.floor(matchIndex / 2);
  const isTeam1 = matchIndex % 2 === 0;

  if (nextRound && nextRound.matches[nextMatchIndex]) {
    const nextMatch = { ...nextRound.matches[nextMatchIndex] };
    if (isTeam1) {
      nextMatch.team1Id = winnerId;
    } else {
      nextMatch.team2Id = winnerId;
    }
    // Update match in the array
    nextRound.matches[nextMatchIndex] = nextMatch;
  }

  return newRounds;
}

/**
 * Resolves the winner of a completed tournament.
 */
export function getTournamentWinner(tournament: Tournament): Team | null {
  if (tournament.status !== 'completed' || tournament.stages.length === 0) return null;
  const finalStage = tournament.stages[tournament.stages.length - 1];
  const allTeams = tournament.stages[0].teams || [];
  
  if (finalStage.type === 'single-elimination' && finalStage.bracket) {
    const rounds = finalStage.bracket.rounds;
    if (rounds.length > 0) {
      const finalRound = rounds[rounds.length - 1];
      if (finalRound.matches.length > 0) {
        const finalMatch = finalRound.matches[0];
        if (finalMatch.status === 'completed' && finalMatch.winnerId) {
          return allTeams.find(t => t.id === finalMatch.winnerId) || null;
        }
      }
    }
  } else if (finalStage.type === 'round-robin' && finalStage.groups) {
    // If round robin, aggregate standings across all final stage groups
    const standings = finalStage.groups.flatMap(g => calculateStandings(g.teams, g.matches));
    if (standings.length > 0) {
      // Sort standings by wins DESC, setDiff DESC, pointDiff DESC
      standings.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
        return b.pointDiff - a.pointDiff;
      });
      const topTeamId = standings[0].teamId;
      return allTeams.find(t => t.id === topTeamId) || null;
    }
  }
  return null;
}
