import Foundation
import Observation

/// Plays one ride: ticks once a second, moves the workout along, keeps the trainer's ERG target in
/// step, records samples and laps, and writes the FIT file at the end. Shared by the iPhone/iPad
/// ride screen and the Apple TV app; the UI only reads its state and calls the controls.
@MainActor @Observable
public final class RideSession {
  public enum Phase: Equatable, Sendable { case ready, riding, paused, finished }

  public let title: String
  public private(set) var phase: Phase = .ready
  public private(set) var runner: WorkoutRunner
  public private(set) var samples: [RideSample] = []
  public private(set) var laps: [RideLap] = []
  /// What the trainer was last told to hold (after ramping and the low-cadence guard).
  public private(set) var sentTarget: Int?
  /// Paused by itself because the rider stopped pedaling (resumes the same way).
  public private(set) var autoPaused = false
  public private(set) var ergSuspended = false
  /// The recorded ride, ready to upload once finished.
  public private(set) var fit: Data?
  /// Free ride: the rider picks a fixed ERG target with +/- (nil = resistance only).
  public var manualTarget: Int?
  /// Rollers: ease into new targets instead of jumping (sudden load changes upset balance) and
  /// release ERG faster when cadence drops.
  public var rollers: Bool { didSet { configureGuard() } }
  /// Called when a new step starts (for a sound or haptic cue). Index of the new step.
  @ObservationIgnored public var onStepChange: ((Int) -> Void)?
  /// Called once when the last step ends (the flow then saves the ride).
  @ObservationIgnored public var onFinish: (() -> Void)?

  @ObservationIgnored private let link: TrainerLink
  @ObservationIgnored private var guardState = ErgGuard()
  @ObservationIgnored private var ticker: Task<Void, Never>?
  @ObservationIgnored private var lastDistance: Double?
  @ObservationIgnored private var still = 0
  @ObservationIgnored private var lapStart: Date?
  @ObservationIgnored private var lapStep = 0 // step the open lap belongs to
  @ObservationIgnored private var distance: Double = 0

  public var isFreeRide: Bool { runner.steps.isEmpty }
  public var elapsed: Int { samples.count }
  public var distanceM: Double { distance }

  /// The goal right now before ramping: workout step, or the free-ride number.
  public var goalWatts: Int? { isFreeRide ? manualTarget : runner.targetWatts }

  public init(title: String, steps: [RideStep], link: TrainerLink, rollers: Bool = false) {
    self.title = title
    self.runner = WorkoutRunner(steps: steps)
    self.link = link
    self.rollers = rollers
    configureGuard()
  }

  private func configureGuard() {
    guardState.floorRpm = rollers ? 40 : 30
    guardState.graceSeconds = rollers ? 1.5 : 3
  }

  // MARK: Controls

  public func start() {
    guard phase == .ready else { return }
    phase = .riding
    lapStart = Date()
    push()
    ticker = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        self?.tick()
      }
    }
  }

  public func pause() {
    guard phase == .riding else { return }
    phase = .paused
    autoPaused = false
    send(nil)
  }

  public func resume() {
    guard phase == .paused else { return }
    phase = .riding
    autoPaused = false
    push()
  }

  public func skip() {
    guard phase == .riding || phase == .paused, !isFreeRide else { return }
    closeLap()
    runner.skip()
    stepChanged()
  }

  /// Rider's easier/harder nudge in 5% steps (workouts) or 5 W steps (free ride).
  public func nudge(_ direction: Int) {
    if isFreeRide {
      manualTarget = max(0, min(1500, (manualTarget ?? 100) + direction * 5))
      if manualTarget == 0 { manualTarget = nil }
    } else {
      runner.bias = (runner.bias + Double(direction) * 0.05 * 100).rounded() / 100
    }
    push()
  }

  /// Ends the ride. Returns the FIT file (empty when nothing was recorded).
  @discardableResult
  public func finish() -> Data {
    if phase == .finished, let fit { return fit }
    ticker?.cancel(); ticker = nil
    if phase != .finished { closeLap() }
    phase = .finished
    send(nil)
    let data = FitWriter.encode(samples: samples, laps: laps)
    fit = data.isEmpty ? nil : data
    return data
  }

  // MARK: Tick

  func tick(now: Date = Date()) {
    guard phase == .riding || phase == .paused else { return }
    let m = link.metrics
    let moving = (m.cadenceRpm ?? 0) > 5 || (m.powerW ?? 0) > 5 || (m.speedKph ?? 0) > 3

    // Auto-pause after 3 still seconds; auto-resume when pedaling again (only if it paused itself).
    if phase == .riding {
      still = moving ? 0 : still + 1
      if still >= 3 { phase = .paused; autoPaused = true; send(nil); return }
    } else {
      if autoPaused && moving { phase = .riding; autoPaused = false; still = 0; push() }
      lastDistance = m.distanceM
      return
    }

    // Distance: trainer's odometer when it has one, else speed × 1 s.
    var dm = 0.0
    if let d = m.distanceM {
      if let last = lastDistance, d >= last { dm = min(d - last, 30) }
      lastDistance = d
    } else if let kph = m.speedKph {
      dm = kph / 3.6
    }
    distance += dm

    let changed = runner.advance(seconds: 1, meters: dm)
    if changed { closeLap(at: now); stepChanged(at: now) }

    if guardState.update(cadence: m.cadenceRpm, now: now) { ergSuspended = guardState.suspended }
    push()

    samples.append(RideSample(time: now, powerW: m.powerW, cadenceRpm: m.cadenceRpm.map { Int($0.rounded()) }, heartRateBpm: m.heartRateBpm, speedMps: m.speedKph.map { $0 / 3.6 }, distanceM: distance))
    if runner.finished && !isFreeRide {
      finish()
      onFinish?()
    }
  }

  private func stepChanged(at now: Date = Date()) {
    lapStart = now
    lapStep = runner.index
    onStepChange?(runner.index)
    push()
  }

  private func closeLap(at now: Date = Date()) {
    guard let start = lapStart else { return }
    let step = lapStep < runner.steps.count ? runner.steps[lapStep] : nil
    if now >= start { laps.append(RideLap(start: start, end: now.addingTimeInterval(-0.001), intensity: step?.intensity ?? "active", stepIndex: step == nil ? nil : lapStep)) }
    lapStart = nil
  }

  /// Sends the current goal, ramped on rollers, dropped while the low-cadence guard is active.
  private func push() {
    guard phase == .riding else { return }
    let goal = ergSuspended ? nil : goalWatts
    guard let g = goal else { send(nil); return }
    var next = g
    if rollers {
      // Ease from what the trainer holds now (or what the rider is putting out) toward the goal.
      let cur = sentTarget ?? link.metrics.powerW ?? g / 2
      let step = 15 // W per second on rollers
      next = cur + max(-step, min(step, g - cur))
    }
    send(Int((Double(next) / 5).rounded()) * 5)
  }

  private func send(_ watts: Int?) {
    sentTarget = watts
    link.setTarget(watts)
  }
}
