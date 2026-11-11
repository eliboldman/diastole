import Foundation

/// Today's fuel as the Fuel page last reported it (via the app, through the shared App Group).
struct FuelToday: Codable {
    struct Amount: Codable { let eaten: Int; let low: Int; let high: Int }
    let date: String // athlete's local day, YYYY-MM-DD
    let level: String // low | medium | high
    let mode: String // full | plates | workout
    let meals: Int
    let carbs: Amount?
    let protein: Amount?
    let fat: Amount?
    let kcal: Amount?
    struct Rings: Codable { let carbs: Double; let protein: Double; let fat: Double }
    let rings: Rings?

    var levelText: String {
        switch level {
        case "high": "High fuel day"
        case "medium": "Medium fuel day"
        default: "Low fuel day"
        }
    }
    var mealsText: String { meals == 0 ? "Nothing logged yet" : meals == 1 ? "1 meal logged" : "\(meals) meals logged" }

    /// The saved snapshot, if it's for today. A new day starts empty (the targets come with the next open).
    static func load(now: Date = .now) -> FuelToday? {
        guard let data = UserDefaults(suiteName: "group.app.diastole.ios")?.data(forKey: "fuelToday"),
              let fuel = try? JSONDecoder().decode(FuelToday.self, from: data) else { return nil }
        return fuel.date == localDay(now) ? fuel : nil
    }

    static func localDay(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
}
