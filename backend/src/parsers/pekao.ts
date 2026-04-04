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

    // Pekao SA CSV format (semicolon-separated):
    // Col 0: Data księgowania
    // Col 1: Data waluty
    // Col 2: Nadawca / Odbiorca
    // Col 3: Adres nadawcy / odbiorcy
    // Col 4: Rachunek źródłowy
    // Col 5: Rachunek docelowy
    // Col 6: Tytułem
    // Col 7: Kwota operacji
    // Col 8: Waluta
    // Col 9: Numer referencyjny
    // Col 10: Typ operacji

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

      if (cols.length < 8) continue;

      const date = parsePolishDate(cols[0]);
      const counterparty = cols[2] || undefined;
      const sourceAccount = (cols[4] || '').replace(/^'/, '') || undefined;
      const destAccount = (cols[5] || '').replace(/^'/, '') || undefined;
      const description = cols[6] || '';
      const amount = parsePolishAmount(cols[7]);
      const type = cols[10] || undefined;
      const rawCategory = cols[11] || undefined;
      const category = rawCategory && rawCategory !== 'Bez kategorii' ? rawCategory : undefined;

      if (isNaN(amount)) continue;

      results.push({
        date,
        description,
        amount,
        counterparty,
        type,
        category,
        sourceAccount,
        destAccount,
      });
    }

    return results;
  },
};
