import SwiftUI
import WidgetKit

/// Today at a glance: readiness color, today's workout, and protein so far. Reads what the Today
/// and Fuel pages last handed the app (App Group); tapping opens Today.
struct TodaySnap: Codable {
    struct Workout: Codable { let title: String; let sport: String; let time: String?; let lines: [String]; let mystery: Bool }
    struct Next: Codable { let date: String; let title: String; let sport: String }
    let date: String
    let readiness: String
    let note: String?
    let workout: Workout?
    let next: [Next]

    static func load(now: Date = .now) -> TodaySnap? {
        guard let data = UserDefaults(suiteName: "group.app.diastole.ios")?.data(forKey: "todayShare"),
              let snap = try? JSONDecoder().decode(TodaySnap.self, from: data) else { return nil }
        return snap.date == FuelToday.localDay(now) ? snap : nil
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let snap: TodaySnap?
    let fuel: FuelToday?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snap: TodaySnap(date: FuelToday.localDay(.now), readiness: "green", note: nil, workout: .init(title: "Easy 45 min", sport: "run", time: "07:00", lines: [], mystery: false), next: []), fuel: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : TodayEntry(date: .now, snap: TodaySnap.load(), fuel: FuelToday.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: .now, snap: TodaySnap.load(), fuel: FuelToday.load())
        // Redraw just after midnight so yesterday's plan doesn't linger.
        let midnight = Calendar.current.startOfDay(for: Date.now.addingTimeInterval(86_400)).addingTimeInterval(60)
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

private func readinessColor(_ r: String) -> Color {
    switch r {
    case "green": Color(red: 0x6e / 255, green: 0xe7 / 255, blue: 0xb7 / 255)
    case "yellow": Color(red: 0xfc / 255, green: 0xd3 / 255, blue: 0x4d / 255)
    case "red": Color(red: 0xf8 / 255, green: 0x71 / 255, blue: 0x71 / 255)
    default: .white.opacity(0.4)
    }
}
private func readinessText(_ r: String) -> String {
    switch r {
    case "green": "Ready"
    case "yellow": "Go easier"
    case "red": "Back off"
    default: "No data yet"
    }
}
private func icon(_ sport: String) -> String {
    switch sport {
    case "run": "figure.run"
    case "bike": "figure.outdoor.cycle"
    case "swim": "figure.pool.swim"
    case "strength": "dumbbell"
    default: "figure.mixed.cardio"
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        let r = entry.snap?.readiness ?? "unknown"
        Group {
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text("● \(readinessText(r))").font(.headline)
                    Text(entry.snap?.workout?.title ?? "Rest day").font(.caption).lineLimit(1)
                    if let p = entry.fuel?.protein { Text("Protein \(p.eaten)/\(p.low) g").font(.caption2) }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Circle().fill(readinessColor(r)).frame(width: 9, height: 9)
                        Text(readinessText(r)).font(.subheadline.weight(.semibold)).foregroundStyle(readinessColor(r))
                        Spacer(minLength: 0)
                    }
                    if let w = entry.snap?.workout {
                        Label(w.title, systemImage: icon(w.sport)).font(.headline).foregroundStyle(.white).lineLimit(2)
                        if let t = w.time { Text(t).font(.caption).foregroundStyle(.white.opacity(0.6)) }
                        if family == .systemMedium, let first = w.lines.first { Text(first).font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(2) }
                    } else if entry.snap != nil {
                        Text("Rest day").font(.headline).foregroundStyle(.white)
                    } else {
                        Text("Open Today to fill this in").font(.caption).foregroundStyle(.white.opacity(0.6))
                    }
                    Spacer(minLength: 0)
                    if let p = entry.fuel?.protein {
                        HStack(spacing: 4) {
                            Circle().fill(Macro.protein).frame(width: 6, height: 6)
                            Text("Protein \(p.eaten) of \(p.low) g").font(.caption2).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                        }
                    } else if let f = entry.fuel {
                        Text(f.mealsText).font(.caption2).foregroundStyle(.white.opacity(0.6))
                    }
                }
            }
        }
        .widgetURL(URL(string: "diastole://today"))
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "app.diastole.ios.today", provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Brand.accent.opacity(0.18), Brand.canvas], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
        }
        .configurationDisplayName("Today")
        .description("Your readiness, today's workout and protein so far.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
