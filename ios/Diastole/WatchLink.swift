import Foundation
import WatchConnectivity
import WebKit

/// Signs the Diastole Apple Watch app in, with nothing to type: when a page loads while signed in
/// (or the watch asks), the page's own fetch gets a watch token from /api/device/link and it goes
/// to the watch over WatchConnectivity. Signing out tells the watch to forget it.
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    private weak var page: WebPage?
    private var linking = false
    private var started = false
    private let linkedKey = "watch.linked"

    func start() {
        guard WCSession.isSupported(), !started else { return }
        started = true
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func pageLoaded(_ page: WebPage) {
        self.page = page
        link(force: false)
    }

    func signedOut() {
        UserDefaults.standard.set(false, forKey: linkedKey)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(["signout": UUID().uuidString])
    }

    private func link(force: Bool) {
        guard WCSession.isSupported(), !linking else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        if !force && UserDefaults.standard.bool(forKey: linkedKey) { return }
        guard let page, let url = page.webView.url, AppConfig.isOwn(url), !url.path.hasPrefix("/login") else { return }
        linking = true
        Task {
            defer { linking = false }
            let js = """
            const r = await fetch('/api/device/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Apple Watch' }) });
            return r.ok ? JSON.stringify(await r.json()) : '';
            """
            guard let out = try? await page.webView.callAsyncJavaScript(js, arguments: [:], contentWorld: .page) as? String, !out.isEmpty,
                  let j = try? JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any], let token = j["token"] as? String else { return }
            do {
                try WCSession.default.updateApplicationContext(["token": token, "name": (j["name"] as? String) ?? ""])
                UserDefaults.standard.set(true, forKey: linkedKey)
            } catch {}
        }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.link(force: false) }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        let installed = session.isWatchAppInstalled
        Task { @MainActor in
            if !installed { UserDefaults.standard.set(false, forKey: self.linkedKey) }
            self.link(force: false)
        }
    }

    /// The watch has no token (new install, or it was reset): make a fresh one.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message["want"] as? String == "token" else { return }
        Task { @MainActor in self.link(force: true) }
    }
}
