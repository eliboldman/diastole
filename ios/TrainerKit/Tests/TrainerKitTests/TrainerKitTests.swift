import Foundation
import Testing

@testable import TrainerKit

@Suite struct IndoorBikeDataTests {
  @Test func speedCadencePower() throws {
    // flags 0x0044: bit2 cadence + bit6 power, bit0 clear -> speed present.
    // speed 3250 (32.50 km/h), cadence 180 (90 rpm), power 250 W.
    let d = try #require(IndoorBikeData.parse(Data([0x44, 0x00, 0xB2, 0x0C, 0xB4, 0x00, 0xFA, 0x00])))
    #expect(d.speedKph == 32.5)
    #expect(d.cadenceRpm == 90)
    #expect(d.powerW == 250)
    #expect(d.heartRateBpm == nil)
  }

  @Test func distanceEnergyHeartRateElapsed() throws {
    // flags: bit4 distance, bit8 energy, bit9 HR, bit11 elapsed = 0x0B10; speed present.
    let bytes: [UInt8] = [0x10, 0x0B, 0x00, 0x00, 0x39, 0x30, 0x00, 0x64, 0x00, 0xFF, 0xFF, 0xFF, 0x96, 0x2C, 0x01]
    let d = try #require(IndoorBikeData.parse(Data(bytes)))
    #expect(d.totalDistanceM == 12345)
    #expect(d.totalEnergyKcal == 100)
    #expect(d.heartRateBpm == 150)
    #expect(d.elapsedS == 300)
  }

  @Test func moreDataFlagMeansNoSpeed() throws {
    let d = try #require(IndoorBikeData.parse(Data([0x41, 0x00, 0x2C, 0x01]))) // bit0 + power 300
    #expect(d.moreData && d.speedKph == nil && d.powerW == 300)
  }

  @Test func truncatedPacketIsRejected() {
    #expect(IndoorBikeData.parse(Data([0x44, 0x00, 0xB2])) == nil)
    #expect(IndoorBikeData.parse(Data()) == nil)
  }
}

@Suite struct ControlPointTests {
  @Test func encodings() {
    #expect(ControlCommand.requestControl.bytes == [0x00])
    #expect(ControlCommand.start.bytes == [0x07])
    #expect(ControlCommand.stop.bytes == [0x08, 0x01])
    #expect(ControlCommand.pause.bytes == [0x08, 0x02])
    #expect(ControlCommand.setTargetPower(watts: 250).bytes == [0x05, 0xFA, 0x00])
    #expect(ControlCommand.setTargetPower(watts: 1000).bytes == [0x05, 0xE8, 0x03])
    #expect(ControlCommand.setResistance(level: 5).bytes == [0x04, 50])
    // 0 wind, 5% grade (500 = 0x01F4), crr 0.004 (40), cw 0.51 (51)
    #expect(ControlCommand.simulation(windMps: 0, gradePercent: 5, crr: 0.004, cwKgPerM: 0.51).bytes == [0x11, 0, 0, 0xF4, 0x01, 40, 51])
    #expect(ControlCommand.simulation(windMps: 0, gradePercent: -2.5, crr: 0.004, cwKgPerM: 0.51).bytes[3...4] == [0x06, 0xFF])
  }

  @Test func responses() throws {
    let ok = try #require(ControlResponse.parse(Data([0x80, 0x05, 0x01])))
    #expect(ok.ok && ok.requestOpcode == 0x05)
    let denied = try #require(ControlResponse.parse(Data([0x80, 0x05, 0x05])))
    #expect(denied.result == .controlNotPermitted)
    #expect(ControlResponse.parse(Data([0x05, 0x01])) == nil)
  }

  @Test func featuresAndRange() throws {
    // machine: cadence (bit1) + power (bit14); targets: resistance (bit2) + power (bit3) + sim (bit13)
    let f = try #require(FTMSFeatures.parse(Data([0x02, 0x40, 0, 0, 0x0C, 0x20, 0, 0])))
    #expect(f.reportsCadence && f.reportsPower && f.canSetPower && f.canSetResistance && f.canSimulate)
    let r = try #require(PowerRange.parse(Data([0x00, 0x00, 0xD0, 0x07, 0x01, 0x00])))
    #expect(r == PowerRange(min: 0, max: 2000, step: 1))
    #expect(PowerRange(min: 10, max: 1500, step: 5).clamp(2500) == 1500)
    #expect(PowerRange(min: 10, max: 1500, step: 5).clamp(253) == 250)
    #expect(PowerRange(min: 10, max: 1500, step: 5).clamp(0) == 10)
  }
}

@Suite struct ReadOnlySensorTests {
  @Test func cyclingPowerWithCrank() throws {
    // flags bit5 crank; power 200; revs 10, time 1024
    let cp = try #require(CyclingPower.parse(Data([0x20, 0x00, 0xC8, 0x00, 0x0A, 0x00, 0x00, 0x04])))
    #expect(cp.powerW == 200 && cp.crank?.revs == 10 && cp.crank?.time == 1024)
  }

  @Test func cadenceHandlesRollover() {
    var t = CadenceTracker()
    _ = t.update((65535, 64000))
    // +1.5 revs worth: 2 revs in 1.0 s across both counters rolling over -> 120 rpm
    let rpm = t.update((1, 64000 &+ 1024))
    #expect(abs(rpm - 120) < 0.01)
  }

  @Test func heartRateFormats() {
    #expect(HeartRate.parse(Data([0x00, 0x8C])) == 140)
    #expect(HeartRate.parse(Data([0x01, 0x2C, 0x01])) == 300)
    #expect(HeartRate.parse(Data([0x00, 0x00])) == nil)
  }
}

@Suite struct RunnerTests {
  let steps: [RideStep] = [
    RideStep(length: .time(seconds: 600), low: 120, high: 150, intensity: "warmup"),
    RideStep(length: .time(seconds: 240), low: 280, high: 300, intensity: "interval"),
    RideStep(length: .open, intensity: "recovery"),
    RideStep(length: .distance(meters: 1000), low: 200, high: 200, intensity: "active"),
  ]

  @Test func playsThroughWithCarry() {
    var r = WorkoutRunner(steps: steps)
    #expect(r.targetWatts == 135)
    let a1 = r.advance(seconds: 590)
    #expect(a1 == false)
    #expect(r.stepRemaining == 10)
    let a2 = r.advance(seconds: 15)
    #expect(a2 == true) // 5 s spill into the interval
    #expect(r.index == 1 && r.stepElapsed == 5 && r.targetWatts == 290)
    r.advance(seconds: 235)
    #expect(r.index == 2 && r.targetWatts == nil && r.stepProgress == nil) // open = free ride
    r.advance(seconds: 1000)
    #expect(r.index == 2) // open waits for the rider
    r.skip()
    r.advance(seconds: 60, meters: 600)
    #expect(r.stepProgress == 0.6)
    r.advance(seconds: 60, meters: 500)
    #expect(r.finished && r.targetWatts == nil)
    #expect(r.plannedSeconds == 840)
  }

  @Test func biasRoundsAndClamps() {
    var r = WorkoutRunner(steps: steps)
    r.advance(seconds: 600)
    r.bias = 0.05 // 290 * 1.05 = 304.5 -> 305
    #expect(r.targetWatts == 305)
    r.bias = -0.9
    #expect(r.bias == -0.3)
  }

  @Test func bigJumpSkipsMultipleSteps() {
    var r = WorkoutRunner(steps: [RideStep(length: .time(seconds: 10)), RideStep(length: .time(seconds: 10)), RideStep(length: .time(seconds: 10))])
    let jumped = r.advance(seconds: 25)
    #expect(jumped)
    #expect(r.index == 2 && r.stepElapsed == 5)
  }

  @Test func decodesServerJSON() throws {
    let json = #"[{"length":{"time":{"seconds":300}},"low":150,"high":170,"intensity":"warmup"},{"length":{"open":{}},"intensity":"rest"}]"#
    let s = try JSONDecoder().decode([RideStep].self, from: Data(json.utf8))
    #expect(s.count == 2 && s[0].targetWatts == 160 && s[1].length == .open)
  }
}

@Suite struct ErgGuardTests {
  @Test func suspendsAfterGraceAndResumes() {
    var g = ErgGuard()
    let t0 = Date(timeIntervalSince1970: 0)
    do { let u = g.update(cadence: 85, now: t0); #expect(u == false) }
    do { let u = g.update(cadence: 10, now: t0.addingTimeInterval(1)); #expect(u == false) }
    do { let u = g.update(cadence: 0, now: t0.addingTimeInterval(4.5)); #expect(u == true) }
    #expect(g.suspended)
    do { let u = g.update(cadence: 70, now: t0.addingTimeInterval(6)); #expect(u == true) }
    #expect(!g.suspended)
    do { let u = g.update(cadence: nil, now: t0.addingTimeInterval(20)); #expect(u == false) }
  }
}
