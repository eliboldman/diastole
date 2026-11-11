import Foundation
import Testing

@testable import TrainerKit

/// 2 km flat, then 1 km at 6%, then 1 km down at −6%, then 1 km flat; heads due north.
func testCourse(track: Bool = true) -> RideCourse {
  RideCourse(id: "r1", name: "Test 70.3", courseName: "Bike", distanceM: 5000, gainM: 60,
             profile: [[0, 100], [2000, 100], [3000, 160], [4000, 100], [5000, 100]],
             climbs: [.init(startM: 2000, endM: 3000, gainM: 60, grade: 6)],
             track: track ? [[0, 30.0, -85.0], [5000, 30.0 + 5000 / 111_195, -85.0]] : nil)
}

@Suite struct CourseRunnerTests {
  @Test func elevationAndGrade() {
    let c = testCourse()
    #expect(c.elevation(at: 2500) == 130)
    #expect(abs(c.grade(at: 2500) - 6) < 0.01)
    #expect(abs(c.grade(at: 1000)) < 0.01)
    #expect(abs(c.grade(at: 3500) + 6) < 0.01)
    #expect(c.elevation(at: -10) == 100 && c.elevation(at: 9999) == 100)
    #expect(c.climb(after: 500)?.startM == 2000, "next climb ahead")
    #expect(c.climb(after: 2500)?.startM == 2000, "the one you're on")
    #expect(c.climb(after: 3500) == nil)
  }

  @Test func flatSpeedIsRealistic() {
    var r = CourseRunner(course: testCourse(), massKg: 80)
    for _ in 0..<60 { r.advance(watts: 200, seconds: 1) }
    // 200 W on the flat, CdA 0.32: roughly 32–35 km/h once up to speed.
    #expect(r.speedMps * 3.6 > 30 && r.speedMps * 3.6 < 37, "got \(r.speedMps * 3.6) km/h")
  }

  @Test func climbsAreSlowDescentsFast() {
    let c = testCourse()
    var up = CourseRunner(course: c, massKg: 80)
    var down = CourseRunner(course: c, massKg: 80)
    // Place riders by riding to the right spot, then hold steady power.
    while up.distanceM < 2300 { up.advance(watts: 250, seconds: 1) }
    for _ in 0..<40 { up.advance(watts: 250, seconds: 1) }
    while down.distanceM < 3100 { down.advance(watts: 250, seconds: 1) }
    for _ in 0..<15 { down.advance(watts: 100, seconds: 1) }
    #expect(up.speedMps * 3.6 < 22, "6% at 250 W is slow (got \(up.speedMps * 3.6))")
    #expect(down.speedMps * 3.6 > 45, "−6% is fast even at 100 W (got \(down.speedMps * 3.6))")
    #expect(up.climbedM > 10)
  }

  @Test func heavierRiderClimbsSlower() {
    var light = CourseRunner(course: testCourse(), massKg: 65)
    var heavy = CourseRunner(course: testCourse(), massKg: 100)
    while light.distanceM < 2500 { light.advance(watts: 250, seconds: 1); heavy.advance(watts: 250, seconds: 1) }
    #expect(heavy.distanceM < light.distanceM)
  }

  @Test func trainerGradeScales() {
    var r = CourseRunner(course: testCourse(), massKg: 80)
    while r.distanceM < 2500 { r.advance(watts: 300, seconds: 1) }
    #expect(r.trainerGrade(difficulty: 1) == 6)
    #expect(r.trainerGrade(difficulty: 0.5) == 3)
    #expect(r.trainerGrade(difficulty: 0) == 0)
    while r.distanceM < 3500 { r.advance(watts: 300, seconds: 1) }
    #expect(r.trainerGrade(difficulty: 1) == -3, "descents at half scale")
  }

  @Test func stopsAtTheFinishAndDecodesFromServer() throws {
    var r = CourseRunner(course: testCourse(), massKg: 80)
    for _ in 0..<2000 { r.advance(watts: 250, seconds: 1) }
    #expect(r.finished && r.distanceM == 5000 && r.remainingM == 0)
    let json = #"{"id":"r1","name":"70.3","course_name":null,"date":"2027-05-08","distance_m":90000,"gain_m":600,"profile":[[0,10],[90000,12]],"climbs":[{"start_m":1,"end_m":2,"gain_m":3,"grade":4}]}"#
    let c = try JSONDecoder().decode(RideCourse.self, from: Data(json.utf8))
    #expect(c.distanceM == 90000 && c.climbs.first?.grade == 4 && c.title == "70.3")
  }
}

@Suite struct CourseTrackTests {
  @Test func positionAlongTheRoute() {
    let c = testCourse()
    let mid = c.position(at: 2500)!
    #expect(abs(mid.lat - (30.0 + 2500 / 111_195)) < 1e-7 && mid.lon == -85.0)
    #expect(c.position(at: -5)!.lat == 30.0 && c.trackIndex(at: 9999) == 1)
    #expect(testCourse(track: false).position(at: 100) == nil && !testCourse(track: false).hasTrack)
    let json = #"{"id":"r","name":"x","course_name":null,"date":"d","distance_m":100,"gain_m":0,"profile":[[0,1],[100,1]],"climbs":[]}"#
    #expect(try! JSONDecoder().decode(RideCourse.self, from: Data(json.utf8)).track == nil, "older servers: no track")
  }
}

@MainActor @Suite struct CourseSessionTests {
  @Test func recordsGpsAndWritesVirtualRide() throws {
    let link = FakeLink()
    let s = RideSession(course: testCourse(), massKg: 80, link: link)
    link.metrics.powerW = 300; link.metrics.cadenceRpm = 90
    s.start()
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    var i = 0
    while s.phase != .finished && i < 3000 { s.tick(now: t0.addingTimeInterval(Double(i))); i += 1 }
    #expect(s.samples.allSatisfy { $0.latitude != nil && $0.longitude == -85.0 })
    #expect((s.samples.last?.latitude ?? 0) > 30.04)
    let fit = try #require(s.fit)
    if let dir = ProcessInfo.processInfo.environment["COURSE_FIT_OUT"] { try fit.write(to: URL(fileURLWithPath: "\(dir)/course.fit")) }
  }

  @Test func ridesTheCourseSendingGradesAndRecordingAltitude() {
    let link = FakeLink()
    let s = RideSession(course: testCourse(), massKg: 80, link: link, difficulty: 0.5)
    var finished = false
    s.onFinish = { finished = true }
    link.metrics.powerW = 280; link.metrics.cadenceRpm = 90; link.metrics.speedKph = 30
    s.start()
    #expect(link.grades.last == 0, "starts on the flat")
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    var i = 0
    while s.phase != .finished && i < 3000 { s.tick(now: t0.addingTimeInterval(Double(i))); i += 1 }
    #expect(finished && s.phase == .finished)
    #expect(abs(s.distanceM - 5000) < 1)
    #expect(link.grades.contains { abs($0 - 3) < 0.05 }, "the 6% climb felt at 50%")
    #expect(link.grades.contains { abs($0 + 1.5) < 0.05 }, "the descent at half scale")
    #expect(s.samples.contains { ($0.altitudeM ?? 0) > 150 }, "altitude recorded")
    #expect(link.targets.last == .some(nil), "released to flat road at the end")
    #expect((s.fit?.count ?? 0) > 100)
  }

  @Test func difficultyNudgesAndPauseGoesFlat() {
    let link = FakeLink()
    let s = RideSession(course: testCourse(), massKg: 80, link: link)
    link.metrics.powerW = 250; link.metrics.cadenceRpm = 90
    s.start()
    s.nudge(1)
    #expect(abs(s.difficulty - 0.6) < 0.001)
    s.nudge(-1); s.nudge(-1)
    #expect(abs(s.difficulty - 0.4) < 0.001)
    s.pause()
    #expect(link.targets.last == .some(nil) && s.sentGrade == nil)
    #expect(s.isCourse && !s.isFreeRide)
  }
}
