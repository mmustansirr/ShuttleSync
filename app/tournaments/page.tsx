'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Clock, Plus, Shuffle, ArrowRight, Star, History, ArrowLeft, Users, Settings, CheckCircle2, ChevronRight } from 'lucide-react';
import { Tournament, Player, Team } from '../../lib/db';
import { getAdminPin, getAuthHeaders } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import styles from './page.module.css';
import PerfectNumberInput from '../../components/PerfectNumberInput';
import { getTournamentWinner, getPlayerTier, eloToStars } from '../../lib/tournamentUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StagePlanItem {
  type: 'round-robin' | 'single-elimination';
  groupsCount: number;
  advancingCount: number;
  teamsCount: number;
  settings: {
    setsCount: 1 | 3;
    targetPoints: number;
    deuceEnabled: boolean;
    deuceMaxPoints: number;
  };
}

// ─── Wizard Step Config ────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { id: 1, label: 'Name',    icon: Trophy },
  { id: 2, label: 'Players', icon: Users },
  { id: 3, label: 'Teams',   icon: Shuffle },
  { id: 4, label: 'Pipeline', icon: Settings },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TournamentsPage() {
  const { showToast } = useToast();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // View state
  const [activeView, setActiveView] = useState<'dashboard' | 'setup'>('dashboard');
  const [subTab, setSubTab] = useState<'active' | 'completed'>('active');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // Teams generation states
  const [tempTeams, setTempTeams] = useState<Team[]>([]);
  const [leftoverPlayers, setLeftoverPlayers] = useState<Player[]>([]);
  const [swapId, setSwapId] = useState<string | null>(null);

  // Pipeline planner state
  const [stagePlan, setStagePlan] = useState<StagePlanItem[]>([]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  async function fetchData() {
    try {
      const [resT, resP] = await Promise.all([
        fetch('/api/tournaments'),
        fetch('/api/players')
      ]);
      if (resT.ok) {
        const tData = await resT.json();
        setTournaments([...tData].reverse());
      }
      if (resP.ok) {
        const pData = await resP.json();
        setPlayers(pData);
        setSelectedPlayers(pData.map((p: Player) => p.id));
      }
    } catch (error) {
      console.error('Error fetching tournaments page data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setIsAdmin(getAdminPin() !== '');
    fetchData();

    const handleAuth = () => {
      const isA = getAdminPin() !== '';
      setIsAdmin(isA);
      if (!isA) {
        setActiveView('dashboard');
      }
    };
    window.addEventListener('shuttlesync_auth_change', handleAuth);
    return () => window.removeEventListener('shuttlesync_auth_change', handleAuth);
  }, []);

  // ─── Player Selection Helpers ───────────────────────────────────────────────

  const toggleSelectPlayer = (id: string) => {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter(pid => pid !== id));
    } else {
      setSelectedPlayers([...selectedPlayers, id]);
    }
  };

  const handleSelectAll = () => setSelectedPlayers(players.map(p => p.id));
  const handleDeselectAll = () => setSelectedPlayers([]);

  // ─── Team Generation ────────────────────────────────────────────────────────

  const getTeamAvgElo = (team: Team): number => {
    const p1 = players.find(p => p.id === team.playerIds[0]);
    const p2 = players.find(p => p.id === team.playerIds[1]);
    return ((p1?.rating ?? 1200) + (p2?.rating ?? 1200)) / 2;
  };

  const handleGenerateTeams = (mode: 'balanced' | 'random' = 'balanced') => {
    const activeList = players.filter(p => selectedPlayers.includes(p.id));
    if (activeList.length < 2) {
      showToast('Select at least 2 players to generate teams.', 'warning');
      return;
    }

    if (mode === 'balanced') {
      const allUnrated = activeList.every(p => p.stats.played === 0);
      if (allUnrated) {
        showToast('Cannot generate balanced teams: all selected players are unrated. Run a tournament first!', 'warning');
        return;
      }
    }

    let list = [...activeList];

    if (mode === 'random') {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    } else {
      const ratedPlayers = players.filter(p => p.stats.played > 0);
      const avgSystemRating = ratedPlayers.length > 0
        ? ratedPlayers.reduce((sum, p) => sum + p.rating, 0) / ratedPlayers.length
        : 1200;

      const listWithTempRatings = list.map(p => ({
        ...p,
        tempRating: p.stats.played === 0 ? avgSystemRating : p.rating
      }));

      listWithTempRatings.sort((a, b) => b.tempRating - a.tempRating);
      list = listWithTempRatings.map(({ tempRating: _t, ...originalPlayer }) => originalPlayer);
    }

    const teams: Team[] = [];
    const leftovers: Player[] = [];
    const len = list.length;
    const numTeams = Math.floor(len / 2);

    if (mode === 'random') {
      for (let i = 0; i < numTeams; i++) {
        const p1 = list[i * 2];
        const p2 = list[i * 2 + 1];
        teams.push({
          id: `team-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${p1.name} & ${p2.name}`,
          playerIds: [p1.id, p2.id]
        });
      }
      if (len % 2 !== 0) leftovers.push(list[len - 1]);
    } else {
      for (let i = 0; i < numTeams; i++) {
        const p1 = list[i];
        const p2 = list[len - 1 - i];
        teams.push({
          id: `team-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${p1.name} & ${p2.name}`,
          playerIds: [p1.id, p2.id]
        });
      }
      if (len % 2 !== 0) leftovers.push(list[numTeams]);
    }

    setTempTeams(teams);
    setLeftoverPlayers(leftovers);
    setSwapId(null);

    setStagePlan([{
      type: 'round-robin',
      groupsCount: 1,
      advancingCount: 0,
      teamsCount: teams.length,
      settings: { setsCount: 3, targetPoints: 21, deuceEnabled: true, deuceMaxPoints: 30 }
    }]);
  };

  // ─── Swap Logic ─────────────────────────────────────────────────────────────

  const handleSwapClick = (playerId: string) => {
    if (swapId === null) {
      setSwapId(playerId);
    } else if (swapId === playerId) {
      setSwapId(null);
    } else {
      const p1Id = swapId;
      const p2Id = playerId;

      let p1TeamIdx = -1, p1PlayerIdx = -1, p1IsLeftover = false;
      let p2TeamIdx = -1, p2PlayerIdx = -1, p2IsLeftover = false;

      tempTeams.forEach((t, tIdx) => {
        const p1Idx = t.playerIds.indexOf(p1Id);
        if (p1Idx !== -1) { p1TeamIdx = tIdx; p1PlayerIdx = p1Idx; }
        const p2Idx = t.playerIds.indexOf(p2Id);
        if (p2Idx !== -1) { p2TeamIdx = tIdx; p2PlayerIdx = p2Idx; }
      });

      if (leftoverPlayers.findIndex(p => p.id === p1Id) !== -1) p1IsLeftover = true;
      if (leftoverPlayers.findIndex(p => p.id === p2Id) !== -1) p2IsLeftover = true;

      const newTeams = [...tempTeams];
      const newLeftovers = [...leftoverPlayers];

      if (!p1IsLeftover && !p2IsLeftover) {
        const temp = newTeams[p1TeamIdx].playerIds[p1PlayerIdx];
        newTeams[p1TeamIdx].playerIds[p1PlayerIdx] = newTeams[p2TeamIdx].playerIds[p2PlayerIdx];
        newTeams[p2TeamIdx].playerIds[p2PlayerIdx] = temp;
      } else if (!p1IsLeftover && p2IsLeftover) {
        const teamPlayerId = newTeams[p1TeamIdx].playerIds[p1PlayerIdx];
        const leftoverPIdx = newLeftovers.findIndex(p => p.id === p2Id);
        newTeams[p1TeamIdx].playerIds[p1PlayerIdx] = p2Id;
        newLeftovers[leftoverPIdx] = players.find(p => p.id === teamPlayerId)!;
      } else if (p1IsLeftover && !p2IsLeftover) {
        const teamPlayerId = newTeams[p2TeamIdx].playerIds[p2PlayerIdx];
        const leftoverPIdx = newLeftovers.findIndex(p => p.id === p1Id);
        newTeams[p2TeamIdx].playerIds[p2PlayerIdx] = p1Id;
        newLeftovers[leftoverPIdx] = players.find(p => p.id === teamPlayerId)!;
      }

      newTeams.forEach(t => {
        const pA = players.find(p => p.id === t.playerIds[0]);
        const pB = players.find(p => p.id === t.playerIds[1]);
        t.name = `${pA?.name ?? 'Unknown'} & ${pB?.name ?? 'Unknown'}`;
      });

      setTempTeams(newTeams);
      setLeftoverPlayers(newLeftovers);
      setSwapId(null);
    }
  };

  // ─── Pipeline Logic ─────────────────────────────────────────────────────────

  const isPowerOf2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;

  const getValidAdvancingOptions = (teamsCount: number) => {
    const options: number[] = [];
    for (let i = 2; i < teamsCount; i++) options.push(i);
    return options;
  };

  const updateStage = (index: number, updates: Partial<StagePlanItem>) => {
    setStagePlan(prev => {
      let next = [...prev];
      const newType = updates.type !== undefined ? updates.type : next[index].type;
      const newAdvancingCount = newType === 'single-elimination'
        ? 0
        : (updates.advancingCount !== undefined ? updates.advancingCount : next[index].advancingCount);

      next[index] = { ...next[index], ...updates, type: newType, advancingCount: newAdvancingCount };

      if (newAdvancingCount === 0) {
        next = next.slice(0, index + 1);
      } else if (index + 1 < next.length) {
        next[index + 1] = { ...next[index + 1], teamsCount: newAdvancingCount };
      }
      return next;
    });
  };

  const updateStageSettings = (index: number, settingUpdates: Partial<StagePlanItem['settings']>) => {
    setStagePlan(prev => {
      const next = [...prev];
      next[index] = { ...next[index], settings: { ...next[index].settings, ...settingUpdates } };
      return next;
    });
  };

  const addStage = () => {
    const lastStage = stagePlan[stagePlan.length - 1];
    if (!lastStage || lastStage.advancingCount < 2) return;
    setStagePlan(prev => [...prev, {
      type: isPowerOf2(lastStage.advancingCount) ? 'single-elimination' as const : 'round-robin' as const,
      groupsCount: 1,
      advancingCount: 0,
      teamsCount: lastStage.advancingCount,
      settings: { setsCount: 3, targetPoints: 21, deuceEnabled: true, deuceMaxPoints: 30 }
    }]);
  };

  const removeStage = (index: number) => {
    if (index === 0) return;
    setStagePlan(prev => {
      const next = prev.slice(0, index);
      if (next.length > 0) {
        next[next.length - 1] = { ...next[next.length - 1], advancingCount: 0 };
      }
      return next;
    });
  };

  const isPipelineValid = () => {
    if (stagePlan.length === 0) return false;
    for (let i = 0; i < stagePlan.length; i++) {
      const stage = stagePlan[i];
      if (stage.teamsCount < 2) return false;
      if (stage.type === 'single-elimination' && !isPowerOf2(stage.teamsCount)) return false;
      if (i < stagePlan.length - 1 && stage.advancingCount < 2) return false;
    }
    return true;
  };

  // ─── Tournament Creation ────────────────────────────────────────────────────

  const handleCreateTournament = async () => {
    if (!name.trim()) return;
    if (tempTeams.length < 2) {
      showToast('Generate teams first.', 'warning');
      return;
    }
    setIsCreating(true);

    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          teams: tempTeams,
          stageType: stagePlan[0]?.type || 'round-robin',
          groupsCount: stagePlan[0]?.type === 'round-robin' ? (stagePlan[0]?.groupsCount || 1) : 1,
          stagePlan,
          settings: stagePlan[0]?.settings
        })
      });

      if (res.ok) {
        const newTournament = await res.json();
        setTournaments(prev => [newTournament, ...prev]);
        // Reset wizard
        setName('');
        setTempTeams([]);
        setLeftoverPlayers([]);
        setSwapId(null);
        setStagePlan([]);
        setWizardStep(1);
        setActiveView('dashboard');
        showToast(`Tournament "${newTournament.name}" created successfully!`, 'success');
      } else {
        const err = await res.json();
        showToast(`Error: ${err.error || 'Failed to create tournament'}`, 'error');
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      showToast('Failed to create tournament.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Wizard Navigation ──────────────────────────────────────────────────────

  const openWizard = () => {
    setWizardStep(1);
    setActiveView('setup');
  };

  const closeWizard = () => {
    setActiveView('dashboard');
    setWizardStep(1);
  };

  const goNext = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        showToast('Please enter a tournament name.', 'warning');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (selectedPlayers.length < 2) {
        showToast('Select at least 2 players to continue.', 'warning');
        return;
      }
      setWizardStep(3);
    } else if (wizardStep === 3) {
      if (tempTeams.length < 2) {
        showToast('Generate teams before continuing.', 'warning');
        return;
      }
      setWizardStep(4);
    }
  };

  const goBack = () => {
    if (wizardStep > 1) {
      setWizardStep((wizardStep - 1) as 1 | 2 | 3 | 4);
    }
  };

  // ─── Dashboard Helpers ──────────────────────────────────────────────────────

  const filteredTournaments = tournaments.filter(t =>
    subTab === 'active' ? t.status === 'active' : t.status === 'completed'
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-container animate-slide">

      {/* ── DASHBOARD VIEW ──────────────────────────────────────────────────── */}
      {activeView === 'dashboard' && (
        <>
          <div className="segment-header">
            <button
              className={`segment-btn ${subTab === 'active' ? 'active' : ''}`}
              onClick={() => setSubTab('active')}
            >
              <Trophy size={16} /> Active
            </button>
            <button
              className={`segment-btn ${subTab === 'completed' ? 'active' : ''}`}
              onClick={() => setSubTab('completed')}
            >
              <History size={16} /> Completed
            </button>
          </div>

          <div className={styles.directoryHeader}>
            <h2>Tournaments</h2>
            {isAdmin && (
              <button
                className={`btn btn-primary ${styles.newTourneyBtn}`}
                onClick={openWizard}
              >
                <Plus size={16} /> New Tournament
              </button>
            )}
          </div>

          <div className={styles.tournamentsList}>
            {filteredTournaments.map((t) => {
              const isActive = t.status === 'active';
              const isCompleted = t.status === 'completed';
              const currentStage = t.stages[t.currentStageIndex];

              let totalMatches = 0;
              let completedMatches = 0;

              t.stages.forEach(stage => {
                if (stage.type === 'round-robin' && stage.groups) {
                  stage.groups.forEach(g => {
                    g.matches.forEach(m => {
                      totalMatches++;
                      if (m.status === 'completed') completedMatches++;
                    });
                  });
                } else if (stage.type === 'single-elimination' && stage.bracket) {
                  stage.bracket.rounds.forEach(r => {
                    r.matches.forEach(m => {
                      totalMatches++;
                      if (m.status === 'completed') completedMatches++;
                    });
                  });
                }
              });

              const completionRate = totalMatches > 0
                ? Math.round((completedMatches / totalMatches) * 100)
                : 0;

              const winnerTeam = getTournamentWinner(t);
              const winnerPlayers = winnerTeam
                ? winnerTeam.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(' & ')
                : '';

              return (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className={`${styles.tournamentCard} glass ${isCompleted ? styles.completedCard : ''}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className={styles.tourneyTop}>
                    <div className={styles.tourneyHeaderInfo}>
                      <h3>{t.name}</h3>
                      <span className={styles.stageLabel}>
                        {isCompleted
                          ? 'Tournament Ended'
                          : `Stage ${t.currentStageIndex + 1}: ${currentStage?.type === 'round-robin' ? 'Round Robin' : 'Knockout'}`
                        }
                      </span>
                    </div>
                    <div>
                      {isActive && <span className="badge badge-success">Live</span>}
                      {isCompleted && (
                        <span className="badge badge-gold" style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Done</span>
                      )}
                    </div>
                  </div>

                  {isCompleted && winnerTeam ? (
                    <div className={styles.winnerSection}>
                      <span className={styles.winnerIcon}>🏆</span>
                      <div className={styles.winnerInfo}>
                        <span className={styles.winnerLabel}>Champions</span>
                        <span className={styles.winnerTeamName}>{winnerTeam.name}</span>
                        {winnerPlayers && <span className={styles.winnerPlayers}>{winnerPlayers}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.tourneyProgress}>
                      <div className={styles.progressBarWrapper}>
                        <div className={styles.progressBar} style={{ width: `${completionRate}%` }} />
                      </div>
                      <div className={styles.progressText}>
                        <span>Progress: {completionRate}%</span>
                        <span>({completedMatches}/{totalMatches} matches)</span>
                      </div>
                    </div>
                  )}

                  <div className={styles.tourneyFooter}>
                    <div style={{ width: 1 }} />
                    <div className="btn btn-secondary" style={{ height: '36px', padding: '0 14px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>View Dashboard</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              );
            })}

            {filteredTournaments.length === 0 && (
              subTab === 'active' ? (
                isAdmin ? (
                  <div className={styles.emptyStateContainer}>
                    <Trophy size={48} className={styles.emptyStateIcon} />
                    <h2>No Active Tournaments</h2>
                    <p style={{ margin: '8px 0 0 0' }}>Set up a new tournament with balanced teams, brackets, and live scoring.</p>
                  </div>
                ) : (
                  <div className={styles.emptyStateContainer}>
                    <Trophy size={48} className={styles.emptyStateIcon} style={{ opacity: 0.4 }} />
                    <h2>No Active Tournaments</h2>
                    <p style={{ margin: '8px 0 0 0' }}>Stay tuned! Ask your group administrator to start a new tournament.</p>
                  </div>
                )
              ) : (
                <div className={styles.emptyStateContainer}>
                  <History size={48} className={styles.emptyStateIcon} style={{ opacity: 0.4 }} />
                  <h2>No Completed Tournaments</h2>
                  <p style={{ margin: '8px 0 0 0' }}>Finished tournaments will show up here as a hall of fame!</p>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ── WIZARD VIEW ─────────────────────────────────────────────────────── */}
      {activeView === 'setup' && (
        <div className={styles.wizardContainer}>

          {/* Wizard Header */}
          <div className={styles.wizardHeader}>
            <button
              type="button"
              className={styles.wizardBackLink}
              onClick={closeWizard}
            >
              <ArrowLeft size={15} />
              <span>Tournaments</span>
            </button>
            <h2 className={styles.wizardTitle}>New Tournament</h2>
          </div>

          {/* Step Indicator */}
          <div className={styles.stepIndicator}>
            {WIZARD_STEPS.map((step, idx) => {
              const isCompleted = wizardStep > step.id;
              const isActive = wizardStep === step.id;
              const Icon = step.icon;

              return (
                <div key={step.id} className={styles.stepIndicatorItem}>
                  <div className={`${styles.stepCircle} ${isActive ? styles.stepCircleActive : ''} ${isCompleted ? styles.stepCircleCompleted : ''}`}>
                    {isCompleted
                      ? <CheckCircle2 size={16} />
                      : <Icon size={16} />
                    }
                  </div>
                  <span className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ''} ${isCompleted ? styles.stepLabelCompleted : ''}`}>
                    {step.label}
                  </span>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className={`${styles.stepConnector} ${wizardStep > step.id ? styles.stepConnectorFilled : ''}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Panel */}
          <div className={`${styles.stepPanel} glass`}>

            {/* ── STEP 1: Tournament Name ──────────────────────────────── */}
            {wizardStep === 1 && (
              <div className={styles.stepContent}>
                <div className={styles.stepPanelHeader}>
                  <Trophy size={22} className={styles.stepPanelIcon} />
                  <div>
                    <h3 className={styles.stepPanelTitle}>Name Your Tournament</h3>
                    <p className={styles.stepPanelSubtitle}>Give your tournament a unique and memorable name.</p>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label className="form-label">Tournament Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Doubles Cup 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
                  />
                </div>

                {name.trim() && (
                  <div className={styles.stepPreview}>
                    <span className={styles.stepPreviewLabel}>Preview</span>
                    <span className={styles.stepPreviewValue}>🏆 {name.trim()}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: Select Players ───────────────────────────────── */}
            {wizardStep === 2 && (
              <div className={styles.stepContent}>
                <div className={styles.stepPanelHeader}>
                  <Users size={22} className={styles.stepPanelIcon} />
                  <div>
                    <h3 className={styles.stepPanelTitle}>Select Players</h3>
                    <p className={styles.stepPanelSubtitle}>Choose who participates. Teams will be formed from selected players.</p>
                  </div>
                </div>

                <div className={styles.playerSelectorContainer}>
                  <div className={styles.selectionSummary}>
                    <div className={styles.summaryTitle}>
                      <label className="form-label" style={{ margin: 0 }}>
                        Active Players ({selectedPlayers.length})
                      </label>
                      <span className={styles.selectionHelper}>
                        {selectedPlayers.length === 0
                          ? 'Select players to form teams'
                          : selectedPlayers.length % 2 === 0
                            ? '✓ Even count — perfect pairing'
                            : '⚡ Odd count — 1 player will be benched'
                        }
                      </span>
                    </div>
                    <div className={styles.selectActions}>
                      <button type="button" className={styles.smallLink} onClick={handleSelectAll}>Select All</button>
                      <span className={styles.actionDivider}>/</span>
                      <button type="button" className={styles.smallLink} onClick={handleDeselectAll}>Clear</button>
                    </div>
                  </div>

                  <div className={styles.checkboxGrid}>
                    {players.map(p => {
                      const tier = getPlayerTier(p.rating);
                      return (
                        <label key={p.id} className={`${styles.checkboxLabel} ${selectedPlayers.includes(p.id) ? styles.checked : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedPlayers.includes(p.id)}
                            onChange={() => toggleSelectPlayer(p.id)}
                          />
                          <span className={styles.playerText}>{p.name}</span>
                          {p.stats.played === 0 ? (
                            <span className="rating-badge-unrated" style={{ marginLeft: 'auto' }}>New</span>
                          ) : (
                            <span className={styles.playerRating} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {tier.emoji} {p.rating}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Build Teams ──────────────────────────────────── */}
            {wizardStep === 3 && (
              <div className={styles.stepContent}>
                <div className={styles.stepPanelHeader}>
                  <Shuffle size={22} className={styles.stepPanelIcon} />
                  <div>
                    <h3 className={styles.stepPanelTitle}>Build Teams</h3>
                    <p className={styles.stepPanelSubtitle}>Generate teams, then tap any two players to swap them.</p>
                  </div>
                </div>

                {/* Generate buttons */}
                {(() => {
                  const selectedPlayerObjs = players.filter(p => selectedPlayers.includes(p.id));
                  const allSelectedUnrated = selectedPlayerObjs.length >= 2 && selectedPlayerObjs.every(p => p.stats.played === 0);
                  return (
                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                      <button
                        type="button"
                        onClick={() => handleGenerateTeams('balanced')}
                        className={`btn btn-secondary ${allSelectedUnrated ? 'btn-inactive' : ''}`}
                        style={{ flex: 1 }}
                        disabled={selectedPlayers.length < 2}
                      >
                        <Star size={14} /> Balanced Teams
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateTeams('random')}
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                        disabled={selectedPlayers.length < 2}
                      >
                        <Shuffle size={14} /> Random Teams
                      </button>
                    </div>
                  );
                })()}

                {tempTeams.length > 0 && (
                  <div className={styles.teamsReviewSection}>
                    {swapId ? (
                      <div className={styles.swapNotice}>
                        Select another player to swap with <strong>{players.find(p => p.id === swapId)?.name}</strong>
                      </div>
                    ) : (
                      <div className={styles.swapInstructions}>
                        💡 Tip: Tap any two players to swap them between teams.
                      </div>
                    )}

                    <div className={styles.teamsList}>
                      {tempTeams.map((team, idx) => {
                        const avgElo = getTeamAvgElo(team);
                        const p1 = players.find(player => player.id === team.playerIds[0]);
                        const p2 = players.find(player => player.id === team.playerIds[1]);
                        const isSwapping1 = swapId === team.playerIds[0];
                        const isSwapping2 = swapId === team.playerIds[1];

                        return (
                          <div key={team.id} className={styles.teamCard}>
                            <div className={styles.teamCardHeader}>
                              <input
                                type="text"
                                value={team.name}
                                onChange={(e) => {
                                  const newTeams = [...tempTeams];
                                  newTeams[idx] = { ...newTeams[idx], name: e.target.value };
                                  setTempTeams(newTeams);
                                }}
                                className="form-input"
                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.85rem', height: '32px', border: 'none', background: 'rgba(255,255,255,0.02)', fontWeight: 'bold' }}
                                placeholder="Enter team name"
                                required
                              />
                              <span className={styles.avgRatingBadge}>Avg: {Math.round(avgElo)} ({eloToStars(avgElo).toFixed(1)}★)</span>
                            </div>
                            <div className={styles.teamPlayersHorizontal}>
                              <div
                                className={`${styles.playerCapsule} ${isSwapping1 ? styles.swappingCapsule : ''}`}
                                onClick={() => handleSwapClick(team.playerIds[0])}
                              >
                                <span className={styles.playerName}>{p1?.name}</span>
                                {p1?.stats.played === 0 ? (
                                  <span className="rating-badge-unrated" style={{ scale: '0.8', padding: '1px 6px', margin: '0' }}>New</span>
                                ) : (
                                  <span className={styles.playerRating}>{p1 ? `${p1.rating} (${eloToStars(p1.rating).toFixed(1)}★)` : ''}</span>
                                )}
                              </div>

                              <span className={styles.handshakeIcon}>🤝</span>

                              <div
                                className={`${styles.playerCapsule} ${isSwapping2 ? styles.swappingCapsule : ''}`}
                                onClick={() => handleSwapClick(team.playerIds[1])}
                              >
                                <span className={styles.playerName}>{p2?.name}</span>
                                {p2?.stats.played === 0 ? (
                                  <span className="rating-badge-unrated" style={{ scale: '0.8', padding: '1px 6px', margin: '0' }}>New</span>
                                ) : (
                                  <span className={styles.playerRating}>{p2 ? `${p2.rating} (${eloToStars(p2.rating).toFixed(1)}★)` : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {leftoverPlayers.length > 0 && (
                      <div className={styles.leftoversCard}>
                        <div className={styles.leftoversHeader}>
                          <h4>Reserve Bench</h4>
                          <span className={styles.leftoversCount}>{leftoverPlayers.length} player(s) resting</span>
                        </div>
                        <div className={styles.leftoversGridHorizontal}>
                          {leftoverPlayers.map(p => {
                            const isSwapping = swapId === p.id;
                            return (
                              <div
                                key={p.id}
                                className={`${styles.leftoverCapsule} ${isSwapping ? styles.swappingCapsule : ''}`}
                                onClick={() => handleSwapClick(p.id)}
                              >
                                <span className={styles.playerName}>{p.name}</span>
                                {p.stats.played === 0 ? (
                                  <span className="rating-badge-unrated" style={{ scale: '0.8', padding: '1px 6px', margin: '0' }}>New</span>
                                ) : (
                                  <span className={styles.playerRating}>{p.rating} ({eloToStars(p.rating).toFixed(1)}★)</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tempTeams.length === 0 && (
                  <div className={styles.teamsEmptyHint}>
                    <Shuffle size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <p>Click <strong>Balanced Teams</strong> or <strong>Random Teams</strong> above to generate pairings.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4: Configure Pipeline ───────────────────────────── */}
            {wizardStep === 4 && (
              <div className={styles.stepContent}>
                <div className={styles.stepPanelHeader}>
                  <Settings size={22} className={styles.stepPanelIcon} />
                  <div>
                    <h3 className={styles.stepPanelTitle}>Configure Pipeline</h3>
                    <p className={styles.stepPanelSubtitle}>Define stages, formats, and scoring rules for your tournament.</p>
                  </div>
                </div>

                {stagePlan.length > 0 && (
                  <div className={styles.pipelineSection}>
                    {stagePlan.map((stage, idx) => {
                      const isLast = idx === stagePlan.length - 1;
                      const hasNextStage = idx + 1 < stagePlan.length;
                      const knockoutInvalid = stage.type === 'single-elimination' && !isPowerOf2(stage.teamsCount);

                      return (
                        <div key={idx}>
                          <div className={`${styles.stageCard} ${idx === 0 ? styles.activeStage : ''}`}>
                            <div className={styles.stageCardHeader}>
                              <span className={styles.stageBadge}>Stage {idx + 1}</span>
                              <span className={styles.stageTeamsCount}>{stage.teamsCount} teams</span>
                              {idx > 0 && (
                                <button type="button" className={styles.removeStageBtn} onClick={() => removeStage(idx)}>
                                  Remove
                                </button>
                              )}
                            </div>

                            <div className={styles.stageConfigRow}>
                              <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Format</label>
                                <select
                                  value={stage.type}
                                  onChange={(e) => updateStage(idx, { type: e.target.value as StagePlanItem['type'] })}
                                  className="form-input"
                                >
                                  <option value="round-robin">Round Robin (Groups)</option>
                                  {isPowerOf2(stage.teamsCount) && (
                                    <option value="single-elimination">Knockout Bracket</option>
                                  )}
                                </select>
                              </div>

                              {stage.type === 'round-robin' && (
                                <div className="form-group" style={{ width: '90px' }}>
                                  <label className="form-label">Groups</label>
                                  <select
                                    value={stage.groupsCount}
                                    onChange={(e) => updateStage(idx, { groupsCount: Number(e.target.value) })}
                                    className="form-input"
                                  >
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    {stage.teamsCount >= 8 && <option value={4}>4</option>}
                                  </select>
                                </div>
                              )}

                              <div className="form-group" style={{ width: '130px' }}>
                                <label className="form-label">Advancing</label>
                                <select
                                  value={stage.advancingCount}
                                  disabled={stage.type === 'single-elimination'}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    if (val === 0 && hasNextStage) {
                                      setStagePlan(prev => {
                                        const next = prev.slice(0, idx + 1);
                                        next[idx] = { ...next[idx], advancingCount: 0 };
                                        return next;
                                      });
                                    } else {
                                      updateStage(idx, { advancingCount: val });
                                    }
                                  }}
                                  className="form-input"
                                >
                                  <option value={0}>Final Stage</option>
                                  {getValidAdvancingOptions(stage.teamsCount).map(n => (
                                    <option key={n} value={n}>Top {n} teams</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {knockoutInvalid && (
                              <div className={styles.validationError}>
                                ⚠️ Knockout requires a power-of-2 team count (2, 4, 8, 16). This stage has {stage.teamsCount} teams.
                              </div>
                            )}

                            {!isLast && stage.advancingCount < 2 && (
                              <div className={styles.validationError}>
                                ⚠️ This stage must advance at least 2 teams to feed the next stage.
                              </div>
                            )}

                            <div
                              className={styles.rulesSection}
                              style={{ marginTop: 0, marginBottom: 0, border: 'none', padding: 'var(--space-3)', background: 'rgba(255,255,255,0.008)' }}
                            >
                              <div className={styles.stageRulesRow}>
                                <div className="form-group" style={{ flex: 1 }}>
                                  <label className="form-label">Sets</label>
                                  <select
                                    value={stage.settings.setsCount}
                                    onChange={(e) => updateStageSettings(idx, { setsCount: Number(e.target.value) as 1 | 3 })}
                                    className="form-input"
                                  >
                                    <option value={3}>Best of 3</option>
                                    <option value={1}>Single Set</option>
                                  </select>
                                </div>
                                <div className="form-group" style={{ width: '90px' }}>
                                  <label className="form-label">Points</label>
                                  <PerfectNumberInput
                                    min={1} max={99}
                                    value={stage.settings.targetPoints}
                                    onChange={(pts) => {
                                      updateStageSettings(idx, {
                                        targetPoints: pts,
                                        deuceMaxPoints: pts === 15 ? 18 : pts === 21 ? 30 : pts + 9
                                      });
                                    }}
                                    className="form-input"
                                    style={{ textAlign: 'center' }}
                                  />
                                </div>
                                <label className={styles.switchLabel} style={{ width: '80px', fontSize: '0.75rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={stage.settings.deuceEnabled}
                                    onChange={(e) => updateStageSettings(idx, { deuceEnabled: e.target.checked })}
                                  />
                                  Deuce
                                </label>
                                {stage.settings.deuceEnabled && (
                                  <div className="form-group" style={{ width: '70px' }}>
                                    <label className="form-label">Max</label>
                                    <PerfectNumberInput
                                      min={stage.settings.targetPoints + 1} max={99}
                                      value={stage.settings.deuceMaxPoints}
                                      onChange={(val) => updateStageSettings(idx, { deuceMaxPoints: val })}
                                      className="form-input"
                                      style={{ textAlign: 'center' }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {hasNextStage && (
                            <div className={styles.stageConnector}>
                              ▼ {stage.advancingCount} teams advance
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {stagePlan[stagePlan.length - 1].advancingCount >= 2 && (
                      <button type="button" className={styles.addStageBtn} onClick={addStage}>
                        + Add Next Stage
                      </button>
                    )}

                    <div className={styles.pipelineSummary}>
                      <strong>{stagePlan[0].teamsCount} Teams</strong>
                      {stagePlan.map((s, i) => (
                        <span key={i}>
                          <span className={styles.pipelineArrow}> → </span>
                          {s.type === 'round-robin' ? 'RR' : 'KO'}
                          <span style={{ opacity: 0.6 }}> ({s.settings.targetPoints}pts)</span>
                          {s.advancingCount > 0 && (
                            <>
                              <span className={styles.pipelineArrow}> → </span>
                              <strong>Top {s.advancingCount}</strong>
                            </>
                          )}
                        </span>
                      ))}
                      <span className={styles.pipelineArrow}> → </span>
                      <span>🏆</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── WIZARD FOOTER (navigation) ──────────────────────────────────── */}
          <div className={styles.wizardFooter}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={goBack}
              disabled={wizardStep === 1}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <ArrowLeft size={15} />
              Back
            </button>

            <div className={styles.wizardStepCounter}>
              Step {wizardStep} of {WIZARD_STEPS.length}
            </div>

            {wizardStep < 4 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                Continue
                <ChevronRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateTournament}
                disabled={!isPipelineValid() || isCreating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {isCreating
                  ? <><span className="btn-spinner" /> Creating…</>
                  : <><Trophy size={15} /> Create Tournament</>
                }
              </button>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
