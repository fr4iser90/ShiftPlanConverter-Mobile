import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import { parseOcrDutyCell } from '@/src/convert/parsers/ocr/matrixToEntries';
import type { MappingValue } from '@/src/convert/types';
import {
  findDateDutyColumnByShort,
  formatDateDutyCellTime,
  formatDateDutyTimeLabel,
  resolveDateDutyColumnTime,
} from '@/src/packs/dateDutyTimes';
import type { PackDateDutyConfig } from '@/src/packs/types';
import {
  formatOcrCellForDisplay,
  type OcrCellDisplayMode,
} from '@/src/sources/ocr/cellDisplay';
import type { MonthMatrixGrid } from '@/src/sources/ocr/layouts/month-matrix';
import {
  filterPreferredNameMatches,
  normalizeNameKeyPublic,
} from '@/src/sources/ocr/names';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

const NAME_W = 118;
const COL_W = 56;
const ROW_H = 34;
const HEAD_H = 36;

type Props = {
  grid: MonthMatrixGrid;
  matchedName?: string | null;
  displayMode?: OcrCellDisplayMode;
  presetMapping?: Record<string, MappingValue> | null;
  colors?: Record<string, string> | null;
  ocrEngineId?: string | null;
  /** Pack date×duty times (Anästhesie HD/RD/…). */
  dateDuty?: PackDateDutyConfig | null;
  /** Default true when matchedName is set — photo below still shows full board. */
  onlyMine?: boolean;
  onOnlyMineChange?: (onlyMine: boolean) => void;
  /** Tap cell to edit (only matched / visible rows). */
  editable?: boolean;
  onEditCell?: (dayHeader: string, currentCell: string) => void;
};

function rosterDateForHeader(
  header: string,
  month?: number,
  year?: number
): Date | null {
  const day = Number.parseInt(String(header || '').trim(), 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  if (!month || month < 1 || month > 12 || !year || year < 2000) return null;
  return new Date(year, month - 1, day);
}

function OcrMonthMatrixScrollTableInner({
  grid,
  matchedName,
  displayMode = 'codes',
  presetMapping = null,
  colors = null,
  ocrEngineId = null,
  dateDuty = null,
  onlyMine = true,
  onOnlyMineChange,
  editable = false,
  onEditCell,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const matchName = String(matchedName || '').trim();
  const colW = displayMode === 'codes' ? COL_W : displayMode === 'times' ? 88 : 96;
  const rowH = displayMode === 'both' ? 40 : ROW_H;

  const mineKeys = useMemo(() => {
    if (!matchName || !grid.rows.length) return new Set<string>();
    const cands = grid.rows.map((r) => ({
      id: normalizeNameKeyPublic(r.name),
      label: r.name,
      yCenter: r.yCenter,
      height: 0,
    }));
    return new Set(
      filterPreferredNameMatches(matchName, cands, null, 0.8).map((c) =>
        normalizeNameKeyPublic(c.label)
      )
    );
  }, [grid.rows, matchName]);

  const rows = useMemo(() => {
    if (!onlyMine || !matchName || !mineKeys.size) return grid.rows;
    return grid.rows.filter((r) => mineKeys.has(normalizeNameKeyPublic(r.name)));
  }, [grid.rows, onlyMine, matchName, mineKeys]);

  if (!grid.rows.length || !grid.headers.length) return null;

  const daysWidth = grid.headers.length * colW;

  const cellText = (raw: string, header: string) => {
    // Date×duty cells are pack duty shorts (HD, RDN, …), not LOGA preset codes.
    if (grid.overlayLayout === 'date-duty') {
      const s = String(raw || '').trim();
      if (!s) return '';
      const date = rosterDateForHeader(header, grid.rosterMonth, grid.rosterYear);
      const parts = parseOcrDutyCell(s);
      const codeLabel = parts.map((p) => p.short).join('+') || s;
      const timeParts: string[] = [];
      for (const p of parts) {
        if (p.start && p.end) {
          timeParts.push(
            formatDateDutyTimeLabel({
              start: p.start,
              end: p.end,
              endNextDay: p.endNextDay || p.end < p.start,
            })
          );
          continue;
        }
        if (date && dateDuty) {
          const col = findDateDutyColumnByShort(dateDuty, p.short);
          const tSlot = col ? resolveDateDutyColumnTime(col, date) : null;
          if (tSlot) timeParts.push(formatDateDutyTimeLabel(tSlot));
        }
      }
      const time =
        timeParts.join('·') || formatDateDutyCellTime(codeLabel, dateDuty, date);
      if (displayMode === 'times') return time;
      if (displayMode === 'both') return time ? `${codeLabel}·${time}` : codeLabel;
      return codeLabel;
    }
    return formatOcrCellForDisplay(
      raw,
      displayMode,
      presetMapping,
      colors,
      null,
      ocrEngineId
    );
  };

  const showPeopleToggle = !!matchName && grid.rows.length > 1;

  return (
    <View style={styles.wrap}>
      {showPeopleToggle ? (
        <View style={styles.peopleSeg}>
          <Pressable
            onPress={() => onOnlyMineChange?.(true)}
            style={[styles.peopleBtn, onlyMine && styles.peopleBtnOn]}
          >
            <Text style={[styles.peopleText, onlyMine && styles.peopleTextOn]}>
              {t('sourceOcrComparePeopleMine')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onOnlyMineChange?.(false)}
            style={[styles.peopleBtn, !onlyMine && styles.peopleBtnOn]}
          >
            <Text style={[styles.peopleText, !onlyMine && styles.peopleTextOn]}>
              {t('sourceOcrComparePeopleAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
              {rows.map((r) => {
                const mine = mineKeys.has(normalizeNameKeyPublic(r.name));
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
                {rows.map((r) => {
                  const mine = mineKeys.has(normalizeNameKeyPublic(r.name));
                  return (
                    <View
                      key={`d-${r.name}-${r.yCenter}`}
                      style={[styles.daysRow, { height: rowH }, mine && styles.matchedRow]}
                    >
                      {r.cells.map((c, i) => {
                        const header = grid.headers[i] || '';
                        const shown = cellText(c, header);
                        const canEdit = editable && !!onEditCell && (!matchName || mine);
                        const inner = (
                          <Text
                            style={[
                              styles.dayText,
                              (displayMode === 'both' || displayMode === 'times') &&
                                styles.dayTextBoth,
                            ]}
                            numberOfLines={displayMode === 'codes' ? 1 : 2}
                          >
                            {shown || '·'}
                          </Text>
                        );
                        return canEdit ? (
                          <Pressable
                            key={`${r.name}-${i}`}
                            onPress={() => onEditCell(header, c || '')}
                            style={[styles.cell, styles.dayCell, { width: colW }]}
                          >
                            {inner}
                          </Pressable>
                        ) : (
                          <View
                            key={`${r.name}-${i}`}
                            style={[styles.cell, styles.dayCell, { width: colW }]}
                          >
                            {inner}
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
    peopleSeg: {
      flexDirection: 'row',
      gap: 6,
      alignSelf: 'flex-start',
    },
    peopleBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    peopleBtnOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primaryTint,
    },
    peopleText: {
      color: theme.color.inkSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    peopleTextOn: {
      color: theme.color.primary,
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
