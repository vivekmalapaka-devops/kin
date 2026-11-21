'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { finishInvitation, setup } from '../../lib/api';
import type { Session } from '../../lib/types';

const INVITE_KEY = 'kin.invitation';
export default function AcceptInvite() {
  const [invite, setInvite] = useState<Session | null>(null), [ready, setReady] = useState(false), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access = hash.get('access_token'), refresh = hash.get('refresh_token');
    let saved: Session | null = null;
    if (access && refresh && hash.get('type') === 'invite') {
      const expires = Number(hash.get('expires_in')) || 3600;
      saved = { access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + expires };
      sessionStorage.setItem(INVITE_KEY, JSON.stringify(saved));
    } else if (!window.location.hash) {
      try { saved = JSON.parse(sessionStorage.getItem(INVITE_KEY) || 'null'); } catch { saved = null; }
    }
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!saved || !saved.access_token || !saved.refresh_token || (saved.expires_at || 0) <= Date.now() / 1000) { sessionStorage.removeItem(INVITE_KEY); setMessage('This invitation link is invalid or expired. Please ask your family admin for a new invitation.'); }
    else setInvite(saved);
    setup().catch(() => setMessage('Could not connect to Kin. Please try again.')).finally(() => setReady(true));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!invite || !ready) return;
    if (password !== confirm) { setMessage('Passwords do not match.'); return; }
    setBusy(true); setMessage('');
    try { await finishInvitation(invite, password); sessionStorage.removeItem(INVITE_KEY); window.location.assign('/'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not accept this invitation.'); setBusy(false); }
  }
  return <main className="invite-page"><a href="/" className="brand"><span className="brand-mark">✳</span> kin<span className="brand-period">.</span></a><div className="invite-card"><div className="eyebrow">FAMILY INVITATION</div><h1>Welcome<br/><em>to Kin.</em></h1><p className="subtitle">Choose a password to join your family’s health record.</p>{invite && <form className="family-access-form" onSubmit={submit}><label className="react-field">PASSWORD<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="react-field">CONFIRM PASSWORD<input type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required /></label><button className="upload-button" disabled={!ready || busy}>{busy ? 'Setting up…' : 'Join your family'}</button></form>}<p className="react-main-message" role="status" aria-live="polite">{message}</p></div></main>;
}
