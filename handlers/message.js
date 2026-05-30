const { Markup } = require('telegraf');
const { validateAmount, validateDescription } = require('../utils/validators');
const { addFinanceRecord } = require('./command');
const logger = require('../utils/logger');

const userSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;

function getSession(userId) {
  let session = userSessions.get(userId);
  if (!session) {
    session = { step: null, data: {} };
    userSessions.set(userId, session);
  }
  session._timer = Date.now();
  return session;
}

function clearSession(userId) {
  userSessions.delete(userId);
}

function isExpired(session) {
  return Date.now() - session._timer > SESSION_TIMEOUT;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions) {
    if (now - session._timer > SESSION_TIMEOUT) {
      userSessions.delete(userId);
    }
  }
}, 60000);

async function handleGuidedStart(ctx) {
  const session = getSession(ctx.from.id);
  if (isExpired(session)) {
    clearSession(ctx.from.id);
    return ctx.reply('Sesi kadaluarsa, mulai lagi.');
  }

  session.step = 'type';
  session.data = {};

  return ctx.reply('Pilih tipe transaksi:', Markup.inlineKeyboard([
    [Markup.button.callback('Pengeluaran', 'guided_keluar')],
    [Markup.button.callback('Pemasukan', 'guided_masuk')],
    [Markup.button.callback('Batal', 'guided_batal')],
  ]));
}

async function handleGuidedInput(ctx) {
  const session = getSession(ctx.from.id);
  if (!session.step || isExpired(session)) {
    clearSession(ctx.from.id);
    return;
  }

  if (session.step === 'amount') {
    const result = validateAmount(ctx.message.text);
    if (!result.valid) return ctx.reply(result.error);

    session.data.amount = result.value;
    session.step = 'description';
    return ctx.reply('Masukkan keterangan:');
  }

  if (session.step === 'description') {
    const result = validateDescription(ctx.message.text);
    if (!result.valid) return ctx.reply(result.error);

    session.data.description = result.value;
    session.step = 'confirm';

    const label = session.data.type === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
    return ctx.reply(
      `Konfirmasi:\n\nTipe: ${label}\nJumlah: Rp ${session.data.amount.toLocaleString('id-ID')}\nKeterangan: ${session.data.description}\n\nBenar?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Simpan', 'guided_simpan')],
        [Markup.button.callback('Ulangi', 'guided_ulang')],
        [Markup.button.callback('Batal', 'guided_batal')],
      ])
    );
  }
}

async function handleGuidedAction(ctx) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session.step || isExpired(session)) {
    clearSession(userId);
    return ctx.reply('Sesi kadaluarsa, mulai lagi.');
  }

  const action = ctx.match[0];

  if (action === 'guided_keluar' || action === 'guided_masuk') {
    session.data.type = action === 'guided_keluar' ? 'pengeluaran' : 'pemasukan';
    session.step = 'amount';
    return ctx.editMessageText('Masukkan nominal (angka saja):');
  }

  if (action === 'guided_batal') {
    clearSession(userId);
    return ctx.editMessageText('Dibatalkan.');
  }

  if (action === 'guided_ulang') {
    session.step = 'type';
    session.data = {};
    return ctx.editMessageText('Pilih tipe transaksi:', Markup.inlineKeyboard([
      [Markup.button.callback('Pengeluaran', 'guided_keluar')],
      [Markup.button.callback('Pemasukan', 'guided_masuk')],
      [Markup.button.callback('Batal', 'guided_batal')],
    ]));
  }

  if (action === 'guided_simpan') {
    try {
      const user = ctx.state.user;
      await addFinanceRecord(user.id, session.data.type, session.data.amount, session.data.description);
      clearSession(userId);
      const label = session.data.type === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
      return ctx.editMessageText(`${label} berhasil disimpan!`);
    } catch (err) {
      logger.error('Guided save failed', { user_id: userId, error: err.message });
      return ctx.editMessageText('Gagal menyimpan, coba lagi.');
    }
  }
}

module.exports = { handleGuidedStart, handleGuidedInput, handleGuidedAction };
