import Foundation
import Observation
import WebKit

enum Role: String { case coach, athlete }

/// Who is signed in, read from the web app's own cookies. The web pages own the session (they sign
/// in, refresh and sign out); the app only watches the shared cookie store, so there is one login.
@Observable
final class Session {
    enum State: Equatable {
        case loading
        case signedOut          // show the web sign-in page full screen
        case signedIn(Role)     // show the app for this role
    }

    private(set) var state: State = .loading
    private let store = WKWebsiteDataStore.default().httpCookieStore
    @ObservationIgnored private var watcher: CookieWatcher?

    init() {
        let watcher = CookieWatcher { [weak self] in Task { @MainActor in await self?.refresh() } }
        store.add(watcher)
        self.watcher = watcher
        Task { await refresh() }
    }

    func refresh() async {
        let cookies = await store.allCookies().filter(AppConfig.isOwnCookie)
        // Supabase's auth cookie, possibly split into chunks (…-auth-token.0, .1).
        let authed = cookies.contains { $0.name.hasPrefix("sb-") && $0.name.contains("-auth-token") && !$0.value.isEmpty }
        // d_role is set by every signed-in page (RoleCookie). Until it's there, the sign-in page stays up;
        // a signed-in visit to /login redirects home, which sets it.
        let role = cookies.first { $0.name == "d_role" }.flatMap { Role(rawValue: $0.value) }
        let next: State = if authed, let role { .signedIn(role) } else { .signedOut }
        if next != state { state = next }
    }
}

/// WKHTTPCookieStoreObserver needs an NSObject; this one just forwards the change.
private final class CookieWatcher: NSObject, WKHTTPCookieStoreObserver {
    private let onChange: @Sendable () -> Void
    init(onChange: @escaping @Sendable () -> Void) { self.onChange = onChange }
    nonisolated func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { onChange() }
}
