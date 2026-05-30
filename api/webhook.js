const { Telegraf } = require('telegraf');
const rateLimit = require('telegraf-ratelimit');
const supabase = require('../config/database');
const { authMiddleware, handleFinanceCommand, addFinanceRecord, listRecords, deleteRecord } = require('../handlers/command');
const { handleGuidedStart, handleGuidedInput, handleGuidedAction } = require('../handlers/message');
const { askGemini } = require('../utils/gemini');
const { checkQuota, incrementUsage } = require('../utils/quota');
const { createReminder, listReminders, deleteReminder } = require('../handlers/reminder');
const { handlePhoto, confirmReceipt } = require('../handlers/photo');
const { generateExcel } = require('../utils/formatter');
const logger = require('../utils/logger');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(rateLimit({ in: 3, out: 1, notification: 'Jangan spam, tunggu dulu ya!' }));
bot.use(authMiddleware);

const featureMap = {
  1: 'Manual catat + Excel',
  2: 'AI chat + Level 1',
  3: 'Reminder + Level 2',
  4: 'Scan struk + Level 3',
};

bot.command('keluar', (ctx) => handleFinanceCommand(ctx, '/keluar'));
bot.command('masuk', (ctx) => handleFinanceCommand(ctx, '/masuk'));
bot.command('catat', (ctx) => handleGuidedStart(ctx));
bot.command('list', (ctx) => listRecords(ctx));
bot.command('download', async (ctx) => {
  try {
    const buffer = await generateExcel(ctx.state.user.id);
    await ctx.replyWithDocument({ source: Buffer.from(buffer), filename: 'transaksi.xlsx' });
  } catch (err) {
    logger.error('Download failed', { user_id: ctx.state.user.id, error: err.message });
    ctx.reply('Gagal generate Excel.');
  }
});

bot.action('catat', (ctx) => handleGuidedStart(ctx));
bot.action('saldo', async (ctx) => {
  const user = ctx.state.user;
  const { data } = await require('../config/database')
    .from('finance_records')
    .select('type, amount')
    .eq('user_id', user.id)
    .eq('is_deleted', false);

  if (!data || data.length === 0) return ctx.reply('Belum ada transaksi.');

  const totalMasuk = data.filter(r => r.type === 'pemasukan').reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalKeluar = data.filter(r => r.type === 'pengeluaran').reduce((s, r) => s + parseFloat(r.amount), 0);

  return ctx.reply(
    `Saldo Kamu\n\nMasuk: Rp ${totalMasuk.toLocaleString('id-ID')}\nKeluar: Rp ${totalKeluar.toLocaleString('id-ID')}\nSaldo: Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}`
  );
});
bot.action('bantuan', (ctx) => {
  return ctx.reply(
    `Bantuan NekoFinance\n\n/start - Menu utama\n/keluar 50000 makan siang - Catat pengeluaran\n/masuk 100000 gaji - Catat pemasukan\n/catat - Catat pake tombol\n/catat_ai - Catat pake AI (Level 2+)\n/list - Lihat transaksi\n/download - Download Excel\n\nAda pertanyaan? Hubungi admin.`
  );
});
bot.action('catat', (ctx) => handleGuidedStart(ctx));
bot.action('saldo', async (ctx) => {
  const user = ctx.state.user;
  const { data: records } = await supabase
    .from('finance_records')
    .select('type, amount')
    .eq('user_id', user.id)
    .eq('is_deleted', false);

  if (!records || records.length === 0) return ctx.reply('Belum ada transaksi.');

  let masuk = 0, keluar = 0;
  for (const r of records) {
    if (r.type === 'pemasukan') masuk += parseFloat(r.amount);
    else keluar += parseFloat(r.amount);
  }
  const saldo = masuk - keluar;
  return ctx.reply(
    `Saldo kamu:\nPemasukan: Rp ${masuk.toLocaleString('id-ID')}\nPengeluaran: Rp ${keluar.toLocaleString('id-ID')}\nSaldo: Rp ${saldo.toLocaleString('id-ID')}`
  );
});
bot.action('bantuan', (ctx) => ctx.reply(
  'Perintah:\n/keluar 50000 makan siang - catat pengeluaran\n/masuk 100000 gaji - catat pemasukan\n/catat - input dengan tombol\n/catat_ai - input pakai AI\n/list - lihat catatan\n/download - export Excel\n/hapus - hapus catatan'
));

bot.action(/guided_.+/, (ctx) => handleGuidedAction(ctx));
bot.action(/detail_\d+/, async (ctx) => {
  const id = ctx.match[0].replace('detail_', '');
  const { data: record } = await require('../config/database')
    .from('finance_records')
    .select('*')
    .eq('id', id)
    .single();

  if (!record) return ctx.answerCbQuery('Data tidak ditemukan😔');

  const label = record.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran';
  return ctx.reply(
    `${label}\nRp ${parseFloat(record.amount).toLocaleString('id-ID')}\n${record.description}\n${new Date(record.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    { parse_mode: 'HTML' }
  );
});
bot.action('hapus_mode', async (ctx) => {
  const { Markup } = require('telegraf');
  const { data: records } = await require('../config/database')
    .from('finance_records')
    .select('id, amount, description')
    .eq('user_id', ctx.state.user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!records || records.length === 0) return ctx.reply('Tidak ada catatan.');

  const buttons = records.map((r) => [
    Markup.button.callback(`Hapus Rp${parseFloat(r.amount).toLocaleString('id-ID')}`, `hapus_${r.id}`),
  ]);

  return ctx.reply('Pilih catatan yang mau dihapus:', Markup.inlineKeyboard(buttons));
});
bot.command('reminder', (ctx) => createReminder(ctx));
bot.command('reminder_list', (ctx) => listReminders(ctx));
bot.action(/hapus_remind_\d+/, async (ctx) => {
  const id = ctx.match[0].replace('hapus_remind_', '');
  await deleteReminder(ctx, parseInt(id));
});

bot.command('ingatkan', (ctx) => createReminder(ctx));
bot.command('reminder_list', (ctx) => listReminders(ctx));
bot.action(/hapus_reminder_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  await deleteReminder(ctx, parseInt(id));
  ctx.answerCbQuery('Reminder dihapus');
});

bot.action(/hapus_\d+/, async (ctx) => {
  const id = ctx.match[0].replace('hapus_', '');
  await deleteRecord(ctx, parseInt(id));
  ctx.answerCbQuery('Catatan dihapus');
});
bot.on('text', (ctx) => handleGuidedInput(ctx));

bot.command('catat_ai', async (ctx) => {
  const user = ctx.state.user;
  if (user.level < 2) {
    return ctx.reply('Fitur AI hanya untuk Level 2+. Upgrade yuk!😄');
  }

  const quota = await checkQuota(user);
  if (!quota.allowed) return ctx.reply(quota.message);

  const text = ctx.message.text.replace('/catat_ai', '').trim();
  if (!text) {
    return ctx.reply('Contoh: `/catat_ai bro/sis catat gojek 30rb`');
  }

  try {
    const response = await askGemini(text);

    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch {
      return ctx.reply(`AI tidak bisa memahami input. Coba lagi.\n\nPesan AI: ${response}`);
    }

    if (!parsed.type || !parsed.amount || !parsed.description) {
      return ctx.reply('AI gagal mengekstrak data. Coba format lain.');
    }

    if (parsed.type !== 'pengeluaran' && parsed.type !== 'pemasukan') {
      return ctx.reply('Tipe transaksi harus pengeluaran atau pemasukan.');
    }

    const { validateAmount, validateDescription } = require('../utils/validators');
    const amountResult = validateAmount(parsed.amount);
    if (!amountResult.valid) return ctx.reply(amountResult.error);

    const descResult = validateDescription(parsed.description);
    if (!descResult.valid) return ctx.reply(descResult.error);

    await addFinanceRecord(user.id, parsed.type, amountResult.value, descResult.value, 'ai');
    await incrementUsage(user);

    const label = parsed.type === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
    return ctx.reply(`Dicatat via AI!\n${label}: Rp ${amountResult.value.toLocaleString('id-ID')}\n${descResult.value}\n\nSisa kuota AI hari ini: ${user.daily_ai_limit - user.ai_usage_today}/${user.daily_ai_limit}`);
  } catch (err) {
    logger.error('AI command failed', { user_id: user.id, error: err.message });
    return ctx.reply('Gagal memproses AI, coba lagi nanti.');
  }
});

bot.on('photo', (ctx) => handlePhoto(ctx));
bot.action('receipt_simpan', (ctx) => confirmReceipt(ctx));
bot.action('receipt_ulang', async (ctx) => {
  ctx.state.receiptData = null;
  ctx.state.photoBuffer = null;
  return ctx.editMessageText('Upload ulang foto struk.');
});
bot.action('receipt_batal', async (ctx) => {
  ctx.state.receiptData = null;
  ctx.state.photoBuffer = null;
  return ctx.editMessageText('Dibatalkan.');
});

bot.command('start', async (ctx) => {
  const user = ctx.state.user;
  const { Markup } = require('telegraf');
  const welcome = `Halo ${user.full_name || 'Sobat'}!\n\n`
    + `Level kamu: ${user.level} (${featureMap[user.level] || '-'})\n`
    + `Status: ${user.status}\n\n`
    + `Apa yang mau dilakukan?😸`;

  return ctx.reply(welcome, Markup.inlineKeyboard([
    [Markup.button.callback('Catat Transaksi', 'catat')],
    [Markup.button.callback('Lihat Saldo', 'saldo')],
    [Markup.button.callback('Bantuan', 'bantuan')],
  ]));
});

module.exports = async (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.ALLOWED_WEBHOOK_SECRET) {
    logger.warn('Unauthorized webhook request', { ip: req.socket.remoteAddress });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).end();
  } catch (err) {
    logger.error('Webhook error', { error: err.message, stack: err.stack });
    res.status(200).end();
  }
};
