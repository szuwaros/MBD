import { ParsedTransaction, CsvParser } from '../types';

function parsePolishDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  // DD.MM.YYYY or DD-MM-YYYY or DD/MM/YYYY
  const match = trimmed.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function parsePolishAmount(amountStr: string): number {
  // Remove spaces, replace comma with dot
  const cleaned = amountStr.trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

export const pekaoParser: CsvParser = {
  bankId: 'pekao',
  parse(content: string): ParsedTransaction[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const results: ParsedTransaction[] = [];

    // PeKaO SA CSV: separator ;
    // Typical columns: Data operacji;Data waluty;Typ operacji;Opis;Kwota;Waluta;Saldo po operacji
    // Skip header rows - find the first row that looks like data
    let dataStarted = false;

    for (const line of lines) {
      const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));

      // Try to detect data rows by checking if first column is a date
      if (!dataStarted) {
        if (/^\d{2}[.\-/]\d{2}[.\-/]\d{4}$/.test(cols[0]) || /^\d{4}-\d{2}-\d{2}$/.test(cols[0])) {
          dataStarted = true;
        } else {
          continue;
        }
      }

      if (cols.length < 5) continue;

      const date = parsePolishDate(cols[0]);
      const type = cols[2] || undefined;
      const description = cols[3] || '';
      const amount = parsePolishAmount(cols[4]);

      if (isNaN(amount)) continue;

      const balanceAfter = cols[6] ? parsePolishAmount(cols[6]) : undefined;

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
