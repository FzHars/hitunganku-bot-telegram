const supabase = require('../config/database');
const { validateAmount, validateDescription } = require('../utils/validators');
const logger = require('../utils/logger');

const authMiddleware = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId || typeof userId !== 'number') {
    return ctx.reply('Akses Ditolak: ID Telegram tidak valid');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !user) {
    return ctx.reply('Akses Ditolak: ID Telegram tidak terdaftar');
  }

  ctx.state.user = user;
  return next();
};

async function addFinanceRecord(userId, type, amount, description, method = 'manual') {
  const { data, error } = await supabase
    .from('finance_records')
    .insert({
      user_id: userId,
      type,
      amount,
      description,
      created_by_method: method,
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'CREATE',
    table_name: 'finance_records',
    record_id: data.id,
    new_value: { type, amount, description, method },
  });

  logger.info('Finance record created', { user_id: userId, type, method });
  return data;
}

function parseFinanceCommand(text, command) {
  const input = text.replace(command, '').trim();
  const match = input.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  return { amount: match[1], description: match[2] };
}

const typeMap = { keluar: 'pengeluaran', masuk: 'pemasukan' };

async function handleFinanceCommand(ctx, command) {
  const parsed = parseFinanceCommand(ctx.message.text, command);
  if (!parsed) {
    return ctx.reply(`Format: \`${command} 50000 makan siang\``);
  }

  const amountResult = validateAmount(parsed.amount);
  if (!amountResult.valid) return ctx.reply(amountResult.error);

  const descResult = validateDescription(parsed.description);
  if (!descResult.valid) return ctx.reply(descResult.error);

  const type = typeMap[command.replace('/', '')];
  const user = ctx.state.user;

  try {
    await addFinanceRecord(user.id, type, amountResult.value, descResult.value);
    const label = type === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
    return ctx.reply(`${label} tercatat:\nRp ${amountResult.value.toLocaleString('id-ID')}\n${descResult.value}`);
  } catch (err) {
    logger.error('Failed to save finance record', { user_id: user.id, error: err.message });
    return ctx.reply('Gagal menyimpan, coba lagi.');
  }
}

async function listRecords(ctx, page = 0) {
  const limit = 5;
  const user = ctx.state.user;

  const { data: records, error } = await supabase
    .from('finance_records')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return ctx.reply('Gagal mengambil data.');

  if (!records || records.length === 0) {
    return ctx.reply('Belum ada catatan.');
  }

  const buttons = records.map((r) => {
    const label = `${r.type === 'pemasukan' ? 'Masuk' : 'Keluar'} Rp${parseFloat(r.amount).toLocaleString('id-ID')}`;
    return [Markup.button.callback(label, `detail_${r.id}`)];
  });

  buttons.push([Markup.button.callback('Hapus', 'hapus_mode')]);

  return ctx.reply('Daftar transaksi terbaru:', Markup.inlineKeyboard(buttons));
}

async function deleteRecord(ctx, recordId) {
  const user = ctx.state.user;

  const { error } = await supabase
    .from('finance_records')
    .update({ is_deleted: true })
    .eq('id', recordId)
    .eq('user_id', user.id);

  if (error) return ctx.reply('Gagal menghapus.');

  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'DELETE',
    table_name: 'finance_records',
    record_id: recordId,
    old_value: { is_deleted: false },
    new_value: { is_deleted: true },
  });

  logger.info('Record deleted', { user_id: user.id, record_id: recordId });
  return ctx.reply('Catatan berhasil dihapus.');
}

const { Markup } = require('telegraf');

module.exports = { authMiddleware, handleFinanceCommand, addFinanceRecord, listRecords, deleteRecord };
