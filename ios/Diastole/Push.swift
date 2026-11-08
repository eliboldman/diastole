import SwiftUI
import UIKit
import UserNotifications

/// Push notifications: asks permission once signed in, hands the device token to the web app
/// (through the page's own fetch, so it uses the web sign-in), and opens the right page on tap.
/// Signing out unregisters, so a shared phone never gets the previous person's notifications.
final class PushCenter {
    static let shared = PushCenter()

    private weak var page: WebPage?
    private var token: String?
    private var sentToken: String?
    private var pendingHref: String?
    private var signedIn = false

    /// The signed-in screen's page. A tap that arrived before it existed opens now.
    func attach(_ page: WebPage) {
        self.page = page
        sentToken = nil
        if let href = pendingHref {
            pendingHref = nil
            open(href)
        }
    }

    func signedInChanged(_ yes: Bool) {
        guard yes != signedIn else { return }
        signedIn = yes
        if yes {
            Task {
                let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
                if granted { UIApplication.shared.registerForRemoteNotifications() }
            }
        } else {
            UIApplication.shared.unregisterForRemoteNotifications()
            token = nil
            sentToken = nil
            UNUserNotificationCenter.current().setBadgeCount(0)
        }
    }

    func didRegister(_ data: Data) {
        token = data.map { String(format: "%02x", $0) }.joined()
        sendToken()
    }

    /// Called when a page finishes loading: the first moment a same-site fetch carries the sign-in cookie.
    func pageLoaded(_ loaded: WebPage) {
        if loaded === page { sendToken() }
    }

    private func sendToken() {
        guard signedIn, let token, token != sentToken, let page, AppConfig.isOwn(page.webView.url ?? AppConfig.baseURL) else { return }
        #if DEBUG
        let environment = "sandbox" // Xcode builds use Apple's development push servers
        #else
        let environment = "production"
        #endif
        let js = """
        const r = await fetch('/api/push/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, environment, version }) });
        return r.status;
        """
        Task {
            let status = try? await page.webView.callAsyncJavaScript(js, arguments: ["token": token, "environment": environment, "version": AppConfig.version], contentWorld: .page)
            if (status as? Int) == 200 { sentToken = token }
        }
    }

    /// Opens a Diastole path from a notification ("/messages/…"). Anything else is ignored.
    func open(_ href: String) {
        guard href.hasPrefix("/"), !href.hasPrefix("//") else { return }
        guard let page else {
            pendingHref = href
            return
        }
        page.open(AppConfig.url(href))
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Background delivery needs its observers set up at every launch, including ones iOS starts
        // in the background for new Health data.
        HealthSync.shared.startBackgroundDelivery()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushCenter.shared.didRegister(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("Push registration failed:", error.localizedDescription)
        #endif
    }

    // Completion-handler versions, not the async ones: iOS requires these handlers to be called on
    // the main thread, and the async variants' generated handlers run off it, which crashed the app
    // whenever a notification was tapped. Both hop to the main thread before doing anything.

    /// Show notifications even while the app is open.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        nonisolated(unsafe) let done = completionHandler
        DispatchQueue.main.async { done([.banner, .list, .sound, .badge]) }
    }

    /// Tapped: open the page it's about.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let href = response.notification.request.content.userInfo["href"] as? String
        nonisolated(unsafe) let done = completionHandler
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if let href { PushCenter.shared.open(href) }
            }
            done()
        }
    }
}
