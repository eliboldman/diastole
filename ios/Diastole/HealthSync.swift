import CryptoKit
import Foundation
import HealthKit
import UIKit
import WebKit
@preconcurrency import WorkoutKit

/// Apple Watch support. After the athlete taps Connect (on the web Connect page, inside the app):
///  - reads Apple Health (workouts, overnight HRV, resting heart rate, sleep) and posts it to
///    Diastole through the signed-in page's own fetch, so it uses the web sign-in;
///  - puts the coach's upcoming workouts in the Apple Watch Workout app (WorkoutKit), and takes
///    off ones the coach removed or changed.
/// It syncs when the app opens or comes back to the front, when Apple Health has something new
/// (iOS wakes the app in the background for new workouts and overnight data), at most every 15
/// minutes, and on "Sync now".
final class HealthSync {
    static let shared = HealthSync()

    private let store = HKHealthStore()
    private weak var page: WebPage?
    private var running = false
    private var lastSync: Date?
    private var observing = false
    private let connectedKey = "health.connected"
    private let scheduledKey = "health.scheduled" // planned workout id -> fingerprint of what's on the watch
    private static let lookbackDays = 14
    private static let minInterval: TimeInterval = 15 * 60

    private var connected: Bool {
        get { UserDefaults.standard.bool(forKey: connectedKey) }
        set { UserDefaults.standard.set(newValue, forKey: connectedKey) }
    }

    func attach(_ page: WebPage) { self.page = page }

    /// Someone signed out: stop syncing and take their workouts off the watch (a shared phone stays private).
    func signedOut() {
        guard connected else { return }
        connected = false
        lastSync = nil
        stopBackgroundDelivery()
        Task { await clearWatch() }
    }

    /// A page finished loading or the app came to the front: sync if it's been a while.
    func maybeSync(_ loaded: WebPage? = nil) {
        if let loaded, loaded !== page { return }
        guard connected, !running else { return }
        if let lastSync, Date().timeIntervalSince(lastSync) < Self.minInterval { return }
        Task { await sync(connect: false, report: false) }
    }

    /// From the page: {type: "connectHealth"} or {type: "syncHealth"}.
    func handle(_ type: String) {
        guard !running else { return }
        guard type == "connectHealth" || type == "syncHealth" else { return }
        Task {
            guard HKHealthStore.isHealthDataAvailable() else { return report(["ok": false, "error": "unavailable"]) }
            // Asks only the first time; after that it returns straight away.
            do {
                try await store.requestAuthorization(toShare: [], read: Self.readTypes)
            } catch {
                return report(["ok": false, "error": "denied"])
            }
            if WorkoutScheduler.isSupported { _ = await WorkoutScheduler.shared.requestAuthorization() }
            await sync(connect: type == "connectHealth", report: true)
        }
    }

    // MARK: sync

    // MARK: background

    /// Ask iOS to wake the app when Apple Health gets a new workout (right away) or overnight data
    /// (hourly), so the coach sees it without the athlete opening Diastole. Set up at every launch.
    func startBackgroundDelivery() {
        guard connected, !observing, HKHealthStore.isHealthDataAvailable() else { return }
        observing = true
        let types: [(HKSampleType, HKUpdateFrequency)] = [
            (HKObjectType.workoutType(), .immediate), (Self.hrv, .hourly), (Self.restingHR, .hourly), (Self.sleep, .hourly),
        ]
        for (type, frequency) in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { @Sendable _, completion, error in
                guard error == nil else { return completion() }
                nonisolated(unsafe) let done = completion
                Task { @MainActor in
                    await HealthSync.shared.backgroundSync()
                    done()
                }
            }
            store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: frequency) { _, _ in }
        }
    }

    private func stopBackgroundDelivery() {
        observing = false
        store.disableAllBackgroundDelivery { _, _ in }
    }

    /// Apple Health has something new. Same 15-minute limit as opening the app.
    func backgroundSync() async {
        guard connected, !running else { return }
        if let lastSync, Date().timeIntervalSince(lastSync) < Self.minInterval { return }
        // A little extra time if iOS woke the app just for this.
        let task = UIApplication.shared.beginBackgroundTask(withName: "health-sync")
        await sync(connect: false, report: false)
        if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
    }

    // MARK: sync

    private func sync(connect: Bool, report shouldReport: Bool) async {
        running = true
        defer { running = false }

        let payload: [String: Any] = [
            "wellness": await wellness(),
            "activities": await workouts(),
            "connect": connect,
        ]
        guard let response = await post("/api/apple/sync", payload) else {
            if shouldReport { report(["ok": false, "error": "failed"]) }
            return
        }
        if response.status == 409 {
            let reason = (response.json["error"] as? String) ?? "failed"
            if reason == "not connected" {
                // Disconnected on the web: stop syncing and clear the watch.
                connected = false
                await clearWatch()
            }
            if shouldReport { report(["ok": false, "error": reason == "garmin" ? "garmin" : "failed"]) }
            return
        }
        guard response.status == 200 else {
            if shouldReport { report(["ok": false, "error": "failed"]) }
            return
        }
        connected = true
        lastSync = Date()
        startBackgroundDelivery()

        let plans = (response.json["workouts"] as? [[String: Any]]) ?? []
        let removing = Set((response.json["removing"] as? [String]) ?? [])
        let onWatch = await updateWatch(plans, removing: removing)
        if shouldReport { report(["ok": true, "workouts": onWatch]) }
    }

    private func report(_ detail: [String: Any]) {
        guard let page, let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        page.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('diastole:health', { detail: \(json) }))")
    }

    private struct Response { let status: Int; let json: [String: Any] }

    /// POST with the web sign-in: through the page while the app is open, or directly with the
    /// page's cookies when iOS woke the app in the background.
    private func post(_ path: String, _ body: [String: Any]) async -> Response? {
        guard let data = try? JSONSerialization.data(withJSONObject: body), let text = String(data: data, encoding: .utf8) else { return nil }
        guard UIApplication.shared.applicationState == .active, let page, AppConfig.isOwn(page.webView.url ?? AppConfig.baseURL) else {
            return await directPost(path, data)
        }
        let js = """
        const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        return JSON.stringify({ status: r.status, json: await r.json().catch(() => ({})) });
        """
        guard let out = try? await page.webView.callAsyncJavaScript(js, arguments: ["path": path, "body": text], contentWorld: .page) as? String,
              let parsed = try? JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any] else { return nil }
        return Response(status: (parsed["status"] as? Int) ?? 0, json: (parsed["json"] as? [String: Any]) ?? [:])
    }

    /// The background path: the web view's sign-in cookies on a plain request. The server refreshes
    /// an expiring session in its response; those cookies go back to the web view so the next page
    /// load (and sync) uses them.
    private func directPost(_ path: String, _ data: Data) async -> Response? {
        let jar = WKWebsiteDataStore.default().httpCookieStore
        let cookies = await jar.allCookies().filter(AppConfig.isOwnCookie)
        guard !cookies.isEmpty else { return nil }
        let url = AppConfig.url(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = data
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        for (k, v) in HTTPCookie.requestHeaderFields(with: cookies) { request.setValue(v, forHTTPHeaderField: k) }
        guard let (body, response) = try? await URLSession.shared.data(for: request), let http = response as? HTTPURLResponse else { return nil }
        // Signed out (the server redirected to the login page): not an answer. Without this check an
        // empty reply would look like "no workouts planned" and clear the watch.
        guard http.url?.path == url.path, (http.value(forHTTPHeaderField: "content-type") ?? "").contains("json") else { return nil }
        if let fields = http.allHeaderFields as? [String: String] {
            for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) where AppConfig.isOwnCookie(c) { await jar.setCookie(c) }
        }
        return Response(status: http.statusCode, json: ((try? JSONSerialization.jsonObject(with: body)) as? [String: Any]) ?? [:])
    }

    // MARK: Apple Health -> Diastole

    private static let hrv = HKQuantityType(.heartRateVariabilitySDNN)
    private static let restingHR = HKQuantityType(.restingHeartRate)
    private static let heartRate = HKQuantityType(.heartRate)
    private static let sleep = HKCategoryType(.sleepAnalysis)
    private static let energy = HKQuantityType(.activeEnergyBurned)
    private static let runDistance = HKQuantityType(.distanceWalkingRunning)
    private static let bikeDistance = HKQuantityType(.distanceCycling)
    private static let swimDistance = HKQuantityType(.distanceSwimming)
    private static let runPower = HKQuantityType(.runningPower)
    private static let bikePower = HKQuantityType(.cyclingPower)
    static let readTypes: Set<HKObjectType> = [
        HKObjectType.workoutType(), hrv, restingHR, heartRate, sleep, energy, runDistance, bikeDistance, swimDistance, runPower, bikePower,
    ]

    private var calendar: Calendar { Calendar.current }
    private func dayString(_ d: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
    /// That day's midnight plus some hours; negative hours reach into the evening before.
    private func at(_ day: Date, hour: Int) -> Date { calendar.date(byAdding: .hour, value: hour, to: calendar.startOfDay(for: day)) ?? day }

    private func samples(_ type: HKQuantityType, from: Date, to: Date) async -> [HKQuantitySample] {
        let pred = HKQuery.predicateForSamples(withStart: from, end: to)
        let q = HKSampleQueryDescriptor(predicates: [.quantitySample(type: type, predicate: pred)], sortDescriptors: [SortDescriptor(\.startDate)])
        return (try? await q.result(for: store)) ?? []
    }

    /// One row per day for the last two weeks: overnight HRV, resting heart rate, time asleep.
    private func wellness() async -> [[String: Any]] {
        let today = calendar.startOfDay(for: Date())
        guard let start = calendar.date(byAdding: .day, value: -Self.lookbackDays, to: today) else { return [] }
        let hrvs = await samples(Self.hrv, from: at(start, hour: -4), to: Date())
        let rests = await samples(Self.restingHR, from: start, to: Date())
        let sleepPred = HKQuery.predicateForSamples(withStart: at(start, hour: -6), end: Date())
        let sleepQ = HKSampleQueryDescriptor(predicates: [.categorySample(type: Self.sleep, predicate: sleepPred)], sortDescriptors: [SortDescriptor(\.startDate)])
        let asleepValues: Set<Int> = [
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue,
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue,
        ]
        let asleep = ((try? await sleepQ.result(for: store)) ?? []).filter { asleepValues.contains($0.value) }

        var rows: [[String: Any]] = []
        for offset in 0...Self.lookbackDays {
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            var row: [String: Any] = ["date": dayString(day)]
            // Overnight: 8 pm the evening before to 10 am.
            let night = hrvs.filter { $0.startDate >= at(day, hour: -4) && $0.startDate < at(day, hour: 10) }
            if !night.isEmpty {
                let ms = night.map { $0.quantity.doubleValue(for: .secondUnit(with: .milli)) }
                row["hrv_ms"] = (ms.reduce(0, +) / Double(ms.count) * 10).rounded() / 10
            }
            if let r = rests.last(where: { calendar.isDate($0.startDate, inSameDayAs: day) }) {
                row["resting_hr"] = r.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())).rounded()
            }
            // Last night's sleep: asleep time ending between 6 pm the day before and 2 pm, overlaps merged
            // (iPhone and Watch can both record the same night).
            let window = asleep.filter { $0.endDate > at(day, hour: -6) && $0.endDate <= at(day, hour: 14) }
            let seconds = Self.merged(window.map { ($0.startDate, $0.endDate) })
            if seconds > 0 { row["sleep_seconds"] = seconds.rounded() }
            if row.count > 1 { rows.append(row) }
        }
        return rows
    }

    private static func merged(_ spans: [(Date, Date)]) -> TimeInterval {
        var total: TimeInterval = 0
        var current: (Date, Date)?
        for s in spans.sorted(by: { $0.0 < $1.0 }) {
            if let c = current, s.0 <= c.1 {
                current = (c.0, max(c.1, s.1))
            } else {
                if let c = current { total += c.1.timeIntervalSince(c.0) }
                current = s
            }
        }
        if let c = current { total += c.1.timeIntervalSince(c.0) }
        return total
    }

    /// Workouts from the last two weeks, with Diastole's sport names.
    private func workouts() async -> [[String: Any]] {
        guard let start = calendar.date(byAdding: .day, value: -Self.lookbackDays, to: Date()) else { return [] }
        let pred = HKQuery.predicateForSamples(withStart: start, end: Date())
        let q = HKSampleQueryDescriptor(predicates: [.workout(pred)], sortDescriptors: [SortDescriptor(\.startDate)])
        let found = (try? await q.result(for: store)) ?? []
        let iso = ISO8601DateFormatter()
        let bpm = HKUnit.count().unitDivided(by: .minute())
        return found.prefix(300).map { w in
            var row: [String: Any] = [
                "id": w.uuid.uuidString.lowercased(),
                "sport": Self.sport(w),
                "start": iso.string(from: w.startDate),
                "duration_s": w.duration.rounded(),
            ]
            let distance = [Self.runDistance, Self.bikeDistance, Self.swimDistance].compactMap { w.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }.max()
            if let distance, distance > 0 { row["distance_m"] = (distance * 10).rounded() / 10 }
            if let hr = w.statistics(for: Self.heartRate) {
                if let avg = hr.averageQuantity()?.doubleValue(for: bpm) { row["avg_hr"] = avg.rounded() }
                if let max = hr.maximumQuantity()?.doubleValue(for: bpm) { row["max_hr"] = max.rounded() }
            }
            if let kcal = w.statistics(for: Self.energy)?.sumQuantity()?.doubleValue(for: .kilocalorie()) { row["calories"] = kcal.rounded() }
            if let watts = [Self.runPower, Self.bikePower].compactMap({ w.statistics(for: $0)?.averageQuantity()?.doubleValue(for: .watt()) }).first {
                row["avg_power"] = watts.rounded()
            }
            if let climb = w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity { row["elevation_gain_m"] = climb.doubleValue(for: .meter()).rounded() }
            if let device = w.device?.name ?? w.sourceRevision.productType { row["device"] = String(device.prefix(100)) }
            return row
        }
    }

    private static func sport(_ w: HKWorkout) -> String {
        let indoor = (w.metadata?[HKMetadataKeyIndoorWorkout] as? Bool) ?? false
        switch w.workoutActivityType {
        case .running: return indoor ? "treadmill_running" : "running"
        case .cycling: return indoor ? "indoor_cycling" : "cycling"
        case .swimming:
            let open = (w.metadata?[HKMetadataKeySwimmingLocationType] as? NSNumber)?.intValue == HKWorkoutSwimmingLocationType.openWater.rawValue
            return open ? "open_water_swimming" : "lap_swimming"
        case .swimBikeRun: return "multisport"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing, .stairs, .stepTraining: return "stair_climbing"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength_training"
        case .highIntensityIntervalTraining: return "hiit"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .crossTraining, .mixedCardio: return "cross_training"
        case .coreTraining: return "core_training"
        case .crossCountrySkiing: return "cross_country_skiing"
        case .paddleSports: return "paddling"
        default: return "other"
        }
    }

    // MARK: Diastole -> Apple Watch

    private var scheduled: [String: String] {
        get { (UserDefaults.standard.dictionary(forKey: scheduledKey) as? [String: String]) ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: scheduledKey) }
    }

    /// Makes the watch match the coach's plan. Returns how many workouts are on the watch.
    private func updateWatch(_ plans: [[String: Any]], removing: Set<String>) async -> Int {
        guard WorkoutScheduler.isSupported, await Self.schedulerAuthorized() else { return 0 }
        let current = await WorkoutScheduler.shared.scheduledWorkouts
        var memory = scheduled
        var sent: [String] = []
        var removed: Set<String> = []

        let wanted: [String: [String: Any]] = Dictionary(plans.compactMap { p in (p["id"] as? String).map { ($0.lowercased(), p) } }, uniquingKeysWith: { a, _ in a })
        for item in current {
            let id = item.plan.id.uuidString.lowercased()
            let fingerprint = wanted[id].map(Self.fingerprint)
            if fingerprint == nil || fingerprint != memory[id] {
                await WorkoutScheduler.shared.remove(item.plan, at: item.date)
                memory[id] = nil
                if wanted[id] == nil { removed.insert(id) }
            }
        }
        let still = Set(await WorkoutScheduler.shared.scheduledWorkouts.map { $0.plan.id.uuidString.lowercased() })
        for (id, p) in wanted where !still.contains(id) {
            guard let uuid = UUID(uuidString: id), let custom = Self.customWorkout(p), let date = Self.when(p["date"] as? String) else { continue }
            await WorkoutScheduler.shared.schedule(WorkoutPlan(.custom(custom), id: uuid), at: date)
            memory[id] = Self.fingerprint(p)
            sent.append(id)
        }
        scheduled = memory
        // Removals the coach is waiting on, including ones that were never on this watch.
        for id in removing where wanted[id] == nil { removed.insert(id) }
        if !sent.isEmpty || !removed.isEmpty {
            _ = await post("/api/apple/ack", ["sent": sent, "removed": Array(removed)])
        }
        return await WorkoutScheduler.shared.scheduledWorkouts.count
    }

    private static func schedulerAuthorized() async -> Bool {
        await WorkoutScheduler.shared.authorizationState == .authorized
    }

    private func clearWatch() async {
        guard WorkoutScheduler.isSupported else { return }
        for item in await WorkoutScheduler.shared.scheduledWorkouts {
            await WorkoutScheduler.shared.remove(item.plan, at: item.date)
        }
        scheduled = [:]
    }

    private static func fingerprint(_ p: [String: Any]) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: p, options: [.sortedKeys])) ?? Data()
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Future days: 6 am. Today: a minute from now, so it shows up right away.
    private static func when(_ date: String?) -> DateComponents? {
        guard let date, case let parts = date.split(separator: "-").compactMap({ Int($0) }), parts.count == 3 else { return nil }
        let cal = Calendar.current
        var c = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 6, minute: 0)
        guard let target = cal.date(from: c) else { return nil }
        if cal.isDateInToday(target) || target < Date() {
            guard cal.isDateInToday(target) else { return nil } // past days aren't scheduled
            let soon = Date().addingTimeInterval(60)
            c.hour = cal.component(.hour, from: soon)
            c.minute = cal.component(.minute, from: soon)
        }
        return c
    }

    private static func customWorkout(_ p: [String: Any]) -> CustomWorkout? {
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
        case "time": goal = .time((g["seconds"] as? Double) ?? 0, .seconds)
        case "distance":
            // Yard pools come with whole yards, so the watch shows "100 yd", not "91.4 m".
            if let yards = (g["yards"] as? NSNumber)?.doubleValue, yards > 0 { goal = .distance(yards, .yards) }
            else { goal = .distance((g["meters"] as? Double) ?? 0, .meters) }
        default: goal = .open
        }
        let location: HKWorkoutSessionLocationType = activity == .swimming ? .indoor : .outdoor
        guard CustomWorkout.supportsGoal(goal, activity: activity, location: location) else { return nil }
        var step = WorkoutStep(goal: goal, displayName: s["name"] as? String)
        if let a = s["alert"] as? [String: Any], let alert = alert(a, activity: activity) { step.alert = alert }
        return step
    }

    private static func alert(_ a: [String: Any], activity: HKWorkoutActivityType) -> (any WorkoutAlert)? {
        let low = (a["low"] as? Double) ?? 0
        let high = (a["high"] as? Double) ?? 0
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
