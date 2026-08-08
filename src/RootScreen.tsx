import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientCanvas } from './components/AmbientCanvas';
import { TabBar, type TabKey } from './components/TabBar';
import { migrateLegacySelection } from './blocking';
import { AppsScreen } from './screens/AppsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { Onboarding } from './screens/Onboarding';
import { Paywall } from './screens/Paywall';
import { StatsScreen } from './screens/StatsScreen';
import { TimerScreen } from './screens/TimerScreen';
import { useResolvedScheme, useSettings, useT } from './settings';
import * as Notify from './notify';
import { applySchedule } from './schedule';
import { useSubscription } from './subscription';
import { INK, PHASES, defaultAmbient, type Ambient } from './theme';

/**
 * Оболочка с вкладками.
 *
 * Живой холст и панель вкладок живут здесь, а не в экранах. Панель лежит
 * поверх содержимого: если положить её под, холст обрывался бы на верхней
 * кромке и стеклу нечего было бы преломлять.
 */
export function RootScreen() {
  const t = useT();
  const systemScheme = useResolvedScheme();

  const { settings } = useSettings();

  // Один раз за запуск: подхватить набор, сохранённый до появления списков.
  useEffect(() => {
    migrateLegacySelection();
  }, []);

  /**
   * «Время фокуса» — на уровне оболочки, а не экрана настроек.
   *
   * Настраивают его в «Ещё», но действует оно всегда, и привязка к
   * экрану была бы привязкой к тому, что все вкладки сейчас смонтированы
   * разом. Стоит однажды поменять это устройство — и напоминания молча
   * перестанут заводиться.
   *
   * Язык в зависимостях: тексты уходят в системный запрос заранее, и
   * переключивший язык иначе получал бы напоминания на прежнем.
   */
  /**
   * Право кончилось — разоружить платное.
   *
   * Расписание живёт в системе и переживает всё, поэтому его окна надо
   * снять руками; строгий режим отпускает сам, потому что его проверка
   * теперь включает право. А ЩИТ НЕ СНИМАЕТСЯ: две сессии в день
   * бесплатны, и снятие щита из-под человека за неоплату — именно тот
   * класс отказов, за который в этой категории ставят единицы.
   *
   * Настройки в файле не трогаются: вернувшийся после паузы в подписке
   * не должен заводить расписание заново.
   */
  const { paid } = useSubscription();
  useEffect(() => {
    if (paid) return;
    applySchedule({ ...settings.schedule, on: false }, settings.appList);
  }, [paid, settings.schedule, settings.appList]);

  const daily = settings.notifications;
  useEffect(() => {
    if (!daily.daily || daily.dailyDays.length === 0) {
      Notify.cancelDaily();
      return;
    }
    Notify.scheduleDaily(
      daily.dailyDays,
      daily.dailyHour,
      t('notifDailyTitle'),
      t('notifDailyBody')
    );
  }, [daily.daily, daily.dailyDays, daily.dailyHour, t]);
  const [tab, setTab] = useState<TabKey>('timer');

  /**
   * Холст задаёт экран таймера — он знает фазу сессии и включён ли Deep Focus.
   * Остальные вкладки наследуют последнее состояние: так фон не мигает при
   * переключении, и цвет остаётся напоминанием о том, что сессия идёт.
   */
  const [ambient, setAmbient] = useState<Ambient>(() => defaultAmbient(systemScheme));
  const scheme = ambient.scheme;

  // Пока таймер не сообщил своего — следуем за системной темой.
  useEffect(() => {
    setAmbient((prev) => (prev.scheme === systemScheme ? prev : defaultAmbient(systemScheme)));
  }, [systemScheme]);

  const handleAmbient = useCallback((next: Ambient) => setAmbient(next), []);

  /**
   * Онбординг вместо всего остального, а не поверх.
   *
   * Так вкладки, таймер и эффекты не монтируются вовсе, пока человек не
   * дошёл до конца: иначе расписание успело бы завестись, а живая
   * активность — начаться, ещё до того, как он увидел первый экран.
   */
  if (!settings.onboarded) return <Onboarding />;

  return (
    <View style={[styles.root, { backgroundColor: INK[scheme].ground }]}>
      <AmbientCanvas colors={ambient.canvas} opacity={ambient.opacity} />

      {/* Вкладки прячутся, а не снимаются с дерева. Экран таймера ведёт
          живую сессию: размонтирование убивало отсчёт, а заодно оставляло
          приложения закрытыми — снять блокировку было уже некому. */}
      <Pane active={tab === 'timer'}>
        <TimerScreen onAmbientChange={handleAmbient} />
      </Pane>

      <Pane active={tab === 'apps'}>
        <AppsScreen scheme={scheme} />
      </Pane>

      <Pane active={tab === 'stats'}>
        {/* `active` нужен экрану, а не только панели: вкладки не
            размонтируются, и без этого прогресс показывал бы историю
            в том виде, в каком она была при запуске приложения. */}
        <StatsScreen scheme={scheme} active={tab === 'stats'} />
      </Pane>

      <Pane active={tab === 'more'}>
        <MoreScreen scheme={scheme} />
      </Pane>

      <View style={styles.dock} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} pointerEvents="box-none">
          <TabBar
            active={tab}
            onChange={setTab}
            scheme={scheme}
            accent={PHASES[scheme].focus.accent}
          />
        </SafeAreaView>
      </View>

      {/* Пейвол поверх всего: он обязан уметь появиться над идущим
          таймером и уйти, не изменив ничего. Поэтому не вкладка. */}
      <Paywall />
    </View>
  );
}

/**
 * Неактивная вкладка скрыта через display: none — она не занимает места
 * в разметке, но продолжает жить: таймеры тикают, состояние на месте.
 * Скрытие прозрачностью тут не годится — невидимый экран продолжал бы
 * перехватывать касания.
 */
function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <View style={active ? styles.pane : styles.hidden}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pane: { flex: 1 },
  hidden: { display: 'none' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
