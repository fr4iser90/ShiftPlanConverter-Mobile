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
  density,
}: NextShiftWidgetData) {
  const c = widgetChrome(scheme);
  const compact = density === 'compact';
  const pad = compact ? 10 : 16;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.surface,
        borderRadius: compact ? 14 : 18,
        padding: pad,
        flexDirection: 'column',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: badge ? c.todayBorder : c.accentSoft,
      }}>
      <TextWidget
        text={eyebrow}
        style={{
          fontSize: compact ? 10 : 11,
          color: c.accent,
          fontWeight: '700',
          letterSpacing: 0.4,
        }}
      />
      <TextWidget
        text={title}
        style={{
          fontSize: empty ? (compact ? 13 : 15) : compact ? 16 : 20,
          color: c.ink,
          fontWeight: '700',
          marginTop: compact ? 4 : 6,
        }}
      />
      <TextWidget
        text={subtitle}
        style={{
          fontSize: compact ? 11 : 13,
          color: c.inkMuted,
          marginTop: compact ? 2 : 4,
        }}
      />
      {badge ? (
        <TextWidget
          text={badge}
          style={{
            fontSize: 10,
            color: c.accent,
            fontWeight: '700',
            marginTop: compact ? 4 : 8,
          }}
        />
      ) : null}
    </FlexWidget>
  );
}
