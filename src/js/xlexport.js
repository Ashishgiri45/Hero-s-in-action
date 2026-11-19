'use strict';
/* ================= Excel writer =================
   Real .xlsx files via ExcelJS (loaded on first export): styled header row, frozen header, autofilter,
   column widths and number formats. Falls back to SheetJS (already loaded for reading) if ExcelJS
   cannot load — still a genuine .xlsx, with widths and filters but without colours.
   Sheet spec: { name, title, meta: [[label, value]], cols: [{ h, k | v(row), w, fmt, wrap }], rows, freezeCols } */

const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const XFMT = { int: '#,##0', num1: '#,##0.0', num2: '#,##0.00', pct: '0%', pct1: '0.0%', inr: '"₹"#,##0', date: 'dd-mmm-yyyy', text: '@' };
let _exceljs = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_exceljs) return _exceljs;
  _exceljs = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = EXCELJS_URL; s.async = true;
    s.onload = () => window.ExcelJS ? res(window.ExcelJS) : rej(new Error('ExcelJS missing'));
    s.onerror = () => { _exceljs = null; rej(new Error('ExcelJS could not load')); };
    document.head.appendChild(s);
  });
  return _exceljs;
}
function saveBlob(blob, filename) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const safeSheet = (s, used) => { let n = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'; let k = 2; while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; };
const safeFile = s => String(s).replace(/[^A-Za-z0-9 _.-]+/g, '_').replace(/\s+/g, '_').slice(0, 120);
const isoToDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : (s || null); };
const cellVal = (c, row) => { let v = typeof c.v === 'function' ? c.v(row) : row[c.k]; if (v === undefined || (typeof v === 'number' && !isFinite(v))) v = null; if (c.fmt === 'date' && typeof v === 'string') v = isoToDate(v); return v; };

async function downloadWorkbook(filename, sheets) {
  filename = safeFile(filename.replace(/\.xlsx$/i, '')) + '.xlsx';
  try {
    const EX = await loadExcelJS();
    const wb = new EX.Workbook(); wb.creator = '16-Point KPI Tracker'; wb.created = new Date();
    const used = new Set();
    for (const sh of sheets) {
      const ws = wb.addWorksheet(safeSheet(sh.name, used));
      let r = 1;
      if (sh.title) { const c = ws.getCell(r, 1); c.value = sh.title; c.font = { bold: true, size: 14, color: { argb: 'FF1E1B4B' } }; r++; }
      for (const m of sh.meta || []) { const a = ws.getCell(r, 1), b = ws.getCell(r, 2); a.value = m[0]; a.font = { bold: true, color: { argb: 'FF4A5372' } }; b.value = m[1]; r++; }
      if (sh.title || (sh.meta && sh.meta.length)) r++;
      const hr = r;
      sh.cols.forEach((c, j) => {
        const cell = ws.getCell(hr, j + 1); cell.value = c.h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF312E81' } } };
        ws.getColumn(j + 1).width = c.w || 14;
      });
      ws.getRow(hr).height = 32;
      sh.rows.forEach((row, i) => {
        const rr = ws.getRow(hr + 1 + i);
        sh.cols.forEach((c, j) => {
          const cell = rr.getCell(j + 1); cell.value = cellVal(c, row);
          if (c.fmt && XFMT[c.fmt]) cell.numFmt = XFMT[c.fmt];
          if (c.wrap) cell.alignment = { wrapText: true, vertical: 'top' };
        });
        if (i % 2) rr.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FC' } }; });
      });
      if (!sh.rows.length) ws.getCell(hr + 1, 1).value = 'No records for this selection.';
      else ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: hr + sh.rows.length, column: sh.cols.length } };
      ws.views = [{ state: 'frozen', ySplit: hr, xSplit: sh.freezeCols || 0 }];
    }
    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    toast('Excel file downloading: ' + filename);
  } catch (e) {
    console.warn('ExcelJS unavailable, using SheetJS', e);
    if (!window.XLSX) { toast('Excel export needs an internet connection the first time (library download).', 6000); return; }
    const XL = window.XLSX, wb = XL.utils.book_new(), used = new Set();
    for (const sh of sheets) {
      const aoa = []; if (sh.title) aoa.push([sh.title]); for (const m of sh.meta || []) aoa.push(m); if (aoa.length) aoa.push([]);
      const hr = aoa.length; aoa.push(sh.cols.map(c => c.h));
      for (const row of sh.rows) aoa.push(sh.cols.map(c => cellVal(c, row)));
      const ws = XL.utils.aoa_to_sheet(aoa, { cellDates: true });
      ws['!cols'] = sh.cols.map(c => ({ wch: c.w || 14 }));
      if (sh.rows.length) ws['!autofilter'] = { ref: XL.utils.encode_range({ s: { r: hr, c: 0 }, e: { r: hr + sh.rows.length, c: sh.cols.length - 1 } }) };
      XL.utils.book_append_sheet(wb, ws, safeSheet(sh.name, used));
    }
    XL.writeFile(wb, filename);
    toast('Excel file downloading (basic format): ' + filename);
  }
}
