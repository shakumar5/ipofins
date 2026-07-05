import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import { siteUrl } from '../../../lib/ipo-alerts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return htmlPage('Missing unsubscribe link', 'This unsubscribe link is invalid.', false);
  }

  try {
    const sql = requireDb();
    const result = await sql`
      UPDATE ipo_alerts
      SET is_active = FALSE
      WHERE unsubscribe_token = ${token}::uuid
      RETURNING id
    `;
    const rows = result as { id: string }[];

    if (!rows.length) {
      return htmlPage('Link expired', 'This unsubscribe link is invalid or already used.', false);
    }

    return htmlPage(
      'Unsubscribed',
      'You will no longer receive email alerts for this IPO. You can re-subscribe anytime from the IPO page.',
      true,
    );
  } catch (err) {
    console.error('[api/ipo-alert/unsubscribe]', err);
    return htmlPage('Something went wrong', 'Please try again later or contact support.', false);
  }
};

function htmlPage(title: string, message: string, success: boolean): Response {
  const home = siteUrl();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — IPOFins</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{max-width:420px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center}
    h1{font-size:1.25rem;margin:0 0 12px}
    p{font-size:0.875rem;color:#64748b;line-height:1.5;margin:0 0 20px}
    a{color:#2563eb;text-decoration:none;font-weight:600}
    .ok{color:#16a34a}
  </style>
</head>
<body>
  <div class="card">
    <h1 class="${success ? 'ok' : ''}">${title}</h1>
    <p>${message}</p>
    <a href="${home}/ipo">← Back to IPOs</a>
  </div>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
