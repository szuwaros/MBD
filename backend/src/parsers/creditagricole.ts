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

export const creditAgricoleParser: CsvParser = {
  bankId: 'creditagricole',
  parse(content: string): ParsedTransaction[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const results: ParsedTransaction[] = [];

    // Credit Agricole CSV: separator ;
    // Columns: Data operacji;Data księgowania;Opis operacji;Kwota;Waluta;Saldo
    let dataStarted = false;

    for (const line of lines) {
      const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));

      if (!dataStarted) {
        if (/^\d{2}[.\-/]\d{2}[.\-/]\d{4}$/.test(cols[0]) || /^\d{4}-\d{2}-\d{2}$/.test(cols[0])) {
          dataStarted = true;
        } else {
          continue;
        }
      }

      if (cols.length < 4) continue;

      const date = parsePolishDate(cols[0]);
      const description = cols[2] || '';
      const amount = parsePolishAmount(cols[3]);

      if (isNaN(amount)) continue;

      const balanceAfter = cols[5] ? parsePolishAmount(cols[5]) : undefined;

      results.push({
        date,
        description,
        amount,
        balanceAfter: isNaN(balanceAfter as number) ? undefined : balanceAfter,
        type: undefined,
        counterparty: undefined,
      });
    }

    return results;
  },
};
