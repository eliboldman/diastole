import SwiftUI
import TrainerKit

/// The screen while riding: what to hold, what you're doing, what's next.
struct RideDashboard: View {
  let session: RideSession
  let link: TrainerLink
  let ftp: Int?
  var miles = false
  let onEnd: () -> Void
  @State private var confirmEnd = false

  private var m: LiveMetrics { link.metrics }
  private var runner: WorkoutRunner { session.runner }

  /// 3-second average so the big number doesn't flicker.
  private var power3s: Int? {
    let last = session.samples.suffix(3).compactMap(\.powerW)
    return last.isEmpty ? m.powerW : last.reduce(0, +) / last.count
  }

  private var powerColor: Color {
    guard let t = session.sentTarget, t > 0, let p = power3s else { return .white }
    let off = abs(Double(p - t)) / Double(t)
    return off <= 0.05 ? RidePalette.accent : off <= 0.15 ? RidePalette.amber : RidePalette.red
  }

  var body: some View {
    GeometryReader { geo in
      let wide = geo.size.width > 760
      // Big numbers scale with the screen: a TV across the room needs them huge.
      let big = wide ? min(300, geo.size.height * 0.24) : 88
      VStack(spacing: wide ? 28 : 18) {
        header
        if wide {
          HStack(alignment: .top, spacing: 24) {
            stepCard(big: big).frame(maxWidth: .infinity)
            metrics(columns: 1, wide: true).frame(width: min(420, geo.size.width * 0.26))
          }
        } else {
          stepCard(big: big)
          metrics(columns: 3, wide: false)
        }
        if !session.isFreeRide {
          // Mystery: only the steps revealed so far.
          WorkoutProfile(steps: session.mystery ? Array(runner.steps.prefix(runner.index + 1)) : runner.steps, ftp: ftp, index: runner.index, stepProgress: runner.stepProgress ?? 0)
            .frame(height: wide ? geo.size.height * 0.18 : 72)
        }
        Spacer(minLength: 0)
        controls(compact: !wide)
      }
      .padding(wide ? 48 : 20)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(RidePalette.canvas.ignoresSafeArea())
    .foregroundStyle(.white)
    .confirmationDialog("End this ride?", isPresented: $confirmEnd, titleVisibility: .visible) {
      Button("End and save", role: .destructive, action: onEnd)
      Button("Keep riding", role: .cancel) {}
    }
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      VStack(alignment: .leading, spacing: 4) {
        Text(session.title).font(.headline).lineLimit(1)
        Text(link.trainerName ?? "Trainer").font(.subheadline).foregroundStyle(RidePalette.dim).lineLimit(1)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 4) {
        Text(clock(session.elapsed)).font(.title2.monospacedDigit().weight(.semibold))
        if !session.isFreeRide, runner.plannedSeconds > 0 {
          Text("of \(clock(runner.plannedSeconds))").font(.subheadline.monospacedDigit()).foregroundStyle(RidePalette.dim)
        }
      }
    }
  }

  private func stepCard(big: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      if session.isFreeRide {
        Text("FREE RIDE").font(.caption.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
      } else if let step = runner.current {
        HStack {
          Text("\(intensityName(step.intensity).uppercased()) · STEP \(runner.index + 1) OF \(runner.steps.count)")
            .font(.caption.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
          Spacer()
          if let left = runner.stepRemaining {
            Text("\(clock(Int(left.rounded(.up)))) left").font(.title3.monospacedDigit().weight(.semibold))
          } else if case .open = step.length {
            Text("Tap Next when done").font(.subheadline).foregroundStyle(RidePalette.amber)
          } else if case let .distance(meters) = step.length {
            Text("\(Int(max(0, meters - runner.stepDistance))) m left").font(.title3.monospacedDigit().weight(.semibold))
          }
        }
        if let label = step.label { Text(label).font(.subheadline).foregroundStyle(RidePalette.dim) }
      }

      HStack(alignment: .firstTextBaseline, spacing: 18) {
        VStack(alignment: .leading, spacing: 2) {
          Text("HOLD").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
          Text(session.ergSuspended ? "–" : session.sentTarget.map { "\($0)" } ?? "Free").font(.system(size: big * 0.5, weight: .semibold, design: .rounded).monospacedDigit())
        }
        VStack(alignment: .leading, spacing: 2) {
          Text("POWER").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(power3s.map(String.init) ?? "–").font(.system(size: big, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(powerColor)
              .contentTransition(.numericText()).minimumScaleFactor(0.5).lineLimit(1)
            Text("W").font(.title3).foregroundStyle(RidePalette.dim)
          }
        }
      }

      if let p = runner.stepProgress {
        GeometryReader { g in
          ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.1))
            Capsule().fill(RidePalette.accent).frame(width: max(6, g.size.width * p))
          }
        }
        .frame(height: 6)
        .accessibilityLabel("Step \(Int(p * 100))% done")
      }
      if session.ergSuspended {
        Text("Pedal to bring the resistance back").font(.subheadline).foregroundStyle(RidePalette.amber)
      } else if session.phase == .paused {
        Text(session.autoPaused ? "Paused · start pedaling to continue" : "Paused").font(.subheadline).foregroundStyle(RidePalette.amber)
      } else if !link.canControl {
        Text("This trainer can't be controlled, so ride to the numbers").font(.subheadline).foregroundStyle(RidePalette.amber)
      }
      if !session.isFreeRide, let next = runner.next {
        if session.mystery {
          Text("Next: sealed until it starts 🎁").font(.subheadline).foregroundStyle(RidePalette.dim).lineLimit(1)
        } else {
          Text("Next: \(intensityName(next.intensity)) · \(stepText(next))").font(.subheadline).foregroundStyle(RidePalette.dim).lineLimit(1)
        }
      }
      if runner.bias != 0 {
        Text("\(runner.bias > 0 ? "+" : "")\(Int((runner.bias * 100).rounded()))% on every target").font(.footnote).foregroundStyle(RidePalette.dim)
      }
    }
    .padding(22)
    .background(RoundedRectangle(cornerRadius: 28).fill(RidePalette.card))
    .overlay(RoundedRectangle(cornerRadius: 28).stroke(RidePalette.line))
  }

  private func metrics(columns: Int, wide: Bool) -> some View {
    let items: [(String, String, String)] = [
      ("Cadence", m.cadenceRpm.map { "\(Int($0.rounded()))" } ?? "–", "rpm"),
      ("Heart rate", m.heartRateBpm.map(String.init) ?? "–", "bpm"),
      ("Distance", String(format: "%.1f", session.distanceM / (miles ? 1609.344 : 1000)), miles ? "mi" : "km"),
    ]
    return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: columns), spacing: 12) {
      ForEach(items, id: \.0) { item in
        VStack(alignment: .leading, spacing: 4) {
          Text(item.0.uppercased()).font(.caption2.weight(.semibold)).tracking(1.2).foregroundStyle(RidePalette.dim)
          HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(item.1).font(wide ? .system(size: 64, weight: .semibold, design: .rounded).monospacedDigit() : .title.monospacedDigit().weight(.semibold)).minimumScaleFactor(0.6).lineLimit(1)
            Text(item.2).font(.caption).foregroundStyle(RidePalette.dim)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20).fill(RidePalette.card))
      }
    }
  }

  private func controls(compact: Bool) -> some View {
    HStack(spacing: compact ? 8 : 12) {
      Button { session.nudge(-1) } label: { Label(session.isFreeRide ? "−5 W" : "Easier", systemImage: "minus").frame(maxWidth: .infinity) }
      Button {
        session.phase == .paused ? session.resume() : session.pause()
      } label: {
        Label(session.phase == .paused ? "Resume" : "Pause", systemImage: session.phase == .paused ? "play.fill" : "pause.fill").frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent).tint(RidePalette.accent).foregroundStyle(.black)
      Button { session.nudge(1) } label: { Label(session.isFreeRide ? "+5 W" : "Harder", systemImage: "plus").frame(maxWidth: .infinity) }
      if !session.isFreeRide {
        Button { session.skip() } label: { Label("Next", systemImage: "forward.end.fill").frame(maxWidth: .infinity) }
      }
      Button(role: .destructive) { confirmEnd = true } label: { Label("End", systemImage: "stop.fill").frame(maxWidth: .infinity) }
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .labelStyle(AdaptiveLabel(compact: compact))
    .font(.subheadline.weight(.semibold))
  }
}

/// Phones show icons only (five buttons don't fit with words); bigger screens show both.
private struct AdaptiveLabel: LabelStyle {
  let compact: Bool
  func makeBody(configuration: Configuration) -> some View {
    if compact {
      IconOnlyLabelStyle().makeBody(configuration: configuration) // VoiceOver still reads the title
    } else {
      TitleAndIconLabelStyle().makeBody(configuration: configuration)
    }
  }
}
