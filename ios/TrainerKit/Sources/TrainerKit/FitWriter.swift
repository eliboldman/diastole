import Foundation

/// One second of a ride.
public struct RideSample: Codable, Equatable, Sendable {
  public var time: Date
  public var powerW: Int?
  public var cadenceRpm: Int?
  public var heartRateBpm: Int?
  public var speedMps: Double?
  public var distanceM: Double
  /// Course rides: elevation on the course here (metres).
  public var altitudeM: Double?
  public init(time: Date, powerW: Int? = nil, cadenceRpm: Int? = nil, heartRateBpm: Int? = nil, speedMps: Double? = nil, distanceM: Double = 0, altitudeM: Double? = nil) {
    self.time = time; self.powerW = powerW; self.cadenceRpm = cadenceRpm; self.heartRateBpm = heartRateBpm; self.speedMps = speedMps; self.distanceM = distanceM; self.altitudeM = altitudeM
  }
}

/// A lap = one workout step (or the whole free ride).
public struct RideLap: Codable, Equatable, Sendable {
  public var start: Date
  public var end: Date
  public var intensity: String
  /// Which workout step this lap rode (lines laps up with the plan on Diastole). Nil for free rides.
  public var stepIndex: Int?
  public init(start: Date, end: Date, intensity: String, stepIndex: Int? = nil) { self.start = start; self.end = end; self.intensity = intensity; self.stepIndex = stepIndex }
}

/// Writes a minimal Garmin FIT activity file (file_id, events, records, laps, session, activity)
/// that Diastole's upload route, Garmin Connect and Strava all read. Indoor cycling, no GPS.
public enum FitWriter {
  private static let fitEpoch: TimeInterval = 631_065_600 // 1989-12-31T00:00:00Z

  private enum Base: UInt8 { case enumT = 0x00, uint8 = 0x02, uint16 = 0x84, uint32 = 0x86, uint32z = 0x8C }
  private struct Field { let num: UInt8; let base: Base
    var size: UInt8 { switch base { case .enumT, .uint8: 1; case .uint16: 2; case .uint32, .uint32z: 4 } }
  }
  private enum V { case u8(Int?), u16(Int?), u32(Int?) }

  private struct Encoder {
    var body: [UInt8] = []
    var defined: [UInt8: [Field]] = [:]

    mutating func define(local: UInt8, global: UInt16, _ fields: [Field]) {
      body.append(0x40 | local)
      body += [0, 0] // reserved, little-endian
      body.appendLE(global)
      body.append(UInt8(fields.count))
      for f in fields { body += [f.num, f.size, f.base.rawValue] }
      defined[local] = fields
    }

    mutating func write(local: UInt8, _ values: [V]) {
      body.append(local)
      for v in values {
        switch v {
        case let .u8(x): body.append(x.map { UInt8(clamping: $0) } ?? 0xFF)
        case let .u16(x): body.appendLE(x.map { UInt16(clamping: $0) } ?? 0xFFFF)
        case let .u32(x):
          let u = x.map { UInt32(clamping: $0) } ?? 0xFFFF_FFFF
          body += [UInt8(u & 0xFF), UInt8((u >> 8) & 0xFF), UInt8((u >> 16) & 0xFF), UInt8(u >> 24)]
        }
      }
    }
  }

  static func ts(_ d: Date) -> Int { Int(d.timeIntervalSince1970 - fitEpoch) }

  private static func intensityCode(_ s: String) -> Int {
    switch s { case "warmup": 2; case "cooldown": 3; case "rest", "recovery": 1; default: 0 }
  }

  public static func encode(samples: [RideSample], laps: [RideLap], serial: UInt32 = 1) -> Data {
    guard let first = samples.first, let last = samples.last else { return Data() }
    var e = Encoder()
    let start = ts(first.time), end = ts(last.time)
    let timer = samples.count // one sample per moving second
    let distance = last.distanceM

    // file_id
    e.define(local: 0, global: 0, [Field(num: 0, base: .enumT), Field(num: 1, base: .uint16), Field(num: 2, base: .uint16), Field(num: 3, base: .uint32z), Field(num: 4, base: .uint32)])
    e.write(local: 0, [.u8(4), .u16(255), .u16(1), .u32(Int(serial)), .u32(start)])

    // event: timer start / stop_all
    e.define(local: 1, global: 21, [Field(num: 253, base: .uint32), Field(num: 0, base: .enumT), Field(num: 1, base: .enumT)])
    e.write(local: 1, [.u32(start), .u8(0), .u8(0)])

    // record
    // altitude (field 2): scale 5, offset 500 m; invalid (0xFFFF) when there's no course.
    e.define(local: 2, global: 20, [Field(num: 253, base: .uint32), Field(num: 3, base: .uint8), Field(num: 4, base: .uint8), Field(num: 5, base: .uint32), Field(num: 6, base: .uint16), Field(num: 7, base: .uint16), Field(num: 2, base: .uint16)])
    for s in samples {
      e.write(local: 2, [.u32(ts(s.time)), .u8(s.heartRateBpm), .u8(s.cadenceRpm), .u32(Int((s.distanceM * 100).rounded())), .u16(s.speedMps.map { Int(($0 * 1000).rounded()) }), .u16(s.powerW.map { max(0, $0) }), .u16(s.altitudeM.map { Int((($0 + 500) * 5).rounded()) })])
    }
    e.write(local: 1, [.u32(end), .u8(0), .u8(4)])

    // laps
    let lapFields = [253, 2, 7, 8, 9, 19, 20, 15, 16, 17, 23, 0, 1, 25, 13, 14, 71].map { n -> Field in
      switch n { case 253, 2, 7, 8, 9: Field(num: UInt8(n), base: .uint32); case 19, 20, 13, 14, 71: Field(num: UInt8(n), base: .uint16); case 15, 16, 17: Field(num: UInt8(n), base: .uint8); default: Field(num: UInt8(n), base: .enumT) }
    }
    e.define(local: 3, global: 19, lapFields)
    let useLaps = laps.isEmpty ? [RideLap(start: first.time, end: last.time, intensity: "active")] : laps
    var lapCount = 0
    for lap in useLaps {
      let inLap = samples.filter { $0.time >= lap.start && $0.time <= lap.end }
      guard let a = inLap.first, let b = inLap.last else { continue }
      let st = stats(inLap)
      let elapsed = max(0, b.time.timeIntervalSince(a.time)) + 1
      e.write(local: 3, [.u32(ts(b.time)), .u32(ts(a.time)), .u32(Int(elapsed * 1000)), .u32(inLap.count * 1000), .u32(Int(((b.distanceM - (samples.last(where: { $0.time < a.time })?.distanceM ?? 0)) * 100).rounded())),
                         .u16(st.avgP), .u16(st.maxP), .u8(st.avgHR), .u8(st.maxHR), .u8(st.avgCad), .u8(intensityCode(lap.intensity)), .u8(9), .u8(1), .u8(2),
                         .u16(st.avgSpeed), .u16(st.maxSpeed), .u16(lap.stepIndex)])
      lapCount += 1
    }

    // session
    let st = stats(samples)
    e.define(local: 4, global: 18, [253, 2, 7, 8, 9, 5, 6, 20, 21, 16, 17, 18, 11, 25, 26, 34, 0, 1, 14, 15].map { n -> Field in
      switch n { case 253, 2, 7, 8, 9: Field(num: UInt8(n), base: .uint32); case 20, 21, 11, 25, 26, 34, 14, 15: Field(num: UInt8(n), base: .uint16); case 16, 17, 18: Field(num: UInt8(n), base: .uint8); default: Field(num: UInt8(n), base: .enumT) }
    })
    let kj = samples.reduce(0) { $0 + max(0, $1.powerW ?? 0) } // joules at 1 Hz
    let kcal = Int((Double(kj) / 1000).rounded()) // ~24% muscle efficiency makes kcal burned ≈ kJ of work
    e.write(local: 4, [.u32(end), .u32(start), .u32((end - start + 1) * 1000), .u32(timer * 1000), .u32(Int((distance * 100).rounded())), .u8(2), .u8(6),
                       .u16(st.avgP), .u16(st.maxP), .u8(st.avgHR), .u8(st.maxHR), .u8(st.avgCad), .u16(kj > 0 ? kcal : nil), .u16(0), .u16(lapCount), .u16(normalizedPower(samples)), .u8(8), .u8(1), .u16(st.avgSpeed), .u16(st.maxSpeed)])

    // activity
    let localOffset = TimeZone.current.secondsFromGMT(for: last.time)
    e.define(local: 5, global: 34, [Field(num: 253, base: .uint32), Field(num: 0, base: .uint32), Field(num: 1, base: .uint16), Field(num: 2, base: .enumT), Field(num: 3, base: .enumT), Field(num: 4, base: .enumT), Field(num: 5, base: .uint32)])
    e.write(local: 5, [.u32(end), .u32(timer * 1000), .u16(1), .u8(0), .u8(26), .u8(1), .u32(end + localOffset)])

    // header + CRCs
    var header: [UInt8] = [14, 0x10]
    header.appendLE(UInt16(2132))
    let size = UInt32(e.body.count)
    header += [UInt8(size & 0xFF), UInt8((size >> 8) & 0xFF), UInt8((size >> 16) & 0xFF), UInt8(size >> 24)]
    header += Array(".FIT".utf8)
    header.appendLE(crc(header))
    var out = header + e.body
    out.appendLE(crc(out))
    return Data(out)
  }

  private struct Stats { var avgP: Int?; var maxP: Int?; var avgHR: Int?; var maxHR: Int?; var avgCad: Int?; var avgSpeed: Int?; var maxSpeed: Int? }
  private static func stats(_ s: [RideSample]) -> Stats {
    func avg(_ xs: [Int]) -> Int? { xs.isEmpty ? nil : Int((Double(xs.reduce(0, +)) / Double(xs.count)).rounded()) }
    let p = s.compactMap(\.powerW), hr = s.compactMap(\.heartRateBpm), cad = s.compactMap(\.cadenceRpm).filter { $0 > 0 }
    let sp = s.compactMap(\.speedMps).map { Int(($0 * 1000).rounded()) } // mm/s, FIT's speed scale
    return Stats(avgP: avg(p), maxP: p.max(), avgHR: avg(hr), maxHR: hr.max(), avgCad: avg(cad), avgSpeed: avg(sp), maxSpeed: sp.max())
  }

  /// 30-second rolling average, raised to the 4th power, averaged, 4th root.
  static func normalizedPower(_ s: [RideSample]) -> Int? {
    let p = s.map { Double(max(0, $0.powerW ?? 0)) }
    guard p.count >= 30 else { return nil }
    var sum = p[0..<30].reduce(0, +), acc = pow(sum / 30, 4), n = 1.0
    for i in 30..<p.count { sum += p[i] - p[i - 30]; acc += pow(sum / 30, 4); n += 1 }
    let np = pow(acc / n, 0.25)
    return np > 0 ? Int(np.rounded()) : nil
  }

  static func crc(_ bytes: [UInt8]) -> UInt16 {
    let table: [UInt16] = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400]
    var c: UInt16 = 0
    for b in bytes {
      var t = table[Int(c & 0xF)]; c = (c >> 4) & 0x0FFF; c = c ^ t ^ table[Int(b & 0xF)]
      t = table[Int(c & 0xF)]; c = (c >> 4) & 0x0FFF; c = c ^ t ^ table[Int((b >> 4) & 0xF)]
    }
    return c
  }
}
