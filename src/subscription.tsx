import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useSettings } from './settings';

/**
 * Подписка.
 *
 * Что за деньги, а что бесплатно (решено 2026-08-08, по образцу
 * категории — Jomo, Roots, Opal гейтят ровно это):
 *
 * — Бесплатно: таймер целиком, статистика целиком и ДВЕ СЕССИИ С ЩИТОМ
 *   В ДЕНЬ. Лимит возобновляется каждый день; навсегда не кончается
 *   ничего. Сужать бесплатный слой после релиза нельзя — это
 *   единственная претензия, которую в категории не прощают, на ней
 *   собрали свои единицы и Opal, и one sec.
 *
 * — Платно: блокировка без лимита, строгий режим, расписание,
 *   автоподъём щита.
 *
 * Дефицитна не блокировка сама по себе, а невозможность передумать:
 * человек борется не с телефоном, а с собой, и через двадцать минут
 * сам себе разрешит. Поэтому строгий режим и расписание — сердцевина
 * платного, а не довесок.
 *
 * ВАЖНО про строгий режим: это трение, а не замок. Приложение можно
 * удалить, и блокировка снимется вместе с ним. Запрет на удаление у
 * Apple есть, и его планируется добавить после пейвола — но только
 * вместе со снятием во всех путях освобождения, иначе человек
 * останется без возможности удалить хоть что-нибудь.
 */

/**
 * Ключ RevenueCat и имя права.
 *
 * Пустой ключ означает «магазина ещё нет»: тогда SDK не поднимается
 * вовсе, а состояние берётся из `DEV_OVERRIDE`. Заполняет владелец
 * аккаунта — публичный ключ вида `appl_...` единственное из всей
 * настройки RevenueCat, что попадает в код.
 */
const API_KEY = 'test_gZTKTxMruHVPPlZBkyDLkfkMTUj';
export const ENTITLEMENT = 'deep_focus';

/**
 * ВРЕМЕННО: ключ начинается с `test_`, это тестовый магазин RevenueCat.
 * Он отдаёт настоящие предложения и позволяет проверить пейвол без
 * App Store Connect, но покупки в нём ненастоящие. Заменить на
 * публичный ключ вида `appl_...`, когда приложение будет связано с
 * App Store — см. ЗАПУСК.md, раздел 5.
 */

/**
 * Подмена состояния для проверки обеих веток.
 *
 * `true` — всё платное открыто. `false` — вид неплатящего, единственный
 * способ увидеть гейты, пока покупки не работают. `null` — спрашивать
 * RevenueCat по-настоящему.
 */
const DEV_OVERRIDE: boolean | null = null;

/** Сколько сессий с щитом в день бесплатно. Возобновляется каждый день. */
export const FREE_DEEP_PER_DAY = 2;

type Ctx = {
  /** Есть ли право прямо сейчас */
  paid: boolean;
  /** Ответил ли магазин хоть раз за этот запуск */
  ready: boolean;
  /** Тарифы. `null` — ещё не спрашивали, пустой массив — магазин не дал */
  packages: PurchasesPackage[] | null;
  refresh: () => Promise<void>;
  purchase: (p: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  /** Пейвол открывается только по прямому действию человека */
  paywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
};

const SubscriptionContext = createContext<Ctx | null>(null);

const hasEntitlement = (info: CustomerInfo) =>
  info.entitlements.active[ENTITLEMENT] !== undefined;

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { settings, update } = useSettings();

  /**
   * Начинаем с последнего известного ответа, а не с «не платил».
   *
   * Иначе заплативший человек на каждом запуске видел бы замки те
   * доли секунды, пока магазин отвечает. Замок, мелькнувший у того,
   * кто заплатил, — худшее, что может сделать пейвол.
   */
  const [paid, setPaid] = useState(settings.paidCache);
  const [ready, setReady] = useState(DEV_OVERRIDE !== null);
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const apply = useCallback(
    (info: CustomerInfo) => {
      const next = hasEntitlement(info);
      setPaid(next);
      setReady(true);
      update({ paidCache: next });
    },
    [update]
  );

  useEffect(() => {
    if (DEV_OVERRIDE !== null) {
      setPaid(DEV_OVERRIDE);
      return;
    }
    if (!API_KEY) return;

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: API_KEY });

    // Слушатель, а не разовый запрос: покупка, восстановление и
    // истечение приходят сюда сами, и отдельный опрос не нужен.
    Purchases.addCustomerInfoUpdateListener(apply);
    Purchases.getCustomerInfo().then(apply).catch(() => {
      // Магазин не ответил — остаёмся на последнем известном ответе.
      // Отобрать право за то, что человек в метро, нельзя.
      setReady(true);
    });

    // Тарифы приходят отдельно от права: их может не быть даже у того,
    // кто заплатил, и наоборот.
    Purchases.getOfferings()
      .then((o) => setPackages(o.current?.availablePackages ?? []))
      .catch(() => setPackages([]));
  }, [apply]);

  /**
   * Покупка.
   *
   * Отказ пользователя — не ошибка и не повод ничего показывать: он
   * просто передумал. Право обновит слушатель, руками его здесь не
   * трогаем.
   */
  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return hasEntitlement(customerInfo);
    } catch {
      return false;
    }
  }, []);

  /** Восстановление обязательно по правилам Apple 3.1.1 */
  const restore = useCallback(async () => {
    try {
      return hasEntitlement(await Purchases.restorePurchases());
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (DEV_OVERRIDE !== null || !API_KEY) return;
    try {
      apply(await Purchases.getCustomerInfo());
    } catch {
      // Тот же довод: молчание магазина не отменяет покупку.
    }
  }, [apply]);

  const openPaywall = useCallback(() => setPaywallOpen(true), []);
  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  // Закрываем сами, как только право появилось: держать пейвол перед
  // тем, кто только что заплатил, незачем.
  useEffect(() => {
    if (paid) setPaywallOpen(false);
  }, [paid]);

  const value = useMemo(
    () => ({
      paid,
      ready,
      packages,
      refresh,
      purchase,
      restore,
      paywallOpen,
      openPaywall,
      closePaywall,
    }),
    [paid, ready, packages, refresh, purchase, restore, paywallOpen, openPaywall, closePaywall]
  );

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}

function useSubscription(): Ctx {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription вызван вне SubscriptionProvider');
  return ctx;
}

export function useSubscribed(): boolean {
  return useSubscription().paid;
}

export { useSubscription };
