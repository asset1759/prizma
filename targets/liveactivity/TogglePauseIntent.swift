import ActivityKit
import AppIntents
import Foundation
import UserNotifications

/**
 Пауза и продолжение прямо с экрана блокировки.

 `LiveActivityIntent` выполняется в процессе самого приложения, а не
 расширения — система будит его в фоне. Но приложение в этот момент может
 быть выгружено, и React Native там ещё не поднят, поэтому JavaScript
 трогать нельзя. Действуем в два шага:

 1. Пишем новое состояние в общую группу и сами переодеваем активность —
    палец нажал, цифры замерли, всё в пределах кадра.
 2. Приложение, выйдя на передний план, читает группу и подстраивает
    свой таймер под то, что уже показано на экране блокировки.

 Экран блокировки здесь ведущий, а не ведомый: он единственный, кто
 наверняка жив в момент нажатия.

 ВНИМАНИЕ: файл существует в двух копиях — здесь и в
 `modules/live-activity/ios`. Тип обязан быть одним и тем же в обеих
 целях: расширение рисует по нему кнопку, приложение его исполняет.
 */
struct TogglePauseIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Пауза"
  static var description = IntentDescription("Останавливает и продолжает сессию Prizma")

  /// Ничего не открываем: смысл кнопки в том, чтобы не разблокировать телефон.
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    SessionBridge.togglePause()
    return .result()
  }
}

/**
 Общая память приложения и расширения.

 Ключи намеренно плоские и примитивные: `UserDefaults` группы читают обе
 стороны, и любая структура посложнее превратилась бы в ещё одну пару
 типов, которые надо держать в согласии вручную.
 */
enum SessionBridge {
  static let suite = "group.kz.asset.focus"

  /// Момент окончания текущей фазы, секунды эпохи. Ноль — сессия не идёт.
  static let kEndsAt = "la.endsAt"
  static let kStartedAt = "la.startedAt"
  static let kRunning = "la.running"
  static let kLeft = "la.leftSeconds"
  static let kPhase = "la.phase"
  static let kTitle = "la.title"
  static let kDeep = "la.deep"
  /// Метка последнего действия с экрана блокировки. Приложение сверяет её
  /// со своей и понимает, что состояние поменяли без него.
  static let kStamp = "la.stamp"

  /// Зеркало сигнала о конце фазы. Пишет JavaScript при планировании,
  /// читаем здесь: пересобрать запрос надо, а перевода взять неоткуда.
  static let kNotifOn = "notifPhaseOn"
  static let kNotifTitle = "notifPhaseTitle"
  static let kNotifBody = "notifPhaseBody"
  /// Тот же идентификатор, что и в `src/notify.ts` — запрос в очереди один
  static let notifId = "prizma.phase.end"

  static var store: UserDefaults? { UserDefaults(suiteName: suite) }

  static func togglePause() {
    guard let d = store else { return }

    let running = d.bool(forKey: kRunning)
    let now = Date()
    let endsAt = Date(timeIntervalSince1970: d.double(forKey: kEndsAt))
    let phase = d.string(forKey: kPhase) ?? "focus"
    let title = d.string(forKey: kTitle) ?? ""
    let deep = d.bool(forKey: kDeep)

    var next: PrizmaAttributes.ContentState

    if running {
      // На паузу: остаток замораживаем, дедлайн дальше не имеет смысла —
      // часы-то продолжают идти.
      let left = max(0, Int(endsAt.timeIntervalSince(now).rounded()))
      d.set(false, forKey: kRunning)
      d.set(left, forKey: kLeft)
      next = .init(
        endsAt: endsAt,
        startedAt: Date(timeIntervalSince1970: d.double(forKey: kStartedAt)),
        running: false,
        leftSeconds: left,
        phase: phase,
        title: title,
        deep: deep
      )
    } else {
      // Продолжаем: новый дедлайн считаем от остатка, а начало отрезка
      // сдвигаем на сейчас, иначе дуга прыгнула бы назад.
      let left = d.integer(forKey: kLeft)
      let newEnd = now.addingTimeInterval(TimeInterval(left))
      d.set(true, forKey: kRunning)
      d.set(newEnd.timeIntervalSince1970, forKey: kEndsAt)
      d.set(now.timeIntervalSince1970, forKey: kStartedAt)
      next = .init(
        endsAt: newEnd,
        startedAt: now,
        running: true,
        leftSeconds: left,
        phase: phase,
        title: title,
        deep: deep
      )
    }

    d.set(now.timeIntervalSince1970, forKey: kStamp)
    rescheduleNotification(store: d)

    for activity in Activity<PrizmaAttributes>.activities {
      Task { await activity.update(ActivityContent(state: next, staleDate: nil)) }
    }
  }

  /**
   Переставляет сигнал о конце фазы под новый дедлайн.

   Без этого пауза с экрана блокировки оставляла бы уведомление в очереди:
   человек нажал паузу в 14:10, а в 14:25 телефон объявлял бы о конце
   сессии, которая стоит. Отменить и поставить заново может только эта
   функция — JavaScript в процессе App Intent не поднят.

   `UNUserNotificationCenter` общий для всего процесса, а идентификатор
   постоянный, поэтому Swift снимает ровно то, что поставил JavaScript.
   */
  private static func rescheduleNotification(store d: UserDefaults) {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [notifId])

    guard d.bool(forKey: kNotifOn), d.bool(forKey: kRunning) else { return }

    let endsAt = Date(timeIntervalSince1970: d.double(forKey: kEndsAt))
    guard endsAt.timeIntervalSinceNow > 1 else { return }

    let content = UNMutableNotificationContent()
    content.title = d.string(forKey: kNotifTitle) ?? ""
    content.body = d.string(forKey: kNotifBody) ?? ""
    content.sound = .default
    if #available(iOS 15.0, *) {
      // Тот же уровень, что и у запроса из JavaScript: без него сигнал
      // приглушается режимом фокусирования — ровно тем, который наша
      // аудитория включает на время работы.
      content.interruptionLevel = .timeSensitive
    }

    let trigger = UNTimeIntervalNotificationTrigger(
      timeInterval: endsAt.timeIntervalSinceNow,
      repeats: false
    )
    center.add(
      UNNotificationRequest(identifier: notifId, content: content, trigger: trigger)
    )
  }
}
