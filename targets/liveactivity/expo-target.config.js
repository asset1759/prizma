/**
 * Цель расширения для живой активности.
 *
 * Подхватывается плагином @kingstinct/expo-apple-targets, который уже
 * стоит в проекте — его тянет react-native-device-activity ради своих
 * трёх расширений Screen Time. Отдельный плагин для целей ставить не
 * нужно и нельзя: два таких плагина дерутся за проект Xcode.
 *
 * @type {import('@kingstinct/expo-apple-targets/build/config-plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'widget',
  name: 'PrizmaLiveActivity',

  // Та же версия, что у приложения. Ниже нельзя: кнопка паузы прямо
  // на экране блокировки работает через App Intents, а они с 17.0.
  deploymentTarget: '17.0',

  frameworks: ['ActivityKit', 'WidgetKit', 'SwiftUI', 'AppIntents'],

  entitlements: {
    // Та же группа, что у расширений Screen Time: через неё расширение
    // и приложение договариваются о состоянии сессии.
    'com.apple.security.application-groups': ['group.kz.asset.focus'],
  },
});
