import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { ensureAuthorized, listId } from '../blocking';
import { useResolvedScheme, useSettings, useT } from '../settings';
import { INK, PHASES, SERIF_BOLD } from '../theme';
import type { Key } from '../i18n';

/**
 * Первый запуск.
 *
 * Четыре экрана, и ни одного лишнего. Квиза нет: ни возраста, ни
 * «сколько часов в телефоне», ни «как планируешь использовать» —
 * сервера нет, персонализации нет, и вопрос, ответ на который ничего
 * не меняет, это ровно та выдуманная функция, которую отсюда трижды
 * удаляли.
 *
 * Пейвола здесь тоже нет. Приложение, которое обещает не вмешиваться,
 * на входе ничего не продаёт. Это сознательный отказ от измеренной
 * выгоды: онбординговые пейволы дают заметно больше выручки на
 * установку. Взамен — граница объявляется вторым экраном, до первого
 * нажатия, и это главная защита от претензии «вы подвинули бесплатное».
 */

type Row = { t: Key; s: Key };

const BORDER: Row[] = [
  { t: 'obRow1T', s: 'obRow1S' },
  { t: 'obRow2T', s: 'obRow2S' },
  { t: 'obRow3T', s: 'obRow3S' },
];

const SCREEN_TIME: Row[] = [
  { t: 'obWhyT', s: 'obWhyS' },
  { t: 'obSeeT', s: 'obSeeS' },
  { t: 'obStayT', s: 'obStayS' },
];

export function Onboarding() {
  const t = useT();
  const scheme = useResolvedScheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const [step, setStep] = useState(0);
  const [picking, setPicking] = useState(false);

  const next = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => s + 1);
  };

  const finish = () => {
    Haptics.selectionAsync().catch(() => {});
    update({ onboarded: true });
  };

  /**
   * Разрешение просится здесь, а не при первом нажатии щита.
   *
   * Системный диалог Family Controls показывается ровно один раз, и
   * отказ изнутри приложения не отменить. Спрошенный поверх только что
   * начатой сессии, он был бы ровно тем прерыванием, против которого
   * продаётся продукт. А здесь он открывает бесплатную возможность, и
   * просьба честна без натяжки.
   */
  const allow = async () => {
    Haptics.selectionAsync().catch(() => {});
    await ensureAuthorized();
    setStep((s) => s + 1);
  };

  const rows = (list: Row[]) => (
    <View style={styles.rows}>
      {list.map((r) => (
        <View key={r.t} style={styles.row}>
          <Text style={[styles.rowTitle, { color: ink.primary }]}>{t(r.t)}</Text>
          <Text style={[styles.rowSub, { color: ink.tertiary }]}>{t(r.s)}</Text>
        </View>
      ))}
    </View>
  );

  const button = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btnWrap, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={[styles.btn, { backgroundColor: accent }]}>
        <Text style={styles.btnText}>{label}</Text>
      </View>
    </Pressable>
  );

  const quiet = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
      {/* Читаемо, а не серым в семь пунктов: отказ, набранный так, чтобы
          его не нашли, — это давление, только вежливое. */}
      <Text style={[styles.quiet, { color: ink.secondary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: ink.ground }]}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.middle}>
            {step === 0 ? (
              <>
                <Text style={[styles.title, { color: ink.primary }]}>{t('obTitle1')}</Text>
                <Text style={[styles.sub, { color: ink.secondary }]}>{t('obSub1')}</Text>
              </>
            ) : step === 1 ? (
              <>
                <Text style={[styles.title, { color: ink.primary }]}>{t('obTitle2')}</Text>
                {rows(BORDER)}
              </>
            ) : step === 2 ? (
              <>
                <Text style={[styles.title, { color: ink.primary }]}>{t('obTitle3')}</Text>
                {rows(SCREEN_TIME)}
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: ink.primary }]}>{t('obTitle4')}</Text>
                <Text style={[styles.sub, { color: ink.secondary }]}>{t('obSub4')}</Text>
              </>
            )}
          </View>

          <View style={styles.foot}>
            {step === 0 || step === 1 ? button(t('obNext'), next) : null}

            {step === 2 ? (
              <>
                {button(t('obAllow'), allow)}
                {quiet(t('obSkipShield'), next)}
                <Text style={[styles.hint, { color: ink.tertiary }]}>
                  {t('obSystemNext')}
                </Text>
              </>
            ) : null}

            {step === 3 ? (
              <>
                {button(t('obChoose'), () => {
                  Haptics.selectionAsync().catch(() => {});
                  setPicking(true);
                })}
                {quiet(t('obLater'), finish)}
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {/* Системный экран Apple. Оформить его нельзя — только подписать. */}
      {picking ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={listId(settings.appList)}
          headerText={t('pickerHeader')}
          footerText={t('pickerFooter')}
          includeEntireCategory
          onSelectionChange={(e) => {
            const m = e.nativeEvent;
            const total = m.applicationCount + m.categoryCount + m.webDomainCount;
            update({
              listCount:
                total > 0
                  ? {
                      apps: m.applicationCount,
                      categories: m.categoryCount,
                      sites: m.webDomainCount,
                    }
                  : null,
            });
          }}
          onDismissRequest={() => {
            setPicking(false);
            finish();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24 },
  middle: { flex: 1, justifyContent: 'center' },

  title: {
    fontSize: 40,
    lineHeight: 46,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.8,
  },
  sub: { fontSize: 15, lineHeight: 21, marginTop: 10 },

  rows: { marginTop: 26, gap: 18 },
  row: { gap: 3 },
  rowTitle: { fontSize: 15.5, fontWeight: '600' },
  rowSub: { fontSize: 12.5, lineHeight: 17 },

  foot: { gap: 14, alignItems: 'center' },
  btnWrap: {
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  btn: { borderRadius: 26, paddingVertical: 17, alignItems: 'center' },
  btnText: { fontSize: 16.5, fontWeight: '700', color: '#FFFFFF' },
  quiet: { fontSize: 14.5, fontWeight: '600' },
  hint: { fontSize: 12, textAlign: 'center' },
});
