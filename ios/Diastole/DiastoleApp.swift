import SwiftUI
import UserNotifications

@main
struct DiastoleApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            switch session.state {
            case .loading:
                Image("Logo").resizable().frame(width: 72, height: 72).clipShape(.rect(cornerRadius: 16))
            case .signedOut:
                SignInScreen()
            case .signedIn(let role):
                MainScreen(role: role).id(role)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.state)
        // Widget and Control Center buttons: diastole://fuel/<action>.
        .onOpenURL { url in
            if let href = DeepLink.href(for: url) { PushCenter.shared.open(href) }
        }
        .onChange(of: session.state, initial: true) { _, state in
            if case .signedIn = state {
                PushCenter.shared.signedInChanged(true)
                WatchLink.shared.start()
            } else if state == .signedOut {
                PushCenter.shared.signedInChanged(false)
                WatchLink.shared.signedOut()
                HealthSync.shared.signedOut()
                BedtimeNudges.shared.signedOut()
            }
        }
        // Opening the app clears the badge; the bell inside shows what's unread.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                UNUserNotificationCenter.current().setBadgeCount(0)
                HealthSync.shared.maybeSync()
                BedtimeNudges.shared.maybeRefresh()
            }
        }
    }
}

/// The web sign-in page, full screen with no tabs. A fresh one each time someone signs out.
struct SignInScreen: View {
    @State private var page = WebPage(root: AppConfig.url("/login"))
    var body: some View { WebContainer(page: page).ignoresSafeArea() }
}

/// Turns a diastole:// link (from the home screen widget or Control Center) into a page to open.
enum DeepLink {
    static func href(for url: URL) -> String? {
        guard url.scheme == "diastole" else { return nil }
        switch (url.host() ?? "", url.lastPathComponent) {
        case ("fuel", "photo"): return "/fuel?log=1&via=photo"
        case ("fuel", "scan"): return "/fuel?log=1&via=scan"
        case ("fuel", "describe"): return "/fuel?log=1&via=describe"
        case ("fuel", "meal"): return "/fuel?log=1"
        case ("fuel", _): return "/fuel"
        default: return nil
        }
    }
}
