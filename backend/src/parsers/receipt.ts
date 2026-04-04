export interface ParsedReceipt {
  storeName: string;
  receiptDate: string;
  totalAmount: number;
  items: ParsedReceiptItem[];
  rawData: string;
}

export interface ParsedReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// Parse JPK_KASA_PARAGON format (Ministerstwo Finansów e-paragon)
function parseJpkParagon(data: any): ParsedReceipt | null {
  const doc = data.dokument;
  if (!doc?.paragon) return null;

  const paragon = doc.paragon;
  const podmiot = doc.podmiot1;

  const storeName = podmiot?.nazwaPod || '';
  const receiptDate = paragon.zakSprzed
    ? paragon.zakSprzed.substring(0, 10)
    : '';

  const items: ParsedReceiptItem[] = [];
  const pozycje = paragon.pozycja || [];

  for (const poz of pozycje) {
    const towar = poz.towar;
    if (!towar) continue;

    // Amounts in JPK are in grosze (1/100 PLN)
    const brutto = typeof towar.brutto === 'number' ? towar.brutto / 100 : 0;
    const cena = typeof towar.cena === 'number' ? towar.cena / 100 : brutto;
    const ilosc = parseFloat(towar.ilosc) || 1;

    items.push({
      name: towar.nazwa || '',
      quantity: ilosc,
      unitPrice: cena,
      amount: brutto,
    });
  }

  // Total in grosze
  const totalGrosze = paragon.podsum?.sumaBrutto || paragon.total?.zaplZwrot || 0;
  const totalAmount = typeof totalGrosze === 'number' ? totalGrosze / 100 : items.reduce((s, i) => s + i.amount, 0);

  return { storeName, receiptDate, totalAmount, items, rawData: JSON.stringify(data, null, 2) };
}

// Parse simple/generic JSON receipt format
function parseGenericReceipt(data: any): ParsedReceipt {
  const items: ParsedReceiptItem[] = [];

  const rawItems = data.items || data.pozycje || data.products || [];
  for (const item of rawItems) {
    items.push({
      name: item.name || item.nazwa || item.opis || '',
      quantity: item.quantity || item.ilosc || item.liczba || 1,
      unitPrice: item.unitPrice || item.cena || item.cenaJednostkowa || 0,
      amount: item.amount || item.wartosc || item.kwota || 0,
    });
  }

  return {
    storeName: data.storeName || data.sklep || data.nazwaSklepu || data.seller?.name || '',
    receiptDate: data.date || data.data || data.dataSprzedazy || '',
    totalAmount: data.total || data.suma || data.kwotaCalkowita || items.reduce((s, i) => s + i.amount, 0),
    items,
    rawData: JSON.stringify(data, null, 2),
  };
}

export function parseReceiptJson(content: string): ParsedReceipt {
  const data = JSON.parse(content);

  // Detect JPK_KASA_PARAGON format
  if (data.dokument?.paragon || data.dokument?.naglowek?.wersja?.startsWith('JPK_KASA')) {
    const result = parseJpkParagon(data);
    if (result) return result;
  }

  return parseGenericReceipt(data);
}
