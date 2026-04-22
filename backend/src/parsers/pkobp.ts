import { ParsedTransaction, CsvParser } from '../types';

/**
 * PKO BP CSV format (iPKO / IKO export "Zestawienie operacji"):
 *
 * Separator: comma
 * Fields quoted: "..."
 * Columns:
 *   0: Data operacji (YYYY-MM-DD)
 *   1: Data waluty (YYYY-MM-DD)
 *   2: Typ transakcji
 *   3: Kwota ("+41.63" or "-7.91")
 *   4: Waluta
 *   5: Saldo po transakcji ("+51962.86")
 *   6: Opis transakcji
 *   7: Dodatkowe pole 1 (rachunek nadawcy/odbiorcy, nazwa)
 *   8: Dodatkowe pole 2 (nazwa nadawcy/odbiorcy)
 *   9: Dodatkowe pole 3 (adres, tytuł)
 *  10: Dodatkowe pole 4 (tytuł, referencje)
 *
 * Encoding: Windows-1250 (handled by import route decodeBuffer)
 */

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseAmount(str: string): number {
  // "+41.63" or "-7.91" or "41,63" or "-7,91"
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function extractCounterparty(fields: string[]): string | undefined {
  // Fields 7-10 contain extra info like:
  //  "Rachunek nadawcy: ..." / "Nazwa nadawcy: ..." / "Nazwa odbiorcy: ..."
  for (let i = 7; i <= 10; i++) {
    const f = fields[i] || '';
    const nameMatch = f.match(/^Nazwa (?:nadawcy|odbiorcy):\s*(.+)/i);
    if (nameMatch) return nameMatch[1].trim();
  }
  return undefined;
}

function extractTitle(fields: string[]): string | undefined {
  for (let i = 7; i <= 10; i++) {
    const f = fields[i] || '';
    const titleMatch = f.match(/^Tytu[łl]:\s*(.+)/i);
    if (titleMatch) return titleMatch[1].trim();
  }
  return undefined;
}

export const pkobpParser: CsvParser = {
  bankId: 'pkobp',
  parse(content: string): ParsedTransaction[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const results: ParsedTransaction[] = [];

    for (const line of lines) {
      const cols = parseCsvLine(line);

      // Skip header and empty rows
      if (cols.length < 7) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cols[0]) && !/^\d{2}[.\-/]\d{2}[.\-/]\d{4}$/.test(cols[0])) continue;

      const date = cols[0]; // Already YYYY-MM-DD
      const type = cols[2] || undefined;
      const amount = parseAmount(cols[3]);
      if (isNaN(amount)) continue;

      const balanceAfter = parseAmount(cols[5]);
      const description = cols[6] || '';
      const counterparty = extractCounterparty(cols);
      const title = extractTitle(cols);

      // Build a useful description: use title if available, otherwise the raw description
      const fullDescription = title && title !== description
        ? `${description} | ${title}`
        : description;

      results.push({
        date,
        description: fullDescription,
        amount,
        balanceAfter: isNaN(balanceAfter) ? undefined : balanceAfter,
        type,
        counterparty,
      });
    }

    return results;
  },
};
