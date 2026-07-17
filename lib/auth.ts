'use client';

// Simple client-side utility for Admin Auth State

export function getAdminPin(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('shuttlesync_admin_pin') || '';
}

export function setAdminPin(pin: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shuttlesync_admin_pin', pin);
  window.dispatchEvent(new Event('shuttlesync_auth_change'));
}

export function clearAdminPin(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('shuttlesync_admin_pin');
  window.dispatchEvent(new Event('shuttlesync_auth_change'));
}

export async function verifyPinOnServer(pin: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    return res.ok;
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
}

// Return headers containing the x-admin-pin
export function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-admin-pin': getAdminPin()
  };
}
