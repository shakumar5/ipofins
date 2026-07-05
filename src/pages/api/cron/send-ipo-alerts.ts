import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import { eventsForIpo, type IPOAlertEvent, type IPOAlertIpoRow } from '../../../lib/ipo-alerts';
import { sendIPOAlertEmail } from '../../../lib/ipo-alert-email';

export const prerender = false;

/** Cron endpoint — send pending IPO alert emails. Protect with CRON_SECRET. */
export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const sql = requireDb();
    const rows = (await sql`
      SELECT
        a.id,
        a.email,
        a.alert_types,
        a.unsubscribe_token,
        i.id AS ipo_id,
        i.slug,
        i.name,
        i.status,
        i.price_min,
        i.price_max,
        i.open_date,
        i.close_date,
        i.listing_date
      FROM ipo_alerts a
      JOIN ipos i ON i.id = a.ipo_id
      WHERE a.is_active = TRUE
    `) as Record<string, unknown>[];

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const alertTypes = Array.isArray(row.alert_types) ? (row.alert_types as string[]) : [];
      const ipo: IPOAlertIpoRow = {
        id: Number(row.ipo_id),
        slug: String(row.slug),
        name: String(row.name),
        status: String(row.status),
        price_min: row.price_min != null ? Number(row.price_min) : null,
        price_max: row.price_max != null ? Number(row.price_max) : null,
        open_date: row.open_date ? String(row.open_date) : null,
        close_date: row.close_date ? String(row.close_date) : null,
        listing_date: row.listing_date ? String(row.listing_date) : null,
      };

      const dueEvents = eventsForIpo(ipo).filter((e) => alertTypes.includes(e));

      for (const event of dueEvents) {
        const already = (await sql`
          SELECT 1 FROM ipo_alert_log
          WHERE alert_id = ${row.id}::uuid AND event_type = ${event}
          LIMIT 1
        `) as unknown[];
        if (already.length) {
          skipped++;
          continue;
        }

        const result = await sendIPOAlertEmail(
          String(row.email),
          event as IPOAlertEvent,
          {
            name: ipo.name,
            slug: ipo.slug,
            priceMin: ipo.price_min,
            priceMax: ipo.price_max,
            openDate: ipo.open_date,
            closeDate: ipo.close_date,
            listingDate: ipo.listing_date,
          },
          String(row.unsubscribe_token),
        );

        if (!result.ok) {
          errors.push(`${row.email}/${ipo.slug}/${event}: ${result.error}`);
          continue;
        }

        await sql`
          INSERT INTO ipo_alert_log (alert_id, event_type)
          VALUES (${row.id}::uuid, ${event})
          ON CONFLICT (alert_id, event_type) DO NOTHING
        `;
        await sql`
          UPDATE ipo_alerts SET last_sent_at = NOW() WHERE id = ${row.id}::uuid
        `;
        sent++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped, errors: errors.slice(0, 10) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[api/cron/send-ipo-alerts]', err);
    return new Response(JSON.stringify({ error: 'Cron failed' }), { status: 500 });
  }
};

function isAuthorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  if (request.headers.get('x-cron-secret') === secret) return true;
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured
  return false;
}
