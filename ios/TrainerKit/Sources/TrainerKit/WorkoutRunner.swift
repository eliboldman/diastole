import Foundation

/// One flat step of a bike workout as the Diastole server sends it (repeats already expanded).
public struct RideStep: Codable, Equatable, Sendable {
  public enum Length: Codable, Equatable, Sendable {
    case time(seconds: Int)
    case distance(meters: Double)
    case open // until the rider taps "Next"
  }

  public var length: Length
  /// Watts. Nil = free ride (ERG off, trainer left in a light resistance).
  public var low: Int?
  public var high: Int?
  public var label: String?
  /// "warmup" | "active" | "interval" | "recovery" | "rest" | "cooldown"
  public var intensity: String

  public init(length: Length, low: Int? = nil, high: Int? = nil, label: String? = nil, intensity: String = "active") {
    self.length = length; self.low = low; self.high = high; self.label = label; self.intensity = intensity
  }

  /// Middle of the range; ERG holds one number.
  public var targetWatts: Int? {
    switch (low, high) {
    case let (l?, h?): (l + h) / 2
    case let (l?, nil): l
    case let (nil, h?): h
    default: nil
    }
  }
}

/// Plays a list of steps against the clock (and trainer distance), and says what ERG target the
/// trainer should hold right now. Pure value type: the caller feeds it time and distance, so it is
/// fully testable and pausing is just "stop calling advance".
public struct WorkoutRunner: Sendable {
  public let steps: [RideStep]
  public private(set) var index = 0
  public private(set) var stepElapsed: Double = 0
  public private(set) var stepDistance: Double = 0
  public private(set) var totalElapsed: Double = 0
  /// Rider's intensity nudge, e.g. -0.05 = 5% easier. Applies to every ERG target.
  public var bias: Double = 0 { didSet { bias = min(max(bias, -0.3), 0.3) } }

  public init(steps: [RideStep]) { self.steps = steps }

  public var finished: Bool { index >= steps.count }
  public var current: RideStep? { finished ? nil : steps[index] }
  public var next: RideStep? { index + 1 < steps.count ? steps[index + 1] : nil }

  /// What the trainer should hold now (bias applied, rounded to 5 W so small nudges don't spam
  /// the trainer). Nil = free ride.
  public var targetWatts: Int? {
    guard let w = current?.targetWatts else { return nil }
    return Int((Double(w) * (1 + bias) / 5).rounded()) * 5
  }

  /// Seconds left in a timed step, else nil.
  public var stepRemaining: Double? {
    guard case let .time(s)? = current?.length else { return nil }
    return max(0, Double(s) - stepElapsed)
  }

  /// Fraction done of the current step (0...1), nil for open steps.
  public var stepProgress: Double? {
    switch current?.length {
    case let .time(s)?: s > 0 ? min(1, stepElapsed / Double(s)) : 1
    case let .distance(m)?: m > 0 ? min(1, stepDistance / m) : 1
    default: nil
    }
  }

  /// Moves the workout forward. Returns true when the step changed (time to send a new target and
  /// play a cue). Leftover time/distance carries into the next step so the total stays exact.
  @discardableResult
  public mutating func advance(seconds dt: Double, meters dm: Double = 0) -> Bool {
    guard !finished, dt >= 0 else { return false }
    totalElapsed += dt
    stepElapsed += dt
    stepDistance += max(0, dm)
    var changed = false
    while let step = current {
      switch step.length {
      case let .time(s) where stepElapsed >= Double(s):
        let carry = stepElapsed - Double(s)
        moveNext(); stepElapsed = carry
        changed = true
      case let .distance(m) where stepDistance >= m:
        let carry = stepDistance - m
        moveNext(); stepDistance = carry
        changed = true
      default:
        return changed
      }
    }
    return changed
  }

  /// Rider tapped "Next" (ends open steps, or skips any step).
  public mutating func skip() {
    guard !finished else { return }
    moveNext()
  }

  private mutating func moveNext() {
    index += 1
    stepElapsed = 0
    stepDistance = 0
  }

  /// Planned length of the timed steps, for the overview bar.
  public var plannedSeconds: Int {
    steps.reduce(0) { sum, s in if case let .time(t) = s.length { return sum + t }; return sum }
  }
}

/// Keeps ERG from fighting a rider who stopped pedaling: at very low cadence a trainer holding
/// 250 W makes it almost impossible to restart ("spiral of death"). Below the floor for a few
/// seconds we drop the target; once cadence is back we restore it.
public struct ErgGuard: Sendable {
  public var floorRpm: Double = 30
  public var graceSeconds: Double = 3
  private var lowSince: Date?
  public private(set) var suspended = false

  public init() {}

  /// Returns true when `suspended` flipped.
  public mutating func update(cadence: Double?, now: Date = Date()) -> Bool {
    guard let rpm = cadence else { return false } // trainer doesn't report cadence: never suspend
    let was = suspended
    if rpm < floorRpm {
      if lowSince == nil { lowSince = now }
      if let since = lowSince, now.timeIntervalSince(since) >= graceSeconds { suspended = true }
    } else {
      lowSince = nil
      suspended = false
    }
    return was != suspended
  }
}
