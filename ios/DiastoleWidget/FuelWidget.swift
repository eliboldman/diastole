import AppIntents
import SwiftUI
import WidgetKit

/// Long-press → Edit Widget: pick the buttons and their order.
struct FuelWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Fuel shortcuts"
    static let description = IntentDescription("Choose which ways to log food show on the widget. The small widget uses the first one.")

    @Parameter(title: "First button", default: .photo) var first: FuelAction
    @Parameter(title: "Second button", default: .scan) var second: FuelAction
    @Parameter(title: "Third button", default: .describe) var third: FuelAction
    @Parameter(title: "Fourth button", default: .today) var fourth: FuelAction

    var actions: [FuelAction] {
        var seen: [FuelAction] = []
        for a in [first, second, third, fourth] where !seen.contains(a) { seen.append(a) }
        return seen
    }
}

struct FuelEntry: TimelineEntry {
    let date: Date
    let actions: [FuelAction]
    let fuel: FuelToday?
}

struct FuelProvider: AppIntentTimelineProvider {
    private static let sample = FuelToday(date: "", level: "high", mode: "full", meals: 2,
                                          carbs: .init(eaten: 210, low: 490, high: 700), protein: .init(eaten: 64, low: 112, high: 140),
                                          fat: .init(eaten: 40, low: 56, high: 84), kcal: .init(eaten: 1450, low: 3100, high: 3900),
                                          rings: .init(carbs: 0.43, protein: 0.57, fat: 0.71))
    func placeholder(in context: Context) -> FuelEntry { FuelEntry(date: .now, actions: [.photo, .scan, .describe, .today], fuel: Self.sample) }
    func snapshot(for configuration: FuelWidgetIntent, in context: Context) async -> FuelEntry {
        FuelEntry(date: .now, actions: configuration.actions, fuel: FuelToday.load() ?? (context.isPreview ? Self.sample : nil))
    }
    /// Now, then again at midnight so a new day starts clean. The app asks for a redraw after each log.
    func timeline(for configuration: FuelWidgetIntent, in context: Context) async -> Timeline<FuelEntry> {
        let midnight = Calendar.current.startOfDay(for: .now.addingTimeInterval(86_400))
        return Timeline(entries: [
            FuelEntry(date: .now, actions: configuration.actions, fuel: FuelToday.load()),
            FuelEntry(date: midnight, actions: configuration.actions, fuel: nil),
        ], policy: .after(midnight.addingTimeInterval(60)))
    }
}

/// Carbs (or calories) eaten against today's range: a bar with the range shaded.
struct RangeBar: View {
    let amount: FuelToday.Amount
    var body: some View {
        GeometryReader { geo in
            let top = Double(max(amount.high, amount.eaten, 1)) * 1.08
            let x = { (v: Int) in geo.size.width * min(1, Double(v) / top) }
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.1))
                Rectangle().fill(Brand.accent.opacity(0.22))
                    .frame(width: max(2, x(amount.high) - x(amount.low)))
                    .offset(x: x(amount.low))
                Capsule().fill(Brand.accent).frame(width: max(6, x(amount.eaten)))
            }
            .clipShape(Capsule())
        }
        .frame(height: 8)
    }
}

/// "210 g of 490–700 g carbs"
struct AmountLine: View {
    let label: String
    let unit: String
    let amount: FuelToday.Amount
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(amount.eaten)").font(.system(.title3, design: .rounded).weight(.semibold)).foregroundStyle(.white).contentTransition(.numericText())
                Text("/ \(amount.low)–\(amount.high) \(unit) \(label)").font(.caption2).foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.7)
            }
            RangeBar(amount: amount)
        }
    }
}

struct FuelWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FuelEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            if let c = entry.fuel?.carbs {
                Gauge(value: Double(min(c.eaten, c.high)), in: 0...Double(max(c.high, 1))) {
                    Image(systemName: "fork.knife")
                } currentValueLabel: {
                    Text("\(c.eaten)")
                }
                .gaugeStyle(.accessoryCircular)
                .widgetURL(entry.actions.first?.url)
            } else {
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: entry.actions.first?.symbol ?? "fork.knife").font(.title3)
                }
                .widgetURL(entry.actions.first?.url)
            }
        case .accessoryRectangular:
            Group {
                if let c = entry.fuel?.carbs {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Carbs \(c.eaten) g").font(.headline)
                        Gauge(value: Double(min(c.eaten, c.high)), in: 0...Double(max(c.high, 1))) { EmptyView() }
                            .gaugeStyle(.accessoryLinearCapacity)
                        Text("Target \(c.low)–\(c.high) g").font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: entry.actions.first?.symbol ?? "fork.knife").font(.title2)
                        VStack(alignment: .leading) {
                            Text("Log fuel").font(.headline)
                            Text(entry.fuel?.mealsText ?? entry.actions.first?.title ?? "Log meal").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .widgetURL(entry.actions.first?.url)
        case .systemSmall:
            small
        case .systemLarge:
            large
        default:
            medium
        }
    }

    /// One big target (the first button), with today's carbs when there are numbers to show.
    private var small: some View {
        let a = entry.actions.first ?? .photo
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image("Logo").resizable().frame(width: 22, height: 22).clipShape(.rect(cornerRadius: 5))
                Spacer()
                Image(systemName: a.symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(Brand.accent)
            }
            Spacer()
            if let f = entry.fuel, let c = f.carbs {
                Text(f.levelText).font(.caption2).foregroundStyle(.white.opacity(0.55))
                AmountLine(label: "carbs", unit: "g", amount: c).padding(.top, 2)
                if let k = f.kcal {
                    Text("\(k.eaten) of \(k.low)–\(k.high) kcal").font(.caption2).foregroundStyle(.white.opacity(0.6)).padding(.top, 6).lineLimit(1).minimumScaleFactor(0.7)
                }
            } else {
                Image(systemName: a.symbol)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(Brand.accent)
                Text("Log fuel").font(.headline).foregroundStyle(.white).padding(.top, 6)
                Text(entry.fuel.map { "\($0.levelText) · \($0.mealsText)" } ?? a.title).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(2)
            }
        }
        .widgetURL(a.url)
    }

    /// Today's numbers (when there are any) over up to four buttons, each straight to its step.
    private var medium: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image("Logo").resizable().frame(width: 20, height: 20).clipShape(.rect(cornerRadius: 5))
                if let f = entry.fuel, let c = f.carbs {
                    Link(destination: FuelAction.today.url) {
                        HStack(spacing: 12) {
                            AmountLine(label: "carbs", unit: "g", amount: c)
                            if let k = f.kcal { AmountLine(label: "kcal", unit: "", amount: k) }
                        }
                    }
                } else {
                    Text("Log fuel").font(.headline).foregroundStyle(.white)
                    Spacer()
                    if let f = entry.fuel {
                        Text("\(f.levelText) · \(f.mealsText)").font(.caption2).foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
            }
            HStack(spacing: 8) {
                ForEach(entry.actions.prefix(4), id: \.self) { a in
                    Link(destination: a.url) {
                        VStack(spacing: 6) {
                            Image(systemName: a.symbol).font(.system(size: 22, weight: .semibold)).foregroundStyle(Brand.accent)
                            Text(a.title).font(.caption2.weight(.medium)).foregroundStyle(.white.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.white.opacity(0.07), in: .rect(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.1)))
                    }
                }
            }
        }
    }

    /// The Fuel page's rings (carbs, protein, fat) with the numbers beside them, and the buttons below.
    private var large: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image("Logo").resizable().frame(width: 22, height: 22).clipShape(.rect(cornerRadius: 5))
                Text(entry.fuel?.levelText ?? "Log fuel").font(.headline).foregroundStyle(.white)
                Spacer()
                if let f = entry.fuel { Text(f.mealsText).font(.caption).foregroundStyle(.white.opacity(0.6)) }
            }
            if let f = entry.fuel, let rings = f.rings {
                Link(destination: FuelAction.today.url) {
                    HStack(spacing: 18) {
                        MacroRingsView(rings: rings).frame(width: 128, height: 128)
                        VStack(alignment: .leading, spacing: 8) {
                            MacroRow(label: "Carbs", color: Brand.accent, amount: f.carbs, fill: rings.carbs)
                            MacroRow(label: "Protein", color: Macro.protein, amount: f.protein, fill: rings.protein)
                            MacroRow(label: "Fat", color: Macro.fat, amount: f.fat, fill: rings.fat)
                            if let k = f.kcal {
                                Text("\(k.eaten) of \(k.low)–\(k.high) kcal").font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.8)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            } else {
                Spacer(minLength: 0)
                Text(entry.fuel == nil ? "Open Fuel in the app once to see today's rings here." : "Add your weight on the Fuel page to get daily targets.")
                    .font(.caption).foregroundStyle(.white.opacity(0.6))
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                ForEach(entry.actions.prefix(4), id: \.self) { a in
                    Link(destination: a.url) {
                        VStack(spacing: 6) {
                            Image(systemName: a.symbol).font(.system(size: 22, weight: .semibold)).foregroundStyle(Brand.accent)
                            Text(a.title).font(.caption2.weight(.medium)).foregroundStyle(.white.opacity(0.85)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity).frame(height: 72)
                        .background(.white.opacity(0.07), in: .rect(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.1)))
                    }
                }
            }
        }
    }
}

enum Macro {
    static let protein = Color(red: 0x7d / 255, green: 0xd3 / 255, blue: 0xfc / 255)
    static let fat = Color(red: 0xfc / 255, green: 0xd3 / 255, blue: 0x4d / 255)
}

/// Three rings, outer to inner: carbs, protein, fat. Each fills toward the bottom of its range (as on the Fuel page).
struct MacroRingsView: View {
    let rings: FuelToday.Rings
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let line = side * 0.09
            ZStack {
                ForEach(Array([(rings.carbs, Brand.accent), (rings.protein, Macro.protein), (rings.fat, Macro.fat)].enumerated()), id: \.offset) { i, item in
                    let inset = CGFloat(i) * (line * 1.35) + line / 2
                    Circle().inset(by: inset).stroke(.white.opacity(0.08), lineWidth: line)
                    Circle().inset(by: inset)
                        .trim(from: 0, to: max(0.015, min(1, item.0)))
                        .stroke(item.1, style: StrokeStyle(lineWidth: line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
            .frame(width: side, height: side)
        }
    }
}

/// "● Carbs  210 g  of 490–700" — or "there" / "on the way" for athletes who don't see numbers.
struct MacroRow: View {
    let label: String
    let color: Color
    let amount: FuelToday.Amount?
    let fill: Double
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label).font(.subheadline).foregroundStyle(color)
            if let a = amount {
                Text("\(a.eaten) g").font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                Text("of \(a.low)–\(a.high)").font(.caption2).foregroundStyle(.white.opacity(0.5)).lineLimit(1).minimumScaleFactor(0.7)
            } else {
                Text(fill >= 1 ? "there" : fill >= 0.5 ? "on the way" : "").font(.caption).foregroundStyle(.white.opacity(0.55))
            }
        }
    }
}

struct FuelWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "app.diastole.ios.fuel", intent: FuelWidgetIntent.self, provider: FuelProvider()) { entry in
            FuelWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Brand.accent.opacity(0.18), Brand.canvas], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
        }
        .configurationDisplayName("Log fuel")
        .description("Today's fuel and quick ways to log what you ate: photo, barcode, or type it.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
    }
}

/// Control Center / Lock Screen button (iOS 18): straight to logging a meal.
struct OpenFuelIntent: AppIntent {
    static let title: LocalizedStringResource = "Log fuel"
    static let description = IntentDescription("Opens Diastole to log a meal.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(FuelAction.meal.url))
    }
}

struct FuelControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.diastole.ios.fuel-control") {
            ControlWidgetButton(action: OpenFuelIntent()) {
                Label("Log fuel", systemImage: "fork.knife")
            }
        }
        .displayName("Log fuel")
        .description("Open Diastole to log a meal.")
    }
}

@main
struct DiastoleWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        FuelWidget()
        FuelControl()
    }
}
