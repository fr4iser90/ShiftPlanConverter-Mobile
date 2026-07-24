/**
 * Lightweight in-app markdown renderer (headings, lists, tables, bold, links).
 * No external markdown package.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/src/ui/theme';

type Props = {
  source: string;
  theme: AppTheme;
};

type Block =
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'hr' }
  | { type: 'table'; headers: string[]; rows: string[][] };

function splitTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}

function isTableSep(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

export function parseMarkdownBlocks(source: string): Block[] {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        parts.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'p', text: parts.filter(Boolean).join(' ') });
      continue;
    }

    const hm = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (hm) {
      blocks.push({
        type: 'h',
        level: hm[1].length as 1 | 2 | 3,
        text: hm[2].trim(),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const n = lines[i].trim();
      if (!n) break;
      if (
        n.startsWith('#') ||
        n.startsWith('|') ||
        /^[-*]\s+/.test(n) ||
        /^\d+\.\s+/.test(n) ||
        /^---+$/.test(n)
      ) {
        break;
      }
      para.push(n);
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }

  return blocks;
}

function Inline({
  text,
  style,
  theme,
}: {
  text: string;
  style: object;
  theme: AppTheme;
}) {
  // **bold**, [label](url) — relative docs links → label only
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      nodes.push(<Text key={key++}>{text.slice(last, m.index)}</Text>);
    }
    const token = m[0];
    if (token.startsWith('**')) {
      nodes.push(
        <Text key={key++} style={{ fontWeight: '700' }}>
          {token.slice(2, -2)}
        </Text>
      );
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const label = lm?.[1] || token;
      const url = lm?.[2] || '';
      if (/^https?:\/\//i.test(url)) {
        nodes.push(
          <Text
            key={key++}
            style={{ color: theme.color.primary, fontWeight: '600' }}
            onPress={() => void Linking.openURL(url)}
          >
            {label}
          </Text>
        );
      } else {
        nodes.push(
          <Text key={key++} style={{ fontWeight: '600' }}>
            {label}
          </Text>
        );
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<Text key={key++}>{text.slice(last)}</Text>);
  }
  return <Text style={style}>{nodes}</Text>;
}

export function MarkdownView({ source, theme }: Props) {
  const blocks = useMemo(() => parseMarkdownBlocks(source), [source]);
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      {blocks.map((b, idx) => {
        if (b.type === 'hr') {
          return <View key={idx} style={styles.hr} />;
        }
        if (b.type === 'h') {
          const st =
            b.level === 1 ? styles.h1 : b.level === 2 ? styles.h2 : styles.h3;
          return <Inline key={idx} text={b.text} style={st} theme={theme} />;
        }
        if (b.type === 'p') {
          return <Inline key={idx} text={b.text} style={styles.p} theme={theme} />;
        }
        if (b.type === 'ul' || b.type === 'ol') {
          return (
            <View key={idx} style={styles.list}>
              {b.items.map((item, j) => (
                <View key={j} style={styles.liRow}>
                  <Text style={styles.bullet}>
                    {b.type === 'ol' ? `${j + 1}.` : '•'}
                  </Text>
                  <Inline text={item} style={styles.liText} theme={theme} />
                </View>
              ))}
            </View>
          );
        }
        if (b.type === 'table') {
          return (
            <View key={idx} style={styles.table}>
              <View style={[styles.tr, styles.trHead]}>
                {b.headers.map((h, j) => (
                  <View key={j} style={styles.td}>
                    <Inline text={h} style={styles.thText} theme={theme} />
                  </View>
                ))}
              </View>
              {b.rows.map((row, ri) => (
                <View key={ri} style={styles.tr}>
                  {row.map((cell, ci) => (
                    <View key={ci} style={styles.td}>
                      <Inline text={cell} style={styles.tdText} theme={theme} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        return <Fragment key={idx} />;
      })}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { gap: 12, paddingBottom: 24 },
    h1: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.color.ink,
      marginTop: 4,
      lineHeight: 28,
    },
    h2: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.color.ink,
      marginTop: 8,
      lineHeight: 24,
    },
    h3: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.color.ink,
      marginTop: 4,
      lineHeight: 22,
    },
    p: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.color.inkSecondary,
    },
    hr: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.color.border,
      marginVertical: 4,
    },
    list: { gap: 6 },
    liRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
    bullet: {
      width: 18,
      fontSize: 14,
      lineHeight: 21,
      color: theme.color.primary,
      fontWeight: '700',
    },
    liText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 21,
      color: theme.color.inkSecondary,
    },
    table: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.color.border,
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.color.surfaceMuted,
    },
    tr: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
    },
    trHead: { backgroundColor: theme.color.surface },
    td: { flex: 1, paddingVertical: 8, paddingHorizontal: 6 },
    thText: { fontSize: 12, fontWeight: '700', color: theme.color.ink },
    tdText: { fontSize: 12, lineHeight: 17, color: theme.color.inkSecondary },
  });
}
