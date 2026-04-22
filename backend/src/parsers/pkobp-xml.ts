import { ParsedTransaction } from '../types';

/**
 * PKO BP XML format (iPKO export "Zestawienie operacji"):
 *
 * <account-history>
 *   <search><account>05102018110000030204548277</account></search>
 *   <operations>
 *     <operation>
 *       <order-date>2026-03-30</order-date>
 *       <exec-date>2026-03-30</exec-date>
 *       <type>Przelew na konto</type>
 *       <description>Rachunek nadawcy : ... Nazwa nadawcy : ... Tytuł : ...</description>
 *       <amount curr="PLN">+170.00</amount>
 *       <ending-balance curr="PLN">+2057.68</ending-balance>
 *     </operation>
 *   </operations>
 * </account-history>
 */

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  // Also get self-enclosing blocks
  const blockRe = new RegExp(`<${tag}[^/>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  if (results.length === 0) {
    while ((m = blockRe.exec(xml)) !== null) {
      results.push(m[1].trim());
    }
  }
  return results;
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/\s/g, '').replace(',', '.'));
}

function parseDescription(desc: string): { counterparty?: string; title?: string; accountNumber?: string } {
  const result: { counterparty?: string; title?: string; accountNumber?: string } = {};

  // Extract counterparty name: "Nazwa nadawcy : ..." or "Nazwa odbiorcy : ..."
  const nameMatch = desc.match(/Nazwa (?:nadawcy|odbiorcy)\s*:\s*(.+?)(?=\s+(?:Adres|Tytuł|Referencje|$))/i);
  if (nameMatch) result.counterparty = nameMatch[1].trim();

  // Extract title: "Tytuł : ..."
  const titleMatch = desc.match(/Tytuł\s*:\s*(.+?)(?=\s+(?:Referencje|$))/i);
  if (titleMatch) result.title = titleMatch[1].trim();

  // Extract account number: "Rachunek nadawcy : ..." or "Rachunek odbiorcy : ..."
  const acctMatch = desc.match(/Rachunek (?:nadawcy|odbiorcy)\s*:\s*(\d[\d\s]*\d)/i);
  if (acctMatch) result.accountNumber = acctMatch[1].replace(/\s/g, '');

  return result;
}

export interface PkoBpXmlResult {
  accountNumber: string | null;
  transactions: ParsedTransaction[];
}

export function parsePkoBpXml(content: string): PkoBpXmlResult {
  // Extract account number from search section
  const searchBlock = extractTag(content, 'search');
  const accountNumber = searchBlock ? extractTag(searchBlock, 'account') : null;

  // Extract all operations
  const operationBlocks = extractAllTags(content, 'operation');
  const transactions: ParsedTransaction[] = [];

  for (const op of operationBlocks) {
    const orderDate = extractTag(op, 'order-date');
    const execDate = extractTag(op, 'exec-date');
    const type = extractTag(op, 'type');
    const description = extractTag(op, 'description') || '';
    const amountStr = extractTag(op, 'amount');
    const balanceStr = extractTag(op, 'ending-balance');

    if (!amountStr || !orderDate) continue;

    const amount = parseAmount(amountStr);
    if (isNaN(amount)) continue;

    const balance = balanceStr ? parseAmount(balanceStr) : undefined;
    const parsed = parseDescription(description);

    // Build description from title or raw description
    const displayDesc = parsed.title || description;

    transactions.push({
      date: execDate || orderDate,
      description: displayDesc,
      amount,
      balanceAfter: isNaN(balance as number) ? undefined : balance,
      type: type || undefined,
      counterparty: parsed.counterparty,
      sourceAccount: amount >= 0 ? parsed.accountNumber : accountNumber || undefined,
      destAccount: amount < 0 ? parsed.accountNumber : accountNumber || undefined,
    });
  }

  return { accountNumber, transactions };
}
