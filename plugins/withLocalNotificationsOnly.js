const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Убирает aps-environment из энтайтлментов.
 *
 * `expo-notifications` добавляет его сам, потому что рассчитан и на
 * удалённые пуши. У Prizma их нет и не планируется: все три уведомления
 * локальные, сервера у приложения не существует. Лишний энтайтлмент
 * требует возможности «Push Notifications» на App ID, без которой сборка
 * на устройство просто не подписывается.
 *
 * ── ПРО TIME SENSITIVE ──────────────────────────────────────────────
 * `com.apple.developer.usernotifications.time-sensitive` здесь НЕ
 * добавляется, и это временно. Он нужен: без него сигнал о конце фазы
 * приглушается режимами фокусирования — теми самыми, которые наша
 * аудитория включает как раз на время работы.
 *
 * Чтобы вернуть: включить «Time Sensitive Notifications» для App ID
 * kz.asset.focus (Xcode → Signing & Capabilities → + Capability, либо
 * в developer.apple.com), после чего дописать в app.json:
 *   "com.apple.developer.usernotifications.time-sensitive": true
 * Возможность выдаётся автоматически, ревью Apple не требует. Сделать
 * это может только владелец аккаунта — автоподписью она не добавляется.
 */
module.exports = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
