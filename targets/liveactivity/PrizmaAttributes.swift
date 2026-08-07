import ActivityKit
import Foundation

/**
 Состояние живой активности.

 ВНИМАНИЕ: файл существует в двух копиях — здесь и в
 `modules/live-activity/ios/PrizmaAttributes.swift`. Приложение и
 расширение виджета собираются разными целями, общего файла у них нет,
 а типы обязаны совпадать до последнего поля: ActivityKit сопоставляет
 их по имени и ключам Codable. Расхождение не даёт ошибки компиляции —
 активность просто молча не запустится. Правишь здесь — правь и там.
 */
struct PrizmaAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// Момент окончания фазы. По нему iOS сама рисует обратный отсчёт —
    /// без единого обновления снаружи, пока телефон лежит заблокированным.
    var endsAt: Date

    /// Начало текущего отрезка. Пара с `endsAt` задаёт дугу прогресса.
    var startedAt: Date

    /// На паузе отсчёт замирает и вместо него показывается `leftSeconds`.
    var running: Bool

    /// Остаток на паузе, секунды. Во время хода не используется.
    var leftSeconds: Int

    /// `focus` | `short` | `long` — от фазы зависят цвет и подпись.
    var phase: String

    /// Deep Focus: приложения закрыты щитом. Красит активность в свой цвет.
    var deep: Bool
  }
}
