import { ParsedTransaction } from '../types';

export function detectPdfBank(text: string): string | null {
  if (/alior\s*bank/i.test(text)) return 'alior';
  if (/bnp\s*paribas/i.test(text)) return 'bnpparibas';
  if (/pekao|pekao\s*sa/i.test(text)) return 'pekao';
  if (/ing\s*bank/i.test(text)) return 'ing';
  if (/mbank/i.test(text)) return 'mbank';
  if (/santander/i.test(text)) return 'santander';
  if (/millennium/i.test(text)) return 'millennium';
  if (/pko\s*bp|powszechna\s*kasa/i.test(text)) return 'pkobp';
  if (/credit\s*agricole/i.test(text)) return 'creditagricole';
  return null;
}

function extractAccountNumber(text: string): string | null {
  const m = text.match(/(?:PL\s*)?(\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/);
  return m ? m[1].replace(/\s/g, '') : null;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/PLN/gi, '').replace(/\s/g, '').replace(',', '.'));
}

function parseDate(s: string): string {
  const trimmed = s.trim();
  let m = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return trimmed;
}

// ==================== ALIOR BANK ====================
// Alior PDF layout: each transaction has:
// - Two dates (operation and booking) as YYYY.MM.DD
// - Type (e.g. "TRANSAKCJA KARTĄ DEBETOWĄ", "PRZELEW KRAJOWY")
// - Amount (with sign, comma decimal)
// - Balance after
// - Description block (counterparty, details)
export function parseAliorPdf(text: string): { transactions: ParsedTransaction[]; accountNumber: string | null } {
  const accountNumber = extractAccountNumber(text);
  const transactions: ParsedTransaction[] = [];

  // Alior format: DATE\nDATE\nTYPE+AMOUNT+BALANCE on same line
  // "2024.11.23\n2024.11.21\nTRANSAKCJA KARTĄ DEBETOWĄ-18,972 981,03\n...description..."
  // or "PRZELEW KRAJOWY1 500,001 500,00"
  // Amount has sign (- for expenses), balance follows immediately

  const blocks = text.split(/(?=\d{4}\.\d{2}\.\d{2}\n\d{4}\.\d{2}\.\d{2}\n)/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const d1 = lines[0].match(/^(\d{4}\.\d{2}\.\d{2})$/);
    const d2 = lines[1].match(/^(\d{4}\.\d{2}\.\d{2})$/);
    if (!d1 || !d2) continue;

    const operDate = parseDate(d1[1]);
    const typeLine = lines[2];

    // Parse type+amount+balance from combined line
    // Pattern: TYPE(-?AMOUNT)(BALANCE)
    // Amount: optional minus, digits with optional spaces, comma, 2 digits
    const typeAmountMatch = typeLine.match(/^([A-ZĄĆĘŁŃÓŚŹŻ\s]+?)(-?[\d\s]+,\d{2})([\d\s]+,\d{2})\s*$/);
    if (!typeAmountMatch) continue;

    const type = typeAmountMatch[1].trim();
    const amount = parseAmount(typeAmountMatch[2]);
    const balanceAfter = parseAmount(typeAmountMatch[3]);

    if (isNaN(amount)) continue;

    // Collect description lines
    const descLines: string[] = [];
    for (let i = 3; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || /^Infolinia/i.test(l) || /^Alior Bank/i.test(l)) break;
      if (/^Wyciąg za okres|^Nr wyciągu|^Strona|^Data wyciągu/i.test(l)) break;
      descLines.push(l);
    }

    const description = descLines.join(' ').trim().substring(0, 200);

    let counterparty = '';
    const cardMatch = description.match(/^(.+?)\s+(GDANSK|GDAŃSK|WARSZAWA|POL)\b/i);
    if (cardMatch) counterparty = cardMatch[1].replace(/^\d[\d\s]*\d\s+/, '').trim();
    if (!counterparty) {
      const nameMatch = description.match(/\d{26}\s+([A-ZĄĆĘŁŃÓŚŹŻ][\w\s.]+?)(?:\n|NIEBOROWSKA|$)/);
      if (nameMatch) counterparty = nameMatch[1].trim();
    }

    transactions.push({
      date: operDate,
      description: description || type,
      amount,
      balanceAfter: isNaN(balanceAfter) ? undefined : balanceAfter,
      type,
      counterparty: counterparty.substring(0, 100) || undefined,
      sourceAccount: amount < 0 ? accountNumber || undefined : undefined,
      destAccount: amount >= 0 ? accountNumber || undefined : undefined,
    });
  }

  return { transactions, accountNumber };
}

// ==================== BNP PARIBAS ====================
// BNP PDF layout: each transaction has:
// - Two dates (DD.MM.YYYY) on separate lines
// - Account number block
// - Sender/receiver info
// - Description
// - Amount: "-50,00 PLN"
// - Balance: "0,00 PLN"
// - Type: "Transakcja kartą" etc.
export function parseBnpParibasPdf(text: string): { transactions: ParsedTransaction[]; accountNumber: string | null } {
  const accountNumber = extractAccountNumber(text);
  const transactions: ParsedTransaction[] = [];

  // Split by date pairs: DD.MM.YYYY\nDD.MM.YYYY
  const blocks = text.split(/(?=\d{2}\.\d{2}\.\d{4}\n\d{2}\.\d{2}\.\d{4}\n)/);

  for (const block of blocks) {
    const dateMatch = block.match(/^(\d{2}\.\d{2}\.\d{4})\n(\d{2}\.\d{2}\.\d{4})\n/);
    if (!dateMatch) continue;

    const operDate = parseDate(dateMatch[1]);

    // Find all PLN amounts in block
    const amounts = [...block.matchAll(/(-?[\d\s]+,\d{2})\s*PLN/g)].map(m => parseAmount(m[1]));
    if (amounts.length === 0) continue;

    const amount = amounts[0];
    const balanceAfter = amounts.length > 1 ? amounts[1] : undefined;

    // Find type
    let type = '';
    const typeMatch = block.match(/(Transakcja kartą|Przelew\s+(?:wychodzący|przychodzący)|Prowizje i opłaty)/i);
    if (typeMatch) type = typeMatch[1];

    // Extract description — everything except dates, account numbers, addresses, type, amounts
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    const descParts: string[] = [];
    for (const line of lines) {
      // Skip dates
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(line)) continue;
      // Skip pure account numbers
      if (/^\d{10,}$/.test(line.replace(/\s/g, ''))) continue;
      // Skip amounts
      if (/^-?[\d\s]+,\d{2}\s*PLN$/.test(line)) continue;
      // Skip type lines
      if (/^(Transakcja kartą|Przelew|Prowizje)/i.test(line)) continue;
      // Skip address patterns
      if (/^\d{2}-\d{3}\s/.test(line) || /^UL\.\s/i.test(line)) continue;
      // Skip page headers/footers
      if (/^(Data|Nadawca|Opis|Kwota|Saldo|Odbiorca|Typ|Strona|BNP Paribas|Konto|Rodzaj|Numer|Waluta|Operacje|Elektroniczne)/i.test(line)) continue;
      // Skip short fragments that look like country codes
      if (/^PL$/.test(line)) continue;
      descParts.push(line);
    }

    const description = descParts.join(' ').trim().substring(0, 200);
    if (!description && !type) continue;

    // Extract counterparty
    let counterparty = '';
    const merchantMatch = description.match(/(?:GDANSK|Gdansk|OSTASZEWO|Poznan|STEGNA)\s+(.+?)\s+POL/i);
    if (merchantMatch) counterparty = merchantMatch[1].trim();
    else {
      const nameMatch = description.match(/^([A-ZĄĆĘŁŃÓŚŹŻ][\w\s.]+?)(?:\s+UL|\s+\d{2}-\d{3}|\n|$)/);
      if (nameMatch) counterparty = nameMatch[1].trim();
    }

    transactions.push({
      date: operDate,
      description: description || type,
      amount,
      balanceAfter,
      type: type || undefined,
      counterparty: counterparty.substring(0, 100) || undefined,
      sourceAccount: amount < 0 ? accountNumber || undefined : undefined,
      destAccount: amount >= 0 ? accountNumber || undefined : undefined,
    });
  }

  return { transactions, accountNumber };
}
