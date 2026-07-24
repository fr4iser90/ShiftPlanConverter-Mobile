import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export const NEXT_SHIFT_WIDGET = 'NextShift';

export type NextShiftWidgetData = {
  title: string;
  subtitle: string;
  empty: boolean;
};

export function NextShiftWidget({ title, subtitle, empty }: NextShiftWidgetData) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0F766E',
        borderRadius: 16,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
      <TextWidget
        text="LOGA3"
        style={{
          fontSize: 11,
          color: '#CCFBF1',
          fontWeight: '600',
        }}
      />
      <TextWidget
        text={title}
        style={{
          fontSize: empty ? 14 : 18,
          color: '#FFFFFF',
          fontWeight: '700',
          marginTop: 4,
        }}
      />
      <TextWidget
        text={subtitle}
        style={{
          fontSize: 13,
          color: '#ECFDF5',
          marginTop: 4,
        }}
      />
    </FlexWidget>
  );
}
