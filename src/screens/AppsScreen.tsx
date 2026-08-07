import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { ensureAuthorized, listId, listSize } from '../blocking';
import { applySchedule } from '../schedule';
import { useSettings, useT, useTn } from '../settings';
import { INK, PHASES, SERIF_BOLD, type Scheme } from '../theme';
import type { Key } from '../i18n';

type Ink = (typeof INK)['dark'];

/**
 * Что закрывает Deep Focus и когда.
 *
 * Экран сознательно без пояснительных абзацев. Первая версия объясняла
 * словами и ограничение Apple, и смысл строгого режима, и почему нет
 * минут — четыре серых блока на одном экране. Раз устройство приходится
 * объяснять, неудачно устройство, а не мало объяснений. Всё, что стоит
 * сказать, скажет онбординг: один раз и до того, как человек полез
 * в настройки.
 *
 * Список тоже один. Их было три с именами, и все три одинаково пустые:
 * непонятно, зачем их столько, какой из них работает и почему действие
 * есть только у одного. Хранилище по-прежнему умеет несколько — вернём,
 * когда появится повод.
 */
export function AppsScreen({ scheme }: { scheme: Scheme }) {
  const t = useT();
  const tn = useTn();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const list = settings.appList;
  const sch = settings.schedule;

  const [picking, setPicking] = useState(false);

  /**
   * Счётчик берём из своих настроек. Запасной путь — спросить Screen Time,
   * он нужен для списков, набранных до того, как мы стали считать сами.
   */
  const size = settings.listCount ?? listSize(list);

  /**
   * Складываем только из непустого. Раньше выбор одних категорий давал
   * «0 прил. · 13 катег.» — ноль впереди читается как «ничего не вышло»,
   * хотя выбрано было как раз всё.
   */
  const summary = (() => {
    if (size === null) return t('listEmpty');
    const parts: string[] = [];
    if (size.apps > 0) parts.push(tn('apps', size.apps));
    if (size.categories > 0) parts.push(tn('cats', size.categories));
    return parts.length > 0 ? parts.join(' · ') : t('listEmpty');
  })();

  /**
   * Расписание живёт в системе, а не у нас: заводим его заново на каждое
   * изменение. Здесь же оно восстанавливается после переустановки —
   * приложение стёрли, а настройка осталась в файле.
   */
  useEffect(() => {
    applySchedule(sch, list);
  }, [sch, list]);

  /**
   * Разрешение спрашиваем до открытия выбора. Без него экран Apple
   * рисуется, галочки ставятся — и ничего не сохраняется: токены
   * приложений просто не выдаются.
   */
  const openPicker = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const ok = await ensureAuthorized();
    if (!ok) {
      Alert.alert(t('screenTimeTitle'), t('screenTimeBody'));
      return;
    }
    setPicking(true);
  }, [t]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: ink.primary }]}>{t('appsTitle')}</Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>
          {t('appsWhatToClose')}
        </Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          <Pressable
            onPress={openPicker}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.rowLabel, { color: ink.primary }]}>
              {summary}
            </Text>
            <SymbolView
              name="chevron.right"
              size={13}
              tintColor={ink.tertiary}
              weight="semibold"
            />
          </Pressable>
        </GlassPane>

        <Text style={[styles.section, { color: ink.tertiary }]}>Deep Focus</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          <Toggle
            label={t('strictTitle')}
            sub={t('strictSub')}
            on={settings.strict}
            onPress={() => update({ strict: !settings.strict })}
            ink={ink}
            accent={accent}
          />

          <View style={[styles.divider, { backgroundColor: ink.track }]} />

          <Toggle
            label={t('scheduleOn')}
            sub={t('scheduleSub')}
            on={sch.on}
            onPress={() => update({ schedule: { ...sch, on: !sch.on } })}
            ink={ink}
            accent={accent}
          />

          {sch.on ? (
            <>
              <View style={styles.days}>
                {/* С понедельника: воскресенье первым — привычка
                    американского календаря, а рынки у нас другие. */}
                {[2, 3, 4, 5, 6, 7, 1].map((d) => {
                  const picked = sch.days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        update({
                          schedule: {
                            ...sch,
                            days: picked
                              ? sch.days.filter((x) => x !== d)
                              : [...sch.days, d],
                          },
                        });
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
                        style={[
                          styles.dayText,
                          { color: picked ? '#FFFFFF' : ink.secondary },
                        ]}
                      >
                        {t(`day${d}` as Key)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.divider, { backgroundColor: ink.track }]} />
              <Hour
                label={t('scheduleFrom')}
                value={sch.from}
                onChange={(v) => update({ schedule: { ...sch, from: v } })}
                ink={ink}
                accent={accent}
              />
              <View style={[styles.divider, { backgroundColor: ink.track }]} />
              <Hour
                label={t('scheduleTo')}
                value={sch.to}
                onChange={(v) => update({ schedule: { ...sch, to: v } })}
                ink={ink}
                accent={accent}
              />
            </>
          ) : null}
        </GlassPane>
      </ScrollView>

      {/* Системный экран Apple. Оформить его нельзя — только подписать. */}
      {picking ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={listId(list)}
          headerText={t('pickerHeader')}
          footerText={t('pickerFooter')}
          // Отмеченная категория закрывает всё, что в ней есть, включая
          // то, что человек поставит завтра.
          includeEntireCategory
          onSelectionChange={(e) => {
            const m = e.nativeEvent;
            const total = m.applicationCount + m.categoryCount + m.webDomainCount;
            update({
              listCount: total > 0
                ? { apps: m.applicationCount, categories: m.categoryCount }
                : null,
            });
          }}
          onDismissRequest={() => setPicking(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Переключатель с одной строкой пояснения под подписью.
 *
 * Именно так это устроено у всех, кто делает то же самое: TIDE, Brick,
 * stoic. Название режима само по себе ничего не сообщает — «строгий»
 * может значить что угодно, — а вынести объяснение отдельным абзацем
 * вниз экрана значит превратить настройки в инструкцию. Одна строка
 * на месте решает и то и другое.
 */
function Toggle({
  label,
  sub,
  on,
  onPress,
  ink,
  accent,
}: {
  label: string;
  sub: string;
  on: boolean;
  onPress: () => void;
  ink: Ink;
  accent: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: ink.primary }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: ink.tertiary }]}>{sub}</Text>
      </View>
      {/* Тумблер свой: системный Switch — единственный элемент,
          который не подчиняется нашей палитре. */}
      <View style={[styles.track, { backgroundColor: on ? accent : ink.track }]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

/** Час с шагом в единицу. Минут нет: окно, начинающееся в 9:07, не держат */
function Hour({
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
        <Text style={[styles.stepValue, { color: ink.primary }]}>{`${value}:00`}</Text>
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
    minWidth: 48,
    textAlign: 'center',
  },
});
