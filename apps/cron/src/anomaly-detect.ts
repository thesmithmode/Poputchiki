import type postgres from "postgres";

const NEW_USER_ALERT_THRESHOLD = 50;

type Fetcher = (url: string, init?: RequestInit) => Promise<{ ok: boolean }>;

async function sendAdminAlert(text: string, fetcher: Fetcher = fetch): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_TG_CHAT_ID;
  if (!botToken || !chatId) return;
  await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function detectAnomalies(
  sql: ReturnType<typeof postgres>,
  fetcher?: Fetcher,
): Promise<void> {
  const [row] = await sql<[{ count: string }]>`
    SELECT COUNT(*) AS count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `;
  const newUsers = Number(row?.count ?? 0);

  if (newUsers > NEW_USER_ALERT_THRESHOLD) {
    console.log(
      JSON.stringify({
        msg: "anomaly_new_users_spike",
        new_users_24h: newUsers,
        threshold: NEW_USER_ALERT_THRESHOLD,
      }),
    );
    await sendAdminAlert(
      `⚠️ <b>Аномальный рост регистраций</b>\n\nЗа последние 24 часа зарегистрировалось <b>${newUsers}</b> новых пользователей (порог: ${NEW_USER_ALERT_THRESHOLD}).\n\nВозможный ban evasion или бот-атака. Проверьте <code>audit_log</code>.`,
      fetcher,
    ).catch((err: unknown) =>
      console.error(JSON.stringify({ msg: "anomaly_alert_send_error", error: String(err) })),
    );
  }
}
