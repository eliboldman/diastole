import Foundation

/// A race's bike course as Diastole sends it (GET /api/ride/plan or /api/device/rides): a smoothed
/// elevation profile and its climbs. No map or video: the trainer feels the grade, the screen
/// shows where you are on the profile.
public struct RideCourse: Codable, Identifiable, Hashable, Sendable {
  public struct Climb: Codable, Hashable, Sendable {
    public let startM: Double
    public let endM: Double
    public let gainM: Double
    public let grade: Double // average %
    enum CodingKeys: String, CodingKey { case startM = "start_m", endM = "end_m", gainM = "gain_m", grade }
    public init(startM: Double, endM: Double, gainM: Double, grade: Double) { self.startM = startM; self.endM = endM; self.gainM = gainM; self.grade = grade }
  }

  public let id: String // race id
  public let name: String
  public let courseName: String?
  public let date: String
  public let distanceM: Double
  public let gainM: Double
  /// [distance m, elevation m], sorted by distance.
  public let profile: [[Double]]
  public let climbs: [Climb]
  /// The real route, [distance m, lat, lon] (courses added since trainer maps; nil before).
  public let track: [[Double]]?

  enum CodingKeys: String, CodingKey {
    case id, name, date, profile, climbs, track
    case courseName = "course_name", distanceM = "distance_m", gainM = "gain_m"
  }

  public init(id: String, name: String, courseName: String? = nil, date: String = "", distanceM: Double, gainM: Double, profile: [[Double]], climbs: [Climb] = [], track: [[Double]]? = nil) {
    self.id = id; self.name = name; self.courseName = courseName; self.date = date
    self.distanceM = distanceM; self.gainM = gainM; self.profile = profile; self.climbs = climbs
    self.track = track?.filter { $0.count == 3 && abs($0[1]) <= 90 && abs($0[2]) <= 180 }
  }

  /// Has a usable real route (map + GPS in the ride file).
  public var hasTrack: Bool { (track?.count ?? 0) >= 2 }

  /// Where on the real route a distance is (lat, lon), interpolated between track points.
  public func position(at d: Double) -> (lat: Double, lon: Double)? {
    guard let t = track, t.count >= 2 else { return nil }
    if d <= t[0][0] { return (t[0][1], t[0][2]) }
    var lo = 0, hi = t.count - 1
    if d >= t[hi][0] { return (t[hi][1], t[hi][2]) }
    while hi - lo > 1 {
      let mid = (lo + hi) / 2
      if t[mid][0] <= d { lo = mid } else { hi = mid }
    }
    let a = t[lo], b = t[hi]
    let f = b[0] > a[0] ? (d - a[0]) / (b[0] - a[0]) : 0
    return (a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
  }

  /// Index of the last track point at or before a distance (to split ridden / ahead on the map).
  public func trackIndex(at d: Double) -> Int {
    guard let t = track, !t.isEmpty else { return 0 }
    var lo = 0, hi = t.count - 1
    if d >= t[hi][0] { return hi }
    while hi - lo > 1 {
      let mid = (lo + hi) / 2
      if t[mid][0] <= d { lo = mid } else { hi = mid }
    }
    return lo
  }

  public var title: String { courseName.map { "\(name) · \($0)" } ?? name }

  /// Elevation at a distance (linear between profile points; clamped at the ends).
  public func elevation(at d: Double) -> Double {
    guard let first = profile.first, first.count == 2 else { return 0 }
    if d <= first[0] { return first[1] }
    var lo = 0, hi = profile.count - 1
    if d >= profile[hi][0] { return profile[hi][1] }
    while hi - lo > 1 {
      let mid = (lo + hi) / 2
      if profile[mid][0] <= d { lo = mid } else { hi = mid }
    }
    let a = profile[lo], b = profile[hi]
    let span = b[0] - a[0]
    return span > 0 ? a[1] + (b[1] - a[1]) * (d - a[0]) / span : a[1]
  }

  /// Road grade in % around a distance, over ~50 m so profile steps don't jolt the trainer.
  public func grade(at d: Double) -> Double {
    let a = max(0, d - 25), b = min(distanceM, d + 25)
    guard b - a > 1 else { return 0 }
    let g = (elevation(at: b) - elevation(at: a)) / (b - a) * 100
    return min(20, max(-15, g))
  }

  /// The climb you're on, or the next one ahead.
  public func climb(after d: Double) -> Climb? { climbs.sorted { $0.startM < $1.startM }.first { $0.endM > d } }
}

/// Moves a rider along a course from their power: rider + bike mass, aerodynamic drag, rolling
/// resistance and gravity on the current grade, with momentum (so speed carries over crests and
/// builds on descents instead of jumping). Pure value type, tested with `swift test`.
public struct CourseRunner: Sendable {
  public let course: RideCourse
  public let massKg: Double
  public var cdA = 0.32 // m², road position on the hoods
  public var crr = 0.004 // good road tyres
  public var airDensity = 1.2

  public private(set) var distanceM: Double = 0
  public private(set) var speedMps: Double = 0
  /// Metres climbed so far (sum of rises along the profile).
  public private(set) var climbedM: Double = 0

  public init(course: RideCourse, massKg: Double) {
    self.course = course
    self.massKg = min(200, max(40, massKg))
  }

  public var finished: Bool { distanceM >= course.distanceM }
  public var remainingM: Double { max(0, course.distanceM - distanceM) }
  public var progress: Double { course.distanceM > 0 ? min(1, distanceM / course.distanceM) : 1 }
  public var grade: Double { course.grade(at: distanceM) }
  public var elevationM: Double { course.elevation(at: distanceM) }

  /// One stretch of riding at `watts` for `seconds` (call once a second).
  public mutating func advance(watts: Double, seconds: Double) {
    guard seconds > 0, !finished else { return }
    let g = 9.81
    let inertia = massKg + 1.5 // wheels' rotational inertia acts like ~1.5 kg extra
    let power = max(0, watts) * 0.975 // drivetrain losses
    let dt = 0.1
    var t = 0.0
    while t < seconds - 1e-9, !finished {
      let step = min(dt, seconds - t)
      let theta = atan(course.grade(at: distanceM) / 100)
      let v = speedMps
      let resist = 0.5 * airDensity * cdA * v * v + massKg * g * (crr * cos(theta) + sin(theta))
      // Propulsive force from power; capped at low speed so a standing start isn't infinite.
      let push = power / max(v, 1.0)
      var next = v + (push - resist) / inertia * step
      next = min(max(next, 0), 22) // ~80 km/h: riders brake before that
      let before = elevationM
      distanceM = min(course.distanceM, distanceM + (v + next) / 2 * step)
      let rise = elevationM - before
      if rise > 0 { climbedM += rise }
      speedMps = next
      t += step
    }
  }

  /// What to tell a trainer in simulation mode: the grade scaled by trainer difficulty (0…1).
  /// Descents get half the scaling so riders keep some resistance to push against.
  public func trainerGrade(difficulty: Double) -> Double {
    let d = min(1, max(0, difficulty))
    let g = grade
    let scaled = g >= 0 ? g * d : g * d * 0.5
    return (scaled * 10).rounded() / 10
  }

  /// Seconds to the finish at the average speed so far (nil until moving).
  public func etaSeconds(elapsed: Int) -> Int? {
    guard elapsed > 30, distanceM > 100 else { return nil }
    let avg = distanceM / Double(elapsed)
    return avg > 0.5 ? Int((remainingM / avg).rounded()) : nil
  }
}
