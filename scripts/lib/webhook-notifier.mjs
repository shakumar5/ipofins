// scripts/lib/webhook-notifier.mjs

/**
 * Send alert notification via webhook (Discord or Telegram).
 * Reads URL from ALERT_WEBHOOK_URL environment variable.
 *
 * @param {Object} payload
 * @param {string} payload.title - Alert title
 * @param {string} payload.message - Alert message body
 * @param {'error'|'warning'|'info'} payload.severity - Alert level
 * @param {string} [payload.source] - Source that triggered the alert
 * @returns {Promise<boolean>} Whether the notification was sent
 */
export async function sendAlert(payload) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(`  ⚠️ [Webhook] ALERT_WEBHOOK_URL not set. Skipping notification.`);
    return false;
  }

  const timestamp = new Date().toISOString();
  const body = formatWebhookBody(webhookUrl, { ...payload, timestamp });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.log(`  ⚠️ [Webhook] Failed to send alert: HTTP ${response.status}`);
      return false;
    }

    console.log(`  📨 [Webhook] Alert sent: ${payload.title}`);
    return true;
  } catch (error) {
    console.log(`  ⚠️ [Webhook] Error sending alert: ${error.message}`);
    return false;
  }
}

/**
 * Format webhook body based on URL (Discord vs Telegram).
 *
 * @param {string} url - The webhook URL
 * @param {Object} payload - The alert payload with timestamp
 * @returns {Object} Formatted body for the target platform
 */
function formatWebhookBody(url, payload) {
  if (url.includes('discord.com')) {
    return {
      embeds: [{
        title: `${severityEmoji(payload.severity)} ${payload.title}`,
        description: payload.message,
        color: severityColor(payload.severity),
        footer: { text: `IPOfins Pipeline • ${payload.timestamp}` },
        fields: payload.source ? [{ name: 'Source', value: payload.source, inline: true }] : [],
      }],
    };
  }

  // Default: Telegram format
  return {
    text: `${severityEmoji(payload.severity)} *${payload.title}*\n\n${payload.message}\n\n_Source: ${payload.source || 'Pipeline'} • ${payload.timestamp}_`,
    parse_mode: 'Markdown',
  };
}

/**
 * Map severity level to an emoji for display.
 *
 * @param {'error'|'warning'|'info'} severity
 * @returns {string} Emoji character
 */
function severityEmoji(severity) {
  switch (severity) {
    case 'error': return '🚨';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
}

/**
 * Map severity level to a Discord embed color.
 *
 * @param {'error'|'warning'|'info'} severity
 * @returns {number} Color as integer
 */
function severityColor(severity) {
  switch (severity) {
    case 'error': return 0xff0000;
    case 'warning': return 0xffaa00;
    default: return 0x0099ff;
  }
}
