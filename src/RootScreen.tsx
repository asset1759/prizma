import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientCanvas } from './components/AmbientCanvas';
import { TabBar, type TabKey } from './components/TabBar';
import { MoreScreen } from './screens/MoreScreen';
import { StubScreen } from './screens/StubScreen';
import { TimerScreen } from './screens/TimerScreen';
import { useResolvedScheme, useT } from './settings';
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
        <StubScreen
          scheme={scheme}
          icon="square.grid.2x2"
          title={t('appsTitle')}
          hint={t('appsHint')}
        />
      </Pane>

      <Pane active={tab === 'stats'}>
        <StubScreen
          scheme={scheme}
          icon="chart.bar"
          title={t('statsTitle')}
          hint={t('statsHint')}
        />
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
