import Foundation

/// Anything a ride can be driven through: a trainer connected over Bluetooth on this device
/// (TrainerConnection) or one connected to an iPhone acting as a hub (HubClient, Apple TV).
@MainActor public protocol TrainerLink: AnyObject {
  var metrics: LiveMetrics { get }
  var trainerName: String? { get }
  /// The trainer accepts ERG targets.
  var canControl: Bool { get }
  /// ERG: hold `watts`; nil = light fixed resistance (free ride / paused).
  func setTarget(_ watts: Int?)
}
