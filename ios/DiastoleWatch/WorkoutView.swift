import SwiftUI
import WatchKit

/// One coach workout: the steps as written, why it's on the plan, fueling, and Start (opens it in
/// Apple's Workout app). Mystery sessions stay sealed here; the Workout app shows goals, not names.
struct WorkoutView: View {
    let workout: Workout
    @State private var starting = false
    @State private var problem: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: workout.sealed ? "gift.fill" : Theme.sportIcon(workout.sport)).foregroundStyle(Theme.accent)
                    if let m = workout.minutes { Text(duration(m)).font(.footnote).foregroundStyle(Theme.soft) }
                }
                Text(workout.title).font(.headline)

                if workout.apple != nil {
                    Button {
                        Task { await start() }
                    } label: {
                        Label(starting ? "Opening…" : "Start", systemImage: "play.fill").frame(maxWidth: .infinity).foregroundStyle(.black).fontWeight(.semibold)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(starting)
                } else {
                    Text(workout.sport == "strength" ? "Follow along on your iPhone." : "Start this one from the Workout app.")
                        .font(.caption2).foregroundStyle(Theme.faint)
                }
                if let problem { Text(problem).font(.caption2).foregroundStyle(.orange) }

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(workout.lines.enumerated()), id: \.offset) { _, line in
                        Text(line).font(.caption).foregroundStyle(.white.opacity(0.88))
                    }
                }
                .glass()

                if let why = workout.why {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("WHY").font(.system(size: 9)).foregroundStyle(Theme.faint)
                        Text(why).font(.caption2).foregroundStyle(Theme.soft)
                    }
                    .glass()
                }

                if let f = workout.fuel {
                    VStack(alignment: .leading, spacing: 2) {
                        Label("Fueling", systemImage: "drop.fill").font(.caption).foregroundStyle(Theme.accent)
                        Text("\(f.note) at \(f.first / 60) min, then every \(f.every / 60).").font(.caption2).foregroundStyle(Theme.soft)
                        if f.drink > 0 { Text("Sips every \(f.drink / 60) min.").font(.caption2).foregroundStyle(Theme.soft) }
                        Text("Your watch taps you when you start.").font(.system(size: 9)).foregroundStyle(Theme.faint)
                    }
                    .glass(Theme.accent)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func start() async {
        starting = true
        problem = nil
        defer { starting = false }
        do {
            try await Starter.start(workout)
            WKInterfaceDevice.current().play(.start)
        } catch Starter.Failure.unsupported {
            problem = "The Workout app can't run this one. Your iPhone app has the full session."
        } catch {
            problem = "Couldn't open the Workout app. Try again."
        }
    }
}
