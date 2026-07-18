'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, Users, Flame, LayoutDashboard, Lock, Unlock, Sun, Moon } from 'lucide-react';
import { getAdminPin, setAdminPin, clearAdminPin, verifyPinOnServer } from '../lib/auth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import styles from './Navbar.module.css';

export default function Navbar() {
  const pathname = usePathname();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showPrompt, setShowPrompt] = useState(false);
  const [inputPin, setInputPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // Set initial admin state on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(getAdminPin() !== '');

    // Theme Check (Exclusive Dark Mode)
    document.documentElement.setAttribute('data-theme', 'dark');

    // Listen for auth changes
    const handleAuthChange = () => {
      setIsAdmin(getAdminPin() !== '');
    };
    window.addEventListener('shuttlesync_auth_change', handleAuthChange);
    return () => {
      window.removeEventListener('shuttlesync_auth_change', handleAuthChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('shuttlesync_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleToggleLock = async () => {
    if (isAdmin) {
      const confirmed = await confirm({
        title: 'Lock Admin Mode',
        message: 'Are you sure you want to lock Admin Mode and return to Player view?',
        confirmText: 'Lock Mode',
        cancelText: 'Cancel'
      });
      if (confirmed) {
        clearAdminPin();
        showToast('Admin Mode Locked.', 'info');
      }
    } else {
      setShowPrompt(true);
      setInputPin('');
      setErrorMsg('');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsVerifying(true);
    try {
      const isValid = await verifyPinOnServer(inputPin);
      if (isValid) {
        setAdminPin(inputPin);
        setShowPrompt(false);
        showToast('Admin Mode Unlocked!', 'success');
      } else {
        setErrorMsg('Incorrect Admin PIN.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error verifying PIN.');
    } finally {
      setIsVerifying(false);
    }
  };

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/players', label: 'Players', icon: Users },
    { href: '/tournaments', label: 'Tournaments', icon: Trophy },
    { href: '/games', label: 'Social Play', icon: Flame },
  ];

  return (
    <>
      {/* Header Bar */}
      <header className={styles.header}>
        <div className={styles.container}>
          {/* Logo */}
          <Link href="/" className={styles.logo}>
            <img src="/icons/icon-192x192.png" alt="ShuttleSync Logo" className={styles.logoImage} />
            <span>Shuttle<span className={styles.logoAccent}>Sync</span></span>
          </Link>
          
          {/* Desktop Navigation Links */}
          <nav className={styles.desktopNav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.active : ''}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Top-Right Controls */}
          <div className={styles.controls}>
            {/* Theme Toggle removed for exclusive dark mode */}

            {/* Lock/Unlock Toggle */}
            <button
              onClick={handleToggleLock}
              className={`${styles.lockBtn} ${isAdmin ? styles.unlocked : styles.locked}`}
              aria-label={isAdmin ? 'Lock Admin Mode' : 'Unlock Admin Mode'}
            >
              {isAdmin ? <Unlock size={16} /> : <Lock size={16} />}
              <span className={styles.lockText}>{isAdmin ? 'Admin' : 'Player'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className={styles.mobileBottomNav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileNavLink} ${isActive ? styles.mobileActive : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Admin PIN Prompt Modal */}
      {showPrompt && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modal} glass`}>
            <h3>Unlock Admin Mode</h3>
            <form onSubmit={handleVerify} className={styles.promptForm}>
              <input
                type="password"
                placeholder="Enter PIN"
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value)}
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25em' }}
                maxLength={8}
                required
                autoFocus
              />
              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
              
              <div className={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => setShowPrompt(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={isVerifying}
                >
                  {isVerifying ? <span className="btn-spinner"></span> : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
