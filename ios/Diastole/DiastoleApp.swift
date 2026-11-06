import SwiftUI

@main
struct DiastoleApp: App {
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

    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            switch session.state {
            case .loading:
                Image("Logo").resizable().frame(width: 72, height: 72).clipShape(.rect(cornerRadius: 16))
            case .signedOut:
                SignInScreen()
            case .signedIn(let role):
                MainTabs(role: role).id(role)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.state)
    }
}

/// The web sign-in page, full screen with no tabs. A fresh one each time someone signs out.
struct SignInScreen: View {
    @State private var page = WebPage(root: AppConfig.url("/login"))
    var body: some View { WebContainer(page: page).ignoresSafeArea() }
}
