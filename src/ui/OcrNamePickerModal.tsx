/**
 * Pick your name from OCR-detected roster names (left column).
 * Pencil on the right: correct OCR typos before confirming.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { t } from '@/src/i18n';
import {
  resolveConfirmedRosterLabel,
  type OcrNameCandidate,
} from '@/src/sources/ocr/names';
import { AppButton } from '@/src/ui/AppButton';
import { useTheme } from '@/src/ui/useTheme';
import type { AppTheme } from '@/src/ui/theme';

export type OcrNamePickResult = {
  id: string;
  /** Display label — may be user-corrected vs OCR. */
  label: string;
};

type Props = {
  visible: boolean;
  candidates: OcrNameCandidate[];
  suggestedId?: string | null;
  preferredLabel?: string | null;
  onCancel: () => void;
  onPick: (result: OcrNamePickResult) => void;
};

export function OcrNamePickerModal({
  visible,
  candidates,
  suggestedId,
  preferredLabel,
  onCancel,
  onPick,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** id → corrected label (OCR original stays in candidates until confirm). */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!visible) return;
    // Never default to the first roster name — that silently “becomes you”.
    setSelectedId(suggestedId || null);
    setEdits({});
    setEditingId(null);
    setDraft('');
  }, [visible, suggestedId, candidates]);

  const labelFor = (item: OcrNameCandidate) => {
    const v = edits[item.id];
    return typeof v === 'string' ? v : item.label;
  };

  const openEdit = (item: OcrNameCandidate) => {
    setSelectedId(item.id);
    setEditingId(item.id);
    setDraft(labelFor(item));
  };

  const saveEdit = () => {
    if (!editingId) return;
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next) {
      setEdits((prev) => ({ ...prev, [editingId]: next }));
    }
    setEditingId(null);
    setDraft('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Text style={styles.title}>{t('sourceOcrNameTitle')}</Text>
        <Text style={styles.hint}>{t('sourceOcrNameHint')}</Text>
        {preferredLabel ? (
          <Text style={styles.pref}>{t('sourceOcrNamePreferred', { name: preferredLabel })}</Text>
        ) : null}
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = selectedId === item.id;
            const label = labelFor(item);
            const edited = edits[item.id] != null && edits[item.id] !== item.label;
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                android_ripple={{ color: theme.color.primarySoft }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.row,
                  on && styles.rowOn,
                  pressed && !on && styles.rowPressed,
                ]}
              >
                <View
                  style={[styles.radio, on && styles.radioOn]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  {on ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowText, on && styles.rowTextOn]} numberOfLines={2}>
                    {label}
                  </Text>
                  {edited ? <Text style={styles.editedTag}>{t('sourceOcrNameEdited')}</Text> : null}
                </View>
                <Pressable
                  onPress={() => openEdit(item)}
                  hitSlop={12}
                  style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('sourceOcrNameEditA11y')}
                >
                  <FontAwesome name="pencil" size={16} color={theme.color.primary} />
                </Pressable>
              </Pressable>
            );
          }}
        />
        <View style={styles.actions}>
          {!selectedId ? (
            <Text style={styles.needPick}>{t('sourceOcrNameNeedPick')}</Text>
          ) : null}
          <AppButton
            title={t('sourceOcrNameConfirm')}
            disabled={!selectedId}
            onPress={() => {
              if (!selectedId) return;
              const base = candidates.find((c) => c.id === selectedId);
              if (!base) return;
              // Row pick = which line is yours. Settings preferred name wins over OCR junk
              // unless the user pencil-edited to a new spelling.
              const label = resolveConfirmedRosterLabel({
                preferred: preferredLabel,
                ocrLabel: base.label,
                pickedLabel: labelFor(base),
              });
              onPick({ id: selectedId, label });
            }}
          />
          <AppButton title={t('sourceOcrNameSkip')} variant="ghost" onPress={onCancel} />
        </View>
      </View>

      <Modal visible={!!editingId} transparent animationType="fade" onRequestClose={() => setEditingId(null)}>
        <Pressable style={styles.editBackdrop} onPress={() => setEditingId(null)}>
          <Pressable style={styles.editCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.editTitle}>{t('sourceOcrNameEditTitle')}</Text>
            <Text style={styles.editHint}>{t('sourceOcrNameEditHint')}</Text>
            <TextInput
              style={styles.editInput}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              placeholder={t('settingsOcrNamePlaceholder')}
              placeholderTextColor={theme.color.inkMuted}
            />
            <View style={styles.editActions}>
              <AppButton title={t('sourceOcrNameEditSave')} onPress={saveEdit} disabled={!draft.trim()} />
              <AppButton
                title={t('sourceOcrNameCancel')}
                variant="ghost"
                onPress={() => {
                  setEditingId(null);
                  setDraft('');
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.canvas,
      paddingTop: 52,
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    title: {
      color: theme.color.ink,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 6,
    },
    hint: {
      color: theme.color.inkMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    pref: {
      color: theme.color.primary,
      fontSize: 13,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingLeft: 12,
      paddingRight: 8,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      marginBottom: 8,
      backgroundColor: theme.color.surface,
      gap: 10,
      overflow: 'hidden',
    },
    rowOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    rowPressed: {
      backgroundColor: theme.color.primaryTint,
      opacity: 0.92,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: {
      borderColor: theme.color.primary,
    },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.color.primary,
    },
    rowMain: { flex: 1, gap: 2 },
    rowText: {
      color: theme.color.ink,
      fontSize: 16,
      fontWeight: '600',
    },
    rowTextOn: {
      color: theme.color.primary,
    },
    editedTag: {
      color: theme.color.primary,
      fontSize: 11,
      fontWeight: '600',
    },
    editBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    editBtnPressed: {
      backgroundColor: theme.color.primarySoft,
    },
    needPick: {
      color: theme.color.inkMuted,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 2,
    },
    actions: { gap: 8, marginTop: 12 },
    editBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    editCard: {
      backgroundColor: theme.color.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      gap: 8,
    },
    editTitle: {
      color: theme.color.ink,
      fontSize: 17,
      fontWeight: '700',
    },
    editHint: {
      color: theme.color.inkMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    editInput: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: theme.color.ink,
      fontSize: 16,
      backgroundColor: theme.color.canvas,
    },
    editActions: { gap: 8, marginTop: 8 },
  });
}
