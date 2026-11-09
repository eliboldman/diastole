import Foundation

// Bluetooth SIG profiles a smart trainer can speak. FTMS (Fitness Machine Service) is the one that
// lets us CONTROL the trainer (ERG mode); Cycling Power and Heart Rate are read-only fallbacks so a
// plain power meter or a non-controllable trainer still shows numbers.

public enum GATT {
  public static let ftmsService = "1826"
  public static let ftmsFeature = "2ACC"
  public static let indoorBikeData = "2AD2"
  public static let trainingStatus = "2AD3"
  public static let supportedPowerRange = "2AD8"
  public static let controlPoint = "2AD9"
  public static let machineStatus = "2ADA"

  public static let cyclingPowerService = "1818"
  public static let cyclingPowerMeasurement = "2A63"

  public static let heartRateService = "180D"
  public static let heartRateMeasurement = "2A37"
}

// MARK: - FTMS Indoor Bike Data (0x2AD2)

/// One Indoor Bike Data notification. Only fields the trainer flagged are set.
public struct IndoorBikeData: Equatable, Sendable {
  public var speedKph: Double?
  public var averageSpeedKph: Double?
  public var cadenceRpm: Double?
  public var averageCadenceRpm: Double?
  public var totalDistanceM: Int?
  public var resistanceLevel: Int?
  public var powerW: Int?
  public var averagePowerW: Int?
  public var totalEnergyKcal: Int?
  public var heartRateBpm: Int?
  public var elapsedS: Int?
  public var remainingS: Int?
  /// True when the trainer split this sample over several packets (flag bit 0) and this one
  /// doesn't carry instantaneous speed.
  public var moreData = false

  public init() {}

  /// Parses per FTMS 1.0 §4.9. Field order is fixed; each flag bit says whether its field is present.
  /// Bit 0 is inverted: 0 means instantaneous speed IS present.
  public static func parse(_ data: Data) -> IndoorBikeData? {
    var r = ByteReader(data)
    guard let flags = r.u16() else { return nil }
    func has(_ bit: Int) -> Bool { flags & (1 << bit) != 0 }
    var d = IndoorBikeData()
    d.moreData = has(0)
    if !has(0) { guard let v = r.u16() else { return nil }; d.speedKph = Double(v) / 100 }
    if has(1) { guard let v = r.u16() else { return nil }; d.averageSpeedKph = Double(v) / 100 }
    if has(2) { guard let v = r.u16() else { return nil }; d.cadenceRpm = Double(v) / 2 }
    if has(3) { guard let v = r.u16() else { return nil }; d.averageCadenceRpm = Double(v) / 2 }
    if has(4) { guard let v = r.u24() else { return nil }; d.totalDistanceM = Int(v) }
    if has(5) { guard let v = r.s16() else { return nil }; d.resistanceLevel = Int(v) }
    if has(6) { guard let v = r.s16() else { return nil }; d.powerW = Int(v) }
    if has(7) { guard let v = r.s16() else { return nil }; d.averagePowerW = Int(v) }
    if has(8) {
      // Total energy (uint16), energy per hour (uint16), energy per minute (uint8).
      guard let total = r.u16(), r.skip(3) else { return nil }
      d.totalEnergyKcal = total == 0xFFFF ? nil : Int(total)
    }
    if has(9) { guard let v = r.u8() else { return nil }; d.heartRateBpm = v == 0 ? nil : Int(v) }
    if has(10) { guard r.skip(1) else { return nil } } // metabolic equivalent
    if has(11) { guard let v = r.u16() else { return nil }; d.elapsedS = Int(v) }
    if has(12) { guard let v = r.u16() else { return nil }; d.remainingS = Int(v) }
    return d
  }
}

// MARK: - FTMS Feature (0x2ACC)

public struct FTMSFeatures: Equatable, Sendable {
  public let machine: UInt32
  public let targets: UInt32

  public var reportsCadence: Bool { machine & (1 << 1) != 0 }
  public var reportsPower: Bool { machine & (1 << 14) != 0 }
  public var canSetResistance: Bool { targets & (1 << 2) != 0 }
  public var canSetPower: Bool { targets & (1 << 3) != 0 }
  public var canSimulate: Bool { targets & (1 << 13) != 0 }

  public init(machine: UInt32, targets: UInt32) { self.machine = machine; self.targets = targets }

  public static func parse(_ data: Data) -> FTMSFeatures? {
    var r = ByteReader(data)
    guard let m = r.u32(), let t = r.u32() else { return nil }
    return FTMSFeatures(machine: m, targets: t)
  }
}

/// Supported Power Range (0x2AD8): what ERG targets the trainer accepts.
public struct PowerRange: Equatable, Sendable {
  public let min: Int, max: Int, step: Int
  public init(min: Int, max: Int, step: Int) { self.min = min; self.max = max; self.step = step }

  public static func parse(_ data: Data) -> PowerRange? {
    var r = ByteReader(data)
    guard let lo = r.s16(), let hi = r.s16(), let inc = r.u16() else { return nil }
    return PowerRange(min: Int(lo), max: Int(hi), step: Swift.max(1, Int(inc)))
  }

  /// Clamps a target to what the trainer accepts, snapped to its increment.
  public func clamp(_ watts: Int) -> Int {
    let c = Swift.min(Swift.max(watts, min), max)
    return min + ((c - min) / step) * step
  }
}

// MARK: - FTMS Control Point (0x2AD9)

public enum ControlCommand: Equatable, Sendable {
  case requestControl
  case reset
  /// Unitless level, 0.1 resolution (FTMS 1.0 uses a uint8).
  case setResistance(level: Double)
  /// ERG mode: hold this many watts regardless of cadence.
  case setTargetPower(watts: Int)
  case start
  case stop
  case pause
  /// SIM mode: trainer computes resistance from grade and wind (for routes, later).
  case simulation(windMps: Double, gradePercent: Double, crr: Double, cwKgPerM: Double)

  public var opcode: UInt8 {
    switch self {
    case .requestControl: 0x00
    case .reset: 0x01
    case .setResistance: 0x04
    case .setTargetPower: 0x05
    case .start: 0x07
    case .stop, .pause: 0x08
    case .simulation: 0x11
    }
  }

  public var bytes: [UInt8] {
    var b: [UInt8] = [opcode]
    switch self {
    case .requestControl, .reset, .start: break
    case .stop: b.append(0x01)
    case .pause: b.append(0x02)
    case let .setResistance(level):
      b.append(UInt8(clamping: Int((level * 10).rounded())))
    case let .setTargetPower(watts):
      b.appendLE(Int16(clamping: watts))
    case let .simulation(wind, grade, crr, cw):
      b.appendLE(Int16(clamping: Int((wind * 1000).rounded())))
      b.appendLE(Int16(clamping: Int((grade * 100).rounded())))
      b.append(UInt8(clamping: Int((crr * 10000).rounded())))
      b.append(UInt8(clamping: Int((cw * 100).rounded())))
    }
    return b
  }

  public var data: Data { Data(bytes) }
}

/// The trainer's answer to a control point write (sent as an indication: 0x80, opcode, result).
public struct ControlResponse: Equatable, Sendable {
  public enum Result: UInt8, Sendable {
    case success = 0x01, notSupported = 0x02, invalidParameter = 0x03, failed = 0x04, controlNotPermitted = 0x05
  }
  public let requestOpcode: UInt8
  public let result: Result?

  public var ok: Bool { result == .success }

  public static func parse(_ data: Data) -> ControlResponse? {
    var r = ByteReader(data)
    guard r.u8() == 0x80, let op = r.u8(), let res = r.u8() else { return nil }
    return ControlResponse(requestOpcode: op, result: Result(rawValue: res))
  }
}

// MARK: - Cycling Power Measurement (0x2A63)

public struct CyclingPower: Equatable, Sendable {
  public var powerW: Int
  /// Cumulative crank revolutions + last crank event time (1/1024 s), for cadence.
  public var crank: (revs: UInt16, time: UInt16)?

  public static func == (a: CyclingPower, b: CyclingPower) -> Bool {
    a.powerW == b.powerW && a.crank?.revs == b.crank?.revs && a.crank?.time == b.crank?.time
  }

  public static func parse(_ data: Data) -> CyclingPower? {
    var r = ByteReader(data)
    guard let flags = r.u16(), let power = r.s16() else { return nil }
    func has(_ bit: Int) -> Bool { flags & (1 << bit) != 0 }
    var out = CyclingPower(powerW: Int(power), crank: nil)
    if has(0) { guard r.skip(1) else { return out } } // pedal power balance
    if has(2) { guard r.skip(2) else { return out } } // accumulated torque
    if has(4) { guard r.skip(6) else { return out } } // wheel revolutions (uint32 + uint16)
    if has(5), let revs = r.u16(), let time = r.u16() { out.crank = (revs, time) }
    return out
  }
}

/// Turns successive crank (revs, event time) pairs into rpm, handling 16-bit rollover.
public struct CadenceTracker: Sendable {
  private var last: (revs: UInt16, time: UInt16)?
  private var lastChange = Date.distantPast
  public private(set) var rpm: Double = 0

  public init() {}

  public mutating func update(_ crank: (revs: UInt16, time: UInt16), now: Date = Date()) -> Double {
    defer { last = crank }
    guard let prev = last else { return rpm }
    let dRevs = crank.revs &- prev.revs
    let dTime = crank.time &- prev.time
    if dRevs > 0, dTime > 0 {
      rpm = Double(dRevs) / (Double(dTime) / 1024) * 60
      lastChange = now
    } else if now.timeIntervalSince(lastChange) > 3 {
      rpm = 0 // no crank event for 3 s: stopped pedaling
    }
    return rpm
  }
}

// MARK: - Heart Rate Measurement (0x2A37)

public enum HeartRate {
  public static func parse(_ data: Data) -> Int? {
    var r = ByteReader(data)
    guard let flags = r.u8() else { return nil }
    let bpm = flags & 0x01 == 0 ? r.u8().map(Int.init) : r.u16().map(Int.init)
    return bpm.flatMap { $0 > 0 ? $0 : nil }
  }
}
