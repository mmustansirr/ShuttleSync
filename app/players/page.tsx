'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Edit2, Shuffle, ArrowRightLeft, Star, Users, Info } from 'lucide-react';
import { Player, Team } from '../../lib/db';
import { getAdminPin, getAuthHeaders } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { getPlayerTier, eloToStars } from '../../lib/tournamentUtils';
import styles from './page.module.css';

export default function PlayersPage() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // View states
  const [activeView, setActiveView] = useState<'directory' | 'sandbox-select' | 'sandbox-results'>('directory');
  const [generationMode, setGenerationMode] = useState<'balanced' | 'random'>('balanced');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  // Action/Edit Modal states
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [activePlayerForAction, setActivePlayerForAction] = useState<Player | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Player Details modal states
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activePlayerDetails, setActivePlayerDetails] = useState<Player | null>(null);

  // Randomizer states
  const [generatedTeams, setGeneratedTeams] = useState<Team[]>([]);
  const [leftoverPlayers, setLeftoverPlayers] = useState<Player[]>([]);
  const [swapId, setSwapId] = useState<string | null>(null);

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players');
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
        setSelectedPlayers(data.map((p: Player) => p.id));
      }
    } catch (err) {
      console.error('Error fetching players:', err);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(getAdminPin() !== '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlayers();
    
    // Admin state sync
    const handleAuth = () => setIsAdmin(getAdminPin() !== '');
    window.addEventListener('shuttlesync_auth_change', handleAuth);
    return () => window.removeEventListener('shuttlesync_auth_change', handleAuth);
  }, []);

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsAdding(true);

    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        const newPlayer = await res.json();
        setPlayers([...players, newPlayer]);
        setSelectedPlayers([...selectedPlayers, newPlayer.id]);
        setName('');
        setIsAddModalOpen(false);
        showToast(`Player "${newPlayer.name}" added successfully!`, 'success');
      } else {
        showToast('Unauthorized: Enter valid Admin PIN in header lock menu.', 'error');
      }
    } catch (err) {
      console.error('Error adding player:', err);
      showToast('Error adding player.', 'error');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDeletePlayer(id: string) {
    const deletedPlayer = players.find(p => p.id === id);
    const confirmed = await confirm({
      title: 'Delete Player',
      message: `Are you sure you want to delete ${deletedPlayer?.name || 'this player'}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    setDeletingPlayerId(id);
    try {
      const res = await fetch(`/api/players/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const deletedPlayer = players.find(p => p.id === id);
        setPlayers(players.filter(p => p.id !== id));
        setSelectedPlayers(selectedPlayers.filter(pid => pid !== id));
        setGeneratedTeams([]);
        setLeftoverPlayers([]);
        if (deletedPlayer) {
          showToast(`Player "${deletedPlayer.name}" deleted.`, 'info');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Unauthorized or error: ${err.error || 'PIN required.'}`, 'error');
      }
    } catch (err) {
      console.error('Error deleting player:', err);
      showToast('Error deleting player.', 'error');
    } finally {
      setDeletingPlayerId(null);
    }
  }

  async function handleEditPlayerName(e: React.FormEvent) {
    e.preventDefault();
    const playerToEdit = activePlayerDetails || activePlayerForAction;
    if (!playerToEdit || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/players/${playerToEdit.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: editName.trim() })
      });
      if (res.ok) {
        const updated = await res.json();
        setPlayers(players.map(p => p.id === playerToEdit.id ? updated : p));
        showToast(`Player name updated to "${updated.name}"`, 'success');
        setIsActionModalOpen(false);
        setActivePlayerForAction(null);
        setIsDetailsModalOpen(false);
        setActivePlayerDetails(null);
        setIsEditingMode(false);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Error: ${err.error || 'Failed to update player.'}`, 'error');
      }
    } catch (err) {
      console.error('Error updating player name:', err);
      showToast('Error updating player name.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  }

  const toggleSelectPlayer = (id: string) => {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter(pid => pid !== id));
    } else {
      setSelectedPlayers([...selectedPlayers, id]);
    }
  };

  const handleSelectAll = () => {
    setSelectedPlayers(players.map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedPlayers([]);
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
        showToast('Cannot generate balanced teams: all selected players are unrated (0 matches played). Run a tournament or play matches to generate ratings first!', 'warning');
        return;
      }
    }

    let list = [...activeList];
    if (mode === 'random') {
      // Shuffling list randomly using Fisher-Yates algorithm
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    } else {
      // Sort by rating for balanced pairing
      // Treat unrated players as having the system-wide average rating of rated players
      const ratedPlayers = players.filter(p => p.stats.played > 0);
      const avgSystemRating = ratedPlayers.length > 0 
        ? ratedPlayers.reduce((sum, p) => sum + p.rating, 0) / ratedPlayers.length 
        : 1200;

      const listWithTempRatings = list.map(p => ({
        ...p,
        tempRating: p.stats.played === 0 ? avgSystemRating : p.rating
      }));

      listWithTempRatings.sort((a, b) => b.tempRating - a.tempRating);
      
      list = listWithTempRatings.map(p => {
        const { tempRating, ...originalPlayer } = p;
        return originalPlayer;
      });
    }

    const teams: Team[] = [];
    const leftovers: Player[] = [];
    const len = list.length;
    const numTeams = Math.floor(len / 2);

    if (mode === 'random') {
      // Random pairing: pair adjacent players in the randomized list
      for (let i = 0; i < numTeams; i++) {
        const p1 = list[i * 2];
        const p2 = list[i * 2 + 1];
        teams.push({
          id: `team-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${p1.name} & ${p2.name}`,
          playerIds: [p1.id, p2.id]
        });
      }
      if (len % 2 !== 0) {
        leftovers.push(list[len - 1]);
      }
    } else {
      // Balanced pairing: pair strongest with weakest
      for (let i = 0; i < numTeams; i++) {
        const p1 = list[i];
        const p2 = list[len - 1 - i];
        teams.push({
          id: `team-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: `${p1.name} & ${p2.name}`,
          playerIds: [p1.id, p2.id]
        });
      }
      if (len % 2 !== 0) {
        leftovers.push(list[numTeams]);
      }
    }

    setGeneratedTeams(teams);
    setLeftoverPlayers(leftovers);
    setSwapId(null);
    setGenerationMode(mode);
    setActiveView('sandbox-results');
  };

  const handleSwapClick = (playerId: string) => {
    // Sandbox swaps do not write to the DB, so we can allow standard players to swap visually.
    if (swapId === null) {
      setSwapId(playerId);
    } else if (swapId === playerId) {
      setSwapId(null);
    } else {
      const p1Id = swapId;
      const p2Id = playerId;

      let p1TeamIdx = -1;
      let p1PlayerIdx = -1;
      let p1IsLeftover = false;

      let p2TeamIdx = -1;
      let p2PlayerIdx = -1;
      let p2IsLeftover = false;

      generatedTeams.forEach((t, tIdx) => {
        const p1Idx = t.playerIds.indexOf(p1Id);
        if (p1Idx !== -1) {
          p1TeamIdx = tIdx;
          p1PlayerIdx = p1Idx;
        }

        const p2Idx = t.playerIds.indexOf(p2Id);
        if (p2Idx !== -1) {
          p2TeamIdx = tIdx;
          p2PlayerIdx = p2Idx;
        }
      });

      const p1LIdx = leftoverPlayers.findIndex(p => p.id === p1Id);
      if (p1LIdx !== -1) p1IsLeftover = true;

      const p2LIdx = leftoverPlayers.findIndex(p => p.id === p2Id);
      if (p2LIdx !== -1) p2IsLeftover = true;

      const newTeams = [...generatedTeams];
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
        t.name = `${pA?.name || 'Unknown'} & ${pB?.name || 'Unknown'}`;
      });

      setGeneratedTeams(newTeams);
      setLeftoverPlayers(newLeftovers);
      setSwapId(null);
    }
  };

  const getTeamAvgElo = (team: Team): number => {
    const p1 = players.find(p => p.id === team.playerIds[0]);
    const p2 = players.find(p => p.id === team.playerIds[1]);
    const r1 = p1 ? p1.rating : 1200;
    const r2 = p2 ? p2.rating : 1200;
    return (r1 + r2) / 2;
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const aRated = a.stats.played > 0;
    const bRated = b.stats.played > 0;
    
    // Put rated players first, unrated players at the very bottom
    if (aRated !== bRated) {
      return aRated ? -1 : 1;
    }

    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
    return a.stats.losses - b.stats.losses;
  });

  const getTierProgress = (elo: number) => {
    let floor = 800;
    let ceil = 1000;
    let nextTierName = 'Silver';
    let isMaxTier = false;

    if (elo < 1000) {
      floor = 800;
      ceil = 1000;
      nextTierName = 'Silver';
    } else if (elo < 1200) {
      floor = 1000;
      ceil = 1200;
      nextTierName = 'Gold';
    } else if (elo < 1400) {
      floor = 1200;
      ceil = 1400;
      nextTierName = 'Platinum';
    } else if (elo < 1600) {
      floor = 1400;
      ceil = 1600;
      nextTierName = 'Diamond';
    } else if (elo < 1800) {
      floor = 1600;
      ceil = 1800;
      nextTierName = 'Master';
    } else {
      isMaxTier = true;
    }

    if (isMaxTier) {
      return {
        percent: 100,
        remaining: 0,
        nextTierName: '',
        isMaxTier: true
      };
    }

    const currentOffset = Math.max(0, elo - floor);
    const totalRange = ceil - floor;
    const percent = Math.min(100, Math.max(0, (currentOffset / totalRange) * 100));
    const remaining = ceil - elo;

    return {
      percent,
      remaining,
      nextTierName,
      isMaxTier: false
    };
  };

  const handlePlayerClick = (player: Player) => {
    setActivePlayerDetails(player);
    setIsDetailsModalOpen(true);
  };

  return (
    <>
      <div className="page-container animate-slide">
      {/* Mobile-first segment switch */}
      <div className="segment-header">
        <button
          className={`segment-btn ${activeView === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveView('directory')}
        >
          <Users size={16} /> Directory
        </button>
        <button
          className={`segment-btn ${activeView.startsWith('sandbox') ? 'active' : ''}`}
          onClick={() => setActiveView('sandbox-select')}
        >
          <Shuffle size={16} /> Team Sandbox
        </button>
      </div>

      {activeView === 'directory' ? (
        <div className={styles.directoryView}>
          <div className={styles.directoryHeader}>
            <h2>Players Directory</h2>
            {isAdmin && (
              <button 
                className={`btn btn-primary ${styles.addPlayerBtn}`} 
                onClick={() => setIsAddModalOpen(true)}
              >
                <UserPlus size={16} /> Add Player
              </button>
            )}
          </div>

          {/* Directory Table */}
          <div className={styles.card} style={{ padding: 'var(--space-4) var(--space-2)' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>Pos</th>
                    <th>Player</th>
                    <th style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}>
                        Rating
                        <Info 
                          size={14} 
                          style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsInfoModalOpen(true);
                          }}
                        />
                      </div>
                    </th>
                    <th style={{ textAlign: 'center' }}>P</th>
                    <th style={{ textAlign: 'center' }}>W</th>
                    <th style={{ textAlign: 'center' }}>L</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player, idx) => {
                    const total = player.stats.played;
                    const wr = total > 0 ? Math.round((player.stats.wins / total) * 100) : 0;
                    const tierClass = getPlayerTier(player.rating).class.replace('tier-', 'row');
                    const rowTierStyle = styles[tierClass] || '';
                    const rowClass = `${styles.clickableRow} ${player.stats.played === 0 ? '' : rowTierStyle}`;

                    return (
                      <tr key={player.id} className={rowClass} onClick={() => handlePlayerClick(player)}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: idx < 3 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontWeight: '600' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={styles.playerName}>{player.name}</span>
                          </div>
                          <span className={styles.winRateSubText}>Win Rate: {wr}%</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {player.stats.played === 0 ? (
                            <span className="rating-badge-unrated">New</span>
                          ) : (
                            <div className="rating-display-container">
                              <span className={`rating-tier-badge ${getPlayerTier(player.rating).class}`}>
                                {getPlayerTier(player.rating).emoji} {getPlayerTier(player.rating).name}
                              </span>
                              <span className="rating-elo-text">
                                {player.rating} Elo
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>{player.stats.played}</td>
                        <td style={{ textAlign: 'center', color: 'var(--primary)' }}>{player.stats.wins}</td>
                        <td style={{ textAlign: 'center', color: 'var(--danger)' }}>{player.stats.losses}</td>
                      </tr>
                    );
                  })}
                  {players.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                        No players registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeView === 'sandbox-select' ? (
        <div className={styles.sandboxView}>
          <div className={styles.card}>
            {/* Selection Header */}
            <div className={styles.selectionSummary}>
              <div className={styles.summaryTitle}>
                <span className={styles.selectionCount}>
                  {selectedPlayers.length} of {players.length} Active
                </span>
                <span className={styles.selectionHelper}>
                  {selectedPlayers.length === 0 ? (
                    'Select players to form teams'
                  ) : selectedPlayers.length % 2 === 0 ? (
                    '✓ Balanced pairing (even numbers)'
                  ) : (
                    '⚡ Odd number (1 player will be benched)'
                  )}
                </span>
              </div>
              <div className={styles.selectActions}>
                <button className={styles.smallLink} onClick={handleSelectAll}>Select All</button>
                <span className={styles.actionDivider}>/</span>
                <button className={styles.smallLink} onClick={handleDeselectAll}>Clear</button>
              </div>
            </div>

            {/* Checkbox selector - Full height, ample breathing space */}
            <div className={styles.selectPlayersWrapperFull}>
              <div className={styles.checkboxGridFull}>
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
                          {tier.emoji} {p.rating} Elo
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {(() => {
              const selectedPlayerObjs = players.filter(p => selectedPlayers.includes(p.id));
              const allSelectedUnrated = selectedPlayerObjs.length >= 2 && selectedPlayerObjs.every(p => p.stats.played === 0);
              return (
                <div className={styles.actionButtonContainer}>
                  <button
                    onClick={() => handleGenerateTeams('balanced')}
                    className={`btn btn-primary ${allSelectedUnrated ? 'btn-inactive' : ''}`}
                    disabled={selectedPlayers.length < 2}
                  >
                    <Star size={16} /> Balanced Teams
                  </button>
                  <button
                    onClick={() => handleGenerateTeams('random')}
                    className="btn btn-secondary"
                    disabled={selectedPlayers.length < 2}
                  >
                    <Shuffle size={16} /> Random Teams
                  </button>
                </div>
              );
            })()}
            <p className={styles.balancingTagline}>
              Balanced pairs stronger players with weaker players. Random shuffles partners completely by chance.
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.sandboxView}>
          <div className={styles.card}>
            {/* Header controls for results page */}
            <div className={styles.resultsHeaderActions}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setActiveView('sandbox-select')}
                style={{ height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
              >
                ← Back to Players
              </button>
              {generationMode === 'random' && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleGenerateTeams('random')}
                  style={{ height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
                >
                  <Shuffle size={16} /> Randomize Again
                </button>
              )}
            </div>

            {/* Generated Teams container */}
            <div className={styles.generatedContainer} style={{ marginTop: '24px', borderTop: 'none', paddingTop: 0 }}>
              {swapId ? (
                <div className={styles.swapNoticeActive}>
                  <span className={styles.swapInstructText}>
                    Select another player to swap with <strong>{players.find(p => p.id === swapId)?.name}</strong>
                  </span>
                  <button className={styles.swapCancelBtn} onClick={() => setSwapId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                isAdmin && (
                  <div className={styles.swapNotice}>
                    💡 Tip: Tap any two players to swap them between teams or reserves.
                  </div>
                )
              )}

              <div className={styles.teamsList}>
                {generatedTeams.map((team, idx) => {
                  const avgElo = getTeamAvgElo(team);
                  const p1 = players.find(player => player.id === team.playerIds[0]);
                  const p2 = players.find(player => player.id === team.playerIds[1]);
                  const isSwapping1 = swapId === team.playerIds[0];
                  const isSwapping2 = swapId === team.playerIds[1];

                  return (
                    <div key={team.id} className={styles.teamCard}>
                      <div className={styles.teamCardHeader}>
                        <span className={styles.teamNumber}>Team {idx + 1}</span>
                        <span className={styles.avgRatingBadge}>Avg: {Math.round(avgElo)} Elo ({eloToStars(avgElo).toFixed(1)}★)</span>
                      </div>
                      
                      <div className={styles.teamPlayersHorizontal}>
                        <div 
                          className={`${styles.playerCapsule} ${isSwapping1 ? styles.swappingCapsule : ''} ${!isAdmin ? styles.nonInteractiveRow : ''}`}
                          onClick={() => isAdmin && handleSwapClick(team.playerIds[0])}
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
                          className={`${styles.playerCapsule} ${isSwapping2 ? styles.swappingCapsule : ''} ${!isAdmin ? styles.nonInteractiveRow : ''}`}
                          onClick={() => isAdmin && handleSwapClick(team.playerIds[1])}
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
                          className={`${styles.leftoverCapsule} ${isSwapping ? styles.swappingCapsule : ''} ${!isAdmin ? styles.nonInteractiveRow : ''}`}
                          onClick={() => isAdmin && handleSwapClick(p.id)}
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
          </div>
        </div>
      )}

      </div>

      {/* Add Player Modal Overlay */}
      {isAddModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Add New Player</h3>
            <form onSubmit={handleAddPlayer} className={styles.promptForm}>
              <div className="form-group">
                <label className="form-label">Player Name</label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  required
                  autoFocus
                />
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setName('');
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={isAdding}
                >
                  {isAdding ? <span className="btn-spinner"></span> : 'Save Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Modal Overlay */}
      {isInfoModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsInfoModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.infoModalTitle}>
              🏸 How Ratings Work
            </h3>
            
            <div className={styles.infoModalContent}>
              <div className={styles.infoSection}>
                <span className={styles.infoQuestion}>What is Elo?</span>
                <span className={styles.infoAnswer}>
                  It is a number representing your badminton skill. Everyone starts with <strong>1200 Elo</strong>.
                </span>
              </div>

              <div className={styles.infoSection}>
                <span className={styles.infoQuestion}>How does it change?</span>
                <span className={styles.infoAnswer}>
                  - <strong>Win a match?</strong> Your rating goes up! 📈<br />
                  - <strong>Lose a match?</strong> Your rating goes down. 📉
                </span>
              </div>

              <div className={styles.infoSection}>
                <span className={styles.infoQuestion}>Rating Tiers & Brackets</span>
                <span className={styles.infoAnswer}>
                  Your tier is determined by your current Elo score:
                </span>
                <div className={styles.infoTiersList}>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-master">👑 Master</span>
                    <span className={styles.infoTierValue}>1800+ Elo</span>
                  </div>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-diamond">🏆 Diamond</span>
                    <span className={styles.infoTierValue}>1600 - 1799 Elo</span>
                  </div>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-platinum">💎 Platinum</span>
                    <span className={styles.infoTierValue}>1400 - 1599 Elo</span>
                  </div>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-gold">🥇 Gold</span>
                    <span className={styles.infoTierValue}>1200 - 1399 Elo</span>
                  </div>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-silver">🥈 Silver</span>
                    <span className={styles.infoTierValue}>1000 - 1199 Elo</span>
                  </div>
                  <div className={styles.infoTierRow}>
                    <span className="rating-tier-badge tier-bronze">🥉 Bronze</span>
                    <span className={styles.infoTierValue}>Under 1000 Elo</span>
                  </div>
                </div>
              </div>

              <div className={styles.infoSection}>
                <span className={styles.infoQuestion}>First Time Players?</span>
                <span className={styles.infoAnswer}>
                  New players are labeled as <strong>New</strong> and positioned at the bottom of the list until they complete their first rated match.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsInfoModalOpen(false)}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Player Details Modal Overlay */}
      {isDetailsModalOpen && activePlayerDetails && (
        <div className={styles.modalOverlay} onClick={() => {
          if (!isSavingEdit && !deletingPlayerId) {
            setIsDetailsModalOpen(false);
            setActivePlayerDetails(null);
            setIsEditingMode(false);
          }
        }}>
          <div className={styles.modal} style={{ maxWidth: '360px' }} onClick={(e) => e.stopPropagation()}>
            {!isEditingMode ? (
              <>
                <div className={styles.detailsHeader}>
                  <span className={styles.detailsRank}>
                    Position #{sortedPlayers.findIndex(p => p.id === activePlayerDetails.id) + 1} of {players.length}
                  </span>
                  <h2 className={styles.detailsName}>{activePlayerDetails.name}</h2>
                </div>

                <div className={styles.detailsTierCard}>
                  {activePlayerDetails.stats.played === 0 ? (
                    <>
                      <span className="rating-badge-unrated" style={{ fontSize: '0.9rem', padding: '4px 12px' }}>New Player</span>
                      <span className={styles.detailsEloText}>{activePlayerDetails.rating} Elo</span>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Play a match to calculate tier progress
                      </p>
                    </>
                  ) : (
                    <>
                      <span className={`${styles.detailsTierBadge} ${getPlayerTier(activePlayerDetails.rating).class}`}>
                        {getPlayerTier(activePlayerDetails.rating).emoji} {getPlayerTier(activePlayerDetails.rating).name}
                      </span>
                      <span className={styles.detailsEloText}>{activePlayerDetails.rating} Elo</span>
                      <div className={styles.detailsStars}>
                        {(() => {
                          const stars = eloToStars(activePlayerDetails.rating);
                          return `${stars.toFixed(1)} ★`;
                        })()}
                      </div>

                      {/* Tier Progress bar */}
                      {(() => {
                        const prog = getTierProgress(activePlayerDetails.rating);
                        return (
                          <div className={styles.progressContainer}>
                            <div className={styles.progressText}>
                              <span>Progress to {prog.isMaxTier ? 'Peak' : prog.nextTierName}</span>
                              <span>
                                {prog.isMaxTier 
                                  ? 'Max Tier reached!' 
                                  : `${prog.remaining} Elo remaining`}
                              </span>
                            </div>
                            <div className={styles.progressBarOuter}>
                              <div 
                                className={`${styles.progressBarInner} ${getPlayerTier(activePlayerDetails.rating).class}`} 
                                style={{ width: `${prog.percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Performance Stats */}
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{activePlayerDetails.stats.played}</span>
                    <span className={styles.statLabel}>Played</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue} style={{ color: 'var(--primary)' }}>
                      {activePlayerDetails.stats.wins}
                    </span>
                    <span className={styles.statLabel}>Wins</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue} style={{ color: 'var(--danger)' }}>
                      {activePlayerDetails.stats.losses}
                    </span>
                    <span className={styles.statLabel}>Losses</span>
                  </div>
                </div>

                {/* Win Rate Bar */}
                {activePlayerDetails.stats.played > 0 && (
                  <div className={styles.winRateSection}>
                    <span className={styles.winRateLabel}>Win Rate</span>
                    <div className={styles.winRateTrack}>
                      <div 
                        className={styles.winRateBar} 
                        style={{ width: `${Math.round((activePlayerDetails.stats.wins / activePlayerDetails.stats.played) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.winRateTextValue}>
                      {Math.round((activePlayerDetails.stats.wins / activePlayerDetails.stats.played) * 100)}%
                    </span>
                  </div>
                )}

                {/* Admin actions inside the Details Modal */}
                {isAdmin ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-border-glass)', paddingTop: '16px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditName(activePlayerDetails.name);
                          setIsEditingMode(true);
                        }}
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        Edit Name
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmDelete = activePlayerDetails.id;
                          setIsDetailsModalOpen(false);
                          await handleDeletePlayer(confirmDelete);
                          setActivePlayerDetails(null);
                        }}
                        className="btn btn-danger"
                        style={{ flex: 1 }}
                      >
                        Delete Player
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDetailsModalOpen(false);
                        setActivePlayerDetails(null);
                      }}
                      className="btn btn-secondary"
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailsModalOpen(false);
                      setActivePlayerDetails(null);
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '8px' }}
                  >
                    Close
                  </button>
                )}
              </>
            ) : (
              <>
                <h3 className={styles.infoModalTitle}>Edit Player Name</h3>
                <form onSubmit={handleEditPlayerName} className={styles.promptForm}>
                  <div className="form-group">
                    <label className="form-label">New Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="form-input"
                      required
                      autoFocus
                    />
                  </div>
                  <div className={styles.modalButtons}>
                    <button
                      type="button"
                      onClick={() => setIsEditingMode(false)}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      disabled={isSavingEdit}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={isSavingEdit}
                    >
                      {isSavingEdit ? <span className="btn-spinner"></span> : 'Save'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
