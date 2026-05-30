const supabase = require('../config/database');
const { validateDate } = require('../utils/validators');
const logger = require('../utils/logger');
const { parse } = require('date-fns');
const { addDays, addHours, setHours, setMinutes } = require('date-fns');

const WIB_OFFSET = 7 * 60 * 60 * 1000;

function parseReminderTime(text) {
  const now = new Date();
  const lower = text.toLowerCase();

  let targetDate = new Date(now);
  let hour = 9;
  let minute = 0;

  const jamMatch = lower.match(/jam (\d{1,2})(?:[:.](\d{2}))?/);
  if (jamMatch) {
    hour = parseInt(jamMatch[1]);
    minute = jamMatch[2] ? parseInt(jamMatch[2]) : 0;
  }

  if (lower.includes('besok')) {
    targetDate = addDays(targetDate, 1);
  } else if (lower.includes('lusa')) {
    targetDate = addDays(targetDate, 2);
  } else if (lower.includes('hari ini')) {
  }

  const remindAt = new Date(
    Date.UTC(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      hour - 7,
      minute,
      0
    )
  );

  return remindAt;
}

function extractReminderText(text) {
  const patterns = [
    /ingatkan?\s+(?:saya\s+)?(?:untuk\s+)?(.*?)(?:\s+besok|\s+lusa|\s+hari ini|\s+jam\s+\d)/i,
    /ingatkan?\s+(?:saya\s+)?(?:untuk\s+)?(.*)/i,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match && match[1].trim()) return match[1].trim();
  }
  return text.replace(/^(ingatkan?\s+saya\s+)/i, '').trim();
}

async function createReminder(ctx) {
  const user = ctx.state.user;
  if (user.level < 3) {
    return ctx.reply('Fitur reminder hanya untuk Level 3+. Upgrade subscription yuk!');
  }

  const text = ctx.message.text.replace(/^\/(ingatkan|reminder)/, '').trim();
  if (!text) {
    return ctx.reply('Contoh: `/ingatkan besok jam 10 bayar patungan 20rb`');
  }

  const remindAt = parseReminderTime(text);
  const validation = validateDate(remindAt);
  if (!validation.valid) return ctx.reply(validation.error);

  const reminderText = extractReminderText(text) || text;

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: user.id,
      reminder_text: reminderText,
      remind_at: remindAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create reminder', { user_id: user.id, error: error.message });
    return ctx.reply('Gagal membuat reminder.');
  }

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'CREATE',
    table_name: 'reminders',
    record_id: data.id,
    new_value: { reminder_text: reminderText, remind_at: remindAt.toISOString() },
  });

  const wibTime = new Date(remindAt.getTime() + WIB_OFFSET);
  const timeStr = wibTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return ctx.reply(`Reminder dibuat!\n${reminderText}\nPada: ${timeStr} WIB`);
}

async function listReminders(ctx) {
  const user = ctx.state.user;

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_sent', false)
    .eq('is_active', true)
    .order('remind_at', { ascending: true });

  if (error) return ctx.reply('Gagal mengambil reminder.');

  if (!reminders || reminders.length === 0) {
    return ctx.reply('Belum ada reminder aktif.');
  }

  const { Markup } = require('telegraf');
  const lines = reminders.map((r, i) => {
    const wib = new Date(new Date(r.remind_at).getTime() + WIB_OFFSET);
    const timeStr = wib.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    return `${i + 1}. ${r.reminder_text} — ${timeStr} WIB`;
  });

  const buttons = reminders.map((r) => [
    Markup.button.callback(`Hapus: ${r.reminder_text.substring(0, 20)}`, `hapus_reminder_${r.id}`),
  ]);

  return ctx.reply(
    `Reminder aktif:\n${lines.join('\n')}`,
    Markup.inlineKeyboard(buttons)
  );
}

async function deleteReminder(ctx, reminderId) {
  const user = ctx.state.user;

  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', reminderId)
    .eq('user_id', user.id);

  if (error) return ctx.reply('Gagal menghapus reminder.');

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'DELETE',
    table_name: 'reminders',
    record_id: reminderId,
  });

  logger.info('Reminder deleted', { user_id: user.id, reminder_id: reminderId });
  return ctx.reply('Reminder berhasil dihapus.');
}

module.exports = { createReminder, listReminders, deleteReminder };
