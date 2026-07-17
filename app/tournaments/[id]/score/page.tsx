'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Save, Trophy, RefreshCw, Plus, Minus, Undo2 } from 'lucide-react';
import { Tournament, Match } from '../../../../lib/db';
import { getAdminPin, getAuthHeaders } from '../../../../lib/auth';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ScoreHistoryState {
  set1T1: number;
  set1T2: number;
  set2T1: number;
  set2T2: number;
  set3T1: number;
  set3T2: number;
  activeSet: 1 | 2 | 3;
  servingTeam: 1 | 2;
  t1RightPlayer: string;
  t1LeftPlayer: string;
  t2RightPlayer: string;
  t2LeftPlayer: string;
}

export default function ScoreControlPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId');
  const { id: tournamentId } = use(params);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [match, setMatch] = useState<Match | null>(null);

  // Set-wise scores
  const [set1T1, setSet1T1] = useState(0);
  const [set1T2, setSet1T2] = useState(0);
  const [set2T1, setSet2T1] = useState(0);
  const [set2T2, setSet2T2] = useState(0);
  const [set3T1, setSet3T1] = useState(0);
  const [set3T2, setSet3T2] = useState(0);
  
  const [activeSet, setActiveSet] = useState<1 | 2 | 3>(1);
  const [court, setCourt] = useState('');
  const [status, setStatus] = useState<'pending' | 'live' | 'completed'>('pending');
  const [loading, setLoading] = useState(true);

  // Serve tracking helper state
  const [servingTeam, setServingTeam] = useState<1 | 2>(1);
  const [t1RightPlayer, setT1RightPlayer] = useState('Player 1A');
  const [t1LeftPlayer, setT1LeftPlayer] = useState('Player 1B');
  const [t2RightPlayer, setT2RightPlayer] = useState('Player 2A');
  const [t2LeftPlayer, setT2LeftPlayer] = useState('Player 2B');

  // Undo Stack History
  const [history, setHistory] = useState<ScoreHistoryState[]>([]);

  // Debounced auto-save ref
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (getAdminPin() === '') {
      showToast('Access Denied: Admin PIN required to umpire matches.', 'error');
      router.push(`/tournaments/${tournamentId}`);
      return;
    }
    if (!matchId) {
      router.push(`/tournaments/${tournamentId}`);
      return;
    }
    fetchMatchDetails();
  }, [tournamentId, matchId]);

  // Real-time auto-saving of score changes
  useEffect(() => {
    if (loading || !match || status === 'completed' || isSaving) return;

    const scoreObj = {
      set1: { team1: set1T1, team2: set1T2 },
      set2: { team1: set2T1, team2: set2T2 },
      set3: (set3T1 > 0 || set3T2 > 0 || activeSet === 3) ? { team1: set3T1, team2: set3T2 } : undefined
    };

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            tournamentId,
            score: scoreObj,
            status,
            court: court.trim()
          })
        });
        if (res.ok) {
          const data = await res.json();
          // Sync local match details quietly
          setMatch(data.match);
        }
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 450); // 450ms debounce to avoid spamming network while clicking + / - rapidly

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [set1T1, set1T2, set2T1, set2T2, set3T1, set3T2, status, court, loading, match, tournamentId, matchId, isSaving]);

  async function fetchMatchDetails() {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (res.ok) {
        const tData: Tournament = await res.json();
        setTournament(tData);

        // Find match in current stage
        const currentStage = tData.stages[tData.currentStageIndex];
        let foundMatch: Match | undefined;

        if (currentStage.type === 'round-robin' && currentStage.groups) {
          for (const group of currentStage.groups) {
            foundMatch = group.matches.find(m => m.id === matchId);
            if (foundMatch) break;
          }
        } else if (currentStage.type === 'single-elimination' && currentStage.bracket) {
          for (const round of currentStage.bracket.rounds) {
            foundMatch = round.matches.find(m => m.id === matchId);
            if (foundMatch) break;
          }
        }

        if (foundMatch) {
          setMatch(foundMatch);
          setSet1T1(foundMatch.score.set1.team1);
          setSet1T2(foundMatch.score.set1.team2);
          setSet2T1(foundMatch.score.set2.team1);
          setSet2T2(foundMatch.score.set2.team2);
          if (foundMatch.score.set3) {
            setSet3T1(foundMatch.score.set3.team1);
            setSet3T2(foundMatch.score.set3.team2);
          }
          setCourt(foundMatch.court || '');
          setStatus(foundMatch.status);

          // Resolve names for service assistant
          const allTeams = tData.stages[0].teams || [];
          
          const t1 = allTeams?.find(team => team.id === foundMatch?.team1Id);
          const t2 = allTeams?.find(team => team.id === foundMatch?.team2Id);

          // Resolve names for service assistant - use team name instead of players
          setT1RightPlayer(t1?.name || 'Team 1');
          setT1LeftPlayer(t1?.name || 'Team 1');
          setT2RightPlayer(t2?.name || 'Team 2');
          setT2LeftPlayer(t2?.name || 'Team 2');

          // Auto select active set
          if (foundMatch.score.set3 && (foundMatch.score.set3.team1 > 0 || foundMatch.score.set3.team2 > 0)) {
            setActiveSet(3);
          } else if (foundMatch.score.set2.team1 > 0 || foundMatch.score.set2.team2 > 0) {
            setActiveSet(2);
          } else {
            setActiveSet(1);
          }
        } else {
          router.push(`/tournaments/${tournamentId}`);
        }
      }
    } catch (error) {
      console.error('Error loading score page:', error);
    } finally {
      setLoading(false);
    }
  }

  // Push current state to undo history
  const pushToHistory = () => {
    const currentState: ScoreHistoryState = {
      set1T1, set1T2,
      set2T1, set2T2,
      set3T1, set3T2,
      activeSet,
      servingTeam,
      t1RightPlayer, t1LeftPlayer,
      t2RightPlayer, t2LeftPlayer
    };
    setHistory(prev => [...prev, currentState]);
  };

  // Undo last action
  const handleUndo = () => {
    if (history.length === 0) return;
    const prevState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));

    setSet1T1(prevState.set1T1);
    setSet1T2(prevState.set1T2);
    setSet2T1(prevState.set2T1);
    setSet2T2(prevState.set2T2);
    setSet3T1(prevState.set3T1);
    setSet3T2(prevState.set3T2);
    setActiveSet(prevState.activeSet);
    setServingTeam(prevState.servingTeam);
    setT1RightPlayer(prevState.t1RightPlayer);
    setT1LeftPlayer(prevState.t1LeftPlayer);
    setT2RightPlayer(prevState.t2RightPlayer);
    setT2LeftPlayer(prevState.t2LeftPlayer);
  };

  // Resolve team names
  const allTeams = tournament?.stages[0].teams || [];
  const getTeamName = (id: string) => {
    if (!id) return 'TBD';
    const team = allTeams.find(t => t.id === id);
    return team ? team.name : 'TBD';
  };

  const team1Name = match ? getTeamName(match.team1Id) : 'Team 1';
  const team2Name = match ? getTeamName(match.team2Id) : 'Team 2';

  // Check if Singles based on team's playerIds length
  const team1Obj = match ? allTeams.find(t => t.id === match.team1Id) : null;
  const team2Obj = match ? allTeams.find(t => t.id === match.team2Id) : null;
  const isDoubles = (team1Obj?.playerIds?.length ?? 0) > 1 || (team2Obj?.playerIds?.length ?? 0) > 1;

  // Locate which stage this match belongs to, so its scoring rules apply
  const matchStageIndex = (() => {
    if (!tournament || !matchId) return 0;
    for (let si = 0; si < tournament.stages.length; si++) {
      const stage = tournament.stages[si];
      if (stage.type === 'round-robin' && stage.groups) {
        if (stage.groups.some(g => g.matches.some(m => m.id === matchId))) return si;
      } else if (stage.type === 'single-elimination' && stage.bracket) {
        if (stage.bracket.rounds.some(r => r.matches.some(m => m.id === matchId))) return si;
      }
    }
    return tournament.currentStageIndex;
  })();

  // Per-stage scoring rules, falling back to tournament-wide settings for older tournaments
  const stageSettings = tournament?.stagePlan?.[matchStageIndex]?.settings ?? tournament?.settings;
  const setsCount = stageSettings?.setsCount ?? 3;

  // Handle Score Adjustments & Serve updates
  const target = stageSettings?.targetPoints ?? 21;
  const deuce = stageSettings?.deuceEnabled ?? true;
  const max = stageSettings?.deuceMaxPoints ?? 30;

  const isSetWon = (s1: number, s2: number) => {
    if (!deuce) {
      return s1 >= target || s2 >= target;
    }
    if (s1 >= target || s2 >= target) {
      if (Math.abs(s1 - s2) >= 2) return true;
      if (s1 === max || s2 === max) return true;
    }
    return false;
  };

  const handleScoreChange = (team: 1 | 2, direction: 'up' | 'down') => {
    let currentScore1 = 0;
    let currentScore2 = 0;

    if (activeSet === 1) {
      currentScore1 = set1T1;
      currentScore2 = set1T2;
    } else if (activeSet === 2) {
      currentScore1 = set2T1;
      currentScore2 = set2T2;
    } else {
      currentScore1 = set3T1;
      currentScore2 = set3T2;
    }

    if (direction === 'up' && isSetWon(currentScore1, currentScore2)) {
      showToast(`Set ${activeSet} has already been won!`, 'warning');
      return;
    }

    pushToHistory();

    if (direction === 'down') {
      if (team === 1 && currentScore1 > 0) currentScore1--;
      if (team === 2 && currentScore2 > 0) currentScore2--;
    } else {
      if (team === 1) {
        currentScore1++;
        // If serving team wins point in doubles, they swap positions
        if (servingTeam === 1 && isDoubles) {
          const temp = t1RightPlayer;
          setT1RightPlayer(t1LeftPlayer);
          setT1LeftPlayer(temp);
        }
        setServingTeam(1);
      } else {
        currentScore2++;
        // If serving team wins point in doubles, they swap positions
        if (servingTeam === 2 && isDoubles) {
          const temp = t2RightPlayer;
          setT2RightPlayer(t2LeftPlayer);
          setT2LeftPlayer(temp);
        }
        setServingTeam(2);
      }
    }

    // Apply back
    if (activeSet === 1) {
      setSet1T1(currentScore1);
      setSet1T2(currentScore2);
    } else if (activeSet === 2) {
      setSet2T1(currentScore1);
      setSet2T2(currentScore2);
    } else {
      setSet3T1(currentScore1);
      setSet3T2(currentScore2);
    }
  };

  // Swap Serving Team manually
  const handleSwapServingTeam = () => {
    pushToHistory();
    setServingTeam(servingTeam === 1 ? 2 : 1);
  };

  // Swap player positions manually
  const handleSwapT1Positions = () => {
    if (!isDoubles) return;
    pushToHistory();
    const temp = t1RightPlayer;
    setT1RightPlayer(t1LeftPlayer);
    setT1LeftPlayer(temp);
  };

  const handleSwapT2Positions = () => {
    if (!isDoubles) return;
    pushToHistory();
    const temp = t2RightPlayer;
    setT2RightPlayer(t2LeftPlayer);
    setT2LeftPlayer(temp);
  };

  const saveScore = async (newStatus?: 'pending' | 'live' | 'completed') => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    const updatedStatus = newStatus || status;
    const scoreObj = {
      set1: { team1: set1T1, team2: set1T2 },
      set2: { team1: set2T1, team2: set2T2 },
      set3: (set3T1 > 0 || set3T2 > 0 || activeSet === 3) ? { team1: set3T1, team2: set3T2 } : undefined
    };
    setIsSaving(true);

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tournamentId,
          score: scoreObj,
          status: updatedStatus,
          court: court.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMatch(data.match);
        setStatus(data.match.status);
        showToast(newStatus ? `Match status updated to ${newStatus}!` : 'Match scores saved successfully!', 'success');
      } else {
        const err = await res.json();
        showToast(`Failed to save: ${err.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Error saving score:', err);
      showToast('Error saving score.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteMatch = async () => {
    const requiredSets = setsCount === 1 ? 1 : 2;

    let t1SetsWon = 0;
    let t2SetsWon = 0;

    if (isSetWon(set1T1, set1T2)) {
      if (set1T1 > set1T2) t1SetsWon++;
      else t2SetsWon++;
    }

    if (setsCount === 3 && isSetWon(set2T1, set2T2)) {
      if (set2T1 > set2T2) t1SetsWon++;
      else t2SetsWon++;
    }

    if (setsCount === 3 && isSetWon(set3T1, set3T2)) {
      if (set3T1 > set3T2) t1SetsWon++;
      else t2SetsWon++;
    }

    if (t1SetsWon < requiredSets && t2SetsWon < requiredSets) {
      showToast(`Cannot complete match: One team must win at least ${requiredSets} set(s) to finish the match.`, 'warning');
      return;
    }

    const confirmed = await confirm({
      title: 'Complete Match',
      message: 'Are you sure you want to complete this match and submit results? This will lock the scores.',
      confirmText: 'Complete Match',
      cancelText: 'Cancel'
    });
    if (confirmed) {
      await saveScore('completed');
      router.push(`/tournaments/${tournamentId}`);
    }
  };

  if (loading || !match || !tournament) {
    return (
      <div className="page-container" style={{ textAlign: 'center', marginTop: '100px' }}>
        <p>Loading Umpire Scoreboard...</p>
      </div>
    );
  }

  // Active score state for calculations
  const activeSetScore = activeSet === 1 
    ? { t1: set1T1, t2: set1T2 }
    : activeSet === 2
      ? { t1: set2T1, t2: set2T2 }
      : { t1: set3T1, t2: set3T2 };

  const activeServerScore = servingTeam === 1 ? activeSetScore.t1 : activeSetScore.t2;
  const isRightServe = activeServerScore % 2 === 0;

  // serving layout variables
  const isT1Serving = servingTeam === 1;
  const isT2Serving = servingTeam === 2;

  // Active Server / Receiver name tags
  let serverName = '';
  let receiverName = '';

  if (isT1Serving) {
    if (isDoubles) {
      serverName = isRightServe ? t1RightPlayer : t1LeftPlayer;
      receiverName = isRightServe ? t2RightPlayer : t2LeftPlayer;
    } else {
      serverName = t1RightPlayer;
      receiverName = t2RightPlayer;
    }
  } else {
    if (isDoubles) {
      serverName = isRightServe ? t2RightPlayer : t2LeftPlayer;
      receiverName = isRightServe ? t1RightPlayer : t1LeftPlayer;
    } else {
      serverName = t2RightPlayer;
      receiverName = t1RightPlayer;
    }
  }

  // Player zone positions based on score and singles/doubles mode
  const t1RightPresent = !isDoubles ? (activeSetScore.t1 % 2 === 0) : true;
  const t1LeftPresent = !isDoubles ? (activeSetScore.t1 % 2 !== 0) : true;
  const t2RightPresent = !isDoubles ? (activeSetScore.t2 % 2 === 0) : true;
  const t2LeftPresent = !isDoubles ? (activeSetScore.t2 % 2 !== 0) : true;

  return (
    <div className="page-container animate-slide">
      {/* Header control */}
      <div className={styles.header}>
        <Link href={`/tournaments/${tournamentId}`} className={styles.backBtn}>
          <ChevronLeft size={18} /> Dashboard
        </Link>
        <div className={styles.matchMeta}>
          <span className={styles.matchLabel}>{team1Name} vs {team2Name}</span>
          <span className={`${styles.statusBadge} ${styles[status]}`}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Rules summary badge */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: '0 0 8px' }}>
        <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-glass)', color: 'var(--color-text-muted)' }}>
          🏸 {setsCount === 1 ? 'Single Set' : 'Best of 3 Sets'}
        </span>
        <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-glass)', color: 'var(--color-text-muted)' }}>
          🎯 {target} pts
        </span>
        {deuce && (
          <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-glass)', color: 'var(--color-text-muted)' }}>
            ⚡ Deuce to {max}
          </span>
        )}
      </div>

      <div className={styles.panelGrid}>
        
        {/* SCORE PANEL */}
        <div className={styles.scoreCol}>
          <div className={`${styles.scoreCard} glass`}>
            
            {/* Set Tabs (Only show if Best of 3 Sets) */}
            {setsCount !== 1 && (
              <div className={styles.setSelectorRow}>
                <button 
                  className={`${styles.setTab} ${activeSet === 1 ? styles.activeSetTab : ''}`} 
                  onClick={() => setActiveSet(1)}
                >
                  Set 1
                </button>
                <button 
                  className={`${styles.setTab} ${activeSet === 2 ? styles.activeSetTab : ''}`} 
                  onClick={() => setActiveSet(2)}
                >
                  Set 2
                </button>
                <button 
                  className={`${styles.setTab} ${activeSet === 3 ? styles.activeSetTab : ''}`} 
                  onClick={() => setActiveSet(3)}
                >
                  Set 3
                </button>
              </div>
            )}

            <div className={styles.courtLabelsRow}>
              <span className={styles.courtInputLabel}>Court No:</span>
              <input 
                type="text" 
                placeholder="e.g. Court 1" 
                value={court} 
                onChange={(e) => setCourt(e.target.value)}
                className={`${styles.courtInput} form-input`}
                disabled={status === 'completed'}
              />
            </div>

            {/* Tap score controller */}
            <div className={styles.scoreTapArea}>
              
              {/* Team 1 Score Box */}
              <div 
                className={`${styles.teamScoreSection} ${isT1Serving ? styles.servingHighlight : ''}`}
                onClick={() => status !== 'completed' && handleScoreChange(1, 'up')}
              >
                <span className={styles.teamNameTitle}>{team1Name}</span>
                
                <span className={styles.hugeScore}>
                  {activeSet === 1 ? set1T1 : activeSet === 2 ? set2T1 : set3T1}
                </span>
                
                <div className={styles.scoreButtonsRow} onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => handleScoreChange(1, 'down')} 
                    className={styles.downBtn} 
                    disabled={status === 'completed' || (activeSet === 1 ? set1T1 : activeSet === 2 ? set2T1 : set3T1) === 0}
                  >
                    <Minus size={16} />
                  </button>
                  <button 
                    onClick={() => handleScoreChange(1, 'up')} 
                    className={styles.upBtn} 
                    disabled={status === 'completed'}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                
                {isT1Serving ? (
                  <span className={styles.serveStatusIndicator}>SERVING</span>
                ) : (
                  <span className={styles.serveStatusIndicatorEmpty}>&nbsp;</span>
                )}
              </div>

              <div className={styles.vsSeparator}>VS</div>

              {/* Team 2 Score Box */}
              <div 
                className={`${styles.teamScoreSection} ${isT2Serving ? styles.servingHighlight : ''}`}
                onClick={() => status !== 'completed' && handleScoreChange(2, 'up')}
              >
                <span className={styles.teamNameTitle}>{team2Name}</span>
                
                <span className={styles.hugeScore}>
                  {activeSet === 1 ? set1T2 : activeSet === 2 ? set2T2 : set3T2}
                </span>
                
                <div className={styles.scoreButtonsRow} onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => handleScoreChange(2, 'down')} 
                    className={styles.downBtn} 
                    disabled={status === 'completed' || (activeSet === 1 ? set1T2 : activeSet === 2 ? set2T2 : set3T2) === 0}
                  >
                    <Minus size={16} />
                  </button>
                  <button 
                    onClick={() => handleScoreChange(2, 'up')} 
                    className={styles.upBtn} 
                    disabled={status === 'completed'}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                
                {isT2Serving ? (
                  <span className={styles.serveStatusIndicator}>SERVING</span>
                ) : (
                  <span className={styles.serveStatusIndicatorEmpty}>&nbsp;</span>
                )}
              </div>

            </div>

            {/* Set Summaries Display */}
            <div className={styles.scoreSummary}>
              <div className={`${styles.summaryItem} ${activeSet === 1 ? styles.summaryItemActive : ''}`}>
                <span>Set 1</span>
                <strong>{set1T1} - {set1T2}</strong>
              </div>
              {setsCount === 3 && (
                <>
                  <div className={`${styles.summaryItem} ${activeSet === 2 ? styles.summaryItemActive : ''}`}>
                    <span>Set 2</span>
                    <strong>{set2T1} - {set2T2}</strong>
                  </div>
                  <div className={`${styles.summaryItem} ${activeSet === 3 ? styles.summaryItemActive : ''}`}>
                    <span>Set 3</span>
                    <strong>{set3T1} - {set3T2}</strong>
                  </div>
                </>
              )}
            </div>

            {/* Score actions */}
            {status !== 'completed' ? (
              <div className={styles.scoreActionsRow}>
                <button 
                  onClick={handleUndo} 
                  className={styles.undoBtn}
                  disabled={history.length === 0 || isSaving}
                  title="Undo last action"
                  style={{ flex: 1 }}
                >
                  <Undo2 size={16} /> Undo
                </button>

                <button onClick={handleCompleteMatch} className="btn btn-primary" style={{ flex: 2 }} disabled={isSaving}>
                  {isSaving ? <span className="btn-spinner"></span> : 'Finish & Submit'}
                </button>
              </div>
            ) : (
              <div className={styles.completedBanner}>
                <Trophy size={16} /> Result Submitted & Locked
              </div>
            )}

          </div>
        </div>

        {/* COURT ASSISTANT / SERVING SYSTEM */}
        <div className={styles.courtAssistantCol}>
          <div className={`${styles.assistantCard} glass`}>
            <h3>Service Assistant</h3>

            {/* Serving State box */}
            <div className={styles.serveStatusBox}>
              <div className={styles.serveStatusItem}>
                <span className={styles.serveStatusLabel}>Serving Team:</span>
                <button onClick={handleSwapServingTeam} className={styles.toggleServeBtn} disabled={status === 'completed'}>
                  {servingTeam === 1 ? team1Name : team2Name} <RefreshCw size={12} />
                </button>
              </div>
              <div className={styles.serveStatusItem}>
                <span className={styles.serveStatusLabel}>Active Server:</span>
                <span className={styles.serverNameSpan}>{serverName} ({isRightServe ? 'Right' : 'Left'} Court)</span>
              </div>
              {receiverName && (
                <div className={styles.serveStatusItem}>
                  <span className={styles.serveStatusLabel}>Receiver:</span>
                  <span className={styles.receiverNameSpan}>{receiverName}</span>
                </div>
              )}
            </div>

            {/* Court Diagram (Horizontal Layout) */}
            <div className={styles.courtMapContainer}>
              <div className={styles.courtGrid}>
                
                {/* Team 1 Side (Left Side) */}
                <div 
                  className={`${styles.courtSide} ${isDoubles ? styles.interactiveSide : ''}`} 
                  onClick={() => status !== 'completed' && isDoubles && handleSwapT1Positions()}
                  title={isDoubles ? "Tap to swap player positions" : undefined}
                >
                  <div className={styles.sideHeader}>{team1Name}</div>
                  <div className={styles.quadrantsColumn}>
                    {/* Top quadrant: Left Court (Odd) */}
                    <div className={`${styles.courtZone} ${
                      t1LeftPresent ? '' : styles.zoneEmpty
                    } ${
                      isT1Serving && !isRightServe && t1LeftPresent ? styles.activeServeZone : ''
                    } ${
                      isT2Serving && !isRightServe && t1LeftPresent ? styles.activeReceiveZone : ''
                    }`}>
                      <span className={styles.sideLabel}>L (Odd)</span>
                      <span className={styles.courtPlayerName}>
                        {t1LeftPresent ? (isDoubles ? t1LeftPlayer : t1RightPlayer) : ''}
                      </span>
                      {isT1Serving && !isRightServe && t1LeftPresent && (
                        <span className={styles.shuttleIcon}>🏸</span>
                      )}
                    </div>
                    
                    {/* Bottom quadrant: Right Court (Even) */}
                    <div className={`${styles.courtZone} ${
                      t1RightPresent ? '' : styles.zoneEmpty
                    } ${
                      isT1Serving && isRightServe && t1RightPresent ? styles.activeServeZone : ''
                    } ${
                      isT2Serving && isRightServe && t1RightPresent ? styles.activeReceiveZone : ''
                    }`}>
                      <span className={styles.sideLabel}>R (Even)</span>
                      <span className={styles.courtPlayerName}>
                        {t1RightPresent ? t1RightPlayer : ''}
                      </span>
                      {isT1Serving && isRightServe && t1RightPresent && (
                        <span className={styles.shuttleIcon}>🏸</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Net Divider */}
                <div className={styles.netDivider}>
                  <div className={styles.netLine}></div>
                  <div className={styles.netTag}>NET</div>
                  <div className={styles.netLine}></div>
                </div>

                {/* Team 2 Side (Right Side) */}
                <div 
                  className={`${styles.courtSide} ${isDoubles ? styles.interactiveSide : ''}`} 
                  onClick={() => status !== 'completed' && isDoubles && handleSwapT2Positions()}
                  title={isDoubles ? "Tap to swap player positions" : undefined}
                >
                  <div className={styles.sideHeader}>{team2Name}</div>
                  <div className={styles.quadrantsColumn}>
                    {/* Top quadrant: Right Court (Even) */}
                    <div className={`${styles.courtZone} ${
                      t2RightPresent ? '' : styles.zoneEmpty
                    } ${
                      isT2Serving && isRightServe && t2RightPresent ? styles.activeServeZone : ''
                    } ${
                      isT1Serving && isRightServe && t2RightPresent ? styles.activeReceiveZone : ''
                    }`}>
                      <span className={styles.sideLabel}>R (Even)</span>
                      <span className={styles.courtPlayerName}>
                        {t2RightPresent ? t2RightPlayer : ''}
                      </span>
                      {isT2Serving && isRightServe && t2RightPresent && (
                        <span className={styles.shuttleIcon}>🏸</span>
                      )}
                    </div>
                    
                    {/* Bottom quadrant: Left Court (Odd) */}
                    <div className={`${styles.courtZone} ${
                      t2LeftPresent ? '' : styles.zoneEmpty
                    } ${
                      isT2Serving && !isRightServe && t2LeftPresent ? styles.activeServeZone : ''
                    } ${
                      isT1Serving && !isRightServe && t2LeftPresent ? styles.activeReceiveZone : ''
                    }`}>
                      <span className={styles.sideLabel}>L (Odd)</span>
                      <span className={styles.courtPlayerName}>
                        {t2LeftPresent ? (isDoubles ? t2LeftPlayer : t2RightPlayer) : ''}
                      </span>
                      {isT2Serving && !isRightServe && t2LeftPresent && (
                        <span className={styles.shuttleIcon}>🏸</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>
              
              <div className={styles.diagramTip}>
                <span>
                  {isDoubles 
                    ? "Tap a team court side to swap player positions manually." 
                    : "Player positions dynamically adapt to the active score."}
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
