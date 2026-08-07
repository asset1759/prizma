import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { all, bestHour, streak, today, week } from '../history';
import { useSettings, useT, useTn } from '../settings';
import { INK, PHASES, SERIF_BOLD, type Scheme } from '../theme';
import type { Key } from '../i18n';

/** Высота самого высокого столбика недели */
const BAR_H = 96;

/**
 * Прогресс: сегодня, неделя, серия и время, в которое чаще всего садишься.
 *
 * Пока не досчитана ни одна сессия, экран показывает одну фразу вместо
 * четырёх блоков с нулями. Ноль в статистике читается как поломка —
 * это уже было с плашкой «0 закрыто», и повторять незачем.
 */
export function StatsScreen({ scheme }: { scheme: Scheme }) {
  const t = useT();
  const tn = useTn();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  /**
   * Историю читаем один раз за показ экрана. Пересчитывать её на каждый
   * кадр незачем: она меняется раз в двадцать пять минут.
   *
   * Зависимость от языка намеренная — она же меняет подписи дней.
   */
  const data = useMemo(() => {
    const list = all();
    return {
      empty: list.length === 0,
      today: today(list),
      week: week(list),
      streak: streak(list),
      best: bestHour(list),
    };
  }, [settings.language]);

  const dur = (sec: number) => {
    const m = Math.round(sec / 60);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h} ${t('unitH')} ${m % 60} ${t('unitMin')}` : `${m} ${t('unitMin')}`;
  };

  const peak = Math.max(...data.week.map((d) => d.sec), 1);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: ink.primary }]}>{t('statsTitle')}</Text>

        {data.empty ? (
          <GlassPane style={styles.card} radius={20} scheme={scheme}>
            <Text style={[styles.empty, { color: ink.secondary }]}>{t('statsEmpty')}</Text>
          </GlassPane>
        ) : (
          <>
            <Text style={[styles.section, { color: ink.tertiary }]}>{t('statsToday')}</Text>
            <GlassPane style={styles.card} radius={20} scheme={scheme}>
              <View style={styles.pad}>
                <Text style={[styles.big, { color: ink.primary }]}>
                  {dur(data.today.sec)}
                </Text>
                <Text style={[styles.under, { color: ink.secondary }]}>
                  {tn('sessions', data.today.count)}
                </Text>
              </View>
            </GlassPane>

            <Text style={[styles.section, { color: ink.tertiary }]}>{t('statsWeek')}</Text>
            <GlassPane style={styles.card} radius={20} scheme={scheme}>
              <View style={styles.week}>
                {data.week.map((d) => {
                  const isToday = d.at === data.week[6].at;
                  return (
                    <View key={d.at} style={styles.col}>
                      <View style={styles.barSlot}>
                        {/* Столбик от нуля не рисуем вовсе: пустой день —
                            это пустота, а не полоска высотой в пиксель. */}
                        {d.sec > 0 ? (
                          <View
                            style={[
                              styles.bar,
                              {
                                height: Math.max(6, (d.sec / peak) * BAR_H),
                                backgroundColor: accent,
                                opacity: isToday ? 1 : 0.5,
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.dayLabel,
                          { color: isToday ? ink.primary : ink.tertiary },
                        ]}
                      >
                        {/* Из своих словарей, а не у системы: та отвечает
                            на языке телефона, а приложение может быть
                            переключено на другой. */}
                        {t(`day${new Date(d.at).getDay() + 1}` as Key)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </GlassPane>

            <Text style={[styles.section, { color: ink.tertiary }]}>{t('statsStreak')}</Text>
            <GlassPane style={styles.card} radius={20} scheme={scheme}>
              <View style={styles.pad}>
                <Text style={[styles.big, { color: ink.primary }]}>
                  {tn('days', data.streak)}
                </Text>
              </View>
            </GlassPane>

            {/* Единственное, чего человек о себе не знает: сколько он работал,
                он помнит, а когда у него получается — нет. */}
            {data.best !== null ? (
              <>
                <Text style={[styles.section, { color: ink.tertiary }]}>
                  {t('statsBest')}
                </Text>
                <GlassPane style={styles.card} radius={20} scheme={scheme}>
                  <View style={styles.pad}>
                    <Text style={[styles.phrase, { color: ink.primary }]}>
                      {t('statsBestPhrase', {
                        hour: `${String(data.best).padStart(2, '0')}:00`,
                      })}
                    </Text>
                  </View>
                </GlassPane>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  title: {
    fontSize: 40,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.8,
    marginTop: 10,
    marginBottom: 10,
  },
  section: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  card: { overflow: 'hidden' },
  pad: { paddingHorizontal: 16, paddingVertical: 16, gap: 3 },

  big: {
    fontSize: 30,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  under: { fontSize: 13.5, fontWeight: '500' },
  phrase: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  empty: { fontSize: 15, lineHeight: 21, padding: 18 },

  week: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 18, paddingBottom: 12 },
  col: { flex: 1, alignItems: 'center', gap: 8 },
  barSlot: { height: BAR_H, justifyContent: 'flex-end' },
  bar: { width: 12, borderRadius: 6 },
  dayLabel: { fontSize: 11, fontWeight: '600' },
});
