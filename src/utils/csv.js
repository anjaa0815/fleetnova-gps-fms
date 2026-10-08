// CSV export for the browser. Opens correctly in Excel: UTF-8 with a byte-order mark (without it Excel shows
// Mongolian Cyrillic as garbage), CRLF line ends, and no formula execution from user-supplied text.
const BOM = '﻿';

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // cells starting with = + - @ are executed as formulas by spreadsheet programs (numbers are left alone)
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header, rows) {
  return `${BOM}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// A Blob download, so characters such as # in a value cannot cut a data: URL short
export function downloadCsv(filename, header, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
