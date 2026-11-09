import Foundation
import Network
import Observation

// "Use iPhone as hub": the iPhone holds the Bluetooth connections (trainer, heart-rate strap, as
// many as it likes) and relays live numbers and ERG targets to an Apple TV over the local network.
// Gets around Apple TV's two-accessory limit. The TV shows a 4-digit code that the rider types on
// the phone, so nobody else on the Wi-Fi can attach to a trainer by accident.

public enum Hub {
  public static let serviceType = "_diastolehub._tcp"
}

/// Newline-delimited JSON messages between TV (client) and phone (hub).
public enum HubMessage: Codable, Equatable, Sendable {
  case hello(name: String, code: String) // TV → phone
  case welcome // phone → TV: code matched
  case denied // phone → TV: wrong code or rider declined
  case status(metrics: LiveMetrics, trainer: String?, canControl: Bool) // phone → TV, ~2 Hz
  case target(watts: Int?) // TV → phone
  case bye

  func line() -> Data {
    var d = (try? JSONEncoder().encode(self)) ?? Data()
    d.append(0x0A)
    return d
  }
}

/// Splits a byte stream into messages.
struct LineBuffer {
  private var buffer = Data()
  mutating func feed(_ data: Data) -> [HubMessage] {
    buffer.append(data)
    if buffer.count > 256_000 { buffer.removeAll() } // garbage guard
    var out: [HubMessage] = []
    while let nl = buffer.firstIndex(of: 0x0A) {
      let line = buffer[buffer.startIndex..<nl]
      buffer.removeSubrange(buffer.startIndex...nl)
      if let m = try? JSONDecoder().decode(HubMessage.self, from: line) { out.append(m) }
    }
    return out
  }
}

// MARK: - Phone side

/// Runs on the iPhone while the hub screen is open. One TV at a time.
@MainActor @Observable
public final class HubServer {
  public enum State: Equatable, Sendable { case off, waiting, asking(tv: String), connected(tv: String), failed(String) }
  public private(set) var state: State = .off

  @ObservationIgnored private let trainer: TrainerConnection
  @ObservationIgnored private var listener: NWListener?
  @ObservationIgnored private var connection: NWConnection?
  @ObservationIgnored private var expectedCode: String?
  @ObservationIgnored private var lines = LineBuffer()
  @ObservationIgnored private var pump: Task<Void, Never>?
  @ObservationIgnored private let queue = DispatchQueue(label: "diastole.hub.server")

  public init(trainer: TrainerConnection) { self.trainer = trainer }

  public func start(name: String) {
    stop()
    do {
      let l = try NWListener(using: .tcp)
      l.service = NWListener.Service(name: name, type: Hub.serviceType)
      l.newConnectionHandler = { [weak self] c in Task { @MainActor in self?.accept(c) } }
      l.stateUpdateHandler = { [weak self] s in
        Task { @MainActor in
          if case let .failed(e) = s { self?.state = .failed(e.localizedDescription) }
        }
      }
      l.start(queue: queue)
      listener = l
      state = .waiting
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  public func stop() {
    pump?.cancel(); pump = nil
    connection?.send(content: HubMessage.bye.line(), completion: .contentProcessed { _ in })
    connection?.cancel(); connection = nil
    listener?.cancel(); listener = nil
    state = .off
  }

  /// The rider typed the TV's code on the phone.
  public func confirm(code: String) {
    guard case let .asking(tv) = state, let c = connection else { return }
    if code.trimmingCharacters(in: .whitespaces) == expectedCode {
      c.send(content: HubMessage.welcome.line(), completion: .contentProcessed { _ in })
      state = .connected(tv: tv)
      startPump()
    } else {
      c.send(content: HubMessage.denied.line(), completion: .contentProcessed { _ in })
      drop()
    }
  }

  public func decline() {
    connection?.send(content: HubMessage.denied.line(), completion: .contentProcessed { _ in })
    drop()
  }

  private func accept(_ c: NWConnection) {
    guard connection == nil else { c.cancel(); return } // one TV at a time
    connection = c
    lines = LineBuffer()
    c.stateUpdateHandler = { [weak self] s in
      Task { @MainActor in
        switch s {
        case .failed, .cancelled: self?.drop()
        default: break
        }
      }
    }
    c.start(queue: queue)
    receive(c)
  }

  private func receive(_ c: NWConnection) {
    c.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, done, error in
      Task { @MainActor in
        guard let self, self.connection === c else { return }
        if let data { for m in self.lines.feed(data) { self.handle(m) } }
        if done || error != nil { self.drop() } else { self.receive(c) }
      }
    }
  }

  private func handle(_ m: HubMessage) {
    switch m {
    case let .hello(name, code):
      expectedCode = code
      state = .asking(tv: String(name.prefix(40)))
    case let .target(watts):
      if case .connected = state { trainer.setTarget(watts) }
    case .bye:
      drop()
    default: break
    }
  }

  private func startPump() {
    pump?.cancel()
    pump = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, let c = self.connection else { return }
        let msg = HubMessage.status(metrics: self.trainer.metrics, trainer: self.trainer.trainerName, canControl: self.trainer.canControl)
        c.send(content: msg.line(), completion: .contentProcessed { _ in })
        try? await Task.sleep(for: .milliseconds(500))
      }
    }
  }

  private func drop() {
    pump?.cancel(); pump = nil
    connection?.cancel(); connection = nil
    expectedCode = nil
    trainer.setTarget(nil) // never leave the trainer holding a TV's last target
    if listener != nil { state = .waiting } else { state = .off }
  }
}

// MARK: - TV side

/// A phone offering itself as a hub.
public struct HubPhone: Identifiable, Hashable, Sendable {
  public let id: String
  public let name: String
  let endpoint: NWEndpoint
}

/// Runs on the Apple TV: finds phones, connects with a code, and acts as the ride's trainer.
@MainActor @Observable
public final class HubClient: TrainerLink {
  public enum State: Equatable, Sendable { case idle, browsing, connecting(code: String), connected, denied, lost }
  public private(set) var state: State = .idle
  public private(set) var phones: [HubPhone] = []
  public private(set) var metrics = LiveMetrics()
  public private(set) var trainerName: String?
  public private(set) var canControl = false

  @ObservationIgnored private var browser: NWBrowser?
  @ObservationIgnored private var connection: NWConnection?
  @ObservationIgnored private var lines = LineBuffer()
  @ObservationIgnored private var lastTarget: Int??
  @ObservationIgnored private let queue = DispatchQueue(label: "diastole.hub.client")

  public init() {}

  public func browse() {
    browser?.cancel()
    let b = NWBrowser(for: .bonjour(type: Hub.serviceType, domain: nil), using: .tcp)
    b.browseResultsChangedHandler = { [weak self] results, _ in
      let found = results.compactMap { r -> HubPhone? in
        guard case let .service(name, _, _, _) = r.endpoint else { return nil }
        return HubPhone(id: "\(r.endpoint)", name: name, endpoint: r.endpoint)
      }
      Task { @MainActor in self?.phones = found.sorted { $0.name < $1.name } }
    }
    b.start(queue: queue)
    browser = b
    state = .browsing
  }

  /// Connects and shows `code` on screen; the rider types it on the phone.
  public func connect(_ phone: HubPhone, deviceName: String) -> String {
    let code = String(format: "%04d", Int.random(in: 0...9999))
    connection?.cancel()
    lines = LineBuffer()
    let c = NWConnection(to: phone.endpoint, using: .tcp)
    c.stateUpdateHandler = { [weak self] s in
      Task { @MainActor in
        guard let self, self.connection === c else { return }
        switch s {
        case .ready: c.send(content: HubMessage.hello(name: deviceName, code: code).line(), completion: .contentProcessed { _ in })
        case .failed, .cancelled: if self.state != .denied { self.state = .lost }
        default: break
        }
      }
    }
    connection = c
    state = .connecting(code: code)
    c.start(queue: queue)
    receive(c)
    return code
  }

  public func disconnect() {
    connection?.send(content: HubMessage.bye.line(), completion: .contentProcessed { _ in })
    connection?.cancel(); connection = nil
    browser?.cancel(); browser = nil
    state = .idle
    metrics = LiveMetrics(); trainerName = nil; canControl = false
  }

  public func setTarget(_ watts: Int?) {
    guard state == .connected, let c = connection, lastTarget != .some(watts) else { return }
    lastTarget = .some(watts)
    c.send(content: HubMessage.target(watts: watts).line(), completion: .contentProcessed { _ in })
  }

  private func receive(_ c: NWConnection) {
    c.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, done, error in
      Task { @MainActor in
        guard let self, self.connection === c else { return }
        if let data { for m in self.lines.feed(data) { self.handle(m) } }
        if done || error != nil { if self.state != .denied { self.state = .lost } } else { self.receive(c) }
      }
    }
  }

  private func handle(_ m: HubMessage) {
    switch m {
    case .welcome: state = .connected; lastTarget = nil
    case .denied: state = .denied; connection?.cancel()
    case let .status(metrics, trainer, control):
      self.metrics = metrics; trainerName = trainer; canControl = control
    case .bye: state = .lost
    default: break
    }
  }
}
