import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import path from 'path';
import os from 'os';
import { ReceiptProfile, defaultProfile, detectProfile } from './receipt-profiles';

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
  profileUsed?: string;
}

// Known store name patterns (for store name extraction — separate from profile detection)
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
  const patterns: { re: RegExp; fmt: (m: RegExpMatchArray) => string }[] = [
    { re: /(\d{4})-(\d{2})-(\d{2})/, fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
    { re: /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/, fmt: m => `${m[3]}-${m[2]}-${m[1]}` },
    { re: /(\d{2})[.\-/](\d{2})[.\-/](\d{2})(?!\d)/, fmt: m => `20${m[3]}-${m[2]}-${m[1]}` },
    { re: /[Dd]ata[:\s]*(\d{2})[.\-/](\d{2})[.\-/](\d{4})/, fmt: m => `${m[3]}-${m[2]}-${m[1]}` },
    { re: /[Dd]ata[:\s]*(\d{4})[.\-/](\d{2})[.\-/](\d{2})/, fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
  ];

  for (const { re, fmt } of patterns) {
    const match = text.match(re);
    if (match) {
      const result = fmt(match);
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

// Generic skip patterns (always applied)
const BASE_SKIP_PATTERNS = [
  /^(PARAGON|FISKALNY|SUMA|RAZEM|SPRZED|GOTOW|KARTA|RESZTA|PTU|NIP|TOTAL|ROZLICZ|VISA|MASTER|---)/i,
  /^\d{2}[.\-/]\d{2}[.\-/]\d{2,4}/,
  /^(ul[.,]|UL[.,]|ADRES|TEL|www|Nr |Sklep|Kasa|Kasjer|ZDC|thZ|Nr sys|Nr trans|nr :|nr rej)/i,
  /^\|/,
  /^[A-Z0-9]{20,}$/,
  /^[cCsS][tT.]?\s*\.?\s*FIU/i,
  /^st\.\s*[A-H]/i,
  /^(PŁATN|PLATN|WZLICZ|WYLICZ|GOTÓWK|GOTOWK|ZMIANA|CHANGE)/i,
];

function isSkipLine(line: string, profile: ReceiptProfile): boolean {
  if (BASE_SKIP_PATTERNS.some(p => p.test(line))) return true;
  if (profile.skipPatterns.some(p => p.test(line))) return true;
  return false;
}

// Clean OCR artifacts from a price string
function cleanPrice(raw: string): number {
  let cleaned = raw.replace(/[A-Ha-h%/»©®]+\s*$/, '').trim();
  cleaned = cleaned.replace(/[^0-9.,\s]/g, '');
  cleaned = cleaned.replace(/[.,]\s*$/, '');
  cleaned = cleaned.replace(/,\s+/g, ',');
  const spacedMatch = cleaned.match(/^(\d+)\s(\d{2})\d?$/);
  if (spacedMatch) {
    cleaned = `${spacedMatch[1]},${spacedMatch[2]}`;
  }
  const extraDecimalMatch = cleaned.match(/^(\d+[.,]\d{2})\d+$/);
  if (extraDecimalMatch) {
    cleaned = extraDecimalMatch[1];
  }
  const result = parseAmount(cleaned);
  return isNaN(result) ? 0 : result;
}

// Sanity-check total vs qty*unitPrice
function saneTotal(rawTotal: number, unitPrice: number, qty: number): number {
  const expected = Math.round(unitPrice * qty * 100) / 100;
  const hasNoDecimals = rawTotal === Math.floor(rawTotal) && unitPrice !== Math.floor(unitPrice);
  if (rawTotal <= 0 || hasNoDecimals || (expected > 1 && Math.abs(rawTotal - expected) / expected > 0.10)) {
    return expected;
  }
  return rawTotal;
}

// =========================================================================
// Pattern matchers — each returns an OcrReceiptItem or null
// =========================================================================

// VAT tail regex depends on profile
function tailRegex(profile: ReceiptProfile): string {
  // OCR often mangles VAT letters: A→Ą, C→(, [, etc.
  if (profile.vatSuffix === 'spaced') return '(?:\\s+[^\\d\\s])?\\s*$';
  if (profile.vatSuffix === 'merged') return '[^\\d\\s]?\\s*$';
  return '\\s*$';
}

const TOTAL_RE = '([\\w][\\d.,\\s/_%]*\\d?)';

type PatternFn = (line: string, nextLine: string, profile: ReceiptProfile) => { item: OcrReceiptItem; skipNext: boolean } | null;

// SZT variants OCR produces: iszt, Iszt, lszt, |szt, oszt, 1szt
const SZT = '[|oO]?szt';

const patternS: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  // qty before szt: 1-2 digits or OCR letter (I/i/l/L = 1)
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d{1,2}|[IilLl])\\s*${SZT}\\s*[*xX]+\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL_RE}\\s*${TAIL}`, 'i'));
  if (!match) return null;
  const qty = /^[IilLl]$/.test(match[2]) ? 1 : parseInt(match[2]);
  const unitPrice = cleanPrice(match[3]);
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(match[4]), unitPrice, qty) }, skipNext: false };
};

// Pattern S for pipe-prefixed szt: "NAME 100 |szt*24,99= 24,99" — pipe is OCR artifact, qty=1
const patternSPipe: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+\\|${SZT}\\s*[*xX]+\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL_RE}\\s*${TAIL}`, 'i'));
  if (!match) return null;
  const unitPrice = cleanPrice(match[2]);
  return { item: { name: match[1].trim(), quantity: 1, unitPrice, amount: saneTotal(cleanPrice(match[3]), unitPrice, 1) }, skipNext: false };
};

const patternS2: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+[IilLl1|o]${SZT}\\s*[*xX]\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL_RE}\\s*${TAIL}`, 'i'));
  if (!match) return null;
  const unitPrice = cleanPrice(match[2]);
  return { item: { name: match[1].trim(), quantity: 1, unitPrice, amount: saneTotal(cleanPrice(match[3]), unitPrice, 1) }, skipNext: false };
};

// Pattern WK: weight items with kg attached — "NAME 0,146kgx29,90= 4,37 C" or "0,432kg*22,99= 9,93"
const patternWK: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+[.,]\\d+)\\s*kg\\s*[xX*%]\\s*(\\d+[.,]\\d{2})\\s*[=:]\\s*${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const qty = parseAmount(match[2]);
  const unitPrice = cleanPrice(match[3]);
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(match[4]), unitPrice, qty) }, skipNext: false };
};

const patternW: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+[.,]\\d+)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const qty = parseAmount(match[2]);
  const unitPrice = cleanPrice(match[3]);
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(match[4]), unitPrice, qty) }, skipNext: false };
};

const patternA: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const qty = parseAmount(match[2]);
  const unitPrice = cleanPrice(match[3]);
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(match[4]), unitPrice, qty) }, skipNext: false };
};

const patternB: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s*[xX*«][^\\d]?(\\d+[.,]\\d{2})[\\s=:]+${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const qty = parseAmount(match[2]);
  const unitPrice = cleanPrice(match[3]);
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(match[4]), unitPrice, qty) }, skipNext: false };
};

const patternB2: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+\\D{0,3}[xX*«]\\s*(\\d+[.,]\\d{2})[\\s=:]+${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const unitPrice = cleanPrice(match[2]);
  const rawTotal = cleanPrice(match[3]);
  const total = rawTotal > 0 ? rawTotal : unitPrice;
  const derivedQty = unitPrice > 0 ? Math.round(total / unitPrice) : 1;
  const qty = derivedQty > 0 ? derivedQty : 1;
  return { item: { name: match[1].trim(), quantity: qty, unitPrice, amount: saneTotal(total, unitPrice, qty) }, skipNext: false };
};

const patternC: PatternFn = (line, _next, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+)\\s+(\\d+[.,]\\d{2})[\\s=:]+${TOTAL_RE}\\s*${TAIL}`));
  if (!match) return null;
  const name = match[1].trim();
  let qty = parseAmount(match[2]);
  let unitPrice = cleanPrice(match[3]);
  let total = cleanPrice(match[4]);

  if (Math.abs(qty * unitPrice - total) > 1 && unitPrice > total * 1.5) {
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
    return { item: { name, quantity: qty, unitPrice, amount: total }, skipNext: false };
  }
  return null;
};

const patternD: PatternFn = (line, nextLine, profile) => {
  const TAIL = tailRegex(profile);
  const match = line.match(new RegExp(`^(.+?)\\s+(\\d+[.,]\\d{2})\\s*${TAIL}`));
  if (!match || match[1].length <= 2 || /^\d/.test(match[1])) return null;
  const name = match[1].trim();
  const qtyMatch = nextLine.match(/^\s*(\d+[.,]?\d*)\s*[xX*«]\s*(\d+[.,]\d{2})/);

  if (qtyMatch) {
    return {
      item: { name, quantity: parseAmount(qtyMatch[1]), unitPrice: cleanPrice(qtyMatch[2]), amount: cleanPrice(match[2]) },
      skipNext: true,
    };
  }
  return { item: { name, quantity: 1, unitPrice: cleanPrice(match[2]), amount: cleanPrice(match[2]) }, skipNext: false };
};

const patternE: PatternFn = (line) => {
  const match = line.match(/^(.+?)\s+(\d+[.,]\d{2})\d\s*$/);
  if (!match || match[1].length <= 2 || /^\d/.test(match[1])) return null;
  return { item: { name: match[1].trim(), quantity: 1, unitPrice: cleanPrice(match[2]), amount: cleanPrice(match[2]) }, skipNext: false };
};

const patternF: PatternFn = (line, nextLine, profile) => {
  if (line.length <= 3 || /^\d/.test(line)) return null;
  const TAIL = tailRegex(profile);

  const qtyPriceMatch = nextLine.match(new RegExp(`^\\s*(\\d+[.,]?\\d*)\\s*[xX*«]\\s*(\\d+[.,]\\d{2})\\s+${TOTAL_RE}\\s*${TAIL}`));
  if (qtyPriceMatch) {
    const qty = parseAmount(qtyPriceMatch[1]);
    const unitPrice = cleanPrice(qtyPriceMatch[2]);
    return { item: { name: line.trim(), quantity: qty, unitPrice, amount: saneTotal(cleanPrice(qtyPriceMatch[3]), unitPrice, qty) }, skipNext: true };
  }

  const qtyPriceOnly = nextLine.match(/^\s*(\d+[.,]?\d*)\s*[xX*«]\s*(\d+[.,]\d{2})\s*$/);
  if (qtyPriceOnly) {
    const qty = parseAmount(qtyPriceOnly[1]);
    const unitPrice = cleanPrice(qtyPriceOnly[2]);
    return { item: { name: line.trim(), quantity: qty, unitPrice, amount: Math.round(qty * unitPrice * 100) / 100 }, skipNext: true };
  }
  return null;
};

// Pattern registry
const PATTERN_MAP: Record<string, PatternFn> = {
  SP: patternSPipe, S: patternS, S2: patternS2, WK: patternWK, W: patternW,
  A: patternA, B: patternB, B2: patternB2,
  C: patternC, D: patternD, E: patternE, F: patternF,
};

// =========================================================================
// Main parser
// =========================================================================

export function parseReceiptLines(text: string, profile?: ReceiptProfile): OcrReceiptItem[] {
  const prof = profile || defaultProfile;
  const items: OcrReceiptItem[] = [];
  const lines = text.split('\n')
    .map(l => l.replace(/^[\|\s]+/, '').replace(/[\|\s]+$/, '').trim())
    .filter(l => l.length > 0);

  const patterns = prof.preferredPatterns
    .map(id => PATTERN_MAP[id])
    .filter(Boolean);

  let inProducts = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of products section
    if (prof.productStart.test(line)) {
      inProducts = true;
      continue;
    }

    // Detect end of products section
    if (prof.productEnd.test(line)) {
      inProducts = false;
      continue;
    }
    // Also catch truncated summary/PTU lines
    if (/^[\|\s]*(PTU\s+[A-H]|[A-Z]{1,2}\s+PTU|[A-Z]{1,2}\s+PLN|[A-Z]{1,2}\s+\d+[.,]\d{2}\s*%)/i.test(line)) {
      inProducts = false;
      continue;
    }

    if (isSkipLine(line, prof)) continue;
    if (!inProducts) continue;

    // Skip discount summary lines (e.g. "OPUST u stawce f -3,61", "suma Opustów")
    if (prof.discountSummaryPatterns.some(p => p.test(line))) continue;

    // Check discount lines
    const isDiscount = prof.discountPatterns.some(p => p.test(line));
    if (isDiscount) {
      if (prof.discountMode === 'apply' && items.length > 0) {
        // Extract discount amount and subtract from previous item
        for (const dp of prof.discountPatterns) {
          const dm = line.match(dp);
          if (dm) {
            const discountAmt = cleanPrice(dm[1]);
            if (discountAmt > 0) {
              const lastItem = items[items.length - 1];
              lastItem.amount = Math.round((lastItem.amount - discountAmt) * 100) / 100;
              if (lastItem.quantity === 1) {
                lastItem.unitPrice = lastItem.amount;
              } else if (lastItem.unitPrice) {
                lastItem.unitPrice = Math.round(lastItem.amount / lastItem.quantity * 100) / 100;
              }
            }
            break;
          }
        }
      }
      // Both 'skip' and 'apply' skip the line (don't add as product)
      continue;
    }

    // Also skip generic discount-like lines not caught by profile patterns
    if (/(?:opust|rabat|znizk|upust|[Uu]+w?zgl)/i.test(line)) {
      continue;
    }

    // Try patterns in profile-preferred order
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    let matched = false;

    for (const patternFn of patterns) {
      const result = patternFn(line, nextLine, prof);
      if (result) {
        // Strip name prefix (e.g. "C_" tax group) if profile defines it
        if (prof.namePrefix) {
          result.item.name = result.item.name.replace(prof.namePrefix, '').trim();
        }
        items.push(result.item);
        if (result.skipNext) i++;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    // No pattern matched — skip line
  }

  return items;
}

// =========================================================================
// Total detection
// =========================================================================

function detectTotal(text: string): number | null {
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

// =========================================================================
// OCR engine
// =========================================================================

function autoOrient(inputPath: string): void {
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
    autoOrient(inputPath);

    let bestText = '';
    for (const psm of ['4', '6', '3']) {
      try {
        const text = runTesseract(inputPath, outputBase, psm);
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

// =========================================================================
// Public API
// =========================================================================

export function reparseRawText(rawText: string): OcrReceipt {
  const profile = detectProfile(rawText);
  return {
    storeName: detectStore(rawText),
    receiptDate: detectDate(rawText),
    totalAmount: detectTotal(rawText),
    items: parseReceiptLines(rawText, profile),
    rawText,
    profileUsed: profile.name,
  };
}

export function parseReceiptImage(imageBuffer: Buffer, mimeType: string): OcrReceipt {
  const rawText = runOcr(imageBuffer, mimeType);
  return reparseRawText(rawText);
}
