import Foundation
import SwiftUI
import Testing

@testable import RideUI
@testable import TrainerKit

/// Renders the ride screens to PNGs for a visual check: RENDER_OUT=/some/dir swift test --filter Render
@MainActor @Suite struct RenderTests {
  @Test func rideDashboard() throws {
    guard let dir = ProcessInfo.processInfo.environment["RENDER_OUT"] else { return }
    let link = FakeLink()
    link.trainerName = "Tacx NEO 3M"
    link.metrics.powerW = 284; link.metrics.cadenceRpm = 92; link.metrics.heartRateBpm = 151; link.metrics.speedKph = 34
    let steps: [RideStep] = [RideStep(length: .time(seconds: 600), low: 140, high: 170, intensity: "warmup")]
      + Array(repeating: [RideStep(length: .time(seconds: 240), low: 280, high: 300, label: "Stay seated", intensity: "interval"), RideStep(length: .time(seconds: 120), low: 130, high: 150, intensity: "recovery")], count: 4).flatMap { $0 }
      + [RideStep(length: .time(seconds: 600), low: 120, high: 140, intensity: "cooldown")]
    let s = RideSession(title: "4×4′ threshold", steps: steps, link: link)
    s.start()
    let t0 = Date()
    for i in 0..<(600 + 95) { s.tick(now: t0.addingTimeInterval(Double(i))) }
    for (name, size) in [("phone", CGSize(width: 393, height: 852)), ("tv", CGSize(width: 1920, height: 1080))] {
      let view = RideDashboard(session: s, link: link, ftp: 290, miles: true, onEnd: {}).frame(width: size.width, height: size.height).environment(\.colorScheme, .dark)
      let r = ImageRenderer(content: view)
      r.scale = name == "tv" ? 1 : 2
      guard let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { continue }
      try png.write(to: URL(fileURLWithPath: "\(dir)/ride-\(name).png"))
    }
  }

  @Test func courseDashboard() throws {
    guard let dir = ProcessInfo.processInfo.environment["RENDER_OUT"] else { return }
    let link = FakeLink()
    link.trainerName = "Tacx NEO 3M"
    link.metrics.powerW = 255; link.metrics.cadenceRpm = 88; link.metrics.heartRateBpm = 148
    // A rolling 40 km course with two climbs.
    var profile: [[Double]] = []
    for d in stride(from: 0.0, through: 40000, by: 200) {
      let e = 30 + 25 * sin(d / 2500) + (d > 12000 && d < 16000 ? (d - 12000) * 0.045 : d >= 16000 ? 180 * max(0, 1 - (d - 16000) / 6000) : 0) + (d > 28000 && d < 30500 ? (d - 28000) * 0.06 : d >= 30500 ? 150 * max(0, 1 - (d - 30500) / 3000) : 0)
      profile.append([d, e])
    }
    let course = RideCourse(id: "r", name: "70.3 Panama City", courseName: "Bike", date: "2027-05-08", distanceM: 40000, gainM: 520, profile: profile,
                            climbs: [.init(startM: 12000, endM: 16000, gainM: 180, grade: 4.5), .init(startM: 28000, endM: 30500, gainM: 150, grade: 6)])
    let s = RideSession(course: course, massKg: 82, link: link, difficulty: 0.5)
    s.start()
    let t0 = Date()
    var i = 0
    while (s.course?.distanceM ?? 0) < 13500 && i < 5000 { s.tick(now: t0.addingTimeInterval(Double(i))); i += 1 }
    for (name, size) in [("phone", CGSize(width: 393, height: 852)), ("tv", CGSize(width: 1920, height: 1080))] {
      let view = CourseDashboard(session: s, link: link, miles: true, onEnd: {}).frame(width: size.width, height: size.height).environment(\.colorScheme, .dark)
      let r = ImageRenderer(content: view)
      r.scale = name == "tv" ? 1 : 2
      guard let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { continue }
      try png.write(to: URL(fileURLWithPath: "\(dir)/course-\(name).png"))
    }
  }
}
