#if canImport(CoreBluetooth)
@preconcurrency import CoreBluetooth
import Foundation
import Observation

/// A Bluetooth device we found while scanning.
public struct FoundDevice: Identifiable, Hashable, Sendable {
  public enum Kind: String, Sendable { case controllable, power, heartRate }
  public let id: UUID
  public let name: String
  public let kind: Kind
  public let rssi: Int
}

/// Live numbers from whatever is connected (trainer and/or heart-rate strap).
public struct LiveMetrics: Codable, Equatable, Sendable {
  public var powerW: Int?
  public var cadenceRpm: Double?
  public var speedKph: Double?
  public var heartRateBpm: Int?
  /// Trainer-reported distance since connect, metres.
  public var distanceM: Double?
  public init() {}
}

/// CoreBluetooth wrapper for one trainer plus one optional heart-rate strap. Apple TV allows only
/// two Bluetooth accessories besides the Siri Remote, so that's the whole budget on tvOS.
///
/// Runs on the main queue so the UI can read it directly; all CoreBluetooth callbacks arrive there.
@MainActor @Observable
public final class TrainerConnection: NSObject, TrainerLink {
  public enum State: Equatable, Sendable { case off, unauthorized, idle, scanning, connecting, connected }

  public private(set) var state: State = .idle
  public private(set) var found: [FoundDevice] = []
  public private(set) var trainerName: String?
  public private(set) var heartRateName: String?
  public private(set) var metrics = LiveMetrics()
  public private(set) var features: FTMSFeatures?
  public private(set) var powerRange: PowerRange?
  /// True once the trainer accepted Request Control: ERG targets will be honoured.
  public private(set) var inControl = false
  public private(set) var lastError: String?

  public var canControl: Bool { controlPoint != nil && (features?.canSetPower ?? true) }

  @ObservationIgnored private var central: CBCentralManager!
  @ObservationIgnored private var trainer: CBPeripheral?
  @ObservationIgnored private var strap: CBPeripheral?
  @ObservationIgnored private var controlPoint: CBCharacteristic?
  @ObservationIgnored private var pending: [ControlCommand] = []
  @ObservationIgnored private var inFlight: ControlCommand?
  @ObservationIgnored private var retriedControl = false
  @ObservationIgnored private var cadence = CadenceTracker()
  @ObservationIgnored private var distanceBase: Int?
  @ObservationIgnored private var wantTrainer: UUID?
  @ObservationIgnored private var wantStrap: UUID?
  /// .none = nothing sent yet (so the first "free ride" is sent too); .some(nil) = released.
  @ObservationIgnored private var lastTarget: Int?? = .none

  private static let scanServices = [GATT.ftmsService, GATT.cyclingPowerService, GATT.heartRateService].map(CBUUID.init(string:))

  public override init() {
    super.init()
    central = CBCentralManager(delegate: self, queue: .main)
  }

  // MARK: Public API

  public func startScan() {
    guard central.state == .poweredOn else { return }
    found = []
    state = .scanning
    central.scanForPeripherals(withServices: Self.scanServices, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
  }

  public func stopScan() {
    central.stopScan()
    if state == .scanning { state = trainer == nil ? .idle : .connected }
  }

  public func connect(_ device: FoundDevice) {
    guard let p = central.retrievePeripherals(withIdentifiers: [device.id]).first else { return }
    stopScan()
    p.delegate = self
    if device.kind == .heartRate {
      wantStrap = device.id; strap = p; heartRateName = device.name
    } else {
      wantTrainer = device.id; trainer = p; trainerName = device.name
      state = .connecting
    }
    central.connect(p)
  }

  /// Reconnects to remembered devices (e.g. ids saved in UserDefaults from last ride).
  public func reconnect(trainer t: UUID?, strap s: UUID?) {
    for p in central.retrievePeripherals(withIdentifiers: [t, s].compactMap { $0 }) {
      p.delegate = self
      if p.identifier == t { wantTrainer = t; trainer = p; trainerName = p.name; state = .connecting }
      if p.identifier == s { wantStrap = s; strap = p; heartRateName = p.name }
      central.connect(p)
    }
  }

  public func disconnectAll() {
    wantTrainer = nil; wantStrap = nil
    if let t = trainer { central.cancelPeripheralConnection(t) }
    if let s = strap { central.cancelPeripheralConnection(s) }
  }

  /// ERG: hold `watts`. Nil releases the trainer to a light fixed resistance (free ride / paused).
  /// Repeating the same target is ignored.
  public func setTarget(_ watts: Int?) {
    if case let .some(last) = lastTarget, last == watts { return }
    lastTarget = .some(watts)
    if let w = watts {
      send(.setTargetPower(watts: powerRange?.clamp(w) ?? w))
    } else if features == nil || features?.canSimulate == true {
      send(Self.flatRoad) // feels like riding on the flat: easiest to keep pedaling or restart
    } else if features?.canSetResistance == true {
      send(.setResistance(level: 5))
    } else {
      send(.setTargetPower(watts: powerRange?.min ?? 50)) // ERG-only trainer: hold something light
    }
  }

  static let flatRoad = ControlCommand.simulation(windMps: 0, gradePercent: 0, crr: 0.004, cwKgPerM: 0.51)

  public func send(_ command: ControlCommand) {
    guard controlPoint != nil else { return }
    if !inControl && command != .requestControl && !pending.contains(.requestControl) && inFlight != .requestControl {
      pending.append(.requestControl)
    }
    // Only the newest target matters: drop older ones still waiting behind a slow trainer.
    if command.setsTarget { pending.removeAll { $0.setsTarget } }
    pending.append(command)
    pump()
  }

  // MARK: Internals

  /// FTMS allows one outstanding control-point write; the next goes after the trainer's indication.
  private func pump() {
    guard inFlight == nil, let cp = controlPoint, let t = trainer, !pending.isEmpty else { return }
    let cmd = pending.removeFirst()
    inFlight = cmd
    t.writeValue(cmd.data, for: cp, type: .withResponse)
  }

  private func handle(_ response: ControlResponse) {
    let cmd = inFlight
    inFlight = nil
    if response.requestOpcode == ControlCommand.requestControl.opcode {
      inControl = response.ok
      if response.ok { pending.insert(.start, at: 0) }
    } else if response.result == .controlNotPermitted, let cmd, !retriedControl {
      // Another app grabbed the trainer, or it reset: ask again once, then retry the command.
      retriedControl = true
      inControl = false
      pending.insert(contentsOf: [.requestControl, cmd], at: 0)
    } else if !response.ok, let cmd {
      lastError = "Trainer refused \(cmd) (\(response.result.map { "\($0)" } ?? "unknown"))"
    }
    if response.ok { retriedControl = false }
    pump()
  }

  private func cleanUp(_ p: CBPeripheral) {
    if p == trainer {
      controlPoint = nil; inControl = false; pending = []; inFlight = nil; lastTarget = .none
      features = nil; powerRange = nil; distanceBase = nil
      metrics.powerW = nil; metrics.cadenceRpm = nil; metrics.speedKph = nil
      if wantTrainer == p.identifier { state = .connecting; central.connect(p) } // auto-reconnect
      else { trainer = nil; trainerName = nil; state = .idle }
    } else if p == strap {
      metrics.heartRateBpm = nil
      if wantStrap == p.identifier { central.connect(p) } else { strap = nil; heartRateName = nil }
    }
  }

  fileprivate func onUpdateState() {
    switch central.state {
    case .poweredOn: if state == .off || state == .unauthorized { state = .idle }
    case .unauthorized: state = .unauthorized
    default: state = .off
    }
  }

  fileprivate func onDiscover(_ p: CBPeripheral, adv: [String: Any], rssi: Int) {
    let services = (adv[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
    let kind: FoundDevice.Kind =
      services.contains(CBUUID(string: GATT.ftmsService)) ? .controllable
      : services.contains(CBUUID(string: GATT.cyclingPowerService)) ? .power : .heartRate
    let name = p.name ?? (adv[CBAdvertisementDataLocalNameKey] as? String) ?? "Unknown device"
    let d = FoundDevice(id: p.identifier, name: name, kind: kind, rssi: rssi)
    if let i = found.firstIndex(where: { $0.id == d.id }) { found[i] = d } else { found.append(d) }
    found.sort { ($0.kind == .controllable ? 0 : 1, -$0.rssi) < ($1.kind == .controllable ? 0 : 1, -$1.rssi) }
  }

  fileprivate func onConnect(_ p: CBPeripheral) {
    if p == trainer { state = .connected }
    p.discoverServices(Self.scanServices)
  }

  fileprivate func onServices(_ p: CBPeripheral) {
    for s in p.services ?? [] { p.discoverCharacteristics(nil, for: s) }
  }

  fileprivate func onCharacteristics(_ p: CBPeripheral, _ s: CBService) {
    for c in s.characteristics ?? [] {
      switch c.uuid.uuidString {
      case GATT.indoorBikeData, GATT.cyclingPowerMeasurement, GATT.heartRateMeasurement, GATT.trainingStatus, GATT.machineStatus:
        p.setNotifyValue(true, for: c)
      case GATT.controlPoint:
        controlPoint = c
        p.setNotifyValue(true, for: c) // indications carry the responses
      case GATT.ftmsFeature, GATT.supportedPowerRange:
        p.readValue(for: c)
      default: break
      }
    }
  }

  fileprivate func onNotifyEnabled(_ c: CBCharacteristic) {
    if c.uuid.uuidString == GATT.controlPoint { send(.requestControl) }
  }

  fileprivate func onValue(_ p: CBPeripheral, _ c: CBCharacteristic) {
    guard let v = c.value else { return }
    switch c.uuid.uuidString {
    case GATT.indoorBikeData:
      guard let d = IndoorBikeData.parse(v) else { return }
      if let w = d.powerW { metrics.powerW = w }
      if let r = d.cadenceRpm { metrics.cadenceRpm = r }
      if let s = d.speedKph { metrics.speedKph = s }
      if let hr = d.heartRateBpm, strap == nil { metrics.heartRateBpm = hr }
      if let dist = d.totalDistanceM {
        if distanceBase == nil { distanceBase = dist }
        metrics.distanceM = Double(dist - (distanceBase ?? dist))
      }
    case GATT.cyclingPowerMeasurement:
      // Only use CPS when the trainer has no FTMS bike data (avoids two power sources fighting).
      guard p == trainer, controlPoint == nil, let cp = CyclingPower.parse(v) else { return }
      metrics.powerW = cp.powerW
      if let crank = cp.crank { metrics.cadenceRpm = cadence.update(crank) }
    case GATT.heartRateMeasurement:
      metrics.heartRateBpm = HeartRate.parse(v)
    case GATT.controlPoint:
      if let r = ControlResponse.parse(v) { handle(r) }
    case GATT.ftmsFeature:
      features = FTMSFeatures.parse(v)
    case GATT.supportedPowerRange:
      powerRange = PowerRange.parse(v)
    default: break
    }
  }

  fileprivate func onDisconnect(_ p: CBPeripheral, error: Error?) {
    if let error { lastError = error.localizedDescription }
    cleanUp(p)
  }
}

// CoreBluetooth calls these on the queue we passed (.main), so hopping onto the main actor is safe.
extension TrainerConnection: CBCentralManagerDelegate, CBPeripheralDelegate {
  nonisolated public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    MainActor.assumeIsolated { onUpdateState() }
  }
  nonisolated public func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    nonisolated(unsafe) let adv = advertisementData
    MainActor.assumeIsolated { onDiscover(p, adv: adv, rssi: rssi.intValue) }
  }
  nonisolated public func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
    MainActor.assumeIsolated { onConnect(p) }
  }
  nonisolated public func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    MainActor.assumeIsolated { onDisconnect(p, error: error) }
  }
  nonisolated public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    MainActor.assumeIsolated { onDisconnect(p, error: error) }
  }
  nonisolated public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    MainActor.assumeIsolated { onServices(p) }
  }
  nonisolated public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    MainActor.assumeIsolated { onCharacteristics(p, s) }
  }
  nonisolated public func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
    guard error == nil else { return }
    MainActor.assumeIsolated { onNotifyEnabled(c) }
  }
  nonisolated public func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
    MainActor.assumeIsolated { onValue(p, c) }
  }
}
#endif
