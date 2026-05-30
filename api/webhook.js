const { Telegraf } = require('telegraf');
const rateLimit = require('telegraf-ratelimit');
const supabase = require('../config/database');
const { authMiddleware, handleFinanceCommand, listRecords, deleteRecord } = require('../handlers/command');
const { handleGuidedStart, handleGuidedInput, handleGuidedAction } = require('../handlers/message');
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

bot.action(/guided_.+/, (ctx) => handleGuidedAction(ctx));
bot.action(/detail_\d+/, async (ctx) => {
  const id = ctx.match[0].replace('detail_', '');
  const { data: record } = await require('../config/database')
    .from('finance_records')
    .select('*')
    .eq('id', id)
    .single();

  if (!record) return ctx.answerCbQuery('Data tidak ditemukan');

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
bot.action(/hapus_\d+/, async (ctx) => {
  const id = ctx.match[0].replace('hapus_', '');
  await deleteRecord(ctx, parseInt(id));
  ctx.answerCbQuery('Catatan dihapus');
});
bot.on('text', (ctx) => handleGuidedInput(ctx));

bot.command('start', async (ctx) => {
  const user = ctx.state.user;
  const { Markup } = require('telegraf');
  const welcome = `Halo ${user.full_name || 'Sobat'}!\n\n`
    + `Level kamu: ${user.level} (${featureMap[user.level] || '-'})\n`
    + `Status: ${user.status}\n\n`
    + `Apa yang mau dilakukan?`;

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
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    logger.error('Webhook error', { error: err.message });
    res.status(200).end();
  }
};
