import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import {
  AuthorizationStatus,
  DeviceActivitySelectionSheetViewPersisted,
  useAuthorizationStatus,
} from 'react-native-device-activity';

import { GlassPane } from '../components/GlassPane';
import { DayRow, Divider, Hour, Toggle, rowStyles } from '../components/SettingsRows';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import {
  ensureAuthorized,
  listId,
  listSize,
  prepareScheduleShield,
} from '../blocking';
import { applySchedule, scheduledCount } from '../schedule';
import { useClock, useSettings, useT, useTn } from '../settings';
import { useSubscription } from '../subscription';
import * as Notify from '../notify';
import { INK, PHASES, SERIF_BOLD, type Scheme } from '../theme';
import type { Key } from '../i18n';

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
  const clock = useClock();
  const { paid, openPaywall } = useSubscription();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const list = settings.appList;
  const sch = settings.schedule;

  const [picking, setPicking] = useState(false);

  /**
   * Разрешение Экранного времени отзывается в системных настройках, не
   * спрашивая нас. После отзыва экран выглядит совершенно нормально:
   * выбор открывается, тумблеры ходят, расписание заводится — и не
   * работает ничего. Это единственное состояние, которое человек не
   * может обнаружить сам.
   */
  const authorized = useAuthorizationStatus() === AuthorizationStatus.approved;

  /** Сколько окон система знает после последнего применения расписания */
  const [armed, setArmed] = useState<number | null>(null);

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
    // Сайты считались в общей сумме, но не сохранялись: выбрав одни
    // домены, человек читал «Ничего не выбрано» поверх работающей
    // блокировки — тот же ноль, только вывернутый наизнанку.
    if ((size.sites ?? 0) > 0) parts.push(tn('sites', size.sites ?? 0));
    return parts.length > 0 ? parts.join(' · ') : t('listEmpty');
  })();

  /**
   * Расписание живёт в системе, а не у нас: заводим его заново на каждое
   * изменение. Здесь же оно восстанавливается после переустановки —
   * приложение стёрли, а настройка осталась в файле.
   */
  useEffect(() => {
    let alive = true;
    // Щит окна кладём заранее: применит его расширение в момент начала,
    // когда JavaScript не выполняется и спросить перевод будет не у кого.
    prepareScheduleShield(t, clock.hour(sch.to));

    /**
     * Без права окна снимаются из системы, но НАСТРОЙКА В ФАЙЛЕ НЕ
     * ТРОГАЕТСЯ.
     *
     * Расписание живёт не в дереве React, а в системе, и переживает и
     * обновление, и переустановку: оставить его заведённым у того, кто
     * перестал платить, значит отдать платную функцию бессрочно. Но и
     * стирать его настройку нельзя — тогда человек, вернувшийся после
     * паузы в подписке, обнаружит, что расписание надо заводить заново.
     */
    if (!paid) {
      applySchedule({ ...sch, on: false }, list);
      if (alive) setArmed(0);
      return;
    }

    applySchedule(sch, list, {
      title: t('notifSchedOnTitle'),
      body: t('notifSchedOnBody', { time: clock.hour(sch.to) }),
    }).then(() => {
      // Пересчитываем после применения, а не до: показать надо не число,
      // а единственное состояние, которое стоит показывать, — что окна
      // не завелись вовсе.
      if (alive) setArmed(scheduledCount());
    });
    return () => {
      alive = false;
    };
    // Язык в зависимостях обязателен: тексты вшиваются в действие
    // заранее, и без него переключивший язык получал бы уведомления на
    // прежнем до следующей правки расписания.
  }, [sch, list, t, clock, paid]);

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

        {!authorized ? (
          <GlassPane style={styles.card} radius={20} scheme={scheme}>
            <Pressable
              onPress={openPicker}
              style={({ pressed }) => [styles.warn, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={16}
                tintColor={ink.secondary}
              />
              <View style={styles.warnText}>
                <Text style={[styles.rowLabel, { color: ink.primary }]}>
                  {t('authOff')}
                </Text>
                <Text style={[styles.sub, { color: ink.tertiary }]}>
                  {t('authOffSub')}
                </Text>
              </View>
            </Pressable>
          </GlassPane>
        ) : null}

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

        <Text style={[styles.section, { color: ink.tertiary }]}>{t('appsHow')}</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          {/* Первой строкой: она отвечает на «когда», а строгий режим и
              расписание — на «как» и «во сколько». */}
          <Toggle
            label={t('autoDeepTitle')}
            sub={t('autoDeepSub')}
            on={settings.autoDeep && paid}
            locked={!paid}
            onPress={() => update({ autoDeep: !settings.autoDeep })}
            onLockedPress={openPaywall}
            ink={ink}
            accent={accent}
          />

          <Divider ink={ink} />

          <Toggle
            label={t('strictTitle')}
            sub={t('strictSub')}
            on={settings.strict && paid}
            locked={!paid}
            onPress={() => update({ strict: !settings.strict })}
            onLockedPress={openPaywall}
            ink={ink}
            accent={accent}
          />

          <Divider ink={ink} />

          <Toggle
            label={t('scheduleOn')}
            sub={t('scheduleSub')}
            on={sch.on && paid}
            locked={!paid}
            onPress={() => update({ schedule: { ...sch, on: !sch.on } })}
            onLockedPress={openPaywall}
            ink={ink}
            accent={accent}
          />

          {/* Дни, часы и «сообщать» не рисуются без права вовсе: живой
              контрол, который ничего не меняет, хуже отсутствующего. */}
          {sch.on && paid ? (
            <>
              <DayRow
                days={sch.days}
                onChange={(days) => update({ schedule: { ...sch, days } })}
                ink={ink}
                accent={accent}
              />

              <Divider ink={ink} />
              <Hour
                label={t('scheduleFrom')}
                value={sch.from}
                onChange={(v) => update({ schedule: { ...sch, from: v } })}
                ink={ink}
                accent={accent}
              />
              <Divider ink={ink} />
              <Hour
                label={t('scheduleTo')}
                value={sch.to}
                onChange={(v) => update({ schedule: { ...sch, to: v } })}
                ink={ink}
                accent={accent}
              />

              <Divider ink={ink} />
              {/* Свойство расписания, а не строка в общем списке уведомлений:
                  тогда заголовок «Как это работает» над ним остаётся честным. */}
              <Toggle
                label={t('schAnnounce')}
                sub={t('schAnnounceSub')}
                on={sch.announce}
                onPress={() => {
                  const next = !sch.announce;
                  update({ schedule: { ...sch, announce: next } });
                  if (next) Notify.ensurePermission();
                }}
                ink={ink}
                accent={accent}
              />

              {/* Три состояния окна, и все три молчат, когда всё хорошо.
                  «Заведено: 5» показывать нельзя — это плашка со
                  счётчиком, а такие с экрана уже удаляли. */}
              {sch.from === sch.to ? (
                <Text style={[rowStyles.foot, { color: ink.secondary }]}>
                  {t('scheduleSameTime')}
                </Text>
              ) : sch.from > sch.to ? (
                <Text style={[rowStyles.foot, { color: ink.tertiary }]}>
                  {t('schOvernight')}
                </Text>
              ) : null}

              {armed === 0 && sch.days.length > 0 && sch.from !== sch.to ? (
                <Text style={[rowStyles.foot, { color: ink.secondary }]}>
                  {`${t('schedFailed')} · ${t('schedFailedSub')}`}
                </Text>
              ) : null}
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
                ? {
                    apps: m.applicationCount,
                    categories: m.categoryCount,
                    sites: m.webDomainCount,
                  }
                : null,
            });
          }}
          onDismissRequest={() => setPicking(false)}
        />
      ) : null}
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


  // Предупреждение об отозванном разрешении: значок и две строки.
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  warnText: { flex: 1, gap: 2 },
  sub: { fontSize: 12.5, lineHeight: 16 },
  rowLabel: { fontSize: 15.5, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  pressed: { opacity: 0.6 },
});
