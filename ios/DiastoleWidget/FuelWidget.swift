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
}

struct FuelProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> FuelEntry { FuelEntry(date: .now, actions: [.photo, .scan, .describe, .today]) }
    func snapshot(for configuration: FuelWidgetIntent, in context: Context) async -> FuelEntry { FuelEntry(date: .now, actions: configuration.actions) }
    func timeline(for configuration: FuelWidgetIntent, in context: Context) async -> Timeline<FuelEntry> {
        Timeline(entries: [FuelEntry(date: .now, actions: configuration.actions)], policy: .never)
    }
}

struct FuelWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FuelEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: entry.actions.first?.symbol ?? "fork.knife").font(.title3)
            }
            .widgetURL(entry.actions.first?.url)
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: entry.actions.first?.symbol ?? "fork.knife").font(.title2)
                VStack(alignment: .leading) {
                    Text("Log fuel").font(.headline)
                    Text(entry.actions.first?.title ?? "Log meal").font(.caption).foregroundStyle(.secondary)
                }
            }
            .widgetURL(entry.actions.first?.url)
        case .systemSmall:
            small
        default:
            medium
        }
    }

    /// One big target: the first button.
    private var small: some View {
        let a = entry.actions.first ?? .photo
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image("Logo").resizable().frame(width: 22, height: 22).clipShape(.rect(cornerRadius: 5))
                Spacer()
            }
            Spacer()
            Image(systemName: a.symbol)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Brand.accent)
            Text("Log fuel").font(.headline).foregroundStyle(.white).padding(.top, 6)
            Text(a.title).font(.caption).foregroundStyle(.white.opacity(0.6))
        }
        .widgetURL(a.url)
    }

    /// Up to four buttons, each straight to its step.
    private var medium: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image("Logo").resizable().frame(width: 20, height: 20).clipShape(.rect(cornerRadius: 5))
                Text("Log fuel").font(.headline).foregroundStyle(.white)
                Spacer()
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
        .description("Quick ways to log what you ate: photo, barcode, or type it.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
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
        FuelWidget()
        FuelControl()
    }
}
