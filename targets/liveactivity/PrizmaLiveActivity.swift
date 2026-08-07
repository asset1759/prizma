import ActivityKit
import SwiftUI
import WidgetKit

/**
 Живая активность Prizma — экран блокировки и Dynamic Island.

 Отсчёт нигде не пересчитывается вручную. `Text(timerInterval:)` и
 `ProgressView(timerInterval:)` получают пару дат и дальше идут сами,
 силами системы: телефон может лежать заблокированным час, приложение
 всё это время спит, а цифры на экране остаются верными. Это же
 причина, по которой состояние хранит момент окончания, а не остаток.
 */
struct PrizmaLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PrizmaAttributes.self) { context in
      LockScreen(state: context.state)
        // Тёмная подложка независимо от обоев: на светлых фотографиях
        // системный фон вырождается в белое, и наш текст пропадал бы.
        .activityBackgroundTint(Color(hex: 0x0A0B14).opacity(0.92))
        .activitySystemActionForegroundColor(Palette.accentHi(context.state.phase, deep: context.state.deep))
    } dynamicIsland: { context in
      let accent = Palette.accent(context.state.phase, deep: context.state.deep)
      let accentHi = Palette.accentHi(context.state.phase, deep: context.state.deep)

      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Dial(state: context.state, size: 42, line: 5)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(state: context.state)
            .font(.system(size: 30, weight: .semibold).monospacedDigit())
            .foregroundStyle(accentHi)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(Palette.label(context.state.phase, deep: context.state.deep))
            .font(Serif.semibold(17))
            .foregroundStyle(.white)
        }
      } compactLeading: {
        Dial(state: context.state, size: 18, line: 3)
      } compactTrailing: {
        Countdown(state: context.state)
          .font(.caption2.monospacedDigit())
          .foregroundStyle(accentHi)
          // Без ширины система на каждой смене цифры дёргает остров.
          .frame(minWidth: 44)
      } minimal: {
        Dial(state: context.state, size: 18, line: 3)
      }
      .keylineTint(accent)
    }
  }
}

// MARK: - Экран блокировки

private struct LockScreen: View {
  let state: PrizmaAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      Dial(state: state, size: 52, line: 6)

      VStack(alignment: .leading, spacing: 2) {
        Text(Palette.label(state.phase, deep: state.deep))
          .font(Serif.semibold(17))
          .foregroundStyle(.white)

        Countdown(state: state)
          .font(Serif.bold(34))
          // Playfair — антиква с разной шириной цифр. Если моноширинного
          // начертания в ней нет, iOS просто оставит обычное, и тогда
          // цифры будут слегка дышать при смене. Проверить на устройстве.
          .monospacedDigit()
          .foregroundStyle(Palette.accentHi(state.phase, deep: state.deep))
      }

      Spacer(minLength: 8)

      // Пауза прямо с экрана блокировки: ради неё не стоит будить телефон
      // и искать приложение — а именно на паузу чаще всего и жмут.
      PauseButton(running: state.running, accent: Palette.accent(state.phase, deep: state.deep))
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
  }
}

// MARK: - Части

/// Кольцо прогресса. Во время хода растёт само, на паузе замирает.
private struct Dial: View {
  let state: PrizmaAttributes.ContentState
  let size: CGFloat
  let line: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .stroke(Color.white.opacity(0.16), lineWidth: line)

      if state.running {
        ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: false) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
        .progressViewStyle(.circular)
        .tint(Palette.accent(state.phase, deep: state.deep))
      } else {
        Circle()
          .trim(from: 0, to: staticProgress)
          .stroke(
            Palette.accent(state.phase, deep: state.deep),
            style: StrokeStyle(lineWidth: line, lineCap: .round)
          )
          .rotationEffect(.degrees(-90))
      }
    }
    .frame(width: size, height: size)
  }

  /// На паузе дугу считаем сами: система умеет вести её только по времени.
  private var staticProgress: CGFloat {
    let total = state.endsAt.timeIntervalSince(state.startedAt)
    guard total > 0 else { return 0 }
    let passed = total - Double(state.leftSeconds)
    return max(0, min(1, CGFloat(passed / total)))
  }
}

/**
 Отсчёт. Пока идёт — системный таймер, на паузе — застывшие цифры.

 Взят `Text(timerInterval:)`, а не `Text(date, style: .timer)`: первый
 даёт формат часов «24:07», второй — фразу «24 минуты». Часы здесь
 уместнее, они же стоят и в самом приложении.

 На симуляторе секунды не отрисовываются — вместо них прочерки, и
 меняются только минуты. То же самое происходит и со вторым API, и
 с системным шрифтом вместо нашего, так что дело не в вёрстке:
 симулятор не крутит посекундный текст. Проверять на устройстве.
 */
private struct Countdown: View {
  let state: PrizmaAttributes.ContentState

  var body: some View {
    if state.running {
      // Часы не показываем: сессия длиннее часа не бывает, а «00:24:07»
      // занимало бы место втрое против нужного.
      Text(timerInterval: state.startedAt...state.endsAt, countsDown: true, showsHours: false)
    } else {
      Text(clock)
    }
  }

  private var clock: String {
    let s = max(0, state.leftSeconds)
    return String(format: "%02d:%02d", s / 60, s % 60)
  }
}

private struct PauseButton: View {
  let running: Bool
  let accent: Color

  var body: some View {
    Button(intent: TogglePauseIntent()) {
      Image(systemName: running ? "pause.fill" : "play.fill")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 44, height: 44)
        .background(accent.opacity(0.9), in: Circle())
    }
    .buttonStyle(.plain)
  }
}
