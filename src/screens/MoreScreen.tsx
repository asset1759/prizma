import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useSettings, useT, type ThemeMode } from '../settings';
import { LANGS, LANG_NAMES, type Key, type LangSetting } from '../i18n';
import { INK, PHASES, SERIF_BOLD, formatClock, type Scheme } from '../theme';

const MODES: { key: ThemeMode; label: Key }[] = [
  { key: 'auto', label: 'themeAuto' },
  { key: 'light', label: 'themeLight' },
  { key: 'dark', label: 'themeDark' },
];

const PHASE_KEY: Record<'focus' | 'short' | 'long', Key> = {
  focus: 'phaseFocus',
  short: 'phaseShort',
  long: 'phaseLong',
};

export function MoreScreen({ scheme }: { scheme: Scheme }) {
  const t = useT();
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
        <Text style={[styles.title, { color: ink.primary }]}>{t('moreTitle')}</Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>{t('sectionAppearance')}</Text>
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
                <Text style={[styles.rowLabel, { color: ink.primary }]}>{t(m.label)}</Text>
                {on ? <View style={[styles.check, { backgroundColor: accent }]} /> : null}
              </Pressable>
            );
          })}
        </GlassPane>
        <Text style={[styles.hint, { color: ink.tertiary }]}>
          {t('hintDeepFocusDark')}
        </Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>{t('sectionDurations')}</Text>
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
                {t(PHASE_KEY[p])}
              </Text>
              <Text style={[styles.rowValue, { color: ink.secondary }]}>
                {formatClock(settings.durations[p])}
              </Text>
            </View>
          ))}
        </GlassPane>
        <Text style={[styles.hint, { color: ink.tertiary }]}>
          {t('hintDurations')}
        </Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>{t('sectionLanguage')}</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          {/* Названия языков — на них самих: человек, попавший не на свой
              язык, найдёт нужную строку только так. */}
          {(['auto', ...LANGS] as LangSetting[]).map((l, i) => {
            const on = settings.language === l;
            return (
              <Pressable
                key={l}
                onPress={() => {
                  if (on) return;
                  Haptics.selectionAsync().catch(() => {});
                  update({ language: l });
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink.track },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.rowLabel, { color: ink.primary }]}>
                  {l === 'auto' ? t('languageAuto') : LANG_NAMES[l]}
                </Text>
                {on ? <View style={[styles.check, { backgroundColor: accent }]} /> : null}
              </Pressable>
            );
          })}
        </GlassPane>
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
