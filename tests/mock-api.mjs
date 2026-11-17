// In-memory stand-in for the Supabase REST endpoints the app calls, with the same
// uniqueness and date rules as supabase/schema.sql. Used only by tests/e2e.mjs.
import { randomUUID } from 'node:crypto';

export function createMockApi({ challenges, failCheckins = () => false }) {
  const participants = [];
  const checkins = [];

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const eq = (q, k) => (q.get(k) || '').replace(/^eq\./, '');

  return async function handle(req, res, url) {
    const path = url.pathname.replace('/rest/v1', '');
    const q = url.searchParams;
    let body = '';
    for await (const c of req) body += c;
    const data = body ? JSON.parse(body) : null;

    if (path === '/challenges' && req.method === 'GET') {
      return json(res, 200, challenges.filter((c) => c.category === eq(q, 'category') && (!q.get('slug') || c.slug === eq(q, 'slug'))));
    }
    if (path === '/participants' && req.method === 'GET') {
      const rows = participants
        .filter((p) => p.challenge_id === eq(q, 'challenge_id'))
        .map((p) => ({ ...p, checkins: checkins.filter((c) => c.participant_id === p.id).map((c) => ({ date: c.date })) }));
      return json(res, 200, rows);
    }
    if (path === '/participants' && req.method === 'POST') {
      if (participants.some((p) => p.challenge_id === data.challenge_id && p.name.toLowerCase() === data.name.toLowerCase())) {
        return json(res, 409, { code: '23505' });
      }
      const row = { id: randomUUID(), challenge_id: data.challenge_id, name: data.name, created_at: new Date().toISOString() };
      participants.push(row);
      return json(res, 201, [row]);
    }
    if (path === '/checkins' && req.method === 'POST') {
      if (failCheckins()) return json(res, 500, { message: 'boom' });
      const p = participants.find((x) => x.id === data.participant_id);
      const c = p && challenges.find((x) => x.id === p.challenge_id);
      const ok = c && ((data.date >= c.start_date && data.date <= c.end_date) || data.date === c.bonus_date);
      if (!ok) return json(res, 403, { code: '42501' });
      if (!checkins.some((x) => x.participant_id === data.participant_id && x.date === data.date)) checkins.push({ ...data });
      return json(res, 201);
    }
    if (path === '/checkins' && req.method === 'DELETE') {
      if (failCheckins()) return json(res, 500, { message: 'boom' });
      const i = checkins.findIndex((x) => x.participant_id === eq(q, 'participant_id') && x.date === eq(q, 'date'));
      if (i >= 0) checkins.splice(i, 1);
      return json(res, 204);
    }
    return json(res, 404, { message: 'no route' });
  };
}
