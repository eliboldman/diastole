import SwiftUI
import TrainerKit

/// Apple TV: pick an iPhone that's acting as a hub, then show the code to type on it.
struct HubConnectView: View {
  let hub: HubClient
  @State private var code: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      switch hub.state {
      case .connected:
        Text("Connected through your iPhone\(hub.trainerName.map { " to \($0)" } ?? "")").foregroundStyle(RidePalette.accent)
        if let p = hub.metrics.powerW { Text("Power \(p) W").font(.footnote.monospacedDigit()).foregroundStyle(RidePalette.dim) }
      case .connecting:
        VStack(alignment: .leading, spacing: 8) {
          Text("On your iPhone, type this code:").foregroundStyle(RidePalette.dim)
          Text(code ?? "----").font(.system(size: 64, weight: .bold, design: .rounded).monospacedDigit()).tracking(8)
        }
      case .denied:
        Text("The iPhone said no. Check the code and try again.").foregroundStyle(RidePalette.amber)
        phoneList
      case .lost:
        Text("Lost the connection to your iPhone.").foregroundStyle(RidePalette.amber)
        phoneList
      case .idle, .browsing:
        Text("On your iPhone, open Diastole › menu › Ride › Use as hub, and connect your trainer there.")
          .foregroundStyle(RidePalette.dim)
        phoneList
      }
    }
    .onAppear { if hub.state == .idle { hub.browse() } }
  }

  @ViewBuilder private var phoneList: some View {
    if hub.phones.isEmpty {
      HStack(spacing: 10) { ProgressView(); Text("Looking for your iPhone…").foregroundStyle(RidePalette.dim) }
    }
    ForEach(hub.phones) { phone in
      Button {
        code = hub.connect(phone, deviceName: "Apple TV")
      } label: {
        Label(phone.name, systemImage: "iphone").frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.bordered)
    }
  }
}

#if os(iOS)
/// iPhone: be the hub for an Apple TV. Connect the trainer here; the TV drives the workout.
public struct HubHostView: View {
  @State private var connection = TrainerConnection()
  @State private var server: HubServer?
  @State private var rollers = false
  @State private var typed = ""
  let onClose: () -> Void

  public init(onClose: @escaping () -> Void) { self.onClose = onClose }

  public var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        HStack {
          Spacer()
          Button { server?.stop(); connection.disconnectAll(); UIApplication.shared.isIdleTimerDisabled = false; onClose() } label: { Label("Close", systemImage: "xmark") }
            .buttonStyle(.bordered)
        }
        Text("Use as hub").font(.largeTitle.weight(.semibold))
        Text("Your iPhone connects to the trainer and passes everything to your Apple TV, so the TV isn't limited to two Bluetooth devices. Keep this screen open while you ride.")
          .foregroundStyle(RidePalette.dim)
        DevicePicker(connection: connection, rollers: $rollers)
        hubStatus
      }
      .padding(24)
    }
    .background(RidePalette.canvas.ignoresSafeArea())
    .foregroundStyle(.white)
    .preferredColorScheme(.dark)
    .onAppear {
      UIApplication.shared.isIdleTimerDisabled = true
      if server == nil {
        let s = HubServer(trainer: connection)
        s.start(name: UIDevice.current.name)
        server = s
      }
      connection.reconnect(trainer: DeviceMemory.trainer, strap: DeviceMemory.strap)
    }
  }

  @ViewBuilder private var hubStatus: some View {
    if let server {
      VStack(alignment: .leading, spacing: 12) {
        switch server.state {
        case .off: Text("Hub is off.").foregroundStyle(RidePalette.dim)
        case .waiting: HStack(spacing: 10) { ProgressView(); Text("Waiting for your Apple TV…").foregroundStyle(RidePalette.dim) }
        case let .asking(tv):
          Text("\(tv) wants to connect. Type the code it shows:")
          TextField("Code", text: $typed).keyboardType(.numberPad).font(.title.monospacedDigit()).textFieldStyle(.roundedBorder)
          HStack {
            Button("Connect") { server.confirm(code: typed); typed = "" }.buttonStyle(.borderedProminent).tint(RidePalette.accent).foregroundStyle(.black)
            Button("Not mine") { server.decline() }.buttonStyle(.bordered)
          }
        case let .connected(tv): Text("Connected to \(tv). Start the ride on the TV.").foregroundStyle(RidePalette.accent)
        case let .failed(msg): Text("Hub stopped: \(msg)").foregroundStyle(RidePalette.amber)
        }
      }
      .padding(18)
      .background(RoundedRectangle(cornerRadius: 22).fill(RidePalette.card))
    }
  }
}
#endif
