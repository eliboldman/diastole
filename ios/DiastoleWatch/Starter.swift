import Foundation
import HealthKit
import UserNotifications
@preconcurrency import WorkoutKit

/// Starts a coach workout in Apple's Workout app (steps, targets and haptics are Apple's), and
/// schedules this session's fueling reminders as notifications that tap the wrist mid-workout.
enum Starter {
    enum Failure: Error { case unsupported, couldNotOpen }

    static func start(_ w: Workout) async throws {
        guard let ap = w.apple, let custom = customWorkout(ap) else { throw Failure.unsupported }
        let plan = WorkoutPlan(.custom(custom), id: UUID(uuidString: w.id) ?? UUID())
        if let fuel = w.fuel { await FuelReminders.schedule(fuel, minutes: w.minutes ?? 90) }
        do { try await plan.openInWorkoutApp() } catch {
            FuelReminders.cancel()
            throw Failure.couldNotOpen
        }
    }

    // Same conversion as the iPhone app's HealthSync (lib/apple/format.ts on the server).

    static func customWorkout(_ p: [String: Any]) -> CustomWorkout? {
        let activity: HKWorkoutActivityType
        switch p["activity"] as? String {
        case "running": activity = .running
        case "cycling": activity = .cycling
        case "swimming": activity = .swimming
        default: return nil
        }
        let location: HKWorkoutSessionLocationType = activity == .swimming ? .indoor : .outdoor
        guard CustomWorkout.supportsActivity(activity) else { return nil }
        let blocks: [IntervalBlock] = ((p["blocks"] as? [[String: Any]]) ?? []).compactMap { b in
            let steps: [IntervalStep] = ((b["steps"] as? [[String: Any]]) ?? []).compactMap { s in
                guard let step = workoutStep(s, activity: activity) else { return nil }
                return IntervalStep((s["purpose"] as? String) == "recovery" ? .recovery : .work, step: step)
            }
            return steps.isEmpty ? nil : IntervalBlock(steps: steps, iterations: max(1, (b["iterations"] as? Int) ?? 1))
        }
        let warmup = (p["warmup"] as? [String: Any]).flatMap { workoutStep($0, activity: activity) }
        let cooldown = (p["cooldown"] as? [String: Any]).flatMap { workoutStep($0, activity: activity) }
        if blocks.isEmpty && warmup == nil && cooldown == nil { return nil }
        return CustomWorkout(activity: activity, location: location, displayName: (p["title"] as? String) ?? "Workout", warmup: warmup, blocks: blocks, cooldown: cooldown)
    }

    private static func workoutStep(_ s: [String: Any], activity: HKWorkoutActivityType) -> WorkoutStep? {
        let g = (s["goal"] as? [String: Any]) ?? [:]
        let goal: WorkoutGoal
        switch g["type"] as? String {
        case "time": goal = .time((g["seconds"] as? NSNumber)?.doubleValue ?? 0, .seconds)
        case "distance":
            if let yards = (g["yards"] as? NSNumber)?.doubleValue, yards > 0 { goal = .distance(yards, .yards) }
            else { goal = .distance((g["meters"] as? NSNumber)?.doubleValue ?? 0, .meters) }
        default: goal = .open
        }
        let location: HKWorkoutSessionLocationType = activity == .swimming ? .indoor : .outdoor
        guard CustomWorkout.supportsGoal(goal, activity: activity, location: location) else { return nil }
        var step = WorkoutStep(goal: goal, displayName: s["name"] as? String)
        if let a = s["alert"] as? [String: Any], let alert = alert(a, activity: activity) { step.alert = alert }
        return step
    }

    private static func alert(_ a: [String: Any], activity: HKWorkoutActivityType) -> (any WorkoutAlert)? {
        let low = (a["low"] as? NSNumber)?.doubleValue ?? 0
        let high = (a["high"] as? NSNumber)?.doubleValue ?? 0
        let candidate: (any WorkoutAlert)?
        switch a["type"] as? String {
        case "hrZone": candidate = HeartRateZoneAlert(zone: (a["zone"] as? Int) ?? 2)
        case "hr" where high >= low && low > 0: candidate = HeartRateRangeAlert.heartRate(low...high)
        case "speed" where high >= low && low > 0:
            candidate = SpeedRangeAlert(target: Measurement(value: low, unit: UnitSpeed.metersPerSecond)...Measurement(value: high, unit: UnitSpeed.metersPerSecond), metric: .current)
        case "power" where high >= low && low > 0:
            candidate = PowerRangeAlert(target: Measurement(value: low, unit: UnitPower.watts)...Measurement(value: high, unit: UnitPower.watts), metric: .current)
        default: candidate = nil
        }
        guard let candidate, CustomWorkout.supportsAlert(candidate, activity: activity, location: activity == .swimming ? .indoor : .outdoor) else { return nil }
        return candidate
    }
}

/// Carb and drink taps from the session's fueling plan, timed from when the workout starts
/// (clock time, so a long pause runs them a little early). "Stop reminders" clears them.
enum FuelReminders {
    private static let prefix = "fuel."
    private static let lead: TimeInterval = 20 // the Workout app's countdown

    static func schedule(_ f: Fuel, minutes: Int) async {
        let center = UNUserNotificationCenter.current()
        guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
        cancel()
        let end = minutes * 60
        var times: [(Int, String, String)] = []
        var t = f.first
        while t < end { times.append((t, "Fuel", f.note)); t += f.every }
        if f.drink > 0 {
            var d = f.drink
            while d < end {
                if !times.contains(where: { abs($0.0 - d) < 300 }) { times.append((d, "Drink", "A few good sips.")) }
                d += f.drink
            }
        }
        for (i, item) in times.sorted(by: { $0.0 < $1.0 }).prefix(40).enumerated() {
            let content = UNMutableNotificationContent()
            content.title = item.1
            content.body = item.2
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: lead + TimeInterval(item.0), repeats: false)
            try? await center.add(UNNotificationRequest(identifier: "\(prefix)\(i)", content: content, trigger: trigger))
        }
        UserDefaults.standard.set(Date().addingTimeInterval(lead + TimeInterval(end)), forKey: "fuel.until")
    }

    static func cancel() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: (0..<40).map { "\(prefix)\($0)" })
        UserDefaults.standard.removeObject(forKey: "fuel.until")
    }

    /// Reminders are still waiting to go off.
    static var active: Bool {
        guard let until = UserDefaults.standard.object(forKey: "fuel.until") as? Date else { return false }
        return until > Date()
    }
}
