import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import path from 'path';
import os from 'os';

export interface OcrReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  amount: number;
}

export interface OcrReceipt {
  storeName: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  items: OcrReceiptItem[];
  rawText: string;
}

// Known store name patterns
const STORE_PATTERNS = [
  /carrefour/i, /biedronka/i, /lidl/i, /kaufland/i, /zabka|żabka/i,
  /auchan/i, /tesco/i, /netto/i, /dino\b/i, /intermarche/i,
  /lewiatan/i, /stokrotka/i, /polomarket/i, /delikatesy centrum/i,
  /pepco/i, /action/i, /rossmann/i, /hebe/i, /orlen/i,
];

function detectStore(text: string): string | null {
  for (const pattern of STORE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function detectDate(text: string): string | null {
  // Match dates in various formats across the whole text
  const patterns: { re: RegExp; fmt: (m: RegExpMatchArray) => string }[] = [
    // YYYY-MM-DD (ISO)
    { re: /(\d{4})-(\d{2})-(\d{2})/, fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
    // DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
    { re: /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/, fmt: m => `${m[3]}-${m[2]}-${m[1]}` },
    // DD.MM.YY, DD-MM-YY, DD/MM/YY (2-digit year)
    { re: /(\d{2})[.\-/](\d{2})[.\-/](\d{2})(?!\d)/, fmt: m => `20${m[3]}-${m[2]}-${m[1]}` },
    // Rossmann-style: date may appear near "Data" or embedded in line with time
    // e.g. "2025-01-15 12:34" or "15.01.2025 12:34"
    { re: /[Dd]ata[:\s]*(\d{2})[.\-/](\d{2})[.\-/](\d{4})/, fmt: m => `${m[3]}-${m[2]}-${m[1]}` },
    { re: /[Dd]ata[:\s]*(\d{4})[.\-/](\d{2})[.\-/](\d{2})/, fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
  ];

  for (const { re, fmt } of patterns) {
    const match = text.match(re);
    if (match) {
      const result = fmt(match);
      // Basic sanity check: month 01-12, day 01-31
      const [, month, day] = result.match(/\d{4}-(\d{2})-(\d{2})/) || [];
      if (month && parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
        return result;
      }
    }
  }
  return null;
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(',', '.').replace(/\s/g, ''));
}

// Lines to skip — headers, footers, metadata
const SKIP_PATTERNS = [
  /^(PARAGON|FISKALNY|SUMA|RAZEM|SPRZED|GOTOW|KARTA|RESZTA|PTU|NIP|TOTAL|ROZLICZ|VISA|MASTER|---)/i,
  /^\d{2}[.\-/]\d{2}[.\-/]\d{2,4}/,
  /^(ul[.,]|UL[.,]|ADRES|TEL|www|Nr |Sklep|Kasa|Kasjer|ZDC|thZ|Nr sys|Nr trans|nr :|nr rej)/i,
  /^\|/,    // lines starting with pipe (OCR artifact from receipt borders)
  /^[A-Z0-9]{20,}$/,  // long hash strings
  // Fiscal summary lines: "c. FIU", "st. A", "st. B", etc.
  /^[cCsS][tT.]?\s*\.?\s*FIU/i,
  /^st\.\s*[A-H]/i,
  // Payment lines
  /^(PŁATN|PLATN|WZLICZ|WYLICZ|GOTÓWK|GOTOWK|ZMIANA|CHANGE)/i,
];

function isSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(line));
}

// Clean OCR artifacts from a price string
// OCR often merges the VAT letter with the price: "18,99A" → "18,99" or "12,496" → "12,49"
function cleanPrice(raw: string): number {
  // Remove trailing VAT letter(s) and OCR junk that got merged
  let cleaned = raw.replace(/[A-Ha-h%/»©®]+\s*$/, '').trim();
  // Remove non-numeric chars OCR inserted into price (e.g. "5,/%" → try to extract digits)
  cleaned = cleaned.replace(/[^0-9.,\s]/g, '');
  // Remove trailing comma/dot with no decimals (e.g. "5," or "5.")
  cleaned = cleaned.replace(/[.,]\s*$/, '');
  // Handle "3, 196" → "3,19" (space after comma from OCR)
  cleaned = cleaned.replace(/,\s+/g, ',');
  // Handle "18 994" → "18,99" (space instead of comma, trailing VAT digit)
  const spacedMatch = cleaned.match(/^(\d+)\s(\d{2})\d?$/);
  if (spacedMatch) {
    cleaned = `${spacedMatch[1]},${spacedMatch[2]}`;
  }
  // Handle "12,496" or "10,294" → "12,49" / "10,29" (3+ decimals = trailing junk)
  const extraDecimalMatch = cleaned.match(/^(\d+[.,]\d{2})\d+$/);
  if (extraDecimalMatch) {
    cleaned = extraDecimalMatch[1];
  }
  const result = parseAmount(cleaned);
  return isNaN(result) ? 0 : result;
}

export function parseReceiptLines(text: string): OcrReceiptItem[] {
  const items: OcrReceiptItem[] = [];
  const lines = text.split('\n')
    .map(l => l.replace(/^[\|\s]+/, '').replace(/[\|\s]+$/, '').trim())  // strip pipe artifacts and whitespace
    .filter(l => l.length > 0);

  // Find the product section boundaries
  // Products are between "PARAGON FISKALNY" and "SUMA/RAZEM/SPRZEDAŻ"
  let inProducts = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of products section
    if (/PARAGON|FISKALNY/i.test(line)) {
      inProducts = true;
      continue;
    }

    // Detect end of products section
    // Rossmann/other: "SPRZEDAŻ OPODATKOWANA", also SUMA, RAZEM, horizontal lines
    // OCR may truncate: "RZEDAŻ" instead of "SPRZEDAŻ", "MA PLN" instead of "SUMA PLN"
    if (/^[\|\s]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|S.UMA|S.UKA|ŚUKA|[-=_]{5,})/i.test(line)) {
      inProducts = false;
      continue;
    }
    // Also catch truncated summary lines: "MA PTU", "MA PLN", "UB 8,00"
    if (/^[\|\s]*(PTU\s+[A-H]|[A-Z]{1,2}\s+PTU|[A-Z]{1,2}\s+PLN|[A-Z]{1,2}\s+\d+[.,]\d{2}\s*%)/i.test(line)) {
      inProducts = false;
      continue;
    }

    if (isSkipLine(line)) continue;
    if (!inProducts) continue;

    // Skip discount/upust lines and non-product lines
    if (/(?:opust|rabat|znizk|upust|[Uu]+w?zgl)/i.test(line)) {
      continue;
    }
    // Skip pharmacy/payment lines: "z recepty", "do zapłaty", "Podsuma"
    if (/^[\|\s]*(z recept|do zap[łl]at|o zap[łl]at|podsuma|podsum\b)/i.test(line)) {
      continue;
    }

    // Skip fiscal/tax summary lines that may appear between products
    // "c. FIU | 19,54" or "c.FIU 19,54" or "st. c 19,99"
    if (/^\s*[cCsS][tT.]?\s*\.?\s*(FIU|[A-H]\s+\d)/i.test(line)) {
      continue;
    }

    // === PATTERN MATCHING (most flexible to least) ===

    // Pattern A: NAME  QTY x/*/szt PRICE  TOTAL [VAT]
    // Standard: "SER GOUDA 200G  1 x 5,99  5,99 A"
    // OCR mangled: "BELLANICO C/P5, OAK 1 118,99 18 994" or "1 «9,59"
    // VAT suffix: OCR often mangles VAT letters (A-H) into %, /, », etc.
    // Total group: capture liberally (digits, commas, dots, spaces, OCR junk) — cleanPrice handles cleanup
    // TOTAL: first char can be digit or OCR-mangled letter (U instead of 0, etc.)
    const TOTAL = '([\\w][\\d.,\\s/_%]*\\d?)';
    // TAIL: any single non-digit char as VAT (OCR mangles A-H into anything)
    const TAIL = '[^\\d\\s]?\\s*$';

    // Sanity-check: if cleaned total is way off from qty*unitPrice, use qty*unitPrice
    // OCR can mangle the total price (e.g. "5,/%" → 5 instead of 5.79)
    const saneTotal = (rawTotal: number, unitPrice: number, qty: number) => {
      const expected = Math.round(unitPrice * qty * 100) / 100;
      // If total is 0, or is a round integer when we expect decimals, or deviates >10%
      const hasNoDecimals = rawTotal === Math.floor(rawTotal) && unitPrice !== Math.floor(unitPrice);
      if (rawTotal <= 0 || hasNoDecimals || (expected > 1 && Math.abs(rawTotal - expected) / expected > 0.10)) {
        return expected;
      }
      return rawTotal;
    };

    // Pattern S: Carrefour-style "NAME QTYszt*PRICE= TOTAL VAT"
    // e.g. "C_WAFEL PRINCE POLO 3szt*2,05= 6,15 C" or "Iszt*41,99= 41,99 Ą"
    // Also handles `:` instead of `=`, and `Iszt`/`iszt`/`lszt` (OCR for 1szt)
    let match = line.match(new RegExp(`^(.+?)\\s+(\\d+|[IilLl])\\s*szt\\s*[*xX]+\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL}\\s*${TAIL}`, 'i'));
    if (match) {
      const qtyRaw = match[2];
      const qty = /^[IilLl]$/.test(qtyRaw) ? 1 : parseInt(qtyRaw);
      const unitPrice = cleanPrice(match[3]);
      items.push({
        name: match[1].trim(),
        quantity: qty,
        unitPrice,
        amount: saneTotal(cleanPrice(match[4]), unitPrice, qty),
      });
      continue;
    }

    // Pattern S2: "NAME Iszt*PRICE= TOTAL" where qty is merged with szt (no space)
    // e.g. "R.HINIPUSZ.FIFA WOR Iszt*41,99= 41,99 Ą"
    match = line.match(new RegExp(`^(.+?)\\s+[IilLl1]szt\\s*[*xX]\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL}\\s*${TAIL}`, 'i'));
    if (match) {
      const unitPrice = cleanPrice(match[2]);
      items.push({
        name: match[1].trim(),
        quantity: 1,
        unitPrice,
        amount: saneTotal(cleanPrice(match[3]), unitPrice, 1),
      });
      continue;
    }

    // Pattern W: NAME  QTY_DECIMAL x PRICE  TOTAL [VAT]  (weight items: "Jabłka 1,752 x4,99 8,74")
    // Note: redeclare match since Pattern S uses `let match` above
    match = line.match(new RegExp(`^(.+?)\\s+(\\d+[.,]\\d+)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL}\\s*${TAIL}`));
    if (match) {
      const qty = parseAmount(match[2]);
      const unitPrice = cleanPrice(match[3]);
      items.push({
        name: match[1].trim(),
        quantity: qty,
        unitPrice,
        amount: saneTotal(cleanPrice(match[4]), unitPrice, qty),
      });
      continue;
    }

    // Pattern A: NAME  QTY x PRICE  TOTAL [VAT]
    match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL}\\s*${TAIL}`));
    if (match) {
      const qty = parseAmount(match[2]);
      const unitPrice = cleanPrice(match[3]);
      items.push({
        name: match[1].trim(),
        quantity: qty,
        unitPrice,
        amount: saneTotal(cleanPrice(match[4]), unitPrice, qty),
      });
      continue;
    }

    // Pattern B: NAME  QTY  xPRICE  TOTAL[VAT]  (no space between x and price, OCR may add junk chars)
    // "JOANNA ULTRACOLORNAX 1 x12,49 12,496" or "DOVE A.CARE GO FRMAK 1 xd7,99 12,50"
    // Also handles OCR mangling qty: "t'x4,49" or "| x5,69"
    match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s*[xX*«][^\\d]?(\\d+[.,]\\d{2})[\\s=:]+${TOTAL}\\s*${TAIL}`));
    if (match) {
      const qty = parseAmount(match[2]);
      const unitPrice = cleanPrice(match[3]);
      items.push({
        name: match[1].trim(),
        quantity: qty,
        unitPrice,
        amount: saneTotal(cleanPrice(match[4]), unitPrice, qty),
      });
      continue;
    }
    // Pattern B2: qty mangled by OCR (non-digit chars before x, e.g. "Z x9,99" "? x10,99")
    // Try to derive qty from total/price
    match = line.match(new RegExp(`^(.+?)\\s+\\D{0,3}[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL}\\s*${TAIL}`));
    if (match) {
      const unitPrice = cleanPrice(match[2]);
      const rawTotal = cleanPrice(match[3]);
      const total = rawTotal > 0 ? rawTotal : unitPrice;
      const derivedQty = unitPrice > 0 ? Math.round(total / unitPrice) : 1;
      const qty = derivedQty > 0 ? derivedQty : 1;
      items.push({
        name: match[1].trim(),
        quantity: qty,
        unitPrice,
        amount: saneTotal(total, unitPrice, qty),
      });
      continue;
    }

    // Pattern C: NAME  QTY  PRICE  TOTAL [VAT]  (no separator between qty and price — OCR lost "x")
    // "BELLANICO C/P5, OAK 1 118,99 18 994" → qty=1, but "118,99" is actually "x18,99"
    match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s+(\\d+[.,]\\d{2})[\\s=:]+${TOTAL}\\s*${TAIL}`));
    if (match) {
      const name = match[1].trim();
      let qty = parseAmount(match[2]);
      let unitPrice = cleanPrice(match[3]);
      let total = cleanPrice(match[4]);

      // Sanity check: if qty*unitPrice is way off from total, OCR probably ate the "x"
      // e.g. "1 118,99 18,99" → qty=1, raw price="118,99", total=18,99
      // The leading digit(s) of price are actually the qty merged with separator
      if (Math.abs(qty * unitPrice - total) > 1 && unitPrice > total * 1.5) {
        // Try stripping leading digits until price matches total
        const priceStr = match[3].replace(',', '.');
        for (let skip = 1; skip < priceStr.length - 3; skip++) {
          const candidate = parseFloat(priceStr.substring(skip));
          if (!isNaN(candidate) && Math.abs(candidate - total) < 0.1) {
            unitPrice = candidate;
            break;
          }
        }
      }

      if (Math.abs(qty * unitPrice - total) < 0.1 || qty === 1) {
        items.push({ name, quantity: qty, unitPrice, amount: total });
        continue;
      }
    }

    // Pattern D: NAME  TOTAL [VAT]  (simple, qty=1 implied)
    // "CHLEB RAZOWY  4,29 A"  or  "CHLEB RAZOWY  4,29"
    match = line.match(new RegExp(`^(.+?)\\s+(\\d+[.,]\\d{2})\\s*${TAIL}`));
    if (match && match[1].length > 2 && !/^\d/.test(match[1])) {
      const name = match[1].trim();
      // Check next line for qty detail
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const qtyMatch = nextLine.match(/^\s*(\d+[.,]?\d*)\s*[xX*«]\s*(\d+[.,]\d{2})/);

      if (qtyMatch) {
        items.push({
          name,
          quantity: parseAmount(qtyMatch[1]),
          unitPrice: cleanPrice(qtyMatch[2]),
          amount: cleanPrice(match[2]),
        });
        i++;
      } else {
        items.push({
          name,
          quantity: 1,
          unitPrice: cleanPrice(match[2]),
          amount: cleanPrice(match[2]),
        });
      }
      continue;
    }

    // Pattern E: NAME  TOTAL[VAT_DIGIT] (VAT letter merged with price digits)
    // "SOME PRODUCT 12,496" → 12,49 + "6" is junk
    match = line.match(/^(.+?)\s+(\d+[.,]\d{2})\d\s*$/);
    if (match && match[1].length > 2 && !/^\d/.test(match[1])) {
      items.push({
        name: match[1].trim(),
        quantity: 1,
        unitPrice: cleanPrice(match[2]),
        amount: cleanPrice(match[2]),
      });
      continue;
    }

    // Pattern F: Multi-line product — name on this line, qty×price on next line
    // e.g. "DYMAX Vital 50+ 60 tabl.+20 ta.2238/B" followed by "1 x52,00 52,008"
    if (line.length > 3 && !/^\d/.test(line)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const qtyPriceMatch = nextLine.match(new RegExp(`^\\s*(\\d+[.,]?\\d*)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})\\s+${TOTAL}\\s*${TAIL}`));
      if (qtyPriceMatch) {
        const qty = parseAmount(qtyPriceMatch[1]);
        const unitPrice = cleanPrice(qtyPriceMatch[2]);
        items.push({
          name: line.trim(),
          quantity: qty,
          unitPrice,
          amount: saneTotal(cleanPrice(qtyPriceMatch[3]), unitPrice, qty),
        });
        i++; // skip next line
        continue;
      }
      // Also handle: next line has just "QTY xPRICE" without total
      const qtyPriceOnly = nextLine.match(/^\s*(\d+[.,]?\d*)\s*[xX*«]\s*(\d+[.,]\d{2})\s*$/);
      if (qtyPriceOnly) {
        const qty = parseAmount(qtyPriceOnly[1]);
        const unitPrice = cleanPrice(qtyPriceOnly[2]);
        items.push({
          name: line.trim(),
          quantity: qty,
          unitPrice,
          amount: Math.round(qty * unitPrice * 100) / 100,
        });
        i++;
        continue;
      }
    }
  }

  return items;
}

function detectTotal(text: string): number | null {
  // Look for SUMA, RAZEM, TOTAL patterns (including OCR variants like ŚUKA, S.UMA)
  const patterns = [
    /(?:SUMA|ŚUKA|S\.?UMA|S\.?UKA|RAZEM|TOTAL|DO ZAP)\w*\s*:?\s*(?:PLN)?\s*(\d+[.,]\d{2})/i,
    /(?:SUMA|ŚUKA|S\.?UMA|S\.?UKA|RAZEM|TOTAL)\s+PLN\s+(\d+[.,]\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseAmount(match[1]);
  }
  return null;
}

function autoOrient(inputPath: string): void {
  // Use ImageMagick to fix EXIF orientation (phone photos are often rotated)
  try {
    execFileSync('convert', [inputPath, '-auto-orient', inputPath], { timeout: 15000 });
  } catch {
    // If convert fails, continue with original image
  }
}

function runTesseract(inputPath: string, outputBase: string, psm: string): string {
  execFileSync('tesseract', [
    inputPath,
    outputBase,
    '-l', 'pol',
    '--psm', psm,
    '--oem', '1',
  ], { timeout: 30000 });

  const { readFileSync } = require('fs');
  return readFileSync(outputBase + '.txt', 'utf-8');
}

export function runOcr(imageBuffer: Buffer, mimeType: string): string {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'receipt-'));
  const ext = mimeType.includes('png') ? '.png' : '.jpg';
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outputBase = path.join(tmpDir, 'output');

  try {
    writeFileSync(inputPath, imageBuffer);

    // Fix EXIF orientation (phone camera photos)
    autoOrient(inputPath);

    // Try PSM 4 (single column) first — best for receipts
    // Fall back to PSM 6 (uniform block) if result is poor
    let bestText = '';
    for (const psm of ['4', '6', '3']) {
      try {
        const text = runTesseract(inputPath, outputBase, psm);
        // Pick the result with more digit-containing lines (receipt lines have prices)
        const priceLines = text.split('\n').filter(l => /\d+[.,]\d{2}/.test(l)).length;
        const bestPriceLines = bestText.split('\n').filter(l => /\d+[.,]\d{2}/.test(l)).length;
        if (priceLines > bestPriceLines) {
          bestText = text;
        }
      } catch {
        // PSM mode failed, try next
      }
      try { unlinkSync(outputBase + '.txt'); } catch {}
    }

    return bestText;
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputBase + '.txt'); } catch {}
    try { require('fs').rmdirSync(tmpDir); } catch {}
  }
}

export function reparseRawText(rawText: string): OcrReceipt {
  return {
    storeName: detectStore(rawText),
    receiptDate: detectDate(rawText),
    totalAmount: detectTotal(rawText),
    items: parseReceiptLines(rawText),
    rawText,
  };
}

export function parseReceiptImage(imageBuffer: Buffer, mimeType: string): OcrReceipt {
  const rawText = runOcr(imageBuffer, mimeType);
  return reparseRawText(rawText);
}
