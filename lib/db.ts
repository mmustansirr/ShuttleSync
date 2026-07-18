// Upstash Redis Database configuration
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = 'shuttlesync:db';


export interface Player {
  id: string;
  name: string;
  rating: number; // Elo rating (e.g. 1200)
  stats: {
    played: number;
    wins: number;
    losses: number;
  };
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
}

export interface MatchScore {
  set1: { team1: number; team2: number };
  set2: { team1: number; team2: number };
  set3?: { team1: number; team2: number };
}

export interface Match {
  id: string;
  team1Id: string;
  team2Id: string;
  score: MatchScore;
  status: 'pending' | 'live' | 'completed';
  court?: string;
  winnerId?: string;
}

export interface Group {
  id: string;
  name: string;
  teams: Team[];
  matches: Match[];
}

export interface Stage {
  id: string;
  type: 'round-robin' | 'single-elimination';
  status: 'pending' | 'active' | 'completed';
  groups?: Group[]; // For round-robin
  bracket?: {
    rounds: {
      name: string; // e.g., "Quarterfinals", "Semifinals", "Final"
      matches: Match[];
    }[];
  }; // For single-elimination
  teams?: Team[]; // Teams participating in this stage
}

export interface StagePlan {
  type: 'round-robin' | 'single-elimination';
  groupsCount: number;           // 1 for knockout, 1+ for round-robin
  advancingCount: number;        // 0 = final stage (no teams advance)
  teamsCount: number;            // incoming teams for this stage
  settings: TournamentSettings;  // per-stage scoring rules
}

export interface TournamentSettings {
  setsCount: 1 | 3;          // Best of 3 or single set
  targetPoints: number;       // Points needed to win a set (e.g. 15, 21)
  deuceEnabled: boolean;      // Whether deuce (win-by-2) applies
  deuceMaxPoints: number;     // Hard cap when deuce is on (e.g. 18, 30)
}

export interface Tournament {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'completed';
  currentStageIndex: number;
  stages: Stage[];
  settings?: TournamentSettings;
  stagePlan?: StagePlan[];
}

export interface SocialMatch {
  id: string;
  team1Players: string[]; // Player IDs
  team2Players: string[]; // Player IDs
  score: { team1: number; team2: number }[];
  court: string;
  status: 'live' | 'completed';
  timestamp: string;
}

export interface SocialSession {
  activePlayers: string[]; // Player IDs
  courtQueue: {
    id: string;
    team1Players: string[];
    team2Players: string[];
    court: string;
    status: 'live' | 'pending';
    score?: { team1: number; team2: number }[];
  }[];
  completedMatches: SocialMatch[];
}

export interface DatabaseSchema {
  players: Player[];
  tournaments: Tournament[];
  sessions: SocialSession;
}

const defaultData: DatabaseSchema = {
  players: [],
  tournaments: [],
  sessions: {
    activePlayers: [],
    courtQueue: [],
    completedMatches: []
  }
};

export async function readDB(): Promise<DatabaseSchema> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('Upstash Redis credentials are not configured. Using local default memory state.');
    return defaultData;
  }

  try {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`
      },
      next: { revalidate: 0 } // Disable caching to fetch live scores
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from Upstash: ${res.statusText}`);
    }

    const data = await res.json();
    if (data && data.result) {
      const db = JSON.parse(data.result) as DatabaseSchema;
      if (db.players) {
        db.players = db.players.map(player => {
          if (player.rating >= 1 && player.rating <= 5) {
            player.rating = 800 + (player.rating - 1) * 200;
          }
          if (player.rating === undefined || player.rating === null) {
            player.rating = 1200;
          }
          return player;
        });
      }
      return db;
    }
    
    // Key doesn't exist yet, initialize it
    await writeDB(defaultData);
    return defaultData;
  } catch (error) {
    console.error('Error reading from Upstash Redis:', error);
    return defaultData;
  }
}

export async function writeDB(data: DatabaseSchema): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn('Upstash Redis credentials are not configured. Cannot write.');
    return;
  }

  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', REDIS_KEY, JSON.stringify(data)])
    });

    if (!res.ok) {
      throw new Error(`Failed to write to Upstash: ${res.statusText}`);
    }
  } catch (error) {
    console.error('Error writing to Upstash Redis:', error);
  }
}
