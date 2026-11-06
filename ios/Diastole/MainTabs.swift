import SwiftUI

/// One native tab per main section. Each tab keeps its own web view, so its history and scroll
/// position survive switching tabs. Same five tabs as the web's bottom bar.
struct TabSpec: Identifiable {
    let id: String
    let title: String
    let symbol: String
    let path: String
}

extension Role {
    var tabs: [TabSpec] {
        switch self {
        case .coach: [
            TabSpec(id: "today", title: "Today", symbol: "sun.max", path: "/dashboard"),
            TabSpec(id: "athletes", title: "Athletes", symbol: "person.2", path: "/athletes"),
            TabSpec(id: "lab", title: "Lab", symbol: "flask", path: "/endurance-lab"),
            TabSpec(id: "messages", title: "Messages", symbol: "message", path: "/messages"),
            TabSpec(id: "me", title: "Me", symbol: "person.crop.circle", path: "/account"),
        ]
        case .athlete: [
            TabSpec(id: "today", title: "Today", symbol: "sun.max", path: "/me"),
            TabSpec(id: "training", title: "Training", symbol: "figure.run", path: "/training"),
            TabSpec(id: "fuel", title: "Fuel", symbol: "fork.knife", path: "/fuel"),
            TabSpec(id: "messages", title: "Messages", symbol: "message", path: "/messages"),
            TabSpec(id: "me", title: "Me", symbol: "person.crop.circle", path: "/account"),
        ]
        }
    }
}

/// Holds each tab's page. Not observable on purpose: pages are created lazily while SwiftUI builds
/// the tabs, and that must not count as a state change.
final class PageStore {
    private var pages: [String: WebPage] = [:]
    func page(_ spec: TabSpec) -> WebPage {
        if let p = pages[spec.id] { return p }
        let p = WebPage(root: AppConfig.url(spec.path))
        pages[spec.id] = p
        return p
    }
}

struct MainTabs: View {
    let role: Role
    @State private var store = PageStore()
    @State private var selection: String

    init(role: Role) {
        self.role = role
        _selection = State(initialValue: role.tabs[0].id)
    }

    var body: some View {
        let tabs = role.tabs
        // Tapping the tab you're already on goes back to its first page, or scrolls to the top.
        let pick = Binding<String>(
            get: { selection },
            set: { new in
                if new == selection, let spec = tabs.first(where: { $0.id == new }) { store.page(spec).reselect() }
                selection = new
            }
        )
        TabView(selection: pick) {
            ForEach(tabs) { spec in
                Tab(spec.title, systemImage: spec.symbol, value: spec.id) {
                    WebContainer(page: store.page(spec))
                        .ignoresSafeArea()
                        .background(Theme.canvas)
                }
            }
        }
        .tint(Color(uiColor: Theme.accentUI))
    }
}
