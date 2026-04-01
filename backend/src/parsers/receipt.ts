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

// Parser for e-paragon JSON format (Ministerstwo Finansów)
export function parseReceiptJson(content: string): ParsedReceipt {
  const data = JSON.parse(content);

  // e-paragon format may vary, handle common structures
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
    rawData: content,
  };
}
