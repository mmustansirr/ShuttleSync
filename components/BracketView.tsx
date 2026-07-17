'use client';

import { Team, Match } from '../lib/db';
import styles from './BracketView.module.css';

interface BracketViewProps {
  bracket: {
    rounds: {
      name: string;
      matches: Match[];
    }[];
  };
  allTeams: Team[];
  onSelectScoring?: (matchId: string) => void;
  isAdmin?: boolean;
}

export default function BracketView({ bracket, allTeams, onSelectScoring, isAdmin = false }: BracketViewProps) {
  const getTeamName = (id: string) => {
    if (!id) return 'TBD';
    const team = allTeams.find(t => t.id === id);
    return team ? team.name : 'TBD';
  };

  return (
    <div className={styles.bracketContainer}>
      <div className={styles.bracketScroll}>
        {bracket.rounds.map((round, rIndex) => (
          <div key={rIndex} className={styles.roundColumn}>
            <div className={styles.roundHeader}>
              <h3>{round.name}</h3>
              <span className={styles.matchCount}>{round.matches.length} {round.matches.length === 1 ? 'Match' : 'Matches'}</span>
            </div>
            
            <div className={styles.matchesList}>
              {round.matches.map((match, mIndex) => {
                const sets = [
                  match.score.set1,
                  match.score.set2,
                  match.score.set3
                ].filter(Boolean) as { team1: number; team2: number }[];

                const isLive = match.status === 'live';
                const isCompleted = match.status === 'completed';

                // Determine set scores for display
                let t1SetsWon = 0;
                let t2SetsWon = 0;
                if (isCompleted && match.winnerId) {
                  sets.forEach(set => {
                    if (set.team1 > set.team2) t1SetsWon++;
                    if (set.team2 > set.team1) t2SetsWon++;
                  });
                }

                const team1Name = getTeamName(match.team1Id);
                const team2Name = getTeamName(match.team2Id);

                const hasTeams = match.team1Id && match.team2Id;

                return (
                  <div key={match.id} className={styles.matchCardWrapper}>
                    <div className={`${styles.matchCard} ${isLive ? styles.liveMatch : ''} ${isCompleted ? styles.completedMatch : ''} glass`}>
                      
                      {match.court && (
                        <div className={styles.courtTag}>{match.court}</div>
                      )}

                      {/* Team 1 */}
                      <div className={`${styles.team} ${isCompleted && match.winnerId === match.team1Id ? styles.winner : ''} ${isCompleted && match.winnerId !== match.team1Id && match.team1Id ? styles.loser : ''}`}>
                        <span className={styles.teamName} title={team1Name}>{team1Name}</span>
                        {isCompleted && match.team1Id && (
                          <span className={styles.score}>{t1SetsWon}</span>
                        )}
                        {isLive && sets.length > 0 && (
                          <span className={styles.liveScore}>
                            {sets[sets.length - 1].team1}
                          </span>
                        )}
                      </div>

                      {/* Divider */}
                      <div className={styles.divider}></div>

                      {/* Team 2 */}
                      <div className={`${styles.team} ${isCompleted && match.winnerId === match.team2Id ? styles.winner : ''} ${isCompleted && match.winnerId !== match.team2Id && match.team2Id ? styles.loser : ''}`}>
                        <span className={styles.teamName} title={team2Name}>{team2Name}</span>
                        {isCompleted && match.team2Id && (
                          <span className={styles.score}>{t2SetsWon}</span>
                        )}
                        {isLive && sets.length > 0 && (
                          <span className={styles.liveScore}>
                            {sets[sets.length - 1].team2}
                          </span>
                        )}
                      </div>

                      {isAdmin && onSelectScoring && !isCompleted && hasTeams && (
                        <button 
                          className={`${styles.scoreBtn} btn btn-primary`}
                          onClick={() => onSelectScoring(match.id)}
                        >
                          {isLive ? 'Score' : 'Start'}
                        </button>
                      )}

                      {isLive && (
                        <div className={styles.liveIndicator}>
                          <span className="live-pulse"></span> LIVE
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
