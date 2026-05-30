const supabase = require('../config/database');
const { validateFile, validateFileMime, validateFileDimensions } = require('../utils/validators');
const { askGeminiWithImage } = require('../utils/gemini');
const { addFinanceRecord } = require('./command');
const logger = require('../utils/logger');

async function handlePhoto(ctx) {
  const user = ctx.state.user;
  if (user.level < 4) {
    return ctx.reply('Fitur scan struk hanya untuk Level 4+. Upgrade subscription yuk!');
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  const fileValidation = validateFile(photo);
  if (!fileValidation.valid) return ctx.reply(fileValidation.error);

  try {
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());

    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();

    const mimeValidation = validateFileMime(metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`);
    if (!mimeValidation.valid) return ctx.reply(mimeValidation.error);

    const dimValidation = validateFileDimensions(metadata.width, metadata.height);
    if (!dimValidation.valid) return ctx.reply(dimValidation.error);

    const cleanBuffer = await sharp(buffer).toBuffer();

    ctx.state.photoBuffer = cleanBuffer;
    ctx.state.mimeType = `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}`;

    return processReceipt(ctx);
  } catch (err) {
    logger.error('Photo processing failed', { user_id: user.id, error: err.message });
    return ctx.reply('Gagal memproses foto. Pastikan format PNG/JPEG/WebP.');
  }
}

async function processReceipt(ctx) {
  if (!ctx.state.photoBuffer) return;

  const loadingMsg = await ctx.reply('Memproses struk...');

  try {
    const result = await askGeminiWithImage(
      'Extract data from this receipt. Return JSON: {"store": "nama toko", "date": "tanggal", "items": [{"name": "item", "price": number}], "total": number}',
      ctx.state.photoBuffer,
      ctx.state.mimeType
    );

    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch {
      return ctx.editMessageText('Gagal membaca struk. Coba foto ulang dengan pencahayaan lebih baik.');
    }

    ctx.state.receiptData = parsed;
    const lines = [
      `Toko: ${parsed.store || '-'}`,
      `Tanggal: ${parsed.date || '-'}`,
      `Total: Rp ${(parsed.total || 0).toLocaleString('id-ID')}`,
      '',
      'Item:',
      ...(parsed.items || []).map((i) => `- ${i.name}: Rp ${(i.price || 0).toLocaleString('id-ID')}`),
    ];

    const { Markup } = require('telegraf');
    await ctx.deleteMessage(loadingMsg.message_id);
    return ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('Simpan sebagai Pengeluaran', 'receipt_simpan')],
      [Markup.button.callback('Ulangi', 'receipt_ulang')],
      [Markup.button.callback('Batal', 'receipt_batal')],
    ]));
  } catch (err) {
    logger.error('Receipt vision failed', { user_id: ctx.state.user.id, error: err.message });
    return ctx.editMessageText('Gagal memproses struk. Coba lagi.');
  }
}

async function confirmReceipt(ctx) {
  const user = ctx.state.user;
  const data = ctx.state.receiptData;
  if (!data) return ctx.reply('Sesi kadaluarsa, upload ulang struk.');

  try {
    await addFinanceRecord(user.id, 'pengeluaran', data.total || 0, `Struk ${data.store || 'belanja'}`, 'vision');
    ctx.state.receiptData = null;
    ctx.state.photoBuffer = null;
    return ctx.editMessageText('Struk berhasil disimpan sebagai pengeluaran!');
  } catch (err) {
    logger.error('Receipt save failed', { user_id: user.id, error: err.message });
    return ctx.editMessageText('Gagal menyimpan, coba lagi.');
  }
}

module.exports = { handlePhoto, confirmReceipt };
