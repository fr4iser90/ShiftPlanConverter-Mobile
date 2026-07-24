import { Text, View } from 'react-native';

import { AppButton } from '@/src/ui/AppButton';
import type { SettingsStyles } from '@/src/ui/settingsStyles';

export function SettingsStepper({
  label,
  value,
  onChange,
  styles,
  max = 6,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  styles: SettingsStyles;
  max?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.row}>
        <AppButton compact title="−" variant="secondary" onPress={() => onChange(Math.max(0, value - 1))} />
        <Text style={styles.stepperVal}>{value}</Text>
        <AppButton
          compact
          title="+"
          variant="secondary"
          onPress={() => onChange(Math.min(max, value + 1))}
        />
      </View>
    </View>
  );
}
