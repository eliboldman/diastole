import Foundation
import Testing

@testable import TrainerKit

@MainActor final class FakeLink: TrainerLink {
  var metrics = LiveMetrics()
  var trainerName: String? = "Fake"
  var canControl = true
  var targets: [Int?] = []
  func setTarget(_ watts: Int?) { targets.append(watts) }
}

@MainActor @Suite struct RideSessionTests {
  func pedal(_ link: FakeLink, _ w: Int = 200, rpm: Double = 90) {
    link.metrics.powerW = w; link.metrics.cadenceRpm = rpm; link.metrics.speedKph = 36
  }

  @Test func playsStepsSendsTargetsAndRecords() {
    let link = FakeLink()
    let s = RideSession(title: "T", steps: [RideStep(length: .time(seconds: 3), low: 100, high: 100, intensity: "warmup"), RideStep(length: .time(seconds: 3), low: 300, high: 300, intensity: "interval")], link: link)
    var cues: [Int] = []
    s.onStepChange = { cues.append($0) }
    pedal(link)
    s.start()
    #expect(link.targets.last == 100)
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    for i in 0..<3 { s.tick(now: t0.addingTimeInterval(Double(i))) }
    #expect(cues == [1] && link.targets.last == 300)
    for i in 3..<6 { s.tick(now: t0.addingTimeInterval(Double(i))) }
    #expect(s.phase == .finished)
    #expect(s.samples.count == 6)
    #expect(abs(s.distanceM - 60) < 0.01) // 36 km/h = 10 m/s, no trainer odometer
    #expect(s.laps.map(\.stepIndex) == [0, 1])
    #expect(s.laps.map(\.intensity) == ["warmup", "interval"])
    #expect(link.targets.last == .some(nil)) // released at the end
    #expect((s.fit?.count ?? 0) > 100)
  }

  @Test func autoPausesAndResumes() {
    let link = FakeLink()
    let s = RideSession(title: "T", steps: [RideStep(length: .time(seconds: 60), low: 200, high: 200)], link: link)
    pedal(link); s.start()
    s.tick()
    link.metrics = LiveMetrics()
    s.tick(); s.tick(); s.tick()
    #expect(s.phase == .paused && s.autoPaused && link.targets.last == .some(nil))
    let recorded = s.samples.count
    s.tick()
    #expect(s.samples.count == recorded) // paused time isn't recorded
    pedal(link); s.tick()
    #expect(s.phase == .riding && link.targets.last == 200)
  }

  @Test func rollersRampAndReleaseFast() {
    let link = FakeLink()
    let s = RideSession(title: "T", steps: [RideStep(length: .time(seconds: 600), low: 250, high: 250)], link: link, rollers: true)
    pedal(link, 150); s.start()
    #expect(link.targets.last == 165) // 150 + 15
    s.tick()
    #expect(link.targets.last == 180)
    let t0 = Date()
    link.metrics.cadenceRpm = 20; link.metrics.powerW = 100
    s.tick(now: t0); s.tick(now: t0.addingTimeInterval(2))
    #expect(s.ergSuspended && link.targets.last == .some(nil))
  }

  @Test func freeRideManualTarget() {
    let link = FakeLink()
    let s = RideSession(title: "Free ride", steps: [], link: link)
    pedal(link); s.start()
    #expect(link.targets.last == .some(nil))
    s.nudge(1)
    #expect(s.manualTarget == 105 && link.targets.last == 105)
    for _ in 0..<5 { s.tick() }
    #expect(s.phase == .riding) // free rides only end when the rider says so
    s.finish()
    #expect(s.laps.count == 1)
  }

  @Test func nudgeAdjustsWorkoutBias() {
    let link = FakeLink()
    let s = RideSession(title: "T", steps: [RideStep(length: .time(seconds: 60), low: 200, high: 200)], link: link)
    pedal(link); s.start()
    s.nudge(-1)
    #expect(link.targets.last == 190)
  }
}

@Suite struct FitTests {
  @Test func writesAParsableFile() throws {
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    var samples: [RideSample] = []
    for i in 0..<120 {
      samples.append(RideSample(time: t0.addingTimeInterval(Double(i)), powerW: i < 60 ? 150 : 300, cadenceRpm: 90, heartRateBpm: 130 + i / 4, speedMps: 9, distanceM: Double(i + 1) * 9))
    }
    let laps = [RideLap(start: t0, end: t0.addingTimeInterval(59.999), intensity: "warmup", stepIndex: 0), RideLap(start: t0.addingTimeInterval(60), end: t0.addingTimeInterval(119), intensity: "interval", stepIndex: 1)]
    let data = FitWriter.encode(samples: samples, laps: laps)
    #expect(data.count > 2000)
    #expect(Array(data[8..<12]) == Array(".FIT".utf8))
    // CRC over everything including the trailing CRC is 0.
    #expect(FitWriter.crc([UInt8](data)) == 0)
    if let out = ProcessInfo.processInfo.environment["FIT_OUT"] { try data.write(to: URL(fileURLWithPath: out)) }
  }

  @Test func normalizedPower() {
    let t0 = Date()
    let steady = (0..<60).map { RideSample(time: t0.addingTimeInterval(Double($0)), powerW: 200) }
    #expect(FitWriter.normalizedPower(steady) == 200)
    #expect(FitWriter.normalizedPower(Array(steady.prefix(10))) == nil)
  }
}

@Suite struct HubTests {
  @Test func linesRoundTrip() {
    var m = LiveMetrics(); m.powerW = 250; m.heartRateBpm = 140
    let msgs: [HubMessage] = [.hello(name: "Living room", code: "0420"), .status(metrics: m, trainer: "NEO 3M", canControl: true), .target(watts: nil), .target(watts: 300)]
    var stream = Data()
    for x in msgs { stream.append(x.line()) }
    var buf = LineBuffer()
    // Arrives in awkward chunks.
    let a = buf.feed(stream.prefix(7)), b = buf.feed(stream.dropFirst(7).prefix(40)), c = buf.feed(stream.dropFirst(47))
    #expect(a + b + c == msgs)
    #expect(buf.feed(Data("not json\n".utf8)).isEmpty)
  }
}
