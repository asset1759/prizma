import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootScreen } from './src/RootScreen';
import { SettingsProvider } from './src/settings';

export default function App() {
  // Системные гарнитуры iOS (New York, SF Pro Rounded) в React Native по имени
  // не достаются — молча откатываются на гротеск. Поэтому антиква вшита файлом.
  // Начертания статичные, а не вариативные: RN не умеет выбирать вес
  // у вариативного шрифта и всегда берёт Regular — цифры выходили хлипкими.
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-500': require('./assets/fonts/PlayfairDisplay-500.ttf'),
    'PlayfairDisplay-600': require('./assets/fonts/PlayfairDisplay-600.ttf'),
    'PlayfairDisplay-700': require('./assets/fonts/PlayfairDisplay-700.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      {/* "auto" — статус-бар инвертируется вместе с системной темой.
          В Deep Focus экран темнеет независимо от неё, но это исключение
          на одном экране, и жёстко фиксировать бар из-за него не стоит. */}
      <StatusBar style="auto" />
      <SettingsProvider>
        <RootScreen />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
