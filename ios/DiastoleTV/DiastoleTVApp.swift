import CoreImage.CIFilterBuiltins
import RideUI
import SwiftUI

@main
struct DiastoleTVApp: App {
    @State private var account = TVAccount()

    var body: some Scene {
        WindowGroup {
            TVRoot(account: account)
                .preferredColorScheme(.dark)
                .tint(RidePalette.accent)
        }
    }
}

struct TVRoot: View {
    let account: TVAccount
    @State private var ride: RideFlowModel?

    var body: some View {
        ZStack {
            RidePalette.canvas.ignoresSafeArea()
            switch account.state {
            case .signedOut, .pairing: PairScreen(account: account)
            case let .signedIn(name):
                if let ride {
                    RideFlowView(model: ride) { self.ride = nil; Task { await account.refreshToday() } }
                } else {
                    HomeScreen(account: account, name: name) { ride = RideFlowModel(api: TokenRideAPI(account: account), allowHub: true) }
                }
            }
        }
        .foregroundStyle(.white)
    }
}

/// "Type this code at diastole.app/me/devices", with a QR code for the phone.
struct PairScreen: View {
    let account: TVAccount

    var body: some View {
        HStack(spacing: 80) {
            VStack(alignment: .leading, spacing: 28) {
                Text("Diastole").font(.system(size: 76, weight: .bold, design: .rounded))
                Text("Ride your coach's workouts on your smart trainer.").font(.title3).foregroundStyle(RidePalette.dim)
                if case let .pairing(code) = account.state {
                    Text("On your phone, open diastole.app/me/devices and type:").font(.title3)
                    Text(code.map { String($0) }.joined(separator: " ")).font(.system(size: 96, weight: .bold, design: .monospaced)).foregroundStyle(RidePalette.accent)
                    Text("Or scan the code with your phone's camera.").foregroundStyle(RidePalette.dim)
                } else {
                    if let e = account.error { Text(e).foregroundStyle(RidePalette.amber) }
                    Button("Sign in") { account.startPairing() }.buttonStyle(.borderedProminent)
                }
            }
            if case let .pairing(code) = account.state, let qr = qrImage("\(TVAccount.baseURL.absoluteString)/me/devices?code=\(code)") {
                Image(uiImage: qr).interpolation(.none).resizable().frame(width: 360, height: 360).padding(24).background(.white, in: .rect(cornerRadius: 28))
            }
        }
        .padding(100)
        .onAppear { if account.state == .signedOut { account.startPairing() } }
    }

    private func qrImage(_ s: String) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(s.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Today at a glance plus the big Ride button.
struct HomeScreen: View {
    let account: TVAccount
    let name: String?
    let onRide: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                HStack(alignment: .firstTextBaseline) {
                    Text(name.map { "Hi, \($0)" } ?? "Diastole").font(.system(size: 64, weight: .bold, design: .rounded))
                    Spacer()
                    if let r = account.today?.r {
                        Label(readinessText(r.o), systemImage: "circle.fill").foregroundStyle(readinessColor(r.o)).font(.title3)
                    }
                }
                Button(action: onRide) {
                    Label("Ride", systemImage: "bicycle").font(.title2.weight(.semibold)).padding(.horizontal, 40).padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)

                if let t = account.today {
                    if t.w.isEmpty {
                        Text("Nothing planned today.").font(.title3).foregroundStyle(RidePalette.dim)
                    }
                    ForEach(t.w) { w in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(w.t).font(.title2.weight(.semibold))
                            if let why = w.why { Text(why).foregroundStyle(RidePalette.dim) }
                            ForEach(Array(w.l.enumerated()), id: \.offset) { _, line in Text(line).font(.callout) }
                        }
                        .padding(28)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RidePalette.card, in: .rect(cornerRadius: 28))
                    }
                    HStack(spacing: 24) {
                        if let v = t.m.hrv { metric("HRV", "\(v) ms") }
                        if let v = t.m.rhr { metric("Resting HR", "\(v) bpm") }
                        if let v = t.m.sl { metric("Sleep", "\(v / 60)h \(v % 60)m") }
                        if let v = t.m.bb { metric("Body Battery", "\(v)") }
                    }
                    if !t.nx.isEmpty {
                        Text("Tomorrow: " + t.nx.map(\.t).joined(separator: " · ")).foregroundStyle(RidePalette.dim)
                    }
                }
                Button("Sign out of this TV", role: .destructive) { Task { await account.signOut() } }.padding(.top, 40)
            }
            .padding(80)
        }
        .task { await account.refreshToday() }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(RidePalette.dim)
            Text(value).font(.title2.monospacedDigit().weight(.semibold))
        }
        .padding(24)
        .background(RidePalette.card, in: .rect(cornerRadius: 22))
    }

    private func readinessText(_ o: String) -> String { o == "green" ? "Ready" : o == "yellow" ? "Take it easier" : "Recovery day" }
    private func readinessColor(_ o: String) -> Color { o == "green" ? RidePalette.accent : o == "yellow" ? RidePalette.amber : RidePalette.red }
}
