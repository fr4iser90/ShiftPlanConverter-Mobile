import type { ParseResult } from '../types';
import { parseStElisabeth } from '../parser-st-elisabeth';

export type ParserFn = (text: string) => ParseResult;

const REGISTRY: Record<string, ParserFn> = {
  'st-elisabeth-zeitprotokoll-pdf': parseStElisabeth,
};

/** Default parser when pack omits parserId (builtin St. Elisabeth). */
export const DEFAULT_PARSER_ID = 'st-elisabeth-zeitprotokoll-pdf';

export function getParser(parserId: string | null | undefined): ParserFn {
  const id = (parserId || DEFAULT_PARSER_ID).trim();
  const fn = REGISTRY[id];
  if (!fn) {
    throw new Error(`Unknown parserId: ${id}`);
  }
  return fn;
}

export function listParserIds(): string[] {
  return Object.keys(REGISTRY);
}

export function registerParser(id: string, fn: ParserFn): void {
  REGISTRY[id] = fn;
}
