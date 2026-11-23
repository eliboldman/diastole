import Foundation
import Testing

@testable import TrainerKit

@Suite struct VirtualGearsTests {
  @Test func neutralGearLeavesTheRoadAlone() {
    let g = VirtualGears()
    #expect(g.factor == 1 && g.number == 13 && g.count == 24)
    #expect(g.trainerGrade(roadGrade: 4.2, trainerSpeedMps: 8, massKg: 80) == 4.2)
  }

  @Test func ratiosClimbAndShiftingClamps() {
    let r = VirtualGears.ratios
    #expect(zip(r, r.dropFirst()).allSatisfy { $0 < $1 })
    #expect(r.first == 1 && abs(r.last! - 4.8) < 0.01)
    var g = VirtualGears(gear: 0)
    g.shift(-1)
    #expect(g.gear == 0)
    g = VirtualGears(gear: 99)
    #expect(g.gear == 23)
  }

  @Test func harderGearsFeelHarderEasierEasier() {
    let up = VirtualGears(gear: VirtualGears.neutral + 3)
    let down = VirtualGears(gear: VirtualGears.neutral - 3)
    for road in [-2.0, 0, 6] {
      let hard = up.trainerGrade(roadGrade: road, trainerSpeedMps: 7, massKg: 80)
      let easy = down.trainerGrade(roadGrade: road, trainerSpeedMps: 7, massKg: 80)
      #expect(hard > road && easy <= road, "road \(road): \(easy) <= \(road) < \(hard)")
      if road >= 0 { #expect(easy < road) }
    }
    // Physics check on the flat at 30 km/h on the trainer: a gear 1.5× bigger means riding 45 km/h,
    // so the pedals should feel ~1.5 × F(45 km/h). Extra grade = extra force / weight.
    let v = 30 / 3.6
    var g = VirtualGears()
    while g.factor < 1.45 { g.shift(1) }
    let k = g.factor
    func f(_ s: Double) -> Double { 0.5 * 1.2 * 0.32 * s * s + 80 * 9.81 * 0.004 }
    let expected = (k * f(k * v) - f(v)) / (80 * 9.81) * 100
    #expect(abs(g.trainerGrade(roadGrade: 0, trainerSpeedMps: v, massKg: 80) - expected) < 0.06)
  }

  @Test func staysInsideWhatTrainersAccept() {
    #expect(VirtualGears(gear: 23).trainerGrade(roadGrade: 15, trainerSpeedMps: 12, massKg: 80) == 20)
    #expect(VirtualGears(gear: 0).trainerGrade(roadGrade: 2, trainerSpeedMps: 25, massKg: 50) == -10)
  }
}

@Suite struct FTMSExtrasTests {
  @Test func resistanceRangeMapsAndWideLevelsEncode() {
    // 0.0 … 100.0 in 0.1 units, increment 1.0
    let r = ResistanceRange.parse(Data([0x00, 0x00, 0xE8, 0x03, 0x0A, 0x00]))
    #expect(r == ResistanceRange(min: 0, max: 100))
    #expect(r?.level(0.5) == 50 && r?.level(2) == 100 && r?.level(-1) == 0)
    #expect(ControlCommand.setResistance(level: 20).bytes == [0x04, 200], "FTMS 1.0 uint8 when it fits")
    #expect(ControlCommand.setResistance(level: 50).bytes == [0x04, 0xF4, 0x01], "sint16 past 25.5")
    #expect(ResistanceRange.fallback.level(1) <= 25.5)
  }

  @Test func machineStatusEvents() {
    #expect(MachineStatus.parse(Data([0x01])) == .reset)
    #expect(MachineStatus.parse(Data([0xFF])) == .controlLost)
    #expect(MachineStatus.parse(Data([0x02, 0x01])) == .stoppedOrPaused)
    #expect(MachineStatus.parse(Data([0x08, 0xC8, 0x00])) == .other(0x08))
    #expect(MachineStatus.parse(Data()) == nil)
  }
}

@MainActor @Suite struct GearedCourseTests {
  @Test func shiftingChangesWhatTheTrainerFeels() {
    let link = FakeLink()
    let s = RideSession(course: testCourse(), massKg: 80, link: link, difficulty: 0.5, virtualGears: true)
    link.metrics.powerW = 220; link.metrics.cadenceRpm = 90; link.metrics.speedKph = 30
    s.start()
    #expect(link.grades.last == 0, "middle gear on the flat = flat")
    s.nudge(1); s.nudge(1)
    #expect(s.gears?.number == 15 && abs(s.difficulty - 0.5) < 0.001, "nudge shifts instead of changing difficulty")
    #expect((link.grades.last ?? 0) > 0.5)
    s.shift(-4)
    #expect(s.gears?.number == 11)
    s.shift(-1)
    #expect((link.grades.last ?? 0) < 0)
  }

  @Test func gearsOffByDefault() {
    let s = RideSession(course: testCourse(), massKg: 80, link: FakeLink())
    #expect(s.gears == nil)
  }
}
