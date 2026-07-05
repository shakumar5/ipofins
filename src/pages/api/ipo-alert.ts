import type { APIRoute } from 'astro';
import { requireDb } from '../../lib/db';
import { isValidAlertEmail, normalizeEmail, parseAlertTypes } from '../../lib/ipo-alerts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const ipoSlug = typeof body.ipoSlug === 'string' ? body.ipoSlug.trim() : '';
  const alertTypes = parseAlertTypes(body.alertTypes);

  if (!isValidAlertEmail(email)) {
    return json({ error: 'Valid email address required' }, 400);
  }
  if (!ipoSlug) {
    return json({ error: 'IPO slug required' }, 400);
  }

  try {
    const sql = requireDb();
    const ipoRows = await sql`SELECT id, name, status FROM ipos WHERE slug = ${ipoSlug} LIMIT 1`;
    const ipo = (ipoRows as { id: number; name: string; status: string }[])[0];
    if (!ipo) {
      return json({ error: 'IPO not found' }, 404);
    }

    if (ipo.status === 'listed' || ipo.status === 'withdrawn' || ipo.status === 'failed') {
      return json({ error: 'Alerts are not available for this IPO status' }, 400);
    }

    await sql`
      INSERT INTO ipo_alerts (email, ipo_id, alert_types, is_active)
      VALUES (${email}, ${ipo.id}, ${alertTypes}, TRUE)
      ON CONFLICT (email, ipo_id) DO UPDATE
        SET alert_types = EXCLUDED.alert_types,
            is_active = TRUE
    `;

    return json({ success: true, message: `You will receive alerts for ${ipo.name}.` });
  } catch (err) {
    console.error('[api/ipo-alert]', err);
    return json({ error: 'Unable to save alert subscription' }, 500);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
