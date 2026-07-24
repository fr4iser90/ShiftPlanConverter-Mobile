import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WeekPlanWidgetData } from './data';
import { widgetChrome } from './theme';

export const WEEK_PLAN_WIDGET = 'WeekPlan';

export function WeekPlanWidget({ empty, eyebrow, range, days, badge, scheme }: WeekPlanWidgetData) {
  const c = widgetChrome(scheme);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.surface,
        borderRadius: 18,
        padding: 12,
        flexDirection: 'column',
        borderWidth: 1,
        borderColor: badge ? c.todayBorder : c.accentSoft,
      }}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
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
          text={badge ? badge : empty ? 'Keine Schichten' : range}
          style={{
            fontSize: 11,
            color: badge ? c.accent : c.inkMuted,
            fontWeight: badge ? '700' : '500',
          }}
        />
      </FlexWidget>

      <FlexWidget
        style={{
          flexDirection: 'row',
          flex: 1,
          width: 'match_parent',
        }}>
        {days.map((d) => (
          <FlexWidget
            key={`${d.label}-${d.dayNum}`}
            style={{
              flex: 1,
              marginHorizontal: 2,
              paddingVertical: 6,
              paddingHorizontal: 2,
              borderRadius: 10,
              backgroundColor: d.isToday ? c.todayBg : c.canvas,
              borderWidth: d.isToday ? 1.5 : 0,
              borderColor: d.isToday ? c.todayBorder : undefined,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <TextWidget
              text={d.label}
              style={{
                fontSize: 10,
                color: d.isToday ? c.accent : c.inkMuted,
                fontWeight: '700',
              }}
            />
            <TextWidget
              text={String(d.dayNum)}
              style={{
                fontSize: 14,
                color: c.ink,
                fontWeight: '700',
                marginTop: 2,
              }}
            />
            <TextWidget
              text={d.codes}
              style={{
                fontSize: 9,
                color: d.codes === '—' ? c.dayEmpty : c.inkMuted,
                fontWeight: '600',
                marginTop: 4,
              }}
            />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
