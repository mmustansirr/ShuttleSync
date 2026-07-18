'use client';

import { Play, CheckCircle2 } from 'lucide-react';
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
  /** How many sets this match is played over (1 = single set, 3 = best-of-3). Default: 3 */
  setsCount?: 1 | 3;
  /** e.g. "Stage 1 · Round Robin" shown subtly in the card header */
  stageLabel?: string;
}

interface CourtCardProps {
  match: CourtCardMatch;
  onSelectScoring?: (matchId: string) => void;
  isAdmin?: boolean;
  isLoading?: boolean;
}

export default function CourtCard({ match, onSelectScoring, isAdmin = false, isLoading = false }: CourtCardProps) {
  const isLive = match.status === 'live';
  const isCompleted = match.status === 'completed';

  // How many sets this match format calls for (default 3 for backwards compat)
  const setsCount: 1 | 3 = match.setsCount ?? 3;

  // Build a fixed-length array of set data for display.
  // Index 0 = Set 1, 1 = Set 2, 2 = Set 3.
  // Each entry is the score pair, or null if the set hasn't started.
  const rawSets = [match.score.set1, match.score.set2, match.score.set3 ?? null] as const;

  // Determine the current active set index for live matches:
  // It is the last set where at least one team has scored, capped at setsCount - 1.
  let activeSetIndex = 0;
  if (setsCount >= 2 && (match.score.set2.team1 > 0 || match.score.set2.team2 > 0)) activeSetIndex = 1;
  if (setsCount === 3 && match.score.set3 && (match.score.set3.team1 > 0 || match.score.set3.team2 > 0)) activeSetIndex = 2;

  // Count set wins for each team (only over completed/played sets)
  let t1Sets = 0;
  let t2Sets = 0;
  for (let i = 0; i < setsCount; i++) {
    const s = rawSets[i];
    if (!s) continue;
    if (s.team1 > s.team2) t1Sets++;
    else if (s.team2 > s.team1) t2Sets++;
  }

  const t1Wins = isCompleted && t1Sets > t2Sets;
  const t2Wins = isCompleted && t2Sets > t1Sets;

  // Render helper: one box per set slot
  // A set slot is "played" if any score was recorded in it
  // A set slot is "current" if it's the active set in a live match
  // A set slot is "future" if it hasn't started yet
  type SetSlot =
    | { kind: 'played'; t1: number; t2: number; t1Won: boolean; t2Won: boolean }
    | { kind: 'current'; t1: number; t2: number }
    | { kind: 'future' };

  const slots: SetSlot[] = [];
  for (let i = 0; i < setsCount; i++) {
    const s = rawSets[i];
    const hasScore = s !== null && (s.team1 > 0 || s.team2 > 0);
    const isCurrent = isLive && i === activeSetIndex;

    if (isCurrent) {
      slots.push({ kind: 'current', t1: s?.team1 ?? 0, t2: s?.team2 ?? 0 });
    } else if (hasScore || isCompleted) {
      // Show the score even if 0-0 for completed matches
      const score = s ?? { team1: 0, team2: 0 };
      slots.push({ kind: 'played', t1: score.team1, t2: score.team2, t1Won: score.team1 > score.team2, t2Won: score.team2 > score.team1 });
    } else {
      slots.push({ kind: 'future' });
    }
  }

  return (
    <div className={`${styles.card} ${isLive ? styles.liveCard : ''} glass`}>
      <div className={styles.header}>
        <div className={styles.courtInfo}>
          <span className={styles.courtName}>{match.court || 'Unassigned'}</span>
          {match.stageLabel && <span className={styles.stageInfo}>{match.stageLabel}</span>}
        </div>
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
            {slots.map((slot, i) => {
              if (slot.kind === 'future') {
                return <span key={i} className={`${styles.scoreBox} ${styles.futureSet}`}>–</span>;
              }
              if (slot.kind === 'current') {
                return <span key={i} className={`${styles.scoreBox} ${styles.currentSet}`}>{slot.t1}</span>;
              }
              // played
              return (
                <span key={i} className={`${styles.scoreBox} ${slot.t1Won ? styles.setWinner : ''}`}>
                  {slot.t1}
                </span>
              );
            })}
          </div>
        </div>

        {/* Team 2 Row */}
        <div className={`${styles.teamRow} ${t2Wins ? styles.winner : ''} ${isCompleted && !t2Wins ? styles.loser : ''}`}>
          <span className={styles.teamName} title={match.team2Name}>
            {match.team2Name}
          </span>
          <div className={styles.setsWrapper}>
            {slots.map((slot, i) => {
              if (slot.kind === 'future') {
                return <span key={i} className={`${styles.scoreBox} ${styles.futureSet}`}>–</span>;
              }
              if (slot.kind === 'current') {
                return <span key={i} className={`${styles.scoreBox} ${styles.currentSet}`}>{slot.t2}</span>;
              }
              // played
              return (
                <span key={i} className={`${styles.scoreBox} ${slot.t2Won ? styles.setWinner : ''}`}>
                  {slot.t2}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {isAdmin && onSelectScoring && !isCompleted && (
        <div className={styles.actions}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={() => onSelectScoring(match.id)}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-spinner"></span>
            ) : (
              <>
                <Play size={14} /> {isLive ? 'Update Score' : 'Start Match'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
