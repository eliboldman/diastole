import Foundation
import UserNotifications
import WebKit

/// Long-press actions on notifications, done without opening the app: "Had protein ✓" on the
/// post-workout reminder, and an inline "Reply" on messages. They call /api/quick with the web
/// sign-in cookies the app already holds. All notification categories are registered here at once
/// (setting them is all-or-nothing, so two separate registrations could overwrite each other).
enum QuickActions {
    static let refuelCategory = "REFUEL"
    static let messageCategory = "MESSAGE"
    static let hadProtein = "refuel.had"
    static let logMeal = "refuel.log"
    static let reply = "message.reply"

    @MainActor static func registerAll() {
        let had = UNNotificationAction(identifier: hadProtein, title: "Had protein ✓", options: [])
        let log = UNNotificationAction(identifier: logMeal, title: "Log what I ate", options: [.foreground])
        let answer = UNTextInputNotificationAction(identifier: reply, title: "Reply", options: [], textInputButtonTitle: "Send", textInputPlaceholder: "Message")
        let snooze = UNNotificationAction(identifier: BedtimeNudges.snoozeAction, title: "Not tonight", options: [])
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: refuelCategory, actions: [had, log], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: messageCategory, actions: [answer], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: BedtimeNudges.category, actions: [snooze], intentIdentifiers: [], options: []),
        ])
    }

    /// Handles one of our actions. Returns false when the action isn't ours (the caller opens the page instead).
    @MainActor
    static func handle(action: String, href: String?, text: String?) async -> Bool {
        switch action {
        case hadProtein:
            let ok = await post(["action": "protein"])
            notify(ok ? "Logged: about 30 g of protein ✓" : "Couldn't log that. Open Diastole to log it.")
            return true
        case logMeal:
            PushCenter.shared.open("/fuel?log=1")
            return true
        case reply:
            guard let href, href.hasPrefix("/messages/"), let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return true }
            let conv = String(href.dropFirst("/messages/".count).prefix(36))
            let ok = await post(["action": "reply", "conversation": conv, "text": text])
            if !ok { notify("Your reply didn't send. Open Diastole to try again.") }
            return true
        default:
            return false
        }
    }

    @MainActor
    private static func post(_ body: [String: Any]) async -> Bool {
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies().filter(AppConfig.isOwnCookie)
        var req = URLRequest(url: AppConfig.url("/api/quick"))
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        HTTPCookie.requestHeaderFields(with: cookies).forEach { req.setValue($0.value, forHTTPHeaderField: $0.key) }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, resp) = try? await URLSession.shared.data(for: req), (resp as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["ok"] as? Bool == true
    }

    private static func notify(_ text: String) {
        let content = UNMutableNotificationContent()
        content.title = "Diastole"
        content.body = text
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "quick.\(UUID().uuidString)", content: content, trigger: nil))
    }
}
