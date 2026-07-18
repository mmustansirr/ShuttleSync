'use client';

import { Sparkles, Activity } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';

// ============================================================================
// ORIGINAL SOCIAL PLAY PAGE IMPLEMENTATION
// (Temporarily commented out to focus development on the Tournament section)
// ============================================================================
/*
import { useState, useEffect } from 'react';
import { Flame, Check, Play, CheckCircle, RefreshCcw, LayoutDashboard, Clock } from 'lucide-react';
import { Player, SocialSession, SocialMatch } from '../../lib/db';
import { getAdminPin, getAuthHeaders } from '../../lib/auth';

export default function SocialPlayPageOriginal() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<SocialSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourt, setSelectedCourt] = useState('Court 1');
  const [gameType, setGameType] = useState<'singles' | 'doubles'>('singles');
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);

  // Tab views
  const [activeTab, setActiveTab] = useState<'checkin' | 'queue' | 'history'>('queue'); // Default to queue for players!

  // Manual score entry
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const [scoreSet1T1, setScoreSet1T1] = useState(0);
  const [scoreSet1T2, setScoreSet1T2] = useState(0);
  const [scoreSet2T1, setScoreSet2T1] = useState(0);
  const [scoreSet2T2, setScoreSet2T2] = useState(0);

  useEffect(() => {
    fetchPlayersAndSession();
    
    // Auth state sync
    const checkAdmin = () => {
      const isA = getAdminPin() !== '';
      setIsAdmin(isA);
      // If player, default to Queue. If Admin, default to Check-in.
      setActiveTab(isA ? 'checkin' : 'queue');
    };
    
    checkAdmin();
    window.addEventListener('shuttlesync_auth_change', checkAdmin);

    const interval = setInterval(fetchSessionOnly, 4000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('shuttlesync_auth_change', checkAdmin);
    };
  }, []);

  async function fetchPlayersAndSession() {
    try {
      const [resP, resS] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/games')
      ]);
      if (resP.ok) setPlayers(await resP.json());
      if (resS.ok) setSession(await resS.json());
    } catch (err) {
      console.error('Error fetching social play data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSessionOnly() {
    try {
      const resS = await fetch('/api/games');
      if (resS.ok) setSession(await resS.json());
    } catch (err) {
      console.error('Error polling session state:', err);
    }
  }

  const handleCheckInToggle = async (playerId: string) => {
    if (!session || !isAdmin) return;
    const isCheckedIn = session.activePlayers.includes(playerId);
    
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: isCheckedIn ? 'checkOut' : 'checkIn',
          playerId,
          playerIds: [playerId]
        })
      });
      if (res.ok) {
        setSession(await res.json());
      }
    } catch (err) {
      console.error('Error toggling check-in:', err);
    }
  };

  const handleSuggestMatch = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'suggestMatch',
          court: selectedCourt,
          gameType
        })
      });

      if (res.ok) {
        setSession(await res.json());
        setActiveTab('queue');
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (error) {
      console.error('Error suggesting match:', error);
    }
  };

  const handleStartMatch = async (matchId: string) => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'updateMatch',
          matchId,
          status: 'live'
        })
      });
      if (res.ok) {
        setSession(await res.json());
      }
    } catch (err) {
      console.error('Error starting match:', err);
    }
  };

  const openScoreModal = (matchId: string) => {
    if (!isAdmin) return;
    setScoreMatchId(matchId);
    setScoreSet1T1(0);
    setScoreSet1T2(0);
    setScoreSet2T1(0);
    setScoreSet2T2(0);
  };

  const handleCompleteMatch = async () => {
    if (!scoreMatchId || !isAdmin) return;

    if (scoreSet1T1 === 0 && scoreSet1T2 === 0) {
      alert('Enter set scores.');
      return;
    }

    const score = [
      { team1: scoreSet1T1, team2: scoreSet1T2 }
    ];

    if (scoreSet2T1 > 0 || scoreSet2T2 > 0) {
      score.push({ team1: scoreSet2T1, team2: scoreSet2T2 });
    }

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'updateMatch',
          matchId: scoreMatchId,
          status: 'completed',
          score
        })
      });

      if (res.ok) {
        setSession(await res.json());
        setScoreMatchId(null);
      }
    } catch (err) {
      console.error('Error completing match:', err);
    }
  };

  const handleResetSession = async () => {
    if (!isAdmin) return;
    if (!confirm('Reset session?')) return;
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'reset' })
      });
      if (res.ok) {
        setSession(await res.json());
      }
    } catch (err) {
      console.error('Error resetting session:', err);
    }
  };

  const getPlayerName = (id: string) => {
    return players.find(p => p.id === id)?.name || 'Unknown';
  };

  const getPlayerNamesString = (ids: string[]) => {
    return ids.map(id => getPlayerName(id)).join(' & ');
  };

  // Render logic...
}
*/

// ============================================================================
// MAIN SOCIAL PLAY PLACEHOLDER SCREEN
// ============================================================================
export default function SocialPlayPage() {
  return (
    <div className={styles.placeholderContainer}>
      <div className={styles.shuttleGlowContainer}>
        <div className={styles.glowRing}></div>
        <img src="/icons/icon-192x192.png" alt="ShuttleSync Logo" className={styles.logoImage} />
      </div>
      
      <div className={`${styles.placeholderCard} glass animate-slide`}>
        <span className={styles.placeholderSubtitle}>Coming Soon ⚡</span>
        <h2 className={styles.placeholderTitle}>Social Pairing Lab</h2>
        
        <p className={styles.placeholderDescription}>
          I am building smart matchmaking tools to pair players for casual social games automatically! This feature is under construction and will be fully ready in a future update. 🏸
        </p>

        <Link href="/tournaments" className={`btn btn-primary ${styles.ctaBtn}`} style={{ marginBottom: '12px' }}>
          Go to Tournaments
        </Link>

        <div className={styles.creditsSection}>
          Handcrafted with ❤️ by <strong>Mustansir</strong>.
          <br />
          Love using the app? Have feature ideas or bug reports?
          <br />
          Let's talk! ✉️ <a href="mailto:mustansirpratabgad@gmail.com" className={styles.creditsLink}>mustansirpratabgad@gmail.com</a>
        </div>
      </div>
    </div>
  );
}
