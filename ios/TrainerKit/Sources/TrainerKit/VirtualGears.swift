import Foundation

/// Shifting for single-speed trainers (Zwift Hub One / Cog, or a bike left in one gear). Zwift's own
/// virtual shifting runs on its private protocol, so we do it over plain FTMS simulation instead:
/// the trainer only sees a grade, and we pick the grade that makes the pedals feel like the chosen
/// gear on the real road.
///
/// How: at the same cadence, a gear `k` times bigger than the bike's real one means you'd be going
/// `k` times faster, so the road pushes back with force F(k·v), and the pedals feel `k` times that.
/// We ask the trainer for the extra force as extra grade. The middle gear (k = 1) sends the road
/// grade unchanged, so riding in it feels exactly like gears off.
public struct VirtualGears: Equatable, Sendable {
  /// Gear ratios (chainring ÷ cog), easiest first. Roughly a 34×34 to 53×11 road setup.
  public static let ratios: [Double] = (0..<24).map { i in
    (1.0 * pow(4.8 / 1.0, Double(i) / 23) * 100).rounded() / 100
  }
  /// The gear that matches the bike's real one; it rides like the course with no gears.
  public static let neutral = 12

  public private(set) var gear: Int = VirtualGears.neutral
  public init(gear: Int = VirtualGears.neutral) { self.gear = Self.clamp(gear) }

  public var count: Int { Self.ratios.count }
  /// Gear number for the screen, 1 = easiest.
  public var number: Int { gear + 1 }
  /// How much bigger than the real gear: < 1 easier, > 1 harder.
  public var factor: Double { Self.ratios[gear] / Self.ratios[Self.neutral] }

  public mutating func shift(_ direction: Int) { gear = Self.clamp(gear + direction) }
  private static func clamp(_ g: Int) -> Int { min(ratios.count - 1, max(0, g)) }

  /// Grade (%) to send the trainer so the pedals feel like this gear on `roadGrade`.
  /// `trainerSpeedMps` is the speed the trainer reports (its flywheel, i.e. the real gear).
  public func trainerGrade(roadGrade: Double, trainerSpeedMps v: Double, massKg m: Double,
                           cdA: Double = 0.32, crr: Double = 0.004, airDensity rho: Double = 1.2) -> Double {
    let k = factor
    guard k != 1, m > 0 else { return roadGrade }
    let theta = atan(roadGrade / 100)
    // What the pedals push against. Floored at 0: downhill faster than the road pulls you, you'd
    // coast, and a negative force would make an easier gear feel harder.
    func force(_ speed: Double) -> Double { max(0, 0.5 * rho * cdA * speed * speed + m * 9.81 * (crr * cos(theta) + sin(theta))) }
    let speed = max(0, v)
    let extra = k * force(k * speed) - force(speed) // newtons on top of what the road grade gives
    let g = roadGrade + extra / (m * 9.81) * 100
    return min(20, max(-10, (g * 10).rounded() / 10))
  }
}
