import SwiftUI
import WidgetKit

/**
 Точка входа расширения. Живая активность пока единственная — виджеты
 на домашний экран появятся, когда будет что на них показывать
 (серия дней, часы в фокусе за неделю).
 */
@main
struct PrizmaWidgetBundle: WidgetBundle {
  var body: some Widget {
    PrizmaLiveActivity()
  }
}
