import { ParsedTransaction, CsvParser } from '../types';

function parsePolishDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function parsePolishAmount(amountStr: string): number {
  const cleaned = amountStr.trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

export const pkobpParser: CsvParser = {
  bankId: 'pkobp',
  parse(content: string): ParsedTransaction[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const results: ParsedTransaction[] = [];

    // PKO BP CSV: separator "," or ";"
    // Columns may vary: Data operacji,Data waluty,Typ transakcji,Kwota,Waluta,Saldo po transakcji,Opis transakcji
    let dataStarted = false;
    let separator = ',';

    for (const line of lines) {
      // Auto-detect separator from header or first data line
      if (!dataStarted) {
        if (line.includes(';') && line.split(';').length > line.split(',').length) {
          separator = ';';
        }
      }

      const cols = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));

      if (!dataStarted) {
        if (/^\d{2}[.\-/]\d{2}[.\-/]\d{4}$/.test(cols[0]) || /^\d{4}-\d{2}-\d{2}$/.test(cols[0])) {
          dataStarted = true;
        } else {
          continue;
        }
      }

      if (cols.length < 4) continue;

      const date = parsePolishDate(cols[0]);
      const type = cols[2] || undefined;
      const amount = parsePolishAmount(cols[3]);

      if (isNaN(amount)) continue;

      const balanceAfter = cols[5] ? parsePolishAmount(cols[5]) : undefined;
      const description = cols[6] || cols[3] || '';

      results.push({
        date,
        description,
        amount,
        balanceAfter: isNaN(balanceAfter as number) ? undefined : balanceAfter,
        type,
        counterparty: undefined,
      });
    }

    return results;
  },
};
