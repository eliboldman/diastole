import Foundation
import WidgetKit

/// Today's fuel, handed over by the Fuel page, saved where the home-screen widget can read it
/// (the shared App Group), then the widget is asked to redraw.
enum FuelShare {
    static let group = "group.app.diastole.ios"
    static let key = "fuelToday"

    static func save(_ snapshot: Any) {
        guard let dict = snapshot as? [String: Any], dict["date"] is String,
              JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict), data.count < 4_000,
              let shared = UserDefaults(suiteName: group) else { return }
        if shared.data(forKey: key) == data { return }
        shared.set(data, forKey: key)
        shared.set(Date().timeIntervalSince1970, forKey: key + ".at")
        WidgetCenter.shared.reloadTimelines(ofKind: "app.diastole.ios.fuel")
    }
}
