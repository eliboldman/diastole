import SwiftUI

/// The phone app's look on the wrist: deep green-black canvas, mint accent, frosted glass cards.
enum Theme {
    static let canvas = Color(red: 0x0d / 255, green: 0x15 / 255, blue: 0x13 / 255)
    static let accent = Color(red: 0.431, green: 0.894, blue: 0.718)
    static let soft = Color.white.opacity(0.6)
    static let faint = Color.white.opacity(0.42)

    static func readiness(_ flag: String?) -> Color {
        switch flag {
        case "green": Color(red: 0.29, green: 0.87, blue: 0.5)
        case "yellow": Color(red: 0.98, green: 0.8, blue: 0.3)
        case "red": Color(red: 0.98, green: 0.47, blue: 0.47)
        default: Color.white.opacity(0.3)
        }
    }

    static func readinessWord(_ flag: String?) -> String {
        switch flag {
        case "green": "Ready to train"
        case "yellow": "Ease in today"
        case "red": "Recovery day"
        default: "No score yet"
        }
    }

    static func sportIcon(_ sport: String) -> String {
        switch sport {
        case "run": "figure.run"
        case "bike": "figure.outdoor.cycle"
        case "swim": "figure.pool.swim"
        case "strength": "dumbbell.fill"
        default: "figure.mixed.cardio"
        }
    }
}

struct Glass: ViewModifier {
    var tint: Color? = nil
    func body(content: Content) -> some View {
        content
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial, in: .rect(cornerRadius: 18))
            .background((tint ?? .clear).opacity(0.12), in: .rect(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder((tint ?? .white).opacity(tint == nil ? 0.1 : 0.3)))
    }
}

extension View {
    func glass(_ tint: Color? = nil) -> some View { modifier(Glass(tint: tint)) }
}

/// "45 min" / "1 h 20".
func duration(_ minutes: Int) -> String {
    minutes >= 60 ? "\(minutes / 60) h \(String(format: "%02d", minutes % 60))" : "\(minutes) min"
}
