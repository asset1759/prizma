import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { LIST_KEYS, ensureAuthorized, listId, listSize, type ListKey } from '../blocking';
import { useSettings, useT } from '../settings';
import { useSubscribed } from '../subscription';
import { INK, PHASES, SERIF_BOLD, type Scheme } from '../theme';
import type { Key } from '../i18n';

const LIST_LABEL: Record<ListKey, Key> = {
  social: 'listSocial',
  games: 'listGames',
  custom: 'listCustom',
};

/**
 * Списки приложений для Deep Focus.
 *
 * Заполнить список за человека нельзя, и это не наша лень: Apple выдаёт
 * токены приложений только через свой экран выбора и наружу их не
 * показывает. Ни одно приложение в App Store не умеет собрать «Соцсети»
 * само — можно лишь дать списку имя, объяснить, что в него класть,
 * и запомнить отмеченное.
 *
 * Отсюда и устройство экрана: имена наши, содержимое приносит Apple,
 * а мы показываем, сколько в списке набралось.
 */
export function AppsScreen({ scheme }: { scheme: Scheme }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const subscribed = useSubscribed();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  /** Какой список сейчас открыт в системном выборе Apple */
  const [editing, setEditing] = useState<ListKey | null>(null);

  /**
   * Счётчики.
   *
   * Основной источник — событие самого экрана Apple: оно приходит на каждую
   * отметку, поэтому цифра меняется прямо во время выбора, а не после
   * закрытия. Перечитывание из хранилища оставлено на первый показ —
   * списки, набранные в прошлые запуски, иначе выглядели бы пустыми.
   */
  type Size = { apps: number; categories: number } | null;

  const [live, setLive] = useState<Partial<Record<ListKey, Size>>>({});

  const size = useCallback(
    (k: ListKey): Size => (k in live ? live[k]! : listSize(k)),
    [live]
  );

  /**
   * Разрешение спрашиваем до открытия выбора, а не при включении Deep Focus.
   *
   * Без него экран Apple рисуется, галочки ставятся — и ничего не
   * сохраняется: токены приложений просто не выдаются. Человек, зашедший
   * сюда первым делом, упирался в молчаливый отказ и не понимал, что
   * сделал не так.
   */
  const openPicker = useCallback(
    async (k: ListKey) => {
      const ok = await ensureAuthorized();
      if (!ok) {
        Alert.alert(t('screenTimeTitle'), t('screenTimeBody'));
        return;
      }
      setEditing(k);
    },
    [t]
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 18 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: ink.primary }]}>{t('appsTitle')}</Text>
        <Text style={[styles.intro, { color: ink.secondary }]}>{t('appsIntro')}</Text>

        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          {LIST_KEYS.map((k, i) => {
            const on = settings.appList === k;
            const s = size(k);
            // Бесплатно доступен один список — тот, что сейчас выбран.
            const locked = !subscribed && !on;

            return (
              <View
                key={k}
                style={[
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: ink.track,
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    if (on) return;
                    if (locked) {
                      Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Warning
                      ).catch(() => {});
                      return;
                    }
                    Haptics.selectionAsync().catch(() => {});
                    update({ appList: k });
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: locked }}
                >
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowLabel, { color: ink.primary }]}>
                      {t(LIST_LABEL[k])}
                    </Text>
                    <Text style={[styles.rowMeta, { color: ink.tertiary }]}>
                      {s === null
                        ? t('listEmpty')
                        : s.categories > 0
                          ? t('listCountWithCategories', {
                              apps: s.apps,
                              categories: s.categories,
                            })
                          : t('listCount', { apps: s.apps })}
                    </Text>
                  </View>

                  {locked ? (
                    <SymbolView
                      name="lock.fill"
                      size={12}
                      tintColor={ink.tertiary}
                      weight="semibold"
                    />
                  ) : on ? (
                    <View style={[styles.check, { backgroundColor: accent }]} />
                  ) : null}
                </Pressable>

                {/* Кнопка правки только у выбранного: менять список, который
                    не работает, незачем — это лишний повод ошибиться. */}
                {on ? (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      openPicker(k);
                    }}
                    style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <SymbolView
                      name="square.grid.2x2"
                      size={13}
                      tintColor={accent}
                      weight="medium"
                    />
                    <Text style={[styles.editText, { color: accent }]}>{t('listEdit')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </GlassPane>

        <Text style={[styles.hint, { color: ink.tertiary }]}>{t('appsPickerNote')}</Text>

        <Text style={[styles.section, { color: ink.tertiary }]}>{t('strictTitle')}</Text>
        <GlassPane style={styles.card} radius={20} scheme={scheme}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              update({ strict: !settings.strict });
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="switch"
            accessibilityState={{ checked: settings.strict }}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: ink.primary }]}>
                {t('strictTitle')}
              </Text>
            </View>
            {/* Переключатель рисуем сами: системный Switch — единственный
                элемент на экране, который не подчиняется нашей палитре. */}
            <View
              style={[
                styles.switchTrack,
                { backgroundColor: settings.strict ? accent : ink.track },
              ]}
            >
              <View
                style={[
                  styles.switchKnob,
                  settings.strict && styles.switchKnobOn,
                ]}
              />
            </View>
          </Pressable>
        </GlassPane>

        <Text style={[styles.hint, { color: ink.tertiary }]}>{t('strictHint')}</Text>
        <Text style={[styles.hint, { color: ink.tertiary }]}>{t('strictHonest')}</Text>
        {!subscribed ? (
          <Text style={[styles.hint, { color: ink.tertiary }]}>
            {t('appsMultipleLocked')}
          </Text>
        ) : null}
      </ScrollView>

      {/* Системный экран Apple. Оформить его нельзя — только подписать
          сверху и снизу, чтобы человек понимал, что отмечает. */}
      {editing ? (
        <DeviceActivitySelectionSheetViewPersisted
          familyActivitySelectionId={listId(editing)}
          headerText={t('pickerHeader')}
          footerText={t('pickerFooter')}
          // Отмеченная категория закрывает всё, что в ней есть, включая
          // то, что человек поставит завтра. Иначе «Общение» означало бы
          // только те приложения, что были на момент выбора.
          includeEntireCategory
          onSelectionChange={(e) => {
            const m = e.nativeEvent;
            const total = m.applicationCount + m.categoryCount + m.webDomainCount;
            setLive((prev) => ({
              ...prev,
              [editing]: total > 0
                ? { apps: m.applicationCount, categories: m.categoryCount }
                : null,
            }));
          }}
          onDismissRequest={() => setEditing(null)}
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
    marginBottom: 8,
  },
  intro: { fontSize: 14, lineHeight: 19, marginBottom: 16, marginHorizontal: 2 },
  card: { overflow: 'hidden' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  rowLeft: { gap: 2 },
  rowLabel: { fontSize: 15.5, fontWeight: '600' },
  rowMeta: { fontSize: 12.5, fontWeight: '500' },
  pressed: { opacity: 0.6 },
  check: { width: 10, height: 10, borderRadius: 5 },

  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  editText: { fontSize: 14, fontWeight: '600' },

  hint: { fontSize: 12.5, lineHeight: 17, marginTop: 12, marginHorizontal: 4 },
  section: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 26,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  switchKnobOn: { alignSelf: 'flex-end' },
});
