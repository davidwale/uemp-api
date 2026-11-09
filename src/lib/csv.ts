import type { Response } from 'express';

const escape = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ prefixes).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function sendCsv<T extends Record<string, unknown>>(
  res: Response,
  filename: string,
  columns: { key: keyof T; header: string }[],
  rows: T[],
): void {
  const lines = [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\r\n'));
}
