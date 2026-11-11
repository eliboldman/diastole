import SwiftUI
import TrainerKit

/// The screen while riding a race course: where you are on the profile, the grade under you, how
/// far is left, and what's coming. The trainer feels the grade; power moves you along.
struct CourseDashboard: View {
  let session: RideSession
  let link: TrainerLink
  var miles = false
  let onEnd: () -> Void
  @State private var confirmEnd = false

  private var m: LiveMetrics { link.metrics }
  private var c: CourseRunner? { session.course }
  private var unit: String { miles ? "mi" : "km" }
  private var elevUnit: String { miles ? "ft" : "m" }
  private func elev(_ meters: Double) -> String { "\(Int((miles ? meters * 3.28084 : meters).rounded()))" }

  private var power3s: Int? {
    let last = session.samples.suffix(3).compactMap(\.powerW)
    return last.isEmpty ? m.powerW : last.reduce(0, +) / last.count
  }

  var body: some View {
    GeometryReader { geo in
      let wide = geo.size.width > 760
      let big = wide ? min(220, geo.size.height * 0.18) : 64
      VStack(spacing: wide ? 24 : 14) {
        header
        if let c {
          profileCard(c, height: wide ? geo.size.height * 0.30 : 150)
          if wide {
            HStack(alignment: .top, spacing: 20) {
              roadCard(c, big: big).frame(maxWidth: .infinity)
              metrics(columns: 2, wide: true).frame(width: min(520, geo.size.width * 0.36))
            }
          } else {
            roadCard(c, big: big)
            metrics(columns: 3, wide: false)
          }
        }
        Spacer(minLength: 0)
        controls(compact: !wide)
      }
      .padding(wide ? 40 : 18)
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
        if let eta = c?.etaSeconds(elapsed: session.elapsed) {
          Text("finish in ~\(clock(eta))").font(.subheadline.monospacedDigit()).foregroundStyle(RidePalette.dim)
        }
      }
    }
  }

  private func profileCard(_ c: CourseRunner, height: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("\(distanceText(c.distanceM, miles: miles)) of \(distanceText(c.course.distanceM, miles: miles)) \(unit)").font(.headline.monospacedDigit())
        Spacer()
        Text("\(distanceText(c.remainingM, miles: miles)) \(unit) to go").font(.headline.monospacedDigit()).foregroundStyle(RidePalette.accent)
      }
      CourseProfile(course: c.course, position: c.distanceM).frame(height: height)
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.1))
          Capsule().fill(RidePalette.accent).frame(width: max(6, g.size.width * c.progress))
        }
      }
      .frame(height: 6)
      .accessibilityLabel("\(Int(c.progress * 100))% of the course done")
    }
    .padding(18)
    .background(RoundedRectangle(cornerRadius: 28).fill(RidePalette.card))
    .overlay(RoundedRectangle(cornerRadius: 28).stroke(RidePalette.line))
  }

  private func roadCard(_ c: CourseRunner, big: CGFloat) -> some View {
    let g = c.grade
    return VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 22) {
        VStack(alignment: .leading, spacing: 2) {
          Text("GRADE").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
          Text(String(format: "%+.1f%%", g)).font(.system(size: big, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(gradeColor(g)).contentTransition(.numericText()).minimumScaleFactor(0.5).lineLimit(1)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text("POWER").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(RidePalette.dim)
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(power3s.map(String.init) ?? "–").font(.system(size: big * 0.7, weight: .semibold, design: .rounded).monospacedDigit()).minimumScaleFactor(0.5).lineLimit(1)
            Text("W").font(.title3).foregroundStyle(RidePalette.dim)
          }
        }
      }
      if let climb = c.course.climb(after: c.distanceM) {
        if climb.startM <= c.distanceM {
          Text("On the climb: \(distanceText(climb.endM - c.distanceM, miles: miles, digits: 2)) \(unit) to the top, \(String(format: "%.1f", climb.grade))% average")
            .font(.subheadline).foregroundStyle(RidePalette.amber)
        } else {
          Text("Climb in \(distanceText(climb.startM - c.distanceM, miles: miles)) \(unit): \(distanceText(climb.endM - climb.startM, miles: miles)) \(unit) at \(String(format: "%.1f", climb.grade))%, \(elev(climb.gainM)) \(elevUnit) up")
            .font(.subheadline).foregroundStyle(RidePalette.dim)
        }
      } else {
        Text("No more climbs. Bring it home.").font(.subheadline).foregroundStyle(RidePalette.dim)
      }
      if session.phase == .paused {
        Text(session.autoPaused ? "Paused · start pedaling to continue" : "Paused").font(.subheadline).foregroundStyle(RidePalette.amber)
      } else if !link.canControl {
        Text("This trainer can't change resistance, so the grade is for show. Distance still comes from your power.").font(.subheadline).foregroundStyle(RidePalette.amber)
      }
      Text("Trainer difficulty \(Int((session.difficulty * 100).rounded()))%\(session.rollers ? " · rollers cap climbs at 4%" : "")")
        .font(.footnote).foregroundStyle(RidePalette.dim)
    }
    .padding(22)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 28).fill(RidePalette.card))
    .overlay(RoundedRectangle(cornerRadius: 28).stroke(RidePalette.line))
  }

  private func metrics(columns: Int, wide: Bool) -> some View {
    let speed = (c?.speedMps ?? 0) * (miles ? 2.236936 : 3.6)
    let items: [(String, String, String)] = [
      ("Speed", String(format: "%.1f", speed), miles ? "mph" : "km/h"),
      ("Elevation", elev(c?.elevationM ?? 0), elevUnit),
      ("Climbed", elev(c?.climbedM ?? 0), elevUnit),
      ("Cadence", m.cadenceRpm.map { "\(Int($0.rounded()))" } ?? "–", "rpm"),
      ("Heart rate", m.heartRateBpm.map(String.init) ?? "–", "bpm"),
      ("Trainer grade", session.sentGrade.map { String(format: "%+.1f", $0) } ?? "–", "%"),
    ]
    return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: columns), spacing: 12) {
      ForEach(items, id: \.0) { item in
        VStack(alignment: .leading, spacing: 4) {
          Text(item.0.uppercased()).font(.caption2.weight(.semibold)).tracking(1.2).foregroundStyle(RidePalette.dim)
          HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(item.1).font(wide ? .system(size: 48, weight: .semibold, design: .rounded).monospacedDigit() : .title2.monospacedDigit().weight(.semibold)).minimumScaleFactor(0.6).lineLimit(1)
            Text(item.2).font(.caption).foregroundStyle(RidePalette.dim)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20).fill(RidePalette.card))
      }
    }
  }

  private func controls(compact: Bool) -> some View {
    HStack(spacing: compact ? 8 : 12) {
      Button { session.nudge(-1) } label: { Label("Easier", systemImage: "minus").frame(maxWidth: .infinity) }
        .accessibilityHint("Lowers trainer difficulty by 10%")
      Button {
        session.phase == .paused ? session.resume() : session.pause()
      } label: {
        Label(session.phase == .paused ? "Resume" : "Pause", systemImage: session.phase == .paused ? "play.fill" : "pause.fill").frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent).tint(RidePalette.accent).foregroundStyle(.black)
      Button { session.nudge(1) } label: { Label("Harder", systemImage: "plus").frame(maxWidth: .infinity) }
        .accessibilityHint("Raises trainer difficulty by 10%")
      Button(role: .destructive) { confirmEnd = true } label: { Label("End", systemImage: "stop.fill").frame(maxWidth: .infinity) }
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .font(.subheadline.weight(.semibold))
  }
}
