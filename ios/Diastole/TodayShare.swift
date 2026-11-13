import Foundation
import WidgetKit

/// Today's plan, handed over by the Today page: saved in the shared App Group for the Today widget
/// and for the offline screen (OfflinePage), then the widget is asked to redraw.
enum TodayShare {
    static let key = "todayShare"

    static func save(_ snapshot: Any) {
        guard let dict = snapshot as? [String: Any], dict["date"] is String,
              JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict), data.count < 12_000,
              let shared = UserDefaults(suiteName: FuelShare.group) else { return }
        if shared.data(forKey: key) == data { return }
        shared.set(data, forKey: key)
        WidgetCenter.shared.reloadTimelines(ofKind: "app.diastole.ios.today")
    }

    static func load() -> [String: Any]? {
        guard let data = UserDefaults(suiteName: FuelShare.group)?.data(forKey: key) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
