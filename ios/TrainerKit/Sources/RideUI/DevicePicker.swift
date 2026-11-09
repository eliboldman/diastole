import SwiftUI
import TrainerKit

/// Find and connect the trainer (and optionally a heart-rate source) over Bluetooth.
struct DevicePicker: View {
  let connection: TrainerConnection
  @Binding var rollers: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      status
      if connection.state == .scanning || !connection.found.isEmpty {
        VStack(spacing: 8) {
          ForEach(connection.found) { d in
            Button {
              connection.connect(d)
              if d.kind == .heartRate { DeviceMemory.strap = d.id } else { DeviceMemory.trainer = d.id; rollers = DeviceMemory.rollers(d.id) }
            } label: {
              HStack {
                Image(systemName: d.kind == .heartRate ? "heart.fill" : d.kind == .controllable ? "bicycle" : "bolt.fill")
                  .foregroundStyle(d.kind == .heartRate ? RidePalette.red : RidePalette.accent).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                  Text(d.name).lineLimit(1)
                  Text(kindText(d.kind)).font(.caption).foregroundStyle(RidePalette.dim)
                }
                Spacer()
                if isConnected(d) { Image(systemName: "checkmark.circle.fill").foregroundStyle(RidePalette.accent) }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
          }
        }
      }
      HStack {
        Button(connection.state == .scanning ? "Searching…" : "Search for devices") { connection.startScan() }
          .buttonStyle(.bordered)
          .disabled(connection.state == .scanning || connection.state == .off || connection.state == .unauthorized)
        if connection.state == .scanning { ProgressView().padding(.leading, 8) }
      }
      if connection.trainerName != nil {
        Toggle(isOn: $rollers) {
          VStack(alignment: .leading, spacing: 2) {
            Text("Smart rollers")
            Text("Eases into each new target so you stay balanced").font(.caption).foregroundStyle(RidePalette.dim)
          }
        }
        .onChange(of: rollers) { _, on in DeviceMemory.setRollers(DeviceMemory.trainer, on) }
      }
      Text("Tip: many Garmin watches can broadcast heart rate (watch settings › Sensors › Broadcast Heart Rate), so the watch can be your heart-rate source.")
        .font(.footnote).foregroundStyle(RidePalette.dim)
    }
  }

  @ViewBuilder private var status: some View {
    switch connection.state {
    case .off: note("Turn on Bluetooth to find your trainer.", RidePalette.amber)
    case .unauthorized: note("Diastole needs Bluetooth access. Turn it on in Settings › Diastole.", RidePalette.amber)
    case .connecting: note("Connecting to \(connection.trainerName ?? "your trainer")…", RidePalette.dim)
    case .connected:
      VStack(alignment: .leading, spacing: 4) {
        note("Connected to \(connection.trainerName ?? "trainer")\(connection.heartRateName.map { " and \($0)" } ?? "")", RidePalette.accent)
        if !connection.canControl && connection.inControl == false && connection.features != nil {
          note("This one reports power but can't be controlled. You can still ride to the numbers.", RidePalette.amber)
        }
        if let p = connection.metrics.powerW { Text("Power \(p) W · cadence \(Int(connection.metrics.cadenceRpm ?? 0)) rpm").font(.footnote.monospacedDigit()).foregroundStyle(RidePalette.dim) }
      }
    default: note("Wake your trainer (pedal a few strokes), then search.", RidePalette.dim)
    }
  }

  private func note(_ s: String, _ c: Color) -> some View { Text(s).font(.subheadline).foregroundStyle(c) }

  private func kindText(_ k: FoundDevice.Kind) -> String {
    switch k {
    case .controllable: "Smart trainer"
    case .power: "Power meter (no control)"
    case .heartRate: "Heart rate"
    }
  }

  private func isConnected(_ d: FoundDevice) -> Bool {
    d.kind == .heartRate ? connection.heartRateName == d.name : connection.trainerName == d.name && connection.state == .connected
  }
}
