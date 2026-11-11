import Foundation
import UIKit
import UserNotifications

/// Bedtime nudges as local notifications. The website works out the next week of evenings (bedtime
/// from tomorrow's first session, at most two nudges a night, quiet hours, off switch); the app asks
/// for that schedule through the signed-in page and replaces its pending bedtime notifications, so
/// they fire on time even when the app is closed. "Not tonight" cancels that evening's nudges.
@MainActor
final class BedtimeNudges {
    static let shared = BedtimeNudges()
    static let category = "BEDTIME"
    static let snoozeAction = "bedtime.snooze"
    private static let prefix = "bedtime."
    private static let snoozedKey = "bedtime.snoozed" // evening dates the athlete said "not tonight" to
    private static let minInterval: TimeInterval = 20 * 60

    private weak var page: WebPage?
    private var lastRefresh: Date?

    func attach(_ page: WebPage) { self.page = page }

    /// The "Not tonight" button shown on each nudge.
    static func registerCategory() {
        let snooze = UNNotificationAction(identifier: snoozeAction, title: "Not tonight", options: [])
        let cat = UNNotificationCategory(identifier: category, actions: [snooze], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().getNotificationCategories { existing in
            let others = existing.filter { $0.identifier != category }
            UNUserNotificationCenter.current().setNotificationCategories(others.union([cat]))
        }
    }

    func signedOut() {
        lastRefresh = nil
        UNUserNotificationCenter.current().getPendingNotificationRequests { reqs in
            let ids = reqs.map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    /// Called on page loads and when the app becomes active; at most every 20 minutes.
    func maybeRefresh(_ loaded: WebPage? = nil) {
        if let loaded { page = loaded }
        if let lastRefresh, Date().timeIntervalSince(lastRefresh) < Self.minInterval { return }
        Task { await refresh() }
    }

    private func refresh() async {
        guard UIApplication.shared.applicationState == .active, let page, AppConfig.isOwn(page.webView.url ?? AppConfig.baseURL) else { return }
        let js = """
        const r = await fetch('/api/bedtime/schedule', { headers: { accept: 'application/json' } });
        if (!r.ok) return JSON.stringify({ status: r.status });
        return JSON.stringify({ status: r.status, json: await r.json() });
        """
        guard let out = try? await page.webView.callAsyncJavaScript(js, arguments: [:], contentWorld: .page) as? String,
              let parsed = try? JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any],
              (parsed["status"] as? Int) == 200, let json = parsed["json"] as? [String: Any] else { return }
        lastRefresh = Date()
        let items = (json["nudges"] as? [[String: Any]]) ?? []
        await schedule(items)
    }

    private func schedule(_ items: [[String: Any]]) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.prefix) })
        let snoozed = Set(UserDefaults.standard.stringArray(forKey: Self.snoozedKey) ?? [])
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        for item in items {
            guard let id = item["id"] as? String, id.hasPrefix(Self.prefix),
                  let date = item["date"] as? String, !snoozed.contains(date),
                  let atText = item["at"] as? String, let at = iso.date(from: atText) ?? ISO8601DateFormatter().date(from: atText),
                  at > Date() else { continue }
            let content = UNMutableNotificationContent()
            content.title = (item["title"] as? String) ?? "Bedtime"
            content.body = (item["body"] as? String) ?? ""
            content.sound = UNNotificationSound(named: UNNotificationSoundName("chime.caf"))
            content.categoryIdentifier = Self.category
            content.userInfo = ["bedtimeDate": date, "href": "/me"]
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: at)
            try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
        }
        // Forget snoozes older than a few days.
        let keep = snoozed.filter { $0 >= Self.dayString(Date().addingTimeInterval(-3 * 86_400)) }
        UserDefaults.standard.set(Array(keep), forKey: Self.snoozedKey)
    }

    /// "Not tonight": drop the rest of that evening's nudges and don't bring them back on re-sync.
    func snooze(_ date: String) {
        var snoozed = Set(UserDefaults.standard.stringArray(forKey: Self.snoozedKey) ?? [])
        snoozed.insert(date)
        UserDefaults.standard.set(Array(snoozed), forKey: Self.snoozedKey)
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { reqs in
            let ids = reqs.filter { ($0.content.userInfo["bedtimeDate"] as? String) == date }.map(\.identifier)
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    private static func dayString(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
}
