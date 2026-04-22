/**
 * Receipt profiles — store-specific parsing rules.
 *
 * Each profile defines:
 *  - storePatterns: regex to auto-detect the store from OCR text
 *  - productStart/productEnd: section boundaries for the product list
 *  - skipPatterns: extra lines to ignore (store-specific headers/footers)
 *  - discountMode:
 *      'skip'  — discount lines are informational, ignore them
 *      'apply' — discount line reduces the price of the preceding item
 *  - discountPatterns: regexes matching discount lines (with amount capture group)
 *  - vatSuffix:
 *      'spaced' — "14,99 A" (Carrefour, Kaufland)
 *      'merged' — "14,99A"  (Dino, Biedronka, Rossmann)
 *      'none'   — no VAT letter on product lines
 *  - preferredPatterns: ordered list of pattern IDs to try first (faster matching)
 */

export interface ReceiptProfile {
  name: string;
  storePatterns: RegExp[];
  productStart: RegExp;
  productEnd: RegExp;
  skipPatterns: RegExp[];
  discountMode: 'skip' | 'apply';
  discountPatterns: RegExp[];
  discountSummaryPatterns: RegExp[];
  vatSuffix: 'spaced' | 'merged' | 'none';
  namePrefix?: RegExp;
  preferredPatterns: string[];
  // Human-readable descriptions for UI display
  desc: {
    dateFormat: string;       // e.g. "DD.MM.YYYY", "YYYY-MM-DD"
    productStartText: string; // e.g. "PARAGON FISKALNY"
    productEndText: string;   // e.g. "Sprzedaż opodatkowana" or "SUMA PLN"
    namePrefixText: string;   // e.g. "C_, A_, B_ (grupa podatkowa)" or "brak"
    vatSuffixText: string;    // e.g. "14,99 A (spacja)" or "14,99A (bez spacji)"
    qtyFormat: string;        // e.g. "3szt*2,05=" or "3 x 2,05"
    headerFormat: string;     // e.g. "NIP, adres, nr kasy"
    totalFormat: string;      // e.g. "SUMA PLN 169,10" or "RAZEM: 45,00"
  };
}

// ---------------------------------------------------------------------------
// Store profiles
// ---------------------------------------------------------------------------

const carrefour: ReceiptProfile = {
  name: 'Carrefour',
  storePatterns: [/carrefour/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(sprzed\.?\s*opod|SUMA|RAZEM|S\.?UKA|[-=_]{5,})/i,
  skipPatterns: [
    /^(KARTA|VISA|MASTER|GOTOW|RESZTA|PŁATN|PLATN)/i,
  ],
  discountMode: 'apply',
  discountPatterns: [
    // "OPUST C_SER SALAMI KLEKPO -3,10 C" — name between OPUST and negative amount
    /^OPUST\s+.+\s+-(\d+[.,]\d{2})/i,
    /(?:opust|rabat|upust|znizk|promo)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [
    /^OPUST\s+u\s+stawce/i,       // "OPUST u stawce f -3,61"
    /^suma\s+[Oo]pust/i,           // "suma Opustów -31,65"
  ],
  vatSuffix: 'spaced',
  namePrefix: /^[A-Z]_/,
  preferredPatterns: ['SP', 'S', 'S2', 'WK', 'W', 'A', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'C_, A_, B_ (grupa podatkowa)',
    vatSuffixText: '14,99 A (spacja + litera)',
    qtyFormat: '3szt*2,05= 6,15 C',
    headerFormat: 'NIP, adres, nr kasy, nr paragonu',
    totalFormat: 'SUKA PLN 169,10',
  },
};

const dino: ReceiptProfile = {
  name: 'Dino',
  storePatterns: [/dino\b/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|promo)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'merged',
  preferredPatterns: ['A', 'W', 'B', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99A (litera doklejona)',
    qtyFormat: '1 x 5,99  5,99 A',
    headerFormat: 'NIP, adres, nr kasy',
    totalFormat: 'SUMA PLN',
  },
};

const biedronka: ReceiptProfile = {
  name: 'Biedronka',
  storePatterns: [/biedronka/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|karta moja|moja biedr)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'merged',
  preferredPatterns: ['A', 'W', 'B', 'C', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99A (litera doklejona)',
    qtyFormat: '1 x 5,99  5,99 A',
    headerFormat: 'NIP, adres, karta moja Biedronka',
    totalFormat: 'SUMA PLN',
  },
};

const lidl: ReceiptProfile = {
  name: 'Lidl',
  storePatterns: [/lidl/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|lidl plus)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'merged',
  preferredPatterns: ['A', 'W', 'B', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99A (litera doklejona)',
    qtyFormat: '1 x 5,99  5,99A',
    headerFormat: 'NIP, adres, Lidl Plus',
    totalFormat: 'SUMA PLN',
  },
};

const kaufland: ReceiptProfile = {
  name: 'Kaufland',
  storePatterns: [/kaufland/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|k-card)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'spaced',
  preferredPatterns: ['A', 'W', 'B', 'C', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99 A (spacja + litera)',
    qtyFormat: '1 x 5,99  5,99 A',
    headerFormat: 'NIP, adres, K-Card',
    totalFormat: 'SUMA PLN',
  },
};

const rossmann: ReceiptProfile = {
  name: 'Rossmann',
  storePatterns: [/rossmann/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [
    /^(z recept|do zap[łl]at|podsuma)/i,
  ],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|rossne)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'merged',
  preferredPatterns: ['A', 'B', 'D', 'E', 'F'],
  desc: {
    dateFormat: 'YYYY-MM-DD / Data: DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99A (litera doklejona)',
    qtyFormat: '1 x 5,99  5,99A',
    headerFormat: 'NIP, adres, Data:',
    totalFormat: 'SUMA PLN',
  },
};

const zabka: ReceiptProfile = {
  name: 'Żabka',
  storePatterns: [/zabka|żabka/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'skip',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|żappk)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'merged',
  preferredPatterns: ['A', 'D', 'B', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99A (litera doklejona)',
    qtyFormat: '1 x 5,99  5,99A',
    headerFormat: 'NIP, adres, Żappka',
    totalFormat: 'SUMA PLN',
  },
};

const auchan: ReceiptProfile = {
  name: 'Auchan',
  storePatterns: [/auchan/i],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|[-=_]{5,})/i,
  skipPatterns: [],
  discountMode: 'apply',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk|skonto)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [],
  vatSuffix: 'spaced',
  preferredPatterns: ['A', 'W', 'B', 'C', 'D', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA',
    namePrefixText: 'brak',
    vatSuffixText: '14,99 A (spacja + litera)',
    qtyFormat: '1 x 5,99  5,99 A',
    headerFormat: 'NIP, adres, skonto',
    totalFormat: 'SUMA PLN',
  },
};

// ---------------------------------------------------------------------------
// Default (generic) profile — used when store is not detected
// ---------------------------------------------------------------------------

export const defaultProfile: ReceiptProfile = {
  name: 'Generic',
  storePatterns: [],
  productStart: /PARAGON|FISKALNY/i,
  productEnd: /^[\s|]*(S?P?RZEDA|SPRZED\.|SP\.\s*OP|SUMA|RAZEM|S\.?UMA|S\.?UKA|ŚUKA|[-=_]{5,})/i,
  skipPatterns: [
    /^(z recept|do zap[łl]at|o zap[łl]at|podsuma|podsum\b)/i,
  ],
  discountMode: 'skip',
  discountPatterns: [
    /(?:opust|rabat|upust|znizk)[a-ząćęłńóśźż\s]*[:\-]?\s*-?\s*(\d+[.,]\d{2})/i,
  ],
  discountSummaryPatterns: [
    /^OPUST\s+u\s+stawce/i,
    /^suma\s+[Oo]pust/i,
  ],
  vatSuffix: 'merged',
  preferredPatterns: ['SP', 'S', 'S2', 'WK', 'W', 'A', 'B', 'B2', 'C', 'D', 'E', 'F'],
  desc: {
    dateFormat: 'DD.MM.YYYY / YYYY-MM-DD (auto)',
    productStartText: 'PARAGON FISKALNY',
    productEndText: 'Sprzedaż opodatkowana / SUMA / RAZEM',
    namePrefixText: 'brak',
    vatSuffixText: 'auto (spacja lub doklejona)',
    qtyFormat: 'wszystkie formaty',
    headerFormat: 'auto',
    totalFormat: 'SUMA / RAZEM / TOTAL PLN',
  },
};

// ---------------------------------------------------------------------------
// All named profiles
// ---------------------------------------------------------------------------

export const PROFILES: ReceiptProfile[] = [
  carrefour, dino, biedronka, lidl, kaufland, rossmann, zabka, auchan,
];

/**
 * Detect which profile to use based on the full OCR text.
 * Returns the matching profile or the default generic one.
 */
export function detectProfile(text: string): ReceiptProfile {
  for (const profile of PROFILES) {
    for (const pattern of profile.storePatterns) {
      if (pattern.test(text)) return profile;
    }
  }
  return defaultProfile;
}
