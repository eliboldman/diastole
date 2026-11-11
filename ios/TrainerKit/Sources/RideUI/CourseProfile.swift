import SwiftUI
import TrainerKit

/// A course's elevation profile: climbs tinted, the part you've ridden filled in, and a marker
/// where you are. Used in the course list (compact) and big on the riding screen.
struct CourseProfile: View {
  let course: RideCourse
  var position: Double? = nil // metres along the course
  var compact = false

  var body: some View {
    Canvas { ctx, size in
      let pts = course.profile.filter { $0.count == 2 }
      guard pts.count >= 2, course.distanceM > 0 else { return }
      let lo = (pts.map { $0[1] }.min() ?? 0), hi = (pts.map { $0[1] }.max() ?? 1)
      // Give flat courses some headroom so a 10 m bump doesn't look like a mountain.
      let span = max(hi - lo, compact ? 40 : 60)
      let base = lo - span * 0.08
      let x = { (d: Double) in CGFloat(d / course.distanceM) * size.width }
      let y = { (e: Double) in size.height - CGFloat((e - base) / (span * 1.12)) * size.height }

      var area = Path()
      area.move(to: CGPoint(x: 0, y: size.height))
      for p in pts { area.addLine(to: CGPoint(x: x(p[0]), y: y(p[1]))) }
      area.addLine(to: CGPoint(x: size.width, y: size.height))
      area.closeSubpath()
      ctx.fill(area, with: .color(Color.white.opacity(0.10)))

      // Climbs in amber.
      for c in course.climbs {
        let rect = CGRect(x: x(c.startM), y: 0, width: max(1, x(c.endM) - x(c.startM)), height: size.height)
        ctx.drawLayer { layer in
          layer.clip(to: area)
          layer.fill(Path(rect), with: .color(RidePalette.amber.opacity(0.22)))
        }
      }

      // Ridden so far.
      if let pos = position {
        let done = CGRect(x: 0, y: 0, width: x(min(pos, course.distanceM)), height: size.height)
        ctx.drawLayer { layer in
          layer.clip(to: area)
          layer.fill(Path(done), with: .color(RidePalette.accent.opacity(0.35)))
        }
      }

      var line = Path()
      for (i, p) in pts.enumerated() {
        let pt = CGPoint(x: x(p[0]), y: y(p[1]))
        if i == 0 { line.move(to: pt) } else { line.addLine(to: pt) }
      }
      ctx.stroke(line, with: .color(Color.white.opacity(0.75)), lineWidth: compact ? 1.2 : 2)

      if let pos = position {
        let px = x(min(pos, course.distanceM)), py = y(course.elevation(at: pos))
        ctx.stroke(Path { $0.move(to: CGPoint(x: px, y: 0)); $0.addLine(to: CGPoint(x: px, y: size.height)) }, with: .color(RidePalette.accent.opacity(0.6)), lineWidth: 1)
        let r: CGFloat = compact ? 3 : 7
        ctx.fill(Path(ellipseIn: CGRect(x: px - r, y: py - r, width: r * 2, height: r * 2)), with: .color(RidePalette.accent))
      }
    }
    .accessibilityElement()
    .accessibilityLabel("Elevation profile, \(Int(course.gainM)) metres of climbing")
  }
}

func distanceText(_ m: Double, miles: Bool, digits: Int = 1) -> String {
  String(format: "%.\(digits)f", m / (miles ? 1609.344 : 1000))
}

func gradeColor(_ g: Double) -> Color {
  switch g {
  case ..<(-2): return Color(red: 0.38, green: 0.66, blue: 0.98)
  case ..<2: return .white
  case ..<5: return RidePalette.accent
  case ..<8: return RidePalette.amber
  default: return RidePalette.red
  }
}
