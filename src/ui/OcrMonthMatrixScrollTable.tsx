import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import type { MappingValue } from '@/src/convert/types';
import {
  formatOcrCellForDisplay,
  type OcrCellDisplayMode,
} from '@/src/sources/ocr/cellDisplay';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

const NAME_W = 118;
const COL_W = 56;
const ROW_H = 34;
const HEAD_H = 36;

type Props = {
  grid: MonthMatrixGrid;
  matchedName?: string | null;
  title?: string;
  displayMode?: OcrCellDisplayMode;
  presetMapping?: Record<string, MappingValue> | null;
  colors?: Record<string, string> | null;
  ocrEngineId?: string | null;
};

function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9,]+/g, ' ')
    .trim();
}

function OcrMonthMatrixScrollTableInner({
  grid,
  matchedName,
  title,
  displayMode = 'codes',
  presetMapping = null,
  colors = null,
  ocrEngineId = null,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const matchKey = matchedName ? nameKey(matchedName) : '';
  const colW = displayMode === 'both' ? 72 : COL_W;
  const rowH = displayMode === 'both' ? 40 : ROW_H;

  if (!grid.rows.length || !grid.headers.length) return null;

  const daysWidth = grid.headers.length * colW;

  const cellText = (raw: string) =>
    formatOcrCellForDisplay(raw, displayMode, presetMapping, colors, null, ocrEngineId);

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={styles.hint}>
        {t('sourceOcrMatrixScrollHint', {
          people: grid.rows.length,
          days: grid.headers.length,
        })}
      </Text>
      <View style={styles.frame}>
        <ScrollView
          style={styles.vScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          removeClippedSubviews
        >
          <View style={styles.tableRow}>
            <View style={styles.nameCol}>
              <View style={[styles.cell, styles.headCell, styles.nameCell, { height: HEAD_H }]}>
                <Text style={styles.headText} numberOfLines={1}>
                  {t('sourceOcrMatrixNameCol')}
                </Text>
              </View>
              {grid.rows.map((r) => {
                const mine = matchKey && nameKey(r.name) === matchKey;
                return (
                  <View
                    key={r.name + r.yCenter}
                    style={[
                      styles.cell,
                      styles.nameCell,
                      { height: rowH },
                      mine && styles.matchedRow,
                    ]}
                  >
                    <Text style={[styles.nameText, mine && styles.matchedText]} numberOfLines={2}>
                      {mine ? `▸ ${r.name}` : r.name}
                    </Text>
                  </View>
                );
              })}
            </View>

            <ScrollView
              horizontal
              style={styles.hScroll}
              contentContainerStyle={{ width: daysWidth }}
              showsHorizontalScrollIndicator
              bounces={false}
              nestedScrollEnabled
              removeClippedSubviews
            >
              <View>
                <View style={[styles.daysRow, { height: HEAD_H }]}>
                  {grid.headers.map((h, i) => (
                    <View
                      key={`${h}-${i}`}
                      style={[styles.cell, styles.headCell, styles.dayCell, { width: colW }]}
                    >
                      <Text style={styles.headText} numberOfLines={1}>
                        {h}
                      </Text>
                    </View>
                  ))}
                </View>
                {grid.rows.map((r) => {
                  const mine = matchKey && nameKey(r.name) === matchKey;
                  return (
                    <View
                      key={`d-${r.name}-${r.yCenter}`}
                      style={[styles.daysRow, { height: rowH }, mine && styles.matchedRow]}
                    >
                      {r.cells.map((c, i) => {
                        const shown = cellText(c);
                        return (
                          <View
                            key={`${r.name}-${i}`}
                            style={[styles.cell, styles.dayCell, { width: colW }]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                displayMode === 'both' && styles.dayTextBoth,
                              ]}
                              numberOfLines={displayMode === 'both' ? 2 : 1}
                            >
                              {shown || '·'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export const OcrMonthMatrixScrollTable = memo(OcrMonthMatrixScrollTableInner);

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { marginTop: 4, gap: 6 },
    title: {
      color: theme.color.ink,
      fontSize: 14,
      fontWeight: '600',
    },
    hint: {
      color: theme.color.inkMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    frame: {
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.color.surfaceMuted,
    },
    vScroll: { maxHeight: 420 },
    tableRow: { flexDirection: 'row' },
    nameCol: {
      width: NAME_W,
      borderRightWidth: 1,
      borderRightColor: theme.color.borderStrong,
      zIndex: 2,
      backgroundColor: theme.color.surface,
    },
    hScroll: { flex: 1 },
    daysRow: { flexDirection: 'row' },
    cell: {
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
    },
    nameCell: { width: NAME_W, paddingHorizontal: 6 },
    dayCell: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.color.border,
      alignItems: 'center',
    },
    headCell: {
      backgroundColor: theme.color.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.borderStrong,
    },
    headText: {
      color: theme.color.inkSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    nameText: {
      color: theme.color.ink,
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 13,
    },
    dayText: {
      color: theme.color.ink,
      fontSize: 11,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    dayTextBoth: {
      fontSize: 9,
      lineHeight: 11,
    },
    matchedRow: {
      backgroundColor: theme.color.primaryTint,
    },
    matchedText: {
      color: theme.color.primary,
    },
  });
}
