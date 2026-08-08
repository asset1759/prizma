import React, { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { PurchasesPackage } from 'react-native-purchases';

import { GlassPane } from '../components/GlassPane';
import { all, isDone } from '../history';
import { useResolvedScheme, useT } from '../settings';
import { useSubscription } from '../subscription';
import { INK, PHASES, SERIF_BOLD, withAlpha } from '../theme';
import type { Key } from '../i18n';

/**
 * Пейвол.
 *
 * Появляется только по прямому действию человека — по нажатию закрытой
 * строки на «Погружении» или из раздела «Подписка». Автоматически не
 * появляется никогда: ни на запуске, ни после сессии, ни поверх идущего
 * таймера. Ни баннера, ни точки на вкладке, ни «попробуйте Pro».
 *
 * Крестик и «Восстановить» — с первого кадра, без задержки. Задержка
 * крестика правилами Apple не запрещена, но попадает под «вмешательство
 * в интерфейс» в европейских нормах и прямо противоречит обещанию
 * невмешательства. Восстановление обязательно по правилу 3.1.1.
 *
 * Ни одна цена не зашита: всё берётся из загруженных предложений.
 * Зашитая цена врёт на всех витринах, кроме одной, и попадает под 3.1.2.
 */

/** Пока домена нет — подставит владелец аккаунта, см. ЗАПУСК.md */
const TERMS_URL = '';
const PRIVACY_URL = '';

type Kind = 'annual' | 'lifetime' | 'monthly';

const ORDER: Kind[] = ['annual', 'lifetime', 'monthly'];

/** Стандартные имена пакетов RevenueCat */
const RC_ID: Record<Kind, string> = {
  annual: '$rc_annual',
  lifetime: '$rc_lifetime',
  monthly: '$rc_monthly',
};

const TITLE: Record<Kind, Key> = {
  annual: 'payYear',
  lifetime: 'payLifetime',
  monthly: 'payMonth',
};

const BUY: Record<Kind, Key> = {
  annual: 'payBuyYear',
  lifetime: 'payBuyLifetime',
  monthly: 'payBuyMonth',
};

const BENEFITS: { icon: SFSymbol; title: Key; sub: Key }[] = [
  { icon: 'infinity', title: 'payNoLimitT', sub: 'payNoLimitS' },
  { icon: 'lock.fill', title: 'payStrictT', sub: 'payStrictS' },
  { icon: 'clock.fill', title: 'paySchedT', sub: 'paySchedS' },
  { icon: 'bolt.fill', title: 'payAutoT', sub: 'payAutoS' },
];

export function Paywall() {
  const t = useT();
  const scheme = useResolvedScheme();
  const insets = useSafeAreaInsets();
  const { paywallOpen, closePaywall, packages, purchase, restore } = useSubscription();

  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const [chosen, setChosen] = useState<Kind>('annual');
  const [busy, setBusy] = useState(false);

  const byKind = useMemo(() => {
    const m = new Map<Kind, PurchasesPackage>();
    for (const k of ORDER) {
      const p = packages?.find((x) => x.identifier === RC_ID[k]);
      if (p) m.set(k, p);
    }
    return m;
  }, [packages]);

  /**
   * Сколько человек уже провёл под щитом.
   *
   * Единственное число на экране, и оно его собственное. Никаких
   * «8 миллионов человек» и «100 000 отзывов»: у нового приложения нет
   * ни одной правдивой цифры такого рода, а выдумывать нельзя. Меньше
   * минуты — блока нет вовсе, ноль здесь не рисуется.
   */
  const underShield = useMemo(() => {
    try {
      const sec = all()
        .filter((s) => s.deep && isDone(s))
        .reduce((a, s) => a + s.sec, 0);
      if (sec < 60) return null;
      const m = Math.round(sec / 60);
      const h = Math.floor(m / 60);
      return h > 0
        ? { n: `${h} ${t('unitH')} ${m % 60}`, u: t('unitMin') }
        : { n: String(m), u: t('unitMin') };
    } catch {
      return null;
    }
  }, [t]);

  /**
   * Скидка годового против месячного — считается из настоящих цен.
   *
   * На витринах, где округление Apple дало другое соотношение, зашитое
   * число соврёт.
   */
  const discount = useMemo(() => {
    const y = byKind.get('annual')?.product.price;
    const m = byKind.get('monthly')?.product.price;
    if (!y || !m) return null;
    const off = Math.round((1 - y / (m * 12)) * 100);
    return off >= 5 ? off : null;
  }, [byKind]);

  const pick = byKind.get(chosen);

  const act = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await fn();
    setBusy(false);
  };

  return (
    <Modal
      visible={paywallOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closePaywall}
    >
      <View style={[styles.root, { backgroundColor: ink.ground }]}>
        <SafeAreaView style={styles.root} edges={['top']}>
          {/* Тем же стеклом, что и чипы на таймере. Голый крестик и голый
              текст висели в воздухе: на экране, где всё остальное собрано,
              это читалось как недоделка. Обе кнопки одной высоты — так они
              становятся парой, а не двумя случайными элементами. */}
          <View style={styles.top}>
            <Pressable onPress={closePaywall} hitSlop={10} accessibilityRole="button">
              <GlassPane style={styles.close} radius={17} scheme={scheme}>
                <SymbolView
                  name="xmark"
                  size={13}
                  tintColor={ink.secondary}
                  weight="semibold"
                />
              </GlassPane>
            </Pressable>
            <Pressable
              onPress={() => act(restore)}
              hitSlop={10}
              accessibilityRole="button"
            >
              <GlassPane style={styles.restoreChip} radius={17} scheme={scheme}>
                <Text style={[styles.restore, { color: ink.secondary }]}>
                  {t('payRestore')}
                </Text>
              </GlassPane>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Продаётся не название функции, а то, ради чего она нужна */}
            <Text style={[styles.title, { color: ink.primary }]}>{t('payTitle')}</Text>
            {/* Самая важная строка: снимает главную претензию категории —
                «бесплатная версия это не продукт, а триал» */}
            <Text style={[styles.sub, { color: ink.secondary }]}>{t('paySub')}</Text>

            {underShield ? (
              <View style={styles.mine}>
                <Text style={[styles.hero, { color: ink.primary }]}>
                  {underShield.n}
                  <Text style={[styles.heroUnit, { color: ink.tertiary }]}>
                    {` ${underShield.u}`}
                  </Text>
                </Text>
                <Text style={[styles.mineSub, { color: ink.tertiary }]}>
                  {t('payUnderShield')}
                </Text>
              </View>
            ) : null}

            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.title} style={styles.benefit}>
                  <SymbolView name={b.icon} size={17} tintColor={accent} weight="semibold" />
                  <View style={styles.benefitText}>
                    <Text style={[styles.benefitTitle, { color: ink.primary }]}>
                      {t(b.title)}
                    </Text>
                    <Text style={[styles.benefitSub, { color: ink.tertiary }]}>
                      {t(b.sub)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Не пришли предложения — нет ни тарифов, ни кнопки.
                Заглушек и серых прямоугольников здесь не бывает. */}
            {byKind.size === 0 ? (
              <Text style={[styles.noPrices, { color: ink.secondary }]}>
                {t('payNoPrices')}
              </Text>
            ) : (
              <>
                {ORDER.filter((k) => byKind.has(k)).map((k) => {
                  const p = byKind.get(k)!;
                  const on = chosen === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setChosen(k);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <GlassPane
                        style={[
                          styles.tariff,
                          on && { borderColor: accent, borderWidth: 1.5 },
                        ]}
                        radius={18}
                        scheme={scheme}
                      >
                        <View style={styles.tariffRow}>
                          <View style={styles.tariffLeft}>
                            <Text style={[styles.tariffName, { color: ink.primary }]}>
                              {t(TITLE[k])}
                            </Text>
                            <Text style={[styles.tariffSub, { color: ink.tertiary }]}>
                              {k === 'annual'
                                ? t('payPerMonth', {
                                    v: perMonth(p),
                                  })
                                : k === 'lifetime'
                                  ? t('payOnePayment')
                                  : ''}
                            </Text>
                          </View>
                          <View style={styles.tariffRight}>
                            <Text style={[styles.price, { color: ink.primary }]}>
                              {p.product.priceString}
                            </Text>
                            {k === 'annual' && discount ? (
                              <Text
                                style={[
                                  styles.badge,
                                  { color: accent, backgroundColor: withAlpha(accent, 0.14) },
                                ]}
                              >
                                {`−${discount}%`}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </GlassPane>
                    </Pressable>
                  );
                })}

                {pick ? (
                  <Pressable
                    onPress={() => act(() => purchase(pick))}
                    disabled={busy}
                    style={({ pressed }) => [styles.buyWrap, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                  >
                    <View style={[styles.buy, { backgroundColor: accent }]}>
                      {/* Списываемая сумма всегда на кнопке: этого требуют
                          правила Apple, и это же снимает страх скрытой цены. */}
                      <Text style={styles.buyText}>
                        {t(BUY[chosen], { v: pick.product.priceString })}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                <Text style={[styles.fine, { color: ink.tertiary }]}>
                  {t(chosen === 'lifetime' ? 'payFineOnce' : 'payFineSub')}
                </Text>
              </>
            )}

            {TERMS_URL && PRIVACY_URL ? (
              <View style={styles.links}>
                <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
                  <Text style={[styles.link, { color: ink.tertiary }]}>{t('payTerms')}</Text>
                </Pressable>
                <Text style={[styles.link, { color: ink.tertiary }]}>·</Text>
                <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
                  <Text style={[styles.link, { color: ink.tertiary }]}>
                    {t('payPrivacy')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/**
 * Помесячный эквивалент годового — считается, а не пишется.
 *
 * Валюту и её форматирование берём у самого продукта: жёстко собранная
 * строка вида «$2.08» неверна везде, кроме одной витрины.
 */
function perMonth(p: PurchasesPackage): string {
  const { price, currencyCode, priceString } = p.product;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(price / 12);
  } catch {
    return priceString;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  close: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  restoreChip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  restore: { fontSize: 12.5, fontWeight: '600' },

  content: { paddingHorizontal: 20 },
  title: {
    fontSize: 40,
    lineHeight: 46,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.8,
    marginTop: 10,
  },
  sub: { fontSize: 12.5, lineHeight: 17, marginTop: 8 },

  mine: { marginTop: 22 },
  hero: {
    fontSize: 44,
    lineHeight: 50,
    fontFamily: SERIF_BOLD,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: { fontSize: 23, fontFamily: SERIF_BOLD },
  mineSub: { fontSize: 12.5, marginTop: 2 },

  benefits: { marginTop: 24, gap: 14 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitText: { flex: 1, gap: 1 },
  benefitTitle: { fontSize: 15.5, fontWeight: '500' },
  benefitSub: { fontSize: 12.5, lineHeight: 16 },

  tariff: { overflow: 'hidden', marginTop: 10 },
  tariffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tariffLeft: { gap: 1 },
  tariffName: { fontSize: 16, fontWeight: '600' },
  tariffSub: { fontSize: 12.5 },
  tariffRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  buyWrap: {
    marginTop: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  buy: { borderRadius: 26, paddingVertical: 17, alignItems: 'center' },
  buyText: { fontSize: 16.5, fontWeight: '700', color: '#FFFFFF' },

  fine: { fontSize: 12.5, lineHeight: 17, marginTop: 12, textAlign: 'center' },
  noPrices: { fontSize: 14, lineHeight: 19, marginTop: 24, textAlign: 'center' },

  links: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 18 },
  link: { fontSize: 12.5 },
});
