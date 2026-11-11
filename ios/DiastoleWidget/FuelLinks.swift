import AppIntents
import SwiftUI

/// What a widget button does. Each opens the Diastole app at the right step of logging food.
enum FuelAction: String, AppEnum, CaseIterable {
    case photo, scan, describe, meal, today

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Fuel button"
    static let caseDisplayRepresentations: [FuelAction: DisplayRepresentation] = [
        .photo: DisplayRepresentation(title: "Photo of a meal", image: .init(systemName: "camera.fill")),
        .scan: DisplayRepresentation(title: "Scan a barcode", image: .init(systemName: "barcode.viewfinder")),
        .describe: DisplayRepresentation(title: "Type what you ate", image: .init(systemName: "text.cursor")),
        .meal: DisplayRepresentation(title: "Log a meal", image: .init(systemName: "fork.knife")),
        .today: DisplayRepresentation(title: "Today's fuel", image: .init(systemName: "chart.bar.fill")),
    ]

    var title: String {
        switch self {
        case .photo: "Photo"
        case .scan: "Scan"
        case .describe: "Type it"
        case .meal: "Log meal"
        case .today: "Today"
        }
    }

    var symbol: String {
        switch self {
        case .photo: "camera.fill"
        case .scan: "barcode.viewfinder"
        case .describe: "text.cursor"
        case .meal: "fork.knife"
        case .today: "chart.bar.fill"
        }
    }

    /// diastole://fuel/<action>; the app turns it into the page to open.
    var url: URL { URL(string: "diastole://fuel/\(rawValue)")! }
}

enum Brand {
    static let accent = Color(red: 0.431, green: 0.894, blue: 0.718)
    static let canvas = Color(red: 0x0d / 255, green: 0x15 / 255, blue: 0x13 / 255)
}
