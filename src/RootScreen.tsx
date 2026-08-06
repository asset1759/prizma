import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmbientCanvas } from './components/AmbientCanvas';
import { TabBar, type TabKey } from './components/TabBar';
import { MoreScreen } from './screens/MoreScreen';
import { StubScreen } from './screens/StubScreen';
import { TimerScreen } from './screens/TimerScreen';
import { useResolvedScheme } from './settings';
import { INK, PHASES, defaultAmbient, type Ambient } from './theme';

/**
 * Оболочка с вкладками.
 *
 * Живой холст и панель вкладок живут здесь, а не в экранах. Панель лежит
 * поверх содержимого: если положить её под, холст обрывался бы на верхней
 * кромке и стеклу нечего было бы преломлять.
 */
export function RootScreen() {
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

      {tab === 'timer' ? (
        <TimerScreen onAmbientChange={handleAmbient} />
      ) : tab === 'apps' ? (
        <StubScreen
          scheme={scheme}
          icon="square.grid.2x2"
          title="Приложения"
          hint="Здесь будут наборы приложений: соцсети, игры, всё кроме звонков. Пока список выбирается системным экраном Apple при включении Deep Focus."
        />
      ) : tab === 'stats' ? (
        <StubScreen
          scheme={scheme}
          icon="chart.bar"
          title="Итоги"
          hint="Сколько часов в фокусе, лучшее время дня, серия дней подряд."
        />
      ) : (
        <MoreScreen scheme={scheme} />
      )}

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
