import Foundation

/// Fueling reminders for one session, from /api/device/today (seconds of workout time).
struct Fuel {
    let first: Int
    let every: Int
    let carbs: Int
    let drink: Int
    let note: String

    init?(_ j: [String: Any]?) {
        guard let j, let first = j["first"] as? Int, let every = j["every"] as? Int, every > 0 else { return nil }
        self.first = first
        self.every = every
        carbs = (j["carbs"] as? Int) ?? 0
        drink = (j["drink"] as? Int) ?? 0
        note = (j["n"] as? String) ?? "Fuel"
    }
}

struct Workout: Identifiable {
    let id: String
    let title: String
    let sport: String
    let why: String?
    let lines: [String]
    let minutes: Int?
    let fuel: Fuel?
    /// The Workout app's copy (blocks, goals, alerts). Nil for strength and other sports it can't run.
    let apple: [String: Any]?
    let sealed: Bool

    init?(_ j: [String: Any]) {
        guard let id = j["id"] as? String, let title = j["t"] as? String else { return nil }
        self.id = id
        self.title = title
        sport = (j["s"] as? String) ?? "workout"
        why = j["why"] as? String
        lines = (j["l"] as? [String]) ?? []
        minutes = j["min"] as? Int
        fuel = Fuel(j["f"] as? [String: Any])
        apple = j["ap"] as? [String: Any]
        sealed = (j["sealed"] as? Int) == 1
    }
}

struct PendingCheckIn: Equatable {
    let activity: String
    let title: String
    let sport: String
    let minutes: Int
    let askFuel: Bool
}

struct Today {
    let date: String
    let name: String?
    let readiness: String?
    let readinessNote: String?
    let workouts: [Workout]
    let tomorrow: [(title: String, sport: String)]
    let hrv: Int?
    let restingHR: Int?
    let sleepMinutes: Int?
    let checkIn: PendingCheckIn?

    init?(data: Data) {
        guard let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let date = j["d"] as? String else { return nil }
        self.date = date
        name = j["n"] as? String
        let r = j["r"] as? [String: Any]
        readiness = r?["o"] as? String
        readinessNote = r?["t"] as? String
        workouts = ((j["w"] as? [[String: Any]]) ?? []).compactMap(Workout.init)
        tomorrow = ((j["nx"] as? [[String: Any]]) ?? []).compactMap { n in (n["t"] as? String).map { ($0, (n["s"] as? String) ?? "") } }
        let m = (j["m"] as? [String: Any]) ?? [:]
        hrv = m["hrv"] as? Int
        restingHR = m["rhr"] as? Int
        sleepMinutes = m["sl"] as? Int
        if let c = j["ck"] as? [String: Any], let a = c["a"] as? String {
            checkIn = PendingCheckIn(activity: a, title: (c["t"] as? String) ?? "Workout", sport: (c["s"] as? String) ?? "workout", minutes: (c["min"] as? Int) ?? 0, askFuel: (c["q"] as? Int) == 1)
        } else {
            checkIn = nil
        }
    }
}
