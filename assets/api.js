// Thin PostgREST client for Supabase. Only the public key is used (anon role);
// every rule is enforced by RLS in supabase/schema.sql.
import { SUPABASE_URL, SUPABASE_KEY } from '/config.js';

const BASE = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

export class ApiError extends Error {
  constructor(status, body) {
    super(`Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const enc = encodeURIComponent;

export function listChallenges(category) {
  return request(`/challenges?category=eq.${enc(category)}&select=*`);
}

export async function getChallenge(category, slug) {
  const rows = await request(`/challenges?category=eq.${enc(category)}&slug=eq.${enc(slug)}&select=*`);
  return rows[0] || null;
}

/** Everyone in the challenge with their check-in dates, in join order. */
export async function getParticipants(challengeId) {
  const rows = await request(
    `/participants?challenge_id=eq.${enc(challengeId)}&select=id,name,created_at,checkins(date)&order=created_at.asc`
  );
  return rows.map((p) => ({ id: p.id, name: p.name, dates: new Set(p.checkins.map((c) => c.date)) }));
}

/** Returns the new participant, or null if the name is already taken (409). */
export async function addParticipant(challengeId, name) {
  try {
    const rows = await request('/participants', {
      method: 'POST',
      body: { challenge_id: challengeId, name },
      prefer: 'return=representation',
    });
    return rows[0];
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return null;
    throw e;
  }
}

/** Idempotent: checking a day that is already checked (e.g. from another device) is fine. */
export function addCheckin(participantId, date) {
  return request('/checkins?on_conflict=participant_id,date', {
    method: 'POST',
    body: { participant_id: participantId, date },
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
}

export function removeCheckin(participantId, date) {
  return request(`/checkins?participant_id=eq.${enc(participantId)}&date=eq.${enc(date)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}
