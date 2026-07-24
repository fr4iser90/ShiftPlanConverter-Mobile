import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { NextShiftWidgetData } from './data';
import { widgetChrome } from './theme';

export const NEXT_SHIFT_WIDGET = 'NextShift';

export function NextShiftWidget({
  empty,
  eyebrow,
  title,
  subtitle,
  badge,
  scheme,
}: NextShiftWidgetData) {
  const c = widgetChrome(scheme);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.surface,
        borderRadius: 18,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: badge ? c.todayBorder : c.accentSoft,
      }}>
      <TextWidget
        text={eyebrow}
        style={{
          fontSize: 11,
          color: c.accent,
          fontWeight: '700',
          letterSpacing: 0.4,
        }}
      />
      <TextWidget
        text={title}
        style={{
          fontSize: empty ? 15 : 20,
          color: c.ink,
          fontWeight: '700',
          marginTop: 6,
        }}
      />
      <TextWidget
        text={subtitle}
        style={{
          fontSize: 13,
          color: c.inkMuted,
          marginTop: 4,
        }}
      />
      {badge ? (
        <TextWidget
          text={badge}
          style={{
            fontSize: 11,
            color: c.accent,
            fontWeight: '700',
            marginTop: 8,
          }}
        />
      ) : null}
    </FlexWidget>
  );
}
