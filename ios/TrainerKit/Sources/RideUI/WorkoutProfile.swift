import SwiftUI
import TrainerKit

/// The workout as a bar chart: width = step length, height = target, color = power zone.
/// Open and distance steps get a fixed width. A line marks where the rider is.
struct WorkoutProfile: View {
  let steps: [RideStep]
  let ftp: Int?
  var index: Int = 0
  var stepProgress: Double = 0
  var compact = false

  private func width(_ s: RideStep) -> Double {
    switch s.length {
    case let .time(sec): Double(max(sec, 20))
    case .distance, .open: 180
    }
  }

  var body: some View {
    Canvas { ctx, size in
      guard !steps.isEmpty else { return }
      let total = steps.reduce(0) { $0 + width($1) }
      let peak = Double(steps.compactMap(\.targetWatts).max() ?? 200) * 1.1
      var x = 0.0
      var marker: Double?
      for (i, s) in steps.enumerated() {
        let w = width(s) / total * size.width
        let h = s.targetWatts.map { max(0.12, Double($0) / peak) } ?? 0.12
        let rect = CGRect(x: x, y: size.height * (1 - h), width: max(1, w - 1), height: size.height * h)
        let color = RidePalette.color(watts: s.targetWatts, ftp: ftp, intensity: s.intensity)
        ctx.fill(Path(roundedRect: rect, cornerRadius: compact ? 1 : 3), with: .color(color.opacity(i < index ? 0.35 : i == index ? 1 : 0.75)))
        if i == index { marker = x + w * min(1, max(0, stepProgress)) }
        x += w
      }
      if let m = marker {
        ctx.fill(Path(CGRect(x: m - 1, y: 0, width: 2, height: size.height)), with: .color(.white))
      }
    }
    .accessibilityLabel("Workout profile, step \(index + 1) of \(steps.count)")
  }
}
