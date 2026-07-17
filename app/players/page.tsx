'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shuffle, ArrowRightLeft, Star, Users } from 'lucide-react';
import { Player, Team } from '../../lib/db';
import { getAdminPin, getAuthHeaders } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import styles from './page.module.css';

export default function PlayersPage() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(3);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);

  // View states
  const [activeView, setActiveView] = useState<'directory' | 'sandbox-select' | 'sandbox-results'>('directory');
  const [generationMode, setGenerationMode] = useState<'balanced' | 'random'>('balanced');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Randomizer states
  const [generatedTeams, setGeneratedTeams] = useState<Team[]>([]);
  const [leftoverPlayers, setLeftoverPlayers] = useState<Player[]>([]);
  const [swapId, setSwapId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers();
    
    // Admin state sync
    setIsAdmin(getAdminPin() !== '');
    const handleAuth = () => setIsAdmin(getAdminPin() !== '');
    window.addEventListener('shuttlesync_auth_change', handleAuth);
    return () => window.removeEventListener('shuttlesync_auth_change', handleAuth);
  }, []);

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

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsAdding(true);

    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, rating })
      });
      if (res.ok) {
        const newPlayer = await res.json();
        setPlayers([...players, newPlayer]);
        setSelectedPlayers([...selectedPlayers, newPlayer.id]);
        setName('');
        setRating(3);
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
        showToast('Unauthorized: PIN required.', 'error');
      }
    } catch (err) {
      console.error('Error deleting player:', err);
      showToast('Error deleting player.', 'error');
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

    let list = [...activeList];
    if (mode === 'random') {
      // Shuffling list randomly using Fisher-Yates algorithm
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    } else {
      // Sort by rating for balanced pairing
      list.sort((a, b) => b.rating - a.rating);
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

  const getTeamRating = (team: Team): number => {
    const p1 = players.find(p => p.id === team.playerIds[0]);
    const p2 = players.find(p => p.id === team.playerIds[1]);
    const r1 = p1 ? p1.rating : 0;
    const r2 = p2 ? p2.rating : 0;
    return (r1 + r2) / 2;
  };

  const sortedPlayers = [...players].sort((a, b) => {
    if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
    if (a.stats.losses !== b.stats.losses) return a.stats.losses - b.stats.losses;
    return b.stats.played - a.stats.played;
  });

  return (
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
                className="btn btn-primary" 
                onClick={() => setIsAddModalOpen(true)}
                style={{ height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
              >
                <UserPlus size={16} /> Add Player
              </button>
            )}
          </div>

          {/* Directory Table */}
          <div className={styles.card}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>Pos</th>
                  <th>Player</th>
                  <th style={{ textAlign: 'center' }}>Rating</th>
                  <th style={{ textAlign: 'center' }}>P</th>
                  <th style={{ textAlign: 'center' }}>W</th>
                  <th style={{ textAlign: 'center' }}>L</th>
                  {isAdmin && <th style={{ width: '40px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, idx) => {
                  const total = player.stats.played;
                  const wr = total > 0 ? Math.round((player.stats.wins / total) * 100) : 0;
                  return (
                    <tr key={player.id}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: idx < 3 ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ fontWeight: '600' }}>
                        <div>{player.name}</div>
                        <span className={styles.winRateSubText}>Win Rate: {wr}%</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={styles.ratingBadge}>{player.rating}★</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{player.stats.played}</td>
                      <td style={{ textAlign: 'center', color: 'var(--primary)' }}>{player.stats.wins}</td>
                      <td style={{ textAlign: 'center', color: 'var(--danger)' }}>{player.stats.losses}</td>
                      {isAdmin && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeletePlayer(player.id)}
                            className={styles.deleteBtn}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {players.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                      No players registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                {players.map(p => (
                  <label key={p.id} className={`${styles.checkboxLabel} ${selectedPlayers.includes(p.id) ? styles.checked : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedPlayers.includes(p.id)}
                      onChange={() => toggleSelectPlayer(p.id)}
                    />
                    <span className={styles.playerText}>{p.name}</span>
                    <span className={styles.playerRating}>{p.rating}★</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.actionButtonContainer}>
              <button
                onClick={() => handleGenerateTeams('balanced')}
                className="btn btn-primary"
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
                  const avgRating = getTeamRating(team);
                  const p1 = players.find(player => player.id === team.playerIds[0]);
                  const p2 = players.find(player => player.id === team.playerIds[1]);
                  const isSwapping1 = swapId === team.playerIds[0];
                  const isSwapping2 = swapId === team.playerIds[1];

                  return (
                    <div key={team.id} className={styles.teamCard}>
                      <div className={styles.teamCardHeader}>
                        <span className={styles.teamNumber}>Team {idx + 1}</span>
                        <span className={styles.avgRatingBadge}>Avg: {avgRating.toFixed(1)}★</span>
                      </div>
                      
                      <div className={styles.teamPlayersHorizontal}>
                        <div 
                          className={`${styles.playerCapsule} ${isSwapping1 ? styles.swappingCapsule : ''} ${!isAdmin ? styles.nonInteractiveRow : ''}`}
                          onClick={() => isAdmin && handleSwapClick(team.playerIds[0])}
                        >
                          <span className={styles.playerName}>{p1?.name}</span>
                          <span className={styles.playerRating}>{p1?.rating}★</span>
                        </div>
                        
                        <span className={styles.handshakeIcon}>🤝</span>
                        
                        <div 
                          className={`${styles.playerCapsule} ${isSwapping2 ? styles.swappingCapsule : ''} ${!isAdmin ? styles.nonInteractiveRow : ''}`}
                          onClick={() => isAdmin && handleSwapClick(team.playerIds[1])}
                        >
                          <span className={styles.playerName}>{p2?.name}</span>
                          <span className={styles.playerRating}>{p2?.rating}★</span>
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
                          <span className={styles.playerRating}>{p.rating}★</span>
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
              
              <div className="form-group">
                <label className="form-label">Skill Rating</label>
                <div className={styles.ratingSelect} style={{ justifyContent: 'center' }}>
                  <div className={styles.starWrapper}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        className={styles.starBtn}
                        onClick={() => setRating(star)}
                      >
                        <Star
                          size={20}
                          className={star <= rating ? styles.filledStar : styles.emptyStar}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setName('');
                    setRating(3);
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
    </div>
  );
}
