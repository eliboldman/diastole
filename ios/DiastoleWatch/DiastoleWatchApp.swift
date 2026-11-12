import SwiftUI

@main
struct DiastoleWatchApp: App {
    @State private var account = WatchAccount()

    var body: some Scene {
        WindowGroup {
            WatchRoot()
                .environment(account)
                .tint(Theme.accent)
                .foregroundStyle(.white)
        }
    }
}

struct WatchRoot: View {
    @Environment(WatchAccount.self) private var account
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch account.state {
            case .signedIn: TodayView()
            case .signedOut: SignInView()
            case .pairing(let code): PairingView(code: code)
            }
        }
        .background(Theme.canvas.ignoresSafeArea())
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active { Task { await account.refresh() } }
        }
    }
}

/// Signed out: the iPhone app signs the watch in on its own; a code is the fallback.
struct SignInView: View {
    @Environment(WatchAccount.self) private var account

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "heart.fill").font(.title2).foregroundStyle(Theme.accent)
                Text("Diastole").font(.headline)
                Text("Open Diastole on your iPhone and this watch signs in by itself.")
                    .font(.footnote).foregroundStyle(Theme.soft).multilineTextAlignment(.center)
                Button { account.askPhone() } label: { Text("Try again").foregroundStyle(.black) }
                    .buttonStyle(.borderedProminent)
                Button("Use a code instead") { account.startPairing() }
                    .font(.footnote)
                if account.offline { Text("Can't reach Diastole right now.").font(.caption2).foregroundStyle(.orange) }
            }
            .padding(.horizontal, 4)
        }
    }
}

struct PairingView: View {
    @Environment(WatchAccount.self) private var account
    let code: String

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Enter this code").font(.footnote).foregroundStyle(Theme.soft)
                Text(code).font(.system(.title2, design: .monospaced)).fontWeight(.semibold).foregroundStyle(Theme.accent)
                Text("at diastole.app/me/devices").font(.caption2).foregroundStyle(Theme.faint).multilineTextAlignment(.center)
                ProgressView().padding(.top, 4)
                Button("Cancel", role: .cancel) { account.cancelPairing() }.font(.footnote)
            }
        }
    }
}
