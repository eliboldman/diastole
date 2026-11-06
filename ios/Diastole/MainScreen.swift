import SwiftUI

/// Signed in: one full-screen web view, same as the website on a phone. The Diastole logo at the
/// top left opens the page menu, so there's no native tab bar.
struct MainScreen: View {
    let role: Role
    @State private var page: WebPage

    init(role: Role) {
        self.role = role
        _page = State(initialValue: WebPage(root: AppConfig.url(role == .coach ? "/dashboard" : "/me")))
    }

    var body: some View {
        WebContainer(page: page)
            .ignoresSafeArea()
            .background(Theme.canvas)
            .onAppear { PushCenter.shared.attach(page) }
    }
}
