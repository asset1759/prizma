import ActivityKit
import ExpoModulesCore

/**
 Мост между экраном таймера и ActivityKit.

 Живая активность нужна ровно одна, поэтому ссылку на неё нигде не храним,
 а каждый раз берём из `Activity.activities`. Это не лень: активность может
 обновиться мимо приложения — кнопкой паузы с экрана блокировки, — и
 сохранённая ссылка тогда указывала бы на устаревшее состояние.
 */
public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    /// Живые активности можно выключить в настройках приложения, и это
    /// нормальный выбор человека, а не ошибка. Спрашиваем перед запуском.
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    Function("start") { (state: SessionState) -> Bool in
      guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
        return false
      }

      // Хвост прошлой сессии убираем сразу: две активности одного типа
      // система показала бы обе, друг под другом.
      Self.endAll()
      state.mirror()

      do {
        _ = try Activity.request(
          attributes: PrizmaAttributes(),
          content: ActivityContent(state: state.content, staleDate: state.staleDate),
          pushType: nil
        )
        return true
      } catch {
        // Отказ — не повод ронять сессию: таймер в приложении идёт своим ходом.
        return false
      }
    }

    Function("update") { (state: SessionState) in
      guard #available(iOS 16.2, *) else { return }
      state.mirror()
      let content = ActivityContent(state: state.content, staleDate: state.staleDate)
      for activity in Activity<PrizmaAttributes>.activities {
        Task { await activity.update(content) }
      }
    }

    Function("end") {
      guard #available(iOS 16.2, *) else { return }
      Self.clearMirror()
      Self.endAll()
    }

    /**
     Что лежит в общей группе прямо сейчас.

     Приложение зовёт это при выходе на передний план: пока оно спало,
     состояние мог поменять App Intent с экрана блокировки. Метка `stamp`
     говорит, когда это случилось; сравнив её со своей, экран таймера
     понимает, надо ли подстраиваться.
     */
    Function("readShared") { () -> [String: Any]? in
      guard let d = SessionBridge.store, d.double(forKey: SessionBridge.kStamp) > 0 else {
        return nil
      }
      return [
        "endsAt": d.double(forKey: SessionBridge.kEndsAt),
        "startedAt": d.double(forKey: SessionBridge.kStartedAt),
        "running": d.bool(forKey: SessionBridge.kRunning),
        "leftSeconds": d.integer(forKey: SessionBridge.kLeft),
        "phase": d.string(forKey: SessionBridge.kPhase) ?? "focus",
        "title": d.string(forKey: SessionBridge.kTitle) ?? "",
        "deep": d.bool(forKey: SessionBridge.kDeep),
        "stamp": d.double(forKey: SessionBridge.kStamp),
      ]
    }
  }

  @available(iOS 16.2, *)
  private static func endAll() {
    for activity in Activity<PrizmaAttributes>.activities {
      Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
  }

  private static func clearMirror() {
    guard let d = SessionBridge.store else { return }
    for key in [
      SessionBridge.kEndsAt, SessionBridge.kStartedAt, SessionBridge.kRunning,
      SessionBridge.kLeft, SessionBridge.kPhase, SessionBridge.kTitle,
      SessionBridge.kDeep, SessionBridge.kStamp,
    ] {
      d.removeObject(forKey: key)
    }
  }
}

/// Состояние сессии в том виде, в каком его присылает JavaScript.
struct SessionState: Record {
  /// Секунды эпохи — в JavaScript время живёт миллисекундами, но double
  /// на миллисекундах теряет точность быстрее, чем хотелось бы для дат.
  @Field var endsAt: Double = 0
  @Field var startedAt: Double = 0
  @Field var running: Bool = false
  @Field var leftSeconds: Int = 0
  @Field var phase: String = "focus"
  /// Подпись фазы, уже переведённая приложением
  @Field var title: String = ""
  @Field var deep: Bool = false

  var content: PrizmaAttributes.ContentState {
    .init(
      endsAt: Date(timeIntervalSince1970: endsAt),
      startedAt: Date(timeIntervalSince1970: startedAt),
      running: running,
      leftSeconds: leftSeconds,
      phase: phase,
      title: title,
      deep: deep
    )
  }

  /// После окончания фазы показывать отсчёт незачем — система пометит
  /// активность устаревшей и приглушит её, даже если приложение спит.
  var staleDate: Date? {
    running ? Date(timeIntervalSince1970: endsAt) : nil
  }

  /// Копия состояния в общей группе: из неё читает App Intent, когда
  /// человек жмёт паузу на экране блокировки.
  func mirror() {
    guard let d = SessionBridge.store else { return }
    d.set(endsAt, forKey: SessionBridge.kEndsAt)
    d.set(startedAt, forKey: SessionBridge.kStartedAt)
    d.set(running, forKey: SessionBridge.kRunning)
    d.set(leftSeconds, forKey: SessionBridge.kLeft)
    d.set(phase, forKey: SessionBridge.kPhase)
    d.set(title, forKey: SessionBridge.kTitle)
    d.set(deep, forKey: SessionBridge.kDeep)
    // Метку ставит только экран блокировки. Приложение своих изменений
    // не отмечает — иначе оно принимало бы за чужие свои же.
  }
}
