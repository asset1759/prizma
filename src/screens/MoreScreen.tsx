import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useSettings, type ThemeMode } from '../settings';
import { INK, PHASES, SERIF_BOLD, formatClock, type Scheme } from '../theme';

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'auto', label: 'Как в системе' },
  { key: 'light', label: 'Светлая' },
  { key: 'dark', label: 'Тёмная' },
];

export function MoreScreen({ scheme }: { scheme: Scheme }) {
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 18 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: ink.primary }]}>Ещё</Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>ОФОРМЛЕНИЕ</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          {MODES.map((m, i) => {
            const on = settings.themeMode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  if (on) return;
                  Haptics.selectionAsync().catch(() => {});
                  update({ themeMode: m.key });
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink.track },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.rowLabel, { color: ink.primary }]}>{m.label}</Text>
                {on ? <View style={[styles.check, { backgroundColor: accent }]} /> : null}
              </Pressable>
            );
          })}
        </GlassPane>
        <Text style={[styles.hint, { color: ink.tertiary }]}>
          Deep Focus остаётся тёмным при любом выборе: в этом режиме свет уходит из комнаты.
        </Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>ДЛИТЕЛЬНОСТИ</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          {(['focus', 'short', 'long'] as const).map((p, i) => (
            <View
              key={p}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink.track },
              ]}
            >
              <Text style={[styles.rowLabel, { color: ink.primary }]}>
                {PHASES[scheme][p].label}
              </Text>
              <Text style={[styles.rowValue, { color: ink.secondary }]}>
                {formatClock(settings.durations[p])}
              </Text>
            </View>
          ))}
        </GlassPane>
        <Text style={[styles.hint, { color: ink.tertiary }]}>
          Меняются регулятором на кольце и запоминаются между запусками.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 8 },
  title: { fontSize: 40, fontFamily: SERIF_BOLD, letterSpacing: -0.8, marginTop: 10, marginBottom: 18 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginTop: 14, marginLeft: 4 },
  card: { overflow: 'hidden', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  pressed: { opacity: 0.6 },
  rowLabel: { fontSize: 15.5, fontWeight: '500' },
  rowValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  check: { width: 10, height: 10, borderRadius: 5 },
  hint: { fontSize: 12.5, lineHeight: 17, marginTop: 8, marginHorizontal: 4 },
});
