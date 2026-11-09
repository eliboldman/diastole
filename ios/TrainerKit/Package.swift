// swift-tools-version: 6.0
// TrainerKit: Bluetooth smart-trainer control for the Diastole apps (iPhone, iPad, Apple TV).
// Pure protocol code (parsers, encoders, the workout runner) is platform-free and unit-tested
// with `swift test`; TrainerConnection.swift wraps CoreBluetooth and only builds on Apple OSes.
import PackageDescription

let package = Package(
  name: "TrainerKit",
  platforms: [.iOS(.v18), .tvOS(.v18), .macOS(.v15)],
  products: [.library(name: "TrainerKit", targets: ["TrainerKit"])],
  targets: [
    .target(name: "TrainerKit"),
    .testTarget(name: "TrainerKitTests", dependencies: ["TrainerKit"]),
  ]
)
