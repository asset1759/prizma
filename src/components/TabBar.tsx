import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GLASS_AVAILABLE } from './GlassPane';
import { INK, withAlpha, type Scheme } from '../theme';
import { useT } from '../settings';
import type { Key } from '../i18n';


export type TabKey = 'timer' | 'apps' | 'stats' | 'more';

/** Высота панели без нижней безопасной зоны */
export const TAB_BAR_HEIGHT = 82;

const BAR_H = 72;
const PAD = 5;

/**
 * Пружина бегунка. Жёсткая и хорошо задемпфированная: переключатель вкладок
 * должен успевать за пальцем, а не догонять его. Отдачи быть не должно —
 * на панели она читается как промах мимо вкладки.
 */
const SNAP = { damping: 26, stiffness: 420 } as const;
/** Прыжок под палец при касании — ещё резче, это реакция, а не переход */
const JUMP = { damping: 30, stiffness: 520 } as const;

type TabSpec = { key: TabKey; label: Key; icon: SFSymbol; iconActive: SFSymbol };

export const TABS: TabSpec[] = [
  { key: 'timer', label: 'tabTimer' as const, icon: 'timer', iconActive: 'timer' },
  {
    key: 'apps',
    label: 'tabApps' as const,
    // Тот же щит, что на кнопке таймера: нажал щит — открыл вкладку,
    // где он настраивается.
    icon: 'shield',
    iconActive: 'shield.lefthalf.filled',
  },
  { key: 'stats', label: 'tabStats' as const, icon: 'chart.bar', iconActive: 'chart.bar.fill' },
  { key: 'more', label: 'tabMore' as const, icon: 'gearshape', iconActive: 'gearshape.fill' },
];

/**
 * Панель вкладок с бегунком, который тянется за пальцем.
 *
 * Бегунок и подложка — соседние стеклянные элементы внутри GlassContainer,
 * а не вложенные друг в друга. Только так iOS сливает их в одну каплю при
 * сближении: вложенное стекло в стекле даёт мутное пятно, а не морфинг.
 */
export function TabBar({
  active,
  onChange,
  scheme,
  accent,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  scheme: Scheme;
  accent: string;
}) {
  const t = useT();
  const ink = INK[scheme];
  const [barWidth, setBarWidth] = useState(0);
  const cell = barWidth > 0 ? (barWidth - PAD * 2) / TABS.length : 0;

  const activeIndex = TABS.findIndex((t) => t.key === active);
  /** Под каким пальцем вкладка сейчас — во время протяжки подсвечиваем её, а не выбранную */
  const [hover, setHover] = useState<number | null>(null);

  const x = useSharedValue(0);
  const dragging = useSharedValue(0);
  /** Держим ширину ячейки в ref: PanResponder создаётся один раз и замкнул бы старое значение */
  const cellRef = useRef(0);
  cellRef.current = cell;
  const activeRef = useRef(0);
  activeRef.current = activeIndex;
  const lastHover = useRef<number | null>(null);

  // Позиция бегунка вне протяжки — просто по выбранной вкладке.
  const settle = useCallback(
    (index: number) => {
      x.value = withSpring(index * cellRef.current, SNAP);
    },
    [x]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      setBarWidth(w);
      const c = (w - PAD * 2) / TABS.length;
      cellRef.current = c;
      x.value = activeRef.current * c;
    },
    [x]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (e) => {
          dragging.value = 1;
          const c = cellRef.current;
          if (!c) return;
          const i = clampIndex(Math.floor((e.nativeEvent.locationX - PAD) / c));
          lastHover.current = i;
          setHover(i);
          // Бегунок прыгает под палец сразу — так делает iOS, ждать протяжки не надо.
          x.value = withSpring(i * c, JUMP);
        },

        onPanResponderMove: (e) => {
          const c = cellRef.current;
          if (!c) return;
          // Центр бегунка следует за пальцем, но не вылезает за края панели.
          const raw = e.nativeEvent.locationX - PAD - c / 2;
          x.value = Math.max(0, Math.min(raw, c * (TABS.length - 1)));

          const i = clampIndex(Math.round(raw / c));
          if (i !== lastHover.current) {
            lastHover.current = i;
            setHover(i);
            // Щелчок на каждой пересечённой вкладке — как у системных панелей.
            Haptics.selectionAsync().catch(() => {});
          }
        },

        onPanResponderRelease: () => {
          dragging.value = 0;
          const i = lastHover.current ?? activeRef.current;
          setHover(null);
          lastHover.current = null;
          x.value = withSpring(i * cellRef.current, SNAP);
          if (TABS[i].key !== TABS[activeRef.current].key) onChange(TABS[i].key);
        },

        onPanResponderTerminate: () => {
          dragging.value = 0;
          setHover(null);
          lastHover.current = null;
          settle(activeRef.current);
        },
      }),
    [dragging, onChange, settle, x]
  );

  // Пока палец не на панели — держим бегунок на выбранной вкладке.
  React.useEffect(() => {
    if (hover === null && cell > 0) settle(activeIndex);
  }, [activeIndex, cell, hover, settle]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const shown = hover ?? activeIndex;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GlassContainer spacing={26} style={styles.container} onLayout={onLayout}>
        {/* Подложка */}
        {GLASS_AVAILABLE ? (
          <GlassView
            glassEffectStyle="clear"
            colorScheme={scheme}
            style={[styles.plate, { borderRadius: BAR_H / 2 }]}
          />
        ) : (
          <View
            style={[
              styles.plate,
              {
                borderRadius: BAR_H / 2,
                backgroundColor: ink.fallback,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ink.fallbackEdge,
              },
            ]}
          />
        )}

        {/* Бегунок — сосед подложки, а не её потомок */}
        {cell > 0 ? (
          <Animated.View
            style={[styles.pillWrap, { width: cell, left: PAD, height: BAR_H - PAD * 2 }, pillStyle]}
            pointerEvents="none"
          >
            {GLASS_AVAILABLE ? (
              <GlassView
                glassEffectStyle="regular"
                colorScheme={scheme}
                tintColor={withAlpha(accent, scheme === 'light' ? 0.3 : 0.42)}
                style={styles.pill}
              />
            ) : (
              <View
                style={[styles.pill, { backgroundColor: withAlpha(accent, 0.25) }]}
              />
            )}
          </Animated.View>
        ) : null}

        {/* Содержимое поверх */}
        <View style={styles.row} {...pan.panHandlers}>
          {TABS.map((tab, i) => {
            const on = i === shown;
            return (
              <View key={tab.key} style={styles.item} pointerEvents="none">
                <SymbolView
                  name={on ? tab.iconActive : tab.icon}
                  size={26}
                  tintColor={on ? ink.primary : ink.tertiary}
                  weight={on ? 'semibold' : 'regular'}
                />
                <Text
                  style={[styles.label, { color: on ? ink.primary : ink.tertiary }]}
                  numberOfLines={1}
                >
                  {t(tab.label)}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassContainer>
    </View>
  );
}

function clampIndex(i: number) {
  return Math.max(0, Math.min(i, TABS.length - 1));
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 4 },
  container: {
    height: BAR_H,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pillWrap: { position: 'absolute', top: PAD },
  pill: { flex: 1, borderRadius: (BAR_H - PAD * 2) / 2, marginHorizontal: 3 },
  // Ряд растянут на всю высоту панели, а не по содержимому: иначе стекло
  // нажимается только серединой, а промах по кромке молча ничего не делает.
  row: {
    flexDirection: 'row',
    paddingHorizontal: PAD,
    alignItems: 'center',
    height: BAR_H,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: '100%' },
  label: { fontSize: 10.5, fontWeight: '600', letterSpacing: -0.1 },
});
