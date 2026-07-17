'use client';

import { Play, CheckCircle2, Tv } from 'lucide-react';
import styles from './CourtCard.module.css';

export interface CourtCardMatch {
  id: string;
  team1Name: string;
  team2Name: string;
  score: {
    set1: { team1: number; team2: number };
    set2: { team1: number; team2: number };
    set3?: { team1: number; team2: number };
  };
  status: 'pending' | 'live' | 'completed';
  court?: string;
}

interface CourtCardProps {
  match: CourtCardMatch;
  onSelectScoring?: (matchId: string) => void;
  isAdmin?: boolean;
}

export default function CourtCard({ match, onSelectScoring, isAdmin = false }: CourtCardProps) {
  const sets = [
    match.score.set1,
    match.score.set2,
    match.score.set3
  ].filter(Boolean) as { team1: number; team2: number }[];

  const isLive = match.status === 'live';
  const isCompleted = match.status === 'completed';

  // Determine winner for display purposes
  let t1Sets = 0;
  let t2Sets = 0;
  sets.forEach(set => {
    if (set.team1 > set.team2) t1Sets++;
    else if (set.team2 > set.team1) t2Sets++;
  });

  const t1Wins = isCompleted && t1Sets > t2Sets;
  const t2Wins = isCompleted && t2Sets > t1Sets;

  return (
    <div className={`${styles.card} ${isLive ? styles.liveCard : ''} glass`}>
      <div className={styles.header}>
        <span className={styles.courtName}>{match.court || 'Unassigned Court'}</span>
        <div className={styles.statusWrapper}>
          {isLive && (
            <span className={styles.liveBadge}>
              <span className="live-pulse"></span> LIVE
            </span>
          )}
          {isCompleted && (
            <span className={styles.completedBadge}>
              <CheckCircle2 size={12} /> COMPLETED
            </span>
          )}
          {!isLive && !isCompleted && (
            <span className={styles.pendingBadge}>UPCOMING</span>
          )}
        </div>
      </div>

      <div className={styles.teamsContainer}>
        {/* Team 1 Row */}
        <div className={`${styles.teamRow} ${t1Wins ? styles.winner : ''} ${isCompleted && !t1Wins ? styles.loser : ''}`}>
          <span className={styles.teamName} title={match.team1Name}>
            {match.team1Name}
          </span>
          <div className={styles.setsWrapper}>
            {sets.map((set, i) => (
              <span 
                key={i} 
                className={`${styles.scoreBox} ${set.team1 > set.team2 ? styles.setWinner : ''} ${isLive && i === sets.length - 1 ? styles.currentSet : ''}`}
              >
                {set.team1}
              </span>
            ))}
          </div>
        </div>

        {/* Team 2 Row */}
        <div className={`${styles.teamRow} ${t2Wins ? styles.winner : ''} ${isCompleted && !t2Wins ? styles.loser : ''}`}>
          <span className={styles.teamName} title={match.team2Name}>
            {match.team2Name}
          </span>
          <div className={styles.setsWrapper}>
            {sets.map((set, i) => (
              <span 
                key={i} 
                className={`${styles.scoreBox} ${set.team2 > set.team1 ? styles.setWinner : ''} ${isLive && i === sets.length - 1 ? styles.currentSet : ''}`}
              >
                {set.team2}
              </span>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && onSelectScoring && !isCompleted && (
        <div className={styles.actions}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '6px 12px', fontSize: '0.85rem' }}
            onClick={() => onSelectScoring(match.id)}
          >
            <Play size={14} /> {isLive ? 'Update Score' : 'Start Match'}
          </button>
        </div>
      )}
    </div>
  );
}
