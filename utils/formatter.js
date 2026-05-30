const ExcelJS = require('exceljs');
const supabase = require('../config/database');
const logger = require('../utils/logger');

async function generateExcel(userId) {
  const { data: records, error } = await supabase
    .from('finance_records')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Transaksi');

  ws.columns = [
    { header: 'Tanggal', key: 'tanggal', width: 20 },
    { header: 'Tipe', key: 'type', width: 15 },
    { header: 'Nominal', key: 'amount', width: 18 },
    { header: 'Keterangan', key: 'description', width: 40 },
  ];

  let totalMasuk = 0;
  let totalKeluar = 0;

  for (const r of records) {
    const amount = parseFloat(r.amount);
    if (r.type === 'pemasukan') totalMasuk += amount;
    else totalKeluar += amount;

    let desc = r.description || '';
    if (/^[=+\-@]/.test(desc)) desc = "'" + desc;

    ws.addRow({
      tanggal: new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      type: r.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      amount,
      description: desc,
    });
  }

  ws.addRow({});
  const saldo = totalMasuk - totalKeluar;
  ws.addRow({ type: 'Total Masuk', amount: totalMasuk });
  ws.addRow({ type: 'Total Keluar', amount: totalKeluar });
  ws.addRow({ type: 'Saldo', amount: saldo });

  ws.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateExcel };
