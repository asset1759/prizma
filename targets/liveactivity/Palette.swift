import SwiftUI

extension Color {
  /// Цвет из шестнадцатеричного литерала — чтобы значения в коде читались
  /// так же, как в `src/theme.ts`, и их можно было сверять глазами.
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

/**
 Цвета и подписи фаз.

 Держать в согласии с `src/theme.ts` — там тот же набор. Берётся тёмная
 палитра: экран блокировки тёмный всегда, независимо от темы телефона.
 */
enum Palette {
  static func accent(_ phase: String, deep: Bool) -> Color {
    if deep { return Color(hex: 0x3D6BFF) }
    switch phase {
    case "short": return Color(hex: 0x2FDCC0)
    case "long": return Color(hex: 0xFF9B63)
    default: return Color(hex: 0x6E5BFF)
    }
  }

  /// Светлый край акцента — им набирается отсчёт, чтобы цифры не тонули.
  static func accentHi(_ phase: String, deep: Bool) -> Color {
    if deep { return Color(hex: 0xDCE6FF) }
    switch phase {
    case "short": return Color(hex: 0x8DF5E4)
    case "long": return Color(hex: 0xFFC79E)
    default: return Color(hex: 0xA897FF)
    }
  }

  static func symbol(_ phase: String, deep: Bool) -> String {
    if deep { return "shield.lefthalf.filled" }
    switch phase {
    case "short", "long": return "cup.and.saucer.fill"
    default: return "timer"
    }
  }
}

/// Антиква приложения. Имена — PostScript, не имена файлов.
enum Serif {
  static func bold(_ size: CGFloat) -> Font { .custom("PlayfairDisplay-Bold", size: size) }
  static func semibold(_ size: CGFloat) -> Font { .custom("PlayfairDisplay-SemiBold", size: size) }
}
