'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { backend, familyAction, familyInvitations } from '../lib/api';
import type { Member } from '../lib/types';

export function FamilyAccess({ members, userId, refresh }: { members: Member[]; userId: string; refresh: () => Promise<void> }) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [existing, setExisting] = useState(false);
  const [pending, setPending] = useState<{id:string; email:string; display_name:string; role:string}[]>([]);
  async function refreshPending() { setPending(await familyInvitations('list_family_invitations')); }
  useEffect(() => { void refreshPending().catch(() => setMessage('Could not load pending invitations.')); }, []);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { if (existing) { await familyAction('add_family_user', { p_email: email.trim(), p_name: name.trim(), p_role: role }); await refresh(); } else { await backend('invite', JSON.stringify({ email: email.trim(), name: name.trim(), role }), { 'Content-Type': 'application/json' }); await refreshPending(); } setName(''); setEmail(''); setRole('viewer'); setMessage(existing ? 'Family member added.' : 'Invitation sent. They can use the email link to set their password.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add this member.'); }
    finally { setBusy(false); }
  }
  async function change(member: Member, next: string) {
    setBusy(true); setMessage('');
    try { await familyAction('set_family_user_role', { p_member: member.id, p_role: next }); await refresh(); setMessage(`Updated access for ${member.display_name}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not change access.'); }
    finally { setBusy(false); }
  }
  async function cancel(id:string) { setBusy(true); setMessage(''); try { await familyInvitations('cancel_family_invitation', {p_id:id}); await refreshPending(); setMessage('Invitation cancelled.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not cancel invitation.'); } finally { setBusy(false); } }
  return <><div className="inner-heading"><div className="eyebrow">YOUR FAMILY / ACCESS</div><h1>Family access<span className="period">.</span></h1><p className="subtitle">Manage who can access your family’s records.</p></div>
    <div className="family-access-layout"><section className="family-access-panel"><div className="eyebrow muted">FAMILY MEMBERS</div><h2>People and roles</h2><p className="section-description">Admins can manage family access and all reports. Viewers can see their own records.</p><div className="family-access-list">{members.map(member => <div className="family-access-row" key={member.id}><div><strong>{member.display_name}</strong>{member.user_id === userId && <small>Your account</small>}</div><label><span className="sr-only">Role for {member.display_name}</span><select value={member.role === 'member' ? 'viewer' : member.role} disabled={busy || member.user_id === userId} onChange={event => void change(member, event.target.value)}><option value="admin">Admin</option><option value="viewer">Viewer</option></select></label></div>)}</div><p className="journal-footnote">You can’t change your own role.</p></section>
    <section className="family-access-panel"><div className="eyebrow muted">ADD A MEMBER</div><h2>Bring family together</h2><p className="section-description">{existing ? 'Link an existing, confirmed account to your family.' : 'Send an invitation so they can set their own password.'}</p><form className="family-access-form" onSubmit={add}><label className="react-field">NAME<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required /></label><label className="react-field">EMAIL<input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label><label className="react-field">ROLE<select value={role} onChange={event => setRole(event.target.value)}><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><button className="upload-button" disabled={busy}>{busy ? 'Saving…' : existing ? 'Add existing account' : 'Send invitation'}</button><button type="button" className="text-link plain-button" onClick={() => {setExisting(!existing);setMessage('');}}>{existing ? 'Invite a new account instead' : 'Already has an account?'}</button></form>{pending.length > 0 && <div className="family-pending"><div className="eyebrow muted">PENDING INVITATIONS</div>{pending.map(item => <div className="family-access-row" key={item.id}><div><strong>{item.display_name}</strong><small>{item.email} · {item.role}</small></div><button className="text-link plain-button" disabled={busy} onClick={() => void cancel(item.id)}>Cancel</button></div>)}</div>}</section></div><p className="react-main-message" role="status" aria-live="polite">{message}</p></>;
}
