export interface Account {
  id: number;
  name: string;
  bank: 'pekao' | 'pkobp' | 'creditagricole';
  account_number: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  description: string;
  amount: number;
  balance_after: number | null;
  type: string | null;
  counterparty: string | null;
  import_hash: string | null;
  category_id: number | null;
  is_split: number;
  created_at: string;
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  description: string;
  amount: number;
  category_id: number | null;
  product_id: number | null;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  last_price: number | null;
  times_purchased: number;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: number;
  transaction_id: number | null;
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  source_filename: string | null;
  raw_data: string | null;
  created_at: string;
}

export interface ReceiptItem {
  id: number;
  receipt_id: number;
  name: string;
  quantity: number;
  unit_price: number | null;
  amount: number;
  product_id: number | null;
  category_id: number | null;
  created_at: string;
}

export interface Import {
  id: number;
  account_id: number | null;
  type: string;
  filename: string;
  rows_imported: number;
  rows_skipped: number;
  imported_at: string;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  balanceAfter?: number;
  type?: string;
  counterparty?: string;
  category?: string;
  sourceAccount?: string;
  destAccount?: string;
}

export interface CsvParser {
  bankId: string;
  parse(content: string): ParsedTransaction[];
}
