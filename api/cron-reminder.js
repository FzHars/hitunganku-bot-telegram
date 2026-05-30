const supabase = require('../config/database');
const axios = require('axios');
const logger = require('../utils/logger');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

async function sendTelegramMessage(chatId, text) {
  const { data } = await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  });
  return data;
}

async function getTelegramId(userId) {
  const { data } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('id', userId)
    .single();
  return data?.telegram_id;
}

module.exports = async (req, res) => {
  try {
    const now = new Date().toISOString();

    const { data: reminders, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('is_sent', false)
      .eq('is_active', true)
      .lte('remind_at', now)
      .limit(10);

    if (error) throw error;

    if (!reminders || reminders.length === 0) {
      return res.status(200).json({ status: 'ok', sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const reminder of reminders) {
      try {
        const telegramId = await getTelegramId(reminder.user_id);
        if (!telegramId) {
          logger.warn('Reminder: user not found', { user_id: reminder.user_id });
          continue;
        }

        await sendTelegramMessage(
          telegramId,
          `Pengingat!\n${reminder.reminder_text}`
        );

        await supabase
          .from('reminders')
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq('id', reminder.id);

        sent++;
      } catch (err) {
        failed++;
        logger.error('Reminder send failed', {
          reminder_id: reminder.id,
          error: err.message,
        });
      }
    }

    logger.info('Cron reminder processed', { sent, failed, total: reminders.length });

    return res.status(200).json({
      status: 'ok',
      processed: reminders.length,
      sent,
      failed,
    });
  } catch (err) {
    logger.error('Cron reminder error', { error: err.message });
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
