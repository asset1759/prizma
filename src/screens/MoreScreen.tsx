import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useSettings, useT, type ThemeMode } from '../settings';
import { LANGS, LANG_NAMES, resolveLang, type Key, type LangSetting } from '../i18n';
import {
  INK,
  PHASES,
  PRESETS,
  SERIF_BOLD,
  matchPreset,
  type PresetKey,
  type Scheme,
} from '../theme';

const MODES: { key: ThemeMode; label: Key }[] = [
  { key: 'auto', label: 'themeAuto' },
  { key: 'light', label: 'themeLight' },
  { key: 'dark', label: 'themeDark' },
];

const PRESET_LABEL: Record<PresetKey, Key> = {
  classic: 'presetClassic',
  deep: 'presetDeep',
  brief: 'presetBrief',
};

const PRESET_ORDER: PresetKey[] = ['classic', 'deep', 'brief'];

type SectionKey = 'appearance' | 'durations' | 'language';

/**
 * Настройки свёрнуты в раскрывающиеся разделы.
 *
 * Открыт всегда один: разделы будут прибавляться — уведомления, подписка,
 * наборы приложений, — и списком в развёрнутом виде это быстро станет
 * простынёй, ради которой всё и затевалось.
 *
 * В свёрнутой строке справа стоит текущий выбор. Без него пришлось бы
 * открывать раздел только чтобы вспомнить, что там выставлено.
 */
export function MoreScreen({ scheme }: { scheme: Scheme }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const [open, setOpen] = useState<SectionKey | null>(null);

  const toggle = (k: SectionKey) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen((prev) => (prev === k ? null : k));
  };

  const min = (s: number) => Math.round(s / 60);
  const set = (d: Record<'focus' | 'short' | 'long', number>) =>
    `${min(d.focus)} · ${min(d.short)} · ${min(d.long)}`;

  /** Свой набор — тот, что не совпал ни с одним готовым */
  const current = matchPreset(settings.durations);
  const durationSummary = current ? t(PRESET_LABEL[current]) : t('presetCustom');

  const langSummary =
    settings.language === 'auto'
      ? LANG_NAMES[resolveLang('auto')]
      : LANG_NAMES[settings.language];

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

        <Section
          title={t('sectionAppearance')}
          summary={t(MODES.find((m) => m.key === settings.themeMode)!.label)}
          open={open === 'appearance'}
          onToggle={() => toggle('appearance')}
          scheme={scheme}
          ink={ink}
        >
          {MODES.map((m) => (
            <Choice
              key={m.key}
              label={t(m.label)}
              on={settings.themeMode === m.key}
              onPress={() => update({ themeMode: m.key })}
              ink={ink}
              accent={accent}
            />
          ))}
          <Hint text={t('hintDeepFocusDark')} ink={ink} />
        </Section>

        <Section
          title={t('sectionDurations')}
          summary={durationSummary}
          open={open === 'durations'}
          onToggle={() => toggle('durations')}
          scheme={scheme}
          ink={ink}
        >
          {PRESET_ORDER.map((k) => (
            <Choice
              key={k}
              label={t(PRESET_LABEL[k])}
              value={set(PRESETS[k])}
              on={current === k}
              onPress={() => update({ durations: { ...PRESETS[k] } })}
              ink={ink}
              accent={accent}
            />
          ))}

          {/* Своё — по подписке. Строку показываем, а не прячем: скрытая
              возможность не продаётся, и человек должен видеть, за что
              ему предлагают заплатить. */}
          <Choice
            label={t('presetCustom')}
            value={current === null ? set(settings.durations) : undefined}
            on={current === null}
            locked
            onPress={() => {}}
            ink={ink}
            accent={accent}
          />

          <Hint text={t('presetLocked')} ink={ink} />
        </Section>

        <Section
          title={t('sectionLanguage')}
          summary={langSummary}
          open={open === 'language'}
          onToggle={() => toggle('language')}
          scheme={scheme}
          ink={ink}
        >
          {/* Названия языков — на них самих: человек, попавший не на свой
              язык, найдёт нужную строку только так. */}
          {(['auto', ...LANGS] as LangSetting[]).map((l) => (
            <Choice
              key={l}
              label={l === 'auto' ? t('languageAuto') : LANG_NAMES[l]}
              on={settings.language === l}
              onPress={() => update({ language: l })}
              ink={ink}
              accent={accent}
            />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

type Ink = (typeof INK)['dark'];

function Section({
  title,
  summary,
  open,
  onToggle,
  scheme,
  ink,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  scheme: Scheme;
  ink: Ink;
  children: React.ReactNode;
}) {
  /**
   * Высоту содержимого меряем на месте: она зависит от языка, кегля
   * системы и числа строк, и любое зашитое число рано или поздно разойдётся
   * с правдой. Внутренняя обёртка absolute — иначе её ужимала бы
   * собственная анимируемая высота родителя.
   */
  const [contentH, setContentH] = useState(0);
  const h = useSharedValue(0);

  useEffect(() => {
    h.value = withTiming(open ? contentH : 0, {
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [open, contentH, h]);

  const boxStyle = useAnimatedStyle(() => ({ height: h.value }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(h.value / Math.max(1, contentH)) * 180}deg` },
    ],
  }));

  return (
    <GlassPane style={styles.card} radius={20} scheme={scheme}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.headerTitle, { color: ink.primary }]}>{title}</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.summary, { color: ink.secondary }]} numberOfLines={1}>
            {summary}
          </Text>
          <Animated.View style={chevronStyle}>
            <SymbolView name="chevron.down" size={12} tintColor={ink.tertiary} weight="semibold" />
          </Animated.View>
        </View>
      </Pressable>

      <Animated.View style={[styles.collapse, boxStyle]}>
        <View
          style={styles.measure}
          onLayout={(e) => {
            const next = Math.ceil(e.nativeEvent.layout.height);
            if (next > 0 && next !== contentH) setContentH(next);
          }}
        >
          <View style={[styles.divider, { backgroundColor: ink.track }]} />
          {children}
        </View>
      </Animated.View>
    </GlassPane>
  );
}

function Choice({
  label,
  value,
  on,
  locked,
  onPress,
  ink,
  accent,
}: {
  label: string;
  /** Что стоит за выбором — например «25 · 5 · 15» */
  value?: string;
  on: boolean;
  /** Замок вместо точки: возможность видна, но пока не выдана */
  locked?: boolean;
  onPress: () => void;
  ink: Ink;
  accent: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (on) return;
        if (locked) {
          // Пока экрана подписки нет, отказ хотя бы честно ощущается.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return;
        }
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled: locked && !on }}
    >
      <Text style={[styles.rowLabel, { color: ink.primary }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={[styles.rowValue, { color: ink.tertiary }]}>{value}</Text>
        ) : null}
        {locked && !on ? (
          <SymbolView name="lock.fill" size={12} tintColor={ink.tertiary} weight="semibold" />
        ) : on ? (
          <View style={[styles.check, { backgroundColor: accent }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

function Hint({ text, ink }: { text: string; ink: Ink }) {
  return <Text style={[styles.hint, { color: ink.tertiary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 10 },
  title: {
    fontSize: 40,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.8,
    marginTop: 10,
    marginBottom: 12,
  },
  card: { overflow: 'hidden' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, flexShrink: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  summary: { fontSize: 15, fontWeight: '500', flexShrink: 1 },

  collapse: { overflow: 'hidden' },
  // Свободная от родителя, чтобы отдать собственную высоту при замере.
  measure: { position: 'absolute', left: 0, right: 0, top: 0 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  pressed: { opacity: 0.6 },
  rowLabel: { fontSize: 15.5, fontWeight: '500' },
  rowValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 10, height: 10, borderRadius: 5 },
  hint: {
    fontSize: 12.5,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 2,
  },
});
