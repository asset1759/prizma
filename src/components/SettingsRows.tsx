import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';

import { useClock, useT } from '../settings';
import { INK } from '../theme';
import type { Key } from '../i18n';

/**
 * Строки настроек, общие для «Погружения» и «Ещё».
 *
 * Жили внутри экрана блокировки, пока были нужны одному ему. Раздел
 * уведомлений потребовал ровно тех же трёх элементов, и написать их
 * вторыми значило бы получить две пары, которые разойдутся через месяц:
 * у одной поправят отступ, у другой забудут.
 */

export type Ink = (typeof INK)['dark'];

/**
 * Переключатель с одной строкой пояснения под подписью.
 *
 * Именно так это устроено у всех, кто делает то же самое: TIDE, Brick,
 * stoic. Название режима само по себе ничего не сообщает — «строгий»
 * может значить что угодно, — а вынести объяснение отдельным абзацем
 * вниз экрана значит превратить настройки в инструкцию. Одна строка
 * на месте решает и то и другое.
 */
export function Toggle({
  label,
  sub,
  on,
  locked,
  onPress,
  onLockedPress,
  ink,
  accent,
}: {
  label: string;
  sub: string;
  on: boolean;
  /** Замок вместо тумблера: возможность видна, но пока не выдана */
  locked?: boolean;
  onPress: () => void;
  /**
   * Что делать при нажатии на закрытую строку.
   *
   * Без него отказ был молчаливым: хаптик и ничего больше. Строка,
   * которая ничего не делает и не объясняет, читается как поломка —
   * а это ровно та строка, которая должна продавать.
   */
  onLockedPress?: () => void;
  ink: Ink;
  accent: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (locked) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
            () => {}
          );
          onLockedPress?.();
          return;
        }
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: locked }}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: ink.primary }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: ink.tertiary }]}>{sub}</Text>
      </View>
      {locked ? (
        <SymbolView name="lock.fill" size={14} tintColor={ink.tertiary} weight="semibold" />
      ) : (
        /* Тумблер свой: системный Switch — единственный элемент,
           который не подчиняется нашей палитре. */
        <View style={[styles.track, { backgroundColor: on ? accent : ink.track }]}>
          <View style={[styles.knob, on && styles.knobOn]} />
        </View>
      )}
    </Pressable>
  );
}

/** Час с шагом в единицу. Минут нет: окно, начинающееся в 9:07, не держат */
export function Hour({
  label,
  value,
  onChange,
  ink,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  ink: Ink;
  accent: string;
}) {
  const clock = useClock();

  const step = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange((value + d + 24) % 24);
  };

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: ink.primary }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => step(-1)}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${label} −1`}
        >
          <SymbolView name="minus" size={13} tintColor={accent} weight="bold" />
        </Pressable>
        {/* Через часы, а не строкой «${value}:00»: американец читал бы
            «14:00» там, где у него пишут «2 PM». */}
        <Text style={[styles.stepValue, { color: ink.primary }]}>
          {clock.hour(value)}
        </Text>
        <Pressable
          onPress={() => step(1)}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${label} +1`}
        >
          <SymbolView name="plus" size={13} tintColor={accent} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Ряд дней недели.
 *
 * С понедельника: воскресенье первым — привычка американского календаря,
 * а рынки у нас другие. Нумерация внутри остаётся Apple-евской, потому
 * что её ждут и `DeviceActivitySchedule`, и триггеры уведомлений.
 */
const ORDER = [2, 3, 4, 5, 6, 7, 1];

export function DayRow({
  days,
  onChange,
  ink,
  accent,
}: {
  days: number[];
  onChange: (next: number[]) => void;
  ink: Ink;
  accent: string;
}) {
  const t = useT();

  return (
    <View style={styles.days}>
      {ORDER.map((d) => {
        const picked = days.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(picked ? days.filter((x) => x !== d) : [...days, d]);
            }}
            style={[
              styles.day,
              { borderColor: picked ? accent : ink.track },
              picked && { backgroundColor: accent },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: picked }}
          >
            <Text
              style={[styles.dayText, { color: picked ? '#FFFFFF' : ink.secondary }]}
            >
              {t(`day${d}` as Key)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider({ ink }: { ink: Ink }) {
  return <View style={[styles.divider, { backgroundColor: ink.track }]} />;
}

export const rowStyles = StyleSheet.create({
  /**
   * Подпись под группой — только для состояний, о которых надо сказать.
   * Когда всё в порядке, её нет вовсе.
   */
  foot: {
    fontSize: 12.5,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 14,
  },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLeft: { flex: 1, gap: 2, paddingRight: 14 },
  rowLabel: { fontSize: 15.5, fontWeight: '500' },
  rowSub: { fontSize: 12.5, lineHeight: 16 },
  pressed: { opacity: 0.6 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  track: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  knobOn: { alignSelf: 'flex-end' },

  days: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  day: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 12, fontWeight: '600' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    textAlign: 'center',
  },
});
