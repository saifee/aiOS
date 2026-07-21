/** Owner notifications: Slack, Telegram (email/WhatsApp reuse channel senders; push via FCM). */
export async function notifySlack(channel: string, text: string) {
  if (!process.env.SLACK_BOT_TOKEN) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  });
}

export async function notifyTelegram(chatId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}
