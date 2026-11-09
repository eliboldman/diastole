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
}
