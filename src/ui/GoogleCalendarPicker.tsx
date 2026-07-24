import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '@/src/i18n';
import {
  createGoogleCalendar,
  isPrimaryCalendar,
  type GoogleCalendar,
} from '@/src/sync/google';
import { setGoogleCalendarId } from '@/src/state/store';
import { AppButton } from '@/src/ui/AppButton';
import { SectionTitle } from '@/src/ui/AppCard';
import { theme } from '@/src/ui/theme';

type Props = {
  calendars: GoogleCalendar[];
  calendarId: string | null;
  title?: string;
  onChange: (calendars: GoogleCalendar[], selectedId: string) => void;
};

export function GoogleCalendarPicker({
  calendars,
  calendarId,
  title,
  onChange,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('Dienstplan');

  if (!calendars.length && !showForm) {
    return (
      <View style={styles.wrap}>
        <SectionTitle>{title || t('pickCalendar')}</SectionTitle>
        <Text style={styles.hint}>{t('googlePrimaryDisabledHint')}</Text>
        <AppButton
          compact
          variant="soft"
          title={t('googleNewCalendar')}
          onPress={() => setShowForm(true)}
        />
      </View>
    );
  }

  const pick = (c: GoogleCalendar) => {
    if (isPrimaryCalendar(c)) return;
    onChange(calendars, c.id);
    void setGoogleCalendarId(c.id);
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert(t('googleNewCalendar'), t('googleNewCalendarNameRequired'));
      return;
    }
    try {
      setCreating(true);
      const created = await createGoogleCalendar(name);
      const next = [created, ...calendars.filter((c) => c.id !== created.id)];
      onChange(next, created.id);
      await setGoogleCalendarId(created.id);
      setShowForm(false);
      setNewName('Dienstplan');
    } catch (e) {
      Alert.alert(t('googleNewCalendar'), String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <SectionTitle>{title || t('pickCalendar')}</SectionTitle>
      <Text style={styles.hint}>{t('googlePrimaryDisabledHint')}</Text>
      {calendars.map((c) => {
        const primary = isPrimaryCalendar(c);
        const selected = calendarId === c.id;
        return (
          <AppButton
            key={c.id}
            compact
            disabled={primary}
            variant={selected ? 'soft' : 'secondary'}
            title={`${c.summary}${primary ? ` (${t('googlePrimaryLabel')})` : ''}${
              selected ? ' ✓' : ''
            }`}
            onPress={() => pick(c)}
          />
        );
      })}

      {showForm ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder={t('googleNewCalendarPlaceholder')}
            placeholderTextColor={theme.color.inkFaint}
            autoFocus
          />
          <View style={styles.formRow}>
            <AppButton
              compact
              variant="ghost"
              title={t('setupBack')}
              onPress={() => setShowForm(false)}
              disabled={creating}
              style={styles.flex}
            />
            <AppButton
              compact
              title={t('googleCreateCalendar')}
              onPress={() => void onCreate()}
              busy={creating}
              disabled={creating}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <AppButton
          compact
          variant="soft"
          title={t('googleNewCalendar')}
          onPress={() => setShowForm(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4 },
  hint: { fontSize: 12, color: theme.color.inkMuted, marginBottom: 2 },
  form: { gap: 8, marginTop: 4 },
  formRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    backgroundColor: theme.color.surfaceMuted,
    color: theme.color.ink,
    fontSize: 15,
  },
});
