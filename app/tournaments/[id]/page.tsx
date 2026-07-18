'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trophy, Calendar, Users, List, GitFork, ShieldAlert, Play, CheckCircle2, ArrowRight } from 'lucide-react';
import { Tournament, Stage, Team, Match, Player } from '../../../lib/db';
import StandingsTable from '../../../components/StandingsTable';
import BracketView from '../../../components/BracketView';
import CourtCard from '../../../components/CourtCard';
import { getAdminPin, getAuthHeaders } from '../../../lib/auth';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import styles from './page.module.css';
import { getTournamentWinner } from '../../../lib/tournamentUtils';

interface PageProps {
  params: Promise<{ id: string }>;
}

function ConfettiEffect() {
  const [particles] = useState<Array<{ id: number; x: number; y: number; size: number; color: string; delay: number; duration: number }>>(() => {
    const colors = ['#FFD700', '#FF4500', '#FF1493', '#00BFFF', '#32CD32', '#FF8C00', '#9400D3'];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      size: 5 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4
    }));
  });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {particles.map(part => (
        <div
          key={part.id}
          style={{
            position: 'absolute',
            left: `${part.x}%`,
            top: `${part.y}vh`,
            width: `${part.size}px`,
            height: `${part.size * 0.6}px`,
            backgroundColor: part.color,
            borderRadius: '2px',
            transform: 'rotate(0deg)',
            opacity: 0.8,
            animation: `fall ${part.duration}s linear infinite`,
            animationDelay: `${part.delay}s`
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% {
            top: -10%;
            transform: translateX(0) rotate(0deg);
          }
          50% {
            transform: translateX(50px) rotate(360deg);
          }
          100% {
            top: 110%;
            transform: translateX(-20px) rotate(720deg);
          }
        }
      `}</style>
    </div>
  );
}

export default function TournamentDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: tournamentId } = use(params);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeTab, setActiveTab] = useState<'standings' | 'matches' | 'bracket' | 'teams' | 'admin'>('standings');
  const [loading, setLoading] = useState(true);
  const [isProgressing, setIsProgressing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [startingMatchId, setStartingMatchId] = useState<string | null>(null);

  // Stage picker: which stage's data is currently being viewed (defaults to the live stage)
  const [viewedStageIndex, setViewedStageIndex] = useState(0);
  const prevCurrentStageIndexRef = useRef<number | null>(null);
  const didInitRef = useRef(false);

  // Auth State
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Next stage progression form states
  const [nextStageType, setNextStageType] = useState<'round-robin' | 'single-elimination'>('single-elimination');
  const [advancingCount, setAdvancingCount] = useState(2);
  const [nextGroupsCount, setNextGroupsCount] = useState(1);

  async function fetchTournament() {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (res.ok) {
        const data = await res.json();
        setTournament(data);
      } else {
        router.push('/tournaments');
      }
    } catch (err) {
      console.error('Error fetching tournament details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players');
      if (res.ok) {
        setPlayers(await res.json());
      }
    } catch (err) {
      console.error('Error fetching players:', err);
    }
  }

  useEffect(() => {
    // Auth state sync
    const checkAdmin = () => {
      const isA = getAdminPin() !== '';
      setIsAdmin(isA);
      // Fallback if they were on the admin tab and then locked
      setActiveTab(curr => (curr === 'admin' && !isA) ? 'standings' : curr);
    };
    checkAdmin();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTournament();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlayers();
    
    window.addEventListener('shuttlesync_auth_change', checkAdmin);

    const interval = setInterval(fetchTournament, 3000); // 3 seconds polling for live updates
    return () => {
      clearInterval(interval);
      window.removeEventListener('shuttlesync_auth_change', checkAdmin);
    };
  }, [tournamentId]);

  // On the first successful load, seed the stage picker to the live stage and pick a
  // sensible default tab. A ref guard (not `loading`) is used because setTournament and
  // setLoading(false) are batched in fetchTournament, so `loading` is already false by
  // the time this effect sees the new tournament.
  useEffect(() => {
    if (tournament && !didInitRef.current) {
      didInitRef.current = true;
      const currentStage = tournament.stages[tournament.currentStageIndex];
      setViewedStageIndex(tournament.currentStageIndex);
      setActiveTab(currentStage?.type === 'single-elimination' ? 'bracket' : 'standings');
    }
  }, [tournament]);

  // If the picked stage doesn't support the active tab (e.g. switched to an older
  // round-robin stage while viewing Bracket), fall back to Matches, which works for both.
  useEffect(() => {
    if (!tournament) return;
    const pickedStage = tournament.stages[viewedStageIndex];
    if (!pickedStage) return;
    if (activeTab === 'standings' && !(pickedStage.type === 'round-robin' && pickedStage.groups)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('matches');
    } else if (activeTab === 'bracket' && !(pickedStage.type === 'single-elimination' && pickedStage.bracket)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('matches');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedStageIndex, tournament]);

  // If a poll brings in a newly created stage while the user was following the live
  // stage, advance the picker with it. If they'd manually navigated to an older stage
  // to review it, leave their selection alone.
  useEffect(() => {
    if (!tournament) return;
    const prev = prevCurrentStageIndexRef.current;
    if (prev !== null && tournament.currentStageIndex > prev) {
      setViewedStageIndex(curr => {
        if (curr === prev) {
          const nextStage = tournament.stages[tournament.currentStageIndex];
          setActiveTab(nextStage.type === 'single-elimination' ? 'bracket' : 'standings');
          return tournament.currentStageIndex;
        }
        return curr;
      });
    }
    prevCurrentStageIndexRef.current = tournament.currentStageIndex;
  }, [tournament?.currentStageIndex]);

  if (loading && !tournament) {
    return (
      <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>
        <div className="live-pulse"></div>
        <p style={{ marginTop: '16px' }}>Loading Tournament details...</p>
      </div>
    );
  }

  if (!tournament) return null;

  const currentStage = tournament.stages[tournament.currentStageIndex];
  const pickedStage = tournament.stages[viewedStageIndex] ?? currentStage;
  const isViewingLiveStage = pickedStage.id === currentStage.id;
  const allTeams = tournament.stages[0].teams || [];

  // Per-stage scoring rules — used by CourtCard to know how many set boxes to render
  const viewedStagePlan = tournament.stagePlan?.[viewedStageIndex];
  const viewedStageSettings = viewedStagePlan?.settings ?? tournament.settings;
  const viewedSetsCount: 1 | 3 = (viewedStageSettings?.setsCount ?? 3) as 1 | 3;
  const viewedStageLabel = `Stage ${viewedStageIndex + 1} · ${pickedStage?.type === 'round-robin' ? 'Round Robin' : 'Knockout'}`;

  const winnerTeam = getTournamentWinner(tournament);
  const winnerPlayers = winnerTeam
    ? winnerTeam.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(' & ')
    : '';

  const getTeamName = (id: string) => {
    if (!id) return 'TBD';
    const team = allTeams?.find(t => t.id === id);
    return team ? team.name : 'TBD';
  };

  const handleProgressStage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isAdmin) return;
    
    const confirmed = await confirm({
      title: 'Progress Stage',
      message: 'Are you sure you want to progress to the next stage? Current standings will be frozen.',
      confirmText: 'Progress Stage',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    setIsProgressing(true);

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'progress',
          nextStageType,
          advancingCount,
          groupsCount: nextStageType === 'round-robin' ? nextGroupsCount : 1
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setTournament(updated);
        
        // Auto select tab for new stage format
        const nextStage = updated.stages[updated.currentStageIndex];
        if (nextStage.type === 'single-elimination') {
          setActiveTab('bracket');
        } else {
          setActiveTab('standings');
        }
        showToast('Successfully progressed to the next tournament stage!', 'success');
      } else {
        const err = await res.json();
        showToast(`Error progressing stage: ${err.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Error progressing stage:', error);
      showToast('Error progressing stage.', 'error');
    } finally {
      setIsProgressing(false);
    }
  };

  const handleCompleteTournament = async () => {
    if (!isAdmin) return;
    const confirmed = await confirm({
      title: 'Complete Tournament',
      message: 'Are you sure you want to mark this tournament as completed? Scores and standings will be locked.',
      confirmText: 'Complete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    setIsCompleting(true);

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'complete' })
      });
      if (res.ok) {
        const updated = await res.json();
        setTournament(updated);
        showToast('Tournament marked as completed!', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error completing tournament: ${err.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Error completing tournament:', error);
      showToast('Error completing tournament.', 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSelectScoring = async (matchId: string) => {
    if (!isAdmin || !tournament) return;

    // Find the match in the current tournament stages to check its status
    let matchObj: Match | undefined;
    for (const stage of tournament.stages) {
      if (stage.type === 'round-robin' && stage.groups) {
        for (const g of stage.groups) {
          const m = g.matches.find(match => match.id === matchId);
          if (m) {
            matchObj = m;
            break;
          }
        }
      } else if (stage.type === 'single-elimination' && stage.bracket) {
        for (const r of stage.bracket.rounds) {
          const m = r.matches.find(match => match.id === matchId);
          if (m) {
            matchObj = m;
            break;
          }
        }
      }
      if (matchObj) break;
    }

    if (!matchObj) return;

    if (matchObj.status === 'pending') {
      const confirmStart = await confirm({
        title: 'Start Match',
        message: 'Do you really want to start this match and set it to LIVE?',
        confirmText: 'Start Match',
        cancelText: 'Cancel'
      });
      if (!confirmStart) return;

      setStartingMatchId(matchId);
      showToast('Starting match in real-time...', 'info');
      try {
        const res = await fetch(`/api/matches/${matchId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            tournamentId,
            status: 'live',
            score: matchObj.score,
            court: matchObj.court || ''
          })
        });

        if (res.ok) {
          showToast('Match is now LIVE!', 'success');
          router.push(`/tournaments/${tournamentId}/score?matchId=${matchId}`);
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(`Error starting match: ${err.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        console.error('Error starting match:', err);
        showToast('Error starting match.', 'error');
      } finally {
        setStartingMatchId(null);
      }
    } else {
      router.push(`/tournaments/${tournamentId}/score?matchId=${matchId}`);
    }
  };

  return (
    <div className="page-container animate-slide">
      {/* Detail header */}
      <div className={styles.header}>
        <div className={styles.titleInfo}>
          <div className={styles.titleRow}>
            <h1>{tournament.name}</h1>
            <div className={styles.badgeWrapper}>
              {tournament.status === 'active' && <span className="badge badge-success">Active</span>}
              {tournament.status === 'completed' && <span className="badge badge-info">Completed</span>}
            </div>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>
              <Trophy size={14} /> Stage {tournament.currentStageIndex + 1} of {tournament.stages.length}
            </span>
            <span className={styles.metaItem}>
              Format: {pickedStage?.type === 'round-robin' ? 'Round Robin (Groups)' : 'Single Elimination (Bracket)'}
            </span>
          </div>
        </div>

        {/* Stage picker: review any stage, past or live */}
        {tournament.stages.length > 1 && (
          <div className={`segment-header ${styles.stagePicker}`} style={{ marginTop: '20px' }}>
            {tournament.stages.map((stage, idx) => {
              const isDone = idx < tournament.currentStageIndex;
              const isLive = idx === tournament.currentStageIndex;
              const icon = isDone ? '✅' : isLive ? '►' : '○';
              return (
                <button
                  key={stage.id}
                  className={`segment-btn ${styles.stagePickerBtn} ${viewedStageIndex === idx ? 'active' : ''}`}
                  onClick={() => setViewedStageIndex(idx)}
                >
                  <span>{icon}</span> Stage {idx + 1}
                </button>
              );
            })}
          </div>
        )}

        {/* Dynamic sub tab bar */}
        <div className="segment-header" style={{ marginBottom: 0, marginTop: tournament.stages.length > 1 ? '8px' : '20px' }}>
          {pickedStage?.type === 'round-robin' && (
            <button
              className={`segment-btn ${activeTab === 'standings' ? 'active' : ''}`}
              onClick={() => setActiveTab('standings')}
            >
              <Trophy size={16} />
              Standings
            </button>
          )}
          <button
            className={`segment-btn ${activeTab === 'matches' ? 'active' : ''}`}
            onClick={() => setActiveTab('matches')}
          >
            <List size={16} />
            Matches
          </button>
          {pickedStage?.type === 'single-elimination' && (
            <button
              className={`segment-btn ${activeTab === 'bracket' ? 'active' : ''}`}
              onClick={() => setActiveTab('bracket')}
            >
              <GitFork size={16} />
              Bracket
            </button>
          )}
          <button
            className={`segment-btn ${activeTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            <Users size={16} />
            Teams
          </button>
          {isAdmin && (
            <button
              className={`segment-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <ShieldAlert size={16} />
              Admin
            </button>
          )}
        </div>
      </div>

      {tournament.status === 'completed' && (
        <>
          <ConfettiEffect />
          <div className={`${styles.championsCard} glass`}>
            <div className={styles.championsHeader}>
              <span className={styles.trophyEmoji}>🏆</span>
              <div className={styles.championsText}>
                <h2>Tournament Champions</h2>
                <span className={styles.winnerTeamName}>{winnerTeam?.name || 'Unknown Team'}</span>
                {winnerPlayers && <span className={styles.winnerPlayers}>{winnerPlayers}</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tab Panels */}
      <div className={styles.tabContentPanel}>
        {/* STANDINGS PANEL */}
        {activeTab === 'standings' && pickedStage?.type === 'round-robin' && pickedStage.groups && (
          <div className={styles.standingsPanel}>
            {pickedStage.groups.map(group => (
              <div key={group.id} className={`${styles.groupCard} glass`}>
                <h2>{group.name} Standings</h2>
                <div style={{ marginTop: '16px' }}>
                  <StandingsTable 
                    teams={group.teams} 
                    matches={group.matches} 
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MATCHES PANEL */}
        {activeTab === 'matches' && (
          <div className={styles.matchesPanel}>
            {pickedStage?.type === 'round-robin' && pickedStage.groups ? (
              // Group stage matches categorized by group
              <div className={styles.groupsMatches}>
                {pickedStage.groups.map(group => (
                  <div key={group.id} className={`${styles.groupCard} glass`}>
                    <h2>{group.name} Matches</h2>
                    <div className={styles.matchesGrid} style={{ marginTop: '16px' }}>
                      {group.matches.map(match => (
                        <CourtCard
                          key={match.id}
                          match={{
                            id: match.id,
                            team1Name: getTeamName(match.team1Id),
                            team2Name: getTeamName(match.team2Id),
                            score: match.score,
                            status: match.status,
                            court: match.court,
                            setsCount: viewedSetsCount,
                            stageLabel: viewedStageLabel
                          }}
                          isAdmin={isAdmin && tournament.status === 'active' && isViewingLiveStage}
                          onSelectScoring={handleSelectScoring}
                          isLoading={startingMatchId === match.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : pickedStage?.bracket ? (
              // Single elimination bracket matches in simple list
              <div>
                <h2>Bracket Matches</h2>
                <div className={styles.matchesGrid} style={{ marginTop: '16px' }}>
                  {pickedStage.bracket.rounds.flatMap(r => r.matches).map(match => (
                    <CourtCard
                      key={match.id}
                      match={{
                        id: match.id,
                        team1Name: getTeamName(match.team1Id),
                        team2Name: getTeamName(match.team2Id),
                        score: match.score,
                        status: match.status,
                        court: match.court,
                        setsCount: viewedSetsCount,
                        stageLabel: viewedStageLabel
                      }}
                      isAdmin={isAdmin && tournament.status === 'active' && isViewingLiveStage && !!(match.team1Id && match.team2Id)}
                      onSelectScoring={handleSelectScoring}
                      isLoading={startingMatchId === match.id}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>No matches generated yet.</div>
            )}
          </div>
        )}

        {/* BRACKET PANEL */}
        {activeTab === 'bracket' && pickedStage?.type === 'single-elimination' && pickedStage.bracket && (
          <div className={`${styles.groupCard} glass`}>
            <h2>Knockout Bracket Tree</h2>
            <BracketView
              bracket={pickedStage.bracket}
              allTeams={allTeams || []}
              isAdmin={isAdmin && tournament.status === 'active' && isViewingLiveStage}
              onSelectScoring={handleSelectScoring}
              loadingMatchId={startingMatchId}
            />
          </div>
        )}

        {/* TEAMS PANEL */}
        {activeTab === 'teams' && (
          <div className={`${styles.groupCard} glass`}>
            <h2>Registered Teams</h2>
            <div className={styles.teamsGrid}>
              {allTeams?.map((team, idx) => (
                <div key={team.id} className={styles.teamBadgeCard}>
                  <span className={styles.teamBadgeIndex}>T{idx + 1}</span>
                  <span className={styles.teamBadgeName}>{team.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN PANEL */}
        {activeTab === 'admin' && isAdmin && (
          <div className={`${styles.groupCard} glass`}>
            <h2>Tournament Administration</h2>
            
            <div style={{ marginTop: '16px' }}>
              {tournament.status === 'active' ? (
                <div className={styles.adminActions}>

                  {tournament.stagePlan && tournament.stagePlan.length > 0 ? (
                    <div className={styles.stageProgressionBox}>
                      <h3>Tournament Pipeline</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                        {tournament.stagePlan.map((plan, idx) => {
                          const isDone = idx < tournament.currentStageIndex;
                          const isCurrent = idx === tournament.currentStageIndex;
                          const icon = isDone ? '✅' : isCurrent ? '►' : '○';
                          return (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              fontSize: '0.8rem',
                              color: isCurrent ? 'var(--color-accent-primary)' : isDone ? 'var(--color-text-muted)' : 'var(--color-text-disabled)',
                              fontWeight: isCurrent ? 600 : 400
                            }}>
                              <span>{icon}</span>
                              <span>
                                Stage {idx + 1}: {plan.type === 'round-robin' ? 'Round Robin' : 'Knockout'}
                                {' '}({plan.teamsCount} teams, {plan.settings.targetPoints}pts)
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {tournament.currentStageIndex < tournament.stagePlan.length - 1 ? (
                        <button
                          onClick={() => handleProgressStage()}
                          className="btn btn-primary"
                          style={{ marginTop: '8px' }}
                          disabled={isProgressing}
                        >
                          {isProgressing ? (
                            <span className="btn-spinner"></span>
                          ) : (
                            <>
                              <span>Progress to Stage {tournament.currentStageIndex + 2}</span>
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={handleCompleteTournament}
                          className="btn btn-primary"
                          style={{ marginTop: '8px' }}
                          disabled={isCompleting}
                        >
                          {isCompleting ? (
                            <span className="btn-spinner"></span>
                          ) : (
                            <>
                              <CheckCircle2 size={16} /> Complete Tournament
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : currentStage?.type === 'round-robin' ? (
                    <div className={styles.stageProgressionBox}>
                      <h3>Configure Next Stage Format</h3>
                      
                      <form onSubmit={handleProgressStage} className={styles.progressForm}>
                        <div className={styles.formRow}>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Next Stage Format</label>
                            <select
                              value={nextStageType}
                              onChange={(e) => setNextStageType(e.target.value as 'round-robin' | 'single-elimination')}
                              className="form-input"
                              style={{ background: 'var(--bg-primary)' }}
                            >
                              <option value="single-elimination">Single Elimination (Bracket)</option>
                              <option value="round-robin">Round Robin (League)</option>
                            </select>
                          </div>
                          
                          <div className="form-group" style={{ width: '130px' }}>
                            <label className="form-label">Advancing from Group</label>
                            <select
                              value={advancingCount}
                              onChange={(e) => setAdvancingCount(Number(e.target.value))}
                              className="form-input"
                              style={{ background: 'var(--bg-primary)' }}
                            >
                              <option value={1}>Top 1 Team</option>
                              <option value={2}>Top 2 Teams</option>
                              <option value={4}>Top 4 Teams</option>
                            </select>
                          </div>

                          {nextStageType === 'round-robin' && (
                            <div className="form-group" style={{ width: '100px' }}>
                              <label className="form-label">Groups Count</label>
                              <select
                                value={nextGroupsCount}
                                onChange={(e) => setNextGroupsCount(Number(e.target.value))}
                                className="form-input"
                                style={{ background: 'var(--bg-primary)' }}
                              >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                              </select>
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={isProgressing}>
                          {isProgressing ? (
                            <span className="btn-spinner"></span>
                          ) : (
                            <>
                              <span>Progress to Stage {tournament.stages.length + 1}</span>
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  ) : (
                    // Knocker Bracket completion option
                    <div className={styles.stageProgressionBox}>
                      <h3>Complete Bracket Stage</h3>
                      <button 
                        onClick={handleCompleteTournament} 
                        className="btn btn-primary"
                        disabled={isCompleting}
                      >
                        {isCompleting ? (
                          <span className="btn-spinner"></span>
                        ) : (
                          <>
                            <CheckCircle2 size={16} /> Complete Tournament
                          </>
                        )}
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div style={{ padding: '16px 0' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    This tournament has ended. Standings are locked.
                  </p>
                </div>
              )}

              {/* Danger Zone: Always show this at the bottom of the admin panel */}
              <div className={styles.dangerZone} style={{ marginTop: '24px', borderTop: '1px solid var(--color-border-glass)', paddingTop: '20px' }}>
                <h3 style={{ color: 'var(--color-status-danger)', fontSize: '1rem', marginBottom: '8px' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                  Deleting this tournament is permanent. Player Elo ratings calculated during its matches will remain unchanged and will NOT be reverted.
                </p>
                <button
                  disabled={isDeleting}
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: 'Delete Tournament Permanently',
                      message: 'Are you sure you want to delete this tournament permanently? This action CANNOT be undone. Note: Any player Elo rating adjustments calculated during matches will remain active and will NOT be reverted.',
                      confirmText: 'Delete Permanently',
                      cancelText: 'Cancel'
                    });
                    if (!confirmed) return;
                    setIsDeleting(true);
                    try {
                      const res = await fetch(`/api/tournaments/${tournamentId}`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ action: 'delete' })
                      });
                      if (res.ok) {
                        showToast('Tournament deleted successfully.', 'success');
                        router.push('/tournaments');
                      } else {
                        const err = await res.json().catch(() => ({}));
                        showToast(`Failed to delete tournament: ${err.error || 'Unknown error'}`, 'error');
                        setIsDeleting(false);
                      }
                    } catch (error) {
                      console.error('Error deleting tournament:', error);
                      showToast('Failed to delete tournament due to a network error.', 'error');
                      setIsDeleting(false);
                    }
                  }}
                  className="btn btn-danger"
                  style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {isDeleting ? (
                    <>
                      <span className="btn-spinner" style={{ width: '12px', height: '12px' }}></span> Deleting...
                    </>
                  ) : (
                    'Delete Tournament'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
