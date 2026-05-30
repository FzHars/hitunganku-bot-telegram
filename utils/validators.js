const AMOUNT_MIN = 1;
const AMOUNT_MAX = 999999999;
const DESC_MIN = 2;
const DESC_MAX = 100;
const FILE_SIZE_MAX = 5 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DIM_MIN = 200;
const DIM_MAX = 4000;

function validateAmount(n) {
  const num = parseFloat(n);
  if (isNaN(num) || !Number.isInteger(num) || num < AMOUNT_MIN || num > AMOUNT_MAX) {
    return { valid: false, error: `Nominal harus ${AMOUNT_MIN} - ${AMOUNT_MAX}` };
  }
  return { valid: true, value: num };
}

function validateDescription(s) {
  if (!s || typeof s !== 'string') {
    return { valid: false, error: 'Keterangan harus diisi' };
  }

  let sanitized = s.trim().replace(/[<>{}]/g, '').substring(0, DESC_MAX);

  if (sanitized.length < DESC_MIN) {
    return { valid: false, error: `Keterangan minimal ${DESC_MIN} karakter` };
  }

  if (/^[=+\-@]/.test(sanitized)) {
    sanitized = "'" + sanitized;
  }

  return { valid: true, value: sanitized };
}

function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'File tidak ditemukan' };
  }

  if (file.file_size > FILE_SIZE_MAX) {
    return { valid: false, error: 'File terlalu besar (max 5MB)' };
  }

  return { valid: true };
}

function validateFileMime(mimeType) {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    return { valid: false, error: 'Hanya PNG/JPEG/WebP diperbolehkan' };
  }
  return { valid: true };
}

function validateFileDimensions(width, height) {
  if (width < DIM_MIN || height < DIM_MIN || width > DIM_MAX || height > DIM_MAX) {
    return { valid: false, error: `Resolusi harus ${DIM_MIN}x${DIM_MIN} - ${DIM_MAX}x${DIM_MAX} pixel` };
  }
  return { valid: true };
}

const { addMonths } = require('date-fns');

function validateDate(d) {
  const date = new Date(d);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Format tanggal tidak valid' };
  }

  if (date <= new Date()) {
    return { valid: false, error: 'Waktu harus di masa depan' };
  }

  if (date > addMonths(new Date(), 6)) {
    return { valid: false, error: 'Maksimal 6 bulan ke depan' };
  }

  return { valid: true, value: date };
}

module.exports = {
  validateAmount,
  validateDescription,
  validateFile,
  validateFileMime,
  validateFileDimensions,
  validateDate,
};
