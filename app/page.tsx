'use client';

import { useState, useEffect } from 'react';
import { Tournament, Player, SocialSession } from '../lib/db';
import CourtCard, { CourtCardMatch } from '../components/CourtCard';
import styles from './page.module.css';

export default function Dashboard() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [socialSession, setSocialSession] = useState<SocialSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll database state
  useEffect(() => {
    async function fetchData() {
      try {
        const [resT, resP, resG] = await Promise.all([
          fetch('/api/tournaments'),
          fetch('/api/players'),
          fetch('/api/games')
        ]);
        
        if (resT.ok) setTournaments(await resT.json());
        if (resP.ok) setPlayers(await resP.json());
        if (resG.ok) setSocialSession(await resG.json());
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 3000); // Poll every 3 seconds for real-time score updates
    return () => clearInterval(interval);
  }, []);

  // Extract all live matches across tournaments and social games
  const getLiveMatches = (): CourtCardMatch[] => {
    const live: CourtCardMatch[] = [];

    // 1. Get live tournament matches
    tournaments.forEach(t => {
      if (t.status === 'active') {
        const currentStage = t.stages[t.currentStageIndex];
        const allTeams = t.stages[0].teams || [];

        const getTeamName = (id: string) => {
          if (!id) return 'TBD';
          const team = allTeams?.find(t => t.id === id);
          return team ? team.name : 'TBD';
        };

        if (currentStage.type === 'round-robin' && currentStage.groups) {
          currentStage.groups.forEach(g => {
            g.matches.forEach(m => {
              if (m.status === 'live') {
                live.push({
                  id: m.id,
                  court: m.court || 'Court',
                  status: 'live',
                  team1Name: getTeamName(m.team1Id),
                  team2Name: getTeamName(m.team2Id),
                  score: m.score
                });
              }
            });
          });
        } else if (currentStage.type === 'single-elimination' && currentStage.bracket) {
          currentStage.bracket.rounds.forEach(r => {
            r.matches.forEach(m => {
              if (m.status === 'live') {
                live.push({
                  id: m.id,
                  court: m.court || 'Court',
                  status: 'live',
                  team1Name: getTeamName(m.team1Id),
                  team2Name: getTeamName(m.team2Id),
                  score: m.score
                });
              }
            });
          });
        }
      }
    });

    // 2. Get live social play matches
    if (socialSession && socialSession.courtQueue) {
      socialSession.courtQueue.forEach(m => {
        if (m.status === 'live') {
          const getPlayerNames = (ids: string[]) => {
            return ids.map(id => players.find(p => p.id === id)?.name || 'Unknown').join(' & ');
          };
          
          // Map single array of sets to CourtCard score structure
          const score = {
            set1: m.score?.[0] || { team1: 0, team2: 0 },
            set2: m.score?.[1] || { team1: 0, team2: 0 },
            set3: m.score?.[2]
          };

          live.push({
            id: m.id,
            court: m.court,
            status: 'live',
            team1Name: getPlayerNames(m.team1Players),
            team2Name: getPlayerNames(m.team2Players),
            score
          });
        }
      });
    }

    return live;
  };

  const liveMatches = getLiveMatches();

  // Stats calculation
  const totalPlayers = players.length;
  const activeTournaments = tournaments.filter(t => t.status === 'active').length;

  if (loading && players.length === 0 && tournaments.length === 0) {
    return (
      <div className="page-container">
        <div className={styles.loadingState}>
          <div className="live-pulse"></div>
          <p className={styles.loadingText}>Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-slide">
      {/* Welcome Banner */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1>Live Dashboard</h1>
        </div>
        
        {/* Quick Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} glass`}>
            <span className={styles.statVal}>{totalPlayers}</span>
            <span className={styles.statLabel}>Players</span>
          </div>
          <div className={`${styles.statCard} glass`}>
            <span className={styles.statVal}>{activeTournaments}</span>
            <span className={styles.statLabel}>Tournaments</span>
          </div>
          <div className={`${styles.statCard} glass`}>
            <span className={styles.statVal}>{socialSession?.activePlayers.length || 0}</span>
            <span className={styles.statLabel}>Checked-in</span>
          </div>
        </div>
      </section>

      {/* Live Matches Dashboard */}
      {liveMatches.length > 0 ? (
        <section className={styles.liveSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.liveTitleWrapper}>
              <span className={styles.liveDot}></span>
              <h2>Live Courts</h2>
            </div>
          </div>
          <div className={styles.liveGrid}>
            {liveMatches.map(match => (
              <CourtCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>No active matches currently on court</p>
          <p className={styles.emptyStateText}>Active tournament games will appear here in real-time.</p>
        </div>
      )}
    </div>
  );
}
