import { CsvParser } from '../types';
import { pekaoParser } from './pekao';
import { pkobpParser } from './pkobp';
import { creditAgricoleParser } from './creditagricole';

const parsers: Record<string, CsvParser> = {
  pekao: pekaoParser,
  pkobp: pkobpParser,
  creditagricole: creditAgricoleParser,
};

export function getParser(bankId: string): CsvParser | undefined {
  return parsers[bankId];
}

export { pekaoParser, pkobpParser, creditAgricoleParser };
