import Foundation
import SwiftUI
import TrainerKit

/// A bike workout from Diastole (GET /api/ride/plan or /api/device/rides).
public struct RidePlan: Codable, Identifiable, Hashable, Sendable {
  public let id: String
  public let date: String
  public let title: String
  public let why: String?
  public let ftp: Int?
  public let steps: [RideStep]

  public var plannedSeconds: Int { WorkoutRunner(steps: steps).plannedSeconds }
  public var hasOpenSteps: Bool { steps.contains { if case .time = $0.length { false } else { true } } }

  public static func == (a: RidePlan, b: RidePlan) -> Bool { a.id == b.id }
  public func hash(into h: inout Hasher) { h.combine(id) }
}

public struct RidesResponse: Codable, Sendable {
  public let ftp: Int?
  public let units: String? // "mi" | "km"
  public let rides: [RidePlan]
  /// Bike courses from the athlete's races (older servers don't send these).
  public let courses: [RideCourse]?
  /// Rider + bike, for course physics.
  public let massKg: Double?

  enum CodingKeys: String, CodingKey { case ftp, units, rides, courses, massKg = "mass_kg" }
}

/// Answer from the upload routes.
public struct UploadResult: Codable, Sendable {
  public let status: String // created | details_added | already_there | unreadable
  public let id: String?
}

/// How an app talks to Diastole. The iPhone app goes through its signed-in web view; the TV uses
/// its device token.
@MainActor public protocol RideAPI: AnyObject {
  func rides(id: String?) async throws -> RidesResponse
  func upload(_ fit: Data) async throws -> UploadResult
  /// Shows the saved ride on Diastole, if this app can (iPhone: open it in the web view).
  func openActivity(_ id: String)
}

public struct RideAPIError: LocalizedError {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}

// MARK: - Look

public enum RidePalette {
  public static let canvas = Color(red: 0x0d / 255, green: 0x15 / 255, blue: 0x13 / 255)
  public static let card = Color.white.opacity(0.06)
  public static let line = Color.white.opacity(0.12)
  public static let accent = Color(red: 0.431, green: 0.894, blue: 0.718)
  public static let amber = Color(red: 0.98, green: 0.78, blue: 0.35)
  public static let red = Color(red: 0.98, green: 0.45, blue: 0.42)
  public static let dim = Color.white.opacity(0.55)

  /// Power zones by % of FTP (Coggan), falling back to the step's intensity tag.
  public static func color(watts: Int?, ftp: Int?, intensity: String) -> Color {
    if let w = watts, let f = ftp, f > 0 {
      let p = Double(w) / Double(f)
      switch p {
      case ..<0.56: return Color(red: 0.55, green: 0.62, blue: 0.70)
      case ..<0.76: return Color(red: 0.38, green: 0.66, blue: 0.98)
      case ..<0.91: return accent
      case ..<1.06: return amber
      case ..<1.21: return Color(red: 0.98, green: 0.58, blue: 0.30)
      default: return red
      }
    }
    switch intensity {
    case "warmup", "cooldown", "rest", "recovery": return Color(red: 0.55, green: 0.62, blue: 0.70)
    case "interval": return amber
    default: return watts == nil ? Color.white.opacity(0.25) : accent
    }
  }
}

func clock(_ seconds: Int) -> String {
  let s = max(0, seconds)
  return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
}

func stepText(_ step: RideStep) -> String {
  let what: String = switch step.length {
  case let .time(s): clock(s)
  case let .distance(m): m >= 1000 ? String(format: "%.1f km", m / 1000) : "\(Int(m)) m"
  case .open: "until you tap Next"
  }
  let target = step.targetWatts.map { step.low != step.high && step.low != nil && step.high != nil ? "\(step.low!)–\(step.high!) W" : "\($0) W" } ?? (step.label ?? "free ride")
  return "\(what) · \(target)"
}

func intensityName(_ s: String) -> String {
  switch s {
  case "warmup": "Warm up"
  case "cooldown": "Cool down"
  case "interval": "Interval"
  case "recovery": "Recovery"
  case "rest": "Rest"
  default: "Ride"
  }
}

/// Remembered devices and per-trainer roller setting.
enum DeviceMemory {
  static var trainer: UUID? {
    get { UserDefaults.standard.string(forKey: "ride.trainer").flatMap(UUID.init(uuidString:)) }
    set { UserDefaults.standard.set(newValue?.uuidString, forKey: "ride.trainer") }
  }
  static var strap: UUID? {
    get { UserDefaults.standard.string(forKey: "ride.strap").flatMap(UUID.init(uuidString:)) }
    set { UserDefaults.standard.set(newValue?.uuidString, forKey: "ride.strap") }
  }
  /// Course riding: share of the real grade the trainer applies (default 50%).
  static var difficulty: Double {
    get { UserDefaults.standard.object(forKey: "ride.difficulty") as? Double ?? 0.5 }
    set { UserDefaults.standard.set(min(1, max(0, newValue)), forKey: "ride.difficulty") }
  }
  static func rollers(_ id: UUID?) -> Bool { id.map { UserDefaults.standard.bool(forKey: "ride.rollers.\($0.uuidString)") } ?? false }
  static func setRollers(_ id: UUID?, _ on: Bool) { if let id { UserDefaults.standard.set(on, forKey: "ride.rollers.\(id.uuidString)") } }
}

/// Rides that haven't uploaded yet stay on the device and retry next time.
enum PendingRides {
  static var folder: URL {
    #if os(tvOS)
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0] // tvOS has no lasting storage
    #else
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    #endif
    let dir = base.appendingPathComponent("PendingRides", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }
  static func save(_ data: Data) -> URL? {
    let url = folder.appendingPathComponent("ride-\(Int(Date().timeIntervalSince1970)).fit")
    return (try? data.write(to: url)) != nil ? url : nil
  }
  static func all() -> [URL] {
    ((try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "fit" }
  }
}
