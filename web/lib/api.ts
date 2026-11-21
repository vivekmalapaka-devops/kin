import type { Config, Session } from './types';

const KEY = 'kin.session';
let config: Config;
let session: Session | null = null;
let refreshing: Promise<void> | null = null;

export async function setup() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Start the Python backend on port 8787 first.');
  config = await response.json();
  try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { session = null; }
  return config;
}
function store(value: Session) {
  session = { ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
  sessionStorage.setItem(KEY, JSON.stringify(session));
}
export async function signIn(email: string, password: string) {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error('Sign-in failed. Check your email and password.');
  const value: Session = await response.json(); store(value); return value.user!;
}
export async function finishInvitation(invite: Session, password: string) {
  const headers = { apikey: config.key, Authorization: `Bearer ${invite.access_token}`, 'Content-Type': 'application/json' };
  const passwordResponse = await fetch(`${config.url}/auth/v1/user`, { method: 'PUT', headers, body: JSON.stringify({ password }) });
  if (!passwordResponse.ok) throw new Error('Could not set your password. The link may have expired; request a new invitation.');
  const claim = await fetch(`${config.url}/rest/v1/rpc/accept_family_invitation`, { method: 'POST', headers, body: '{}' });
  if (!claim.ok) throw new Error('Could not join the family. The invitation may have expired; contact your family admin.');
  store(invite);
}
async function accessToken() {
  if (!session) throw new Error('Please sign in again.');
  if ((session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
    if (!refreshing) {
      const refresh = session.refresh_token;
      refreshing = (async () => {
        const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) });
        if (!response.ok) { session = null; sessionStorage.removeItem(KEY); throw new Error('Your session expired. Please sign in again.'); }
        const value = await response.json();
        if (!session || session.refresh_token !== refresh) throw new Error('Please sign in again.');
        store(value);
      })().finally(() => { refreshing = null; });
    }
    await refreshing;
  }
  if (!session) throw new Error('Please sign in again.');
  return session.access_token;
}
export async function restore() {
  if (!session?.access_token || !session.refresh_token) return null;
  try { return await query<{ id: string }>('/auth/v1/user'); }
  catch { session = null; sessionStorage.removeItem(KEY); return null; }
}
export async function query<T>(path: string): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${config.url}${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load your records. Please try again.');
  return response.json();
}
export async function familyAction(action: 'add_family_user' | 'set_family_user_role', body: Record<string, string>) {
  const token = await accessToken();
  const response = await fetch(`${config.url}/rest/v1/rpc/${action}`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const known = ['No confirmed account found for this email', 'Account already belongs to a family', 'You cannot change your own role', 'Admin access required', 'Family member not found'];
    throw new Error(known.includes(error.message) ? error.message : 'Could not update family access. Please try again.');
  }
}
export async function familyInvitations(action: 'list_family_invitations' | 'cancel_family_invitation', body: Record<string,string> = {}) {
  const token = await accessToken();
  const response = await fetch(`${config.url}/rest/v1/rpc/${action}`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('Could not update invitations. Please try again.');
  return response.status === 204 ? null : response.json();
}
export async function backend<T>(action: 'reports' | 'confirm' | 'invite', body: BodyInit, headers: Record<string,string>): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`/api/${action}`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${token}` }, body });
  if (!response.ok) { let error = 'The request failed.'; try { error = (await response.json()).error || error; } catch {} throw new Error(error); }
  return response.json();
}
export async function getPdf(path: string) {
  const token = await accessToken();
  const response = await fetch(`${config.url}/storage/v1/object/authenticated/blood-reports/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: config.key, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Could not open the original PDF.');
  return response.blob();
}
export function signOut() {
  const token = session?.access_token; session = null; sessionStorage.removeItem(KEY);
  if (token) void fetch(`${config.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${token}` } }).catch(() => {});
}
export function dateLabel(value: string | null) { if (!value) return 'Date not available'; return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
