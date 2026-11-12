import SwiftUI

/// Today: readiness, a waiting check-in, the coach's workouts, tomorrow and last night's numbers.
struct TodayView: View {
    @Environment(WatchAccount.self) private var account

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if let t = account.today {
                        ReadinessCard(today: t)
                        if let ck = t.checkIn {
                            NavigationLink { CheckInView(pending: ck) } label: { CheckInPrompt(pending: ck) }
                                .buttonStyle(.plain)
                        }
                        if t.workouts.isEmpty {
                            Text("Nothing planned today. Enjoy it.").font(.footnote).foregroundStyle(Theme.soft).glass()
                        }
                        ForEach(t.workouts) { w in
                            NavigationLink { WorkoutView(workout: w) } label: { WorkoutRow(workout: w) }
                                .buttonStyle(.plain)
                        }
                        if FuelReminders.active {
                            Button { FuelReminders.cancel() } label: { Label("Stop fuel reminders", systemImage: "bell.slash") }
                                .font(.footnote)
                        }
                        if !t.tomorrow.isEmpty {
                            Text("TOMORROW").font(.caption2).foregroundStyle(Theme.faint).padding(.top, 4)
                            ForEach(Array(t.tomorrow.enumerated()), id: \.offset) { _, n in
                                Label(n.title, systemImage: Theme.sportIcon(n.sport)).font(.footnote).foregroundStyle(Theme.soft).lineLimit(2)
                            }
                        }
                        Numbers(today: t)
                    } else if account.loading {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text(account.offline ? "Can't reach Diastole right now." : "Tap ↻ to load today.").font(.footnote).foregroundStyle(Theme.soft)
                        Button("Try again") { Task { await account.refresh() } }
                    }
                }
                .padding(.horizontal, 2)
            }
            .navigationTitle(account.today?.name.map { "Hi \($0)" } ?? "Diastole")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await account.refresh() } } label: { Image(systemName: "arrow.clockwise").foregroundStyle(.black) }
                        .disabled(account.loading)
                }
            }
        }
    }
}

struct ReadinessCard: View {
    let today: Today

    var body: some View {
        let color = Theme.readiness(today.readiness)
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(color.opacity(0.25), lineWidth: 5)
                Circle().trim(from: 0, to: today.readiness == nil ? 0.08 : today.readiness == "green" ? 1 : today.readiness == "yellow" ? 0.66 : 0.33)
                    .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Image(systemName: "heart.fill").font(.caption).foregroundStyle(color)
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text(Theme.readinessWord(today.readiness)).font(.headline).foregroundStyle(color)
                if let note = today.readinessNote { Text(note).font(.caption2).foregroundStyle(Theme.soft).lineLimit(3) }
            }
        }
        .glass(today.readiness == nil ? nil : color)
    }
}

struct CheckInPrompt: View {
    let pending: PendingCheckIn

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.bubble.fill").foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("How did it go?").font(.footnote).fontWeight(.semibold)
                Text("\(pending.title) · \(duration(pending.minutes))").font(.caption2).foregroundStyle(Theme.soft).lineLimit(1)
            }
        }
        .glass(Theme.accent)
    }
}

struct WorkoutRow: View {
    let workout: Workout

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: workout.sealed ? "gift.fill" : Theme.sportIcon(workout.sport))
                .font(.title3).foregroundStyle(Theme.accent).frame(width: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(workout.title).font(.footnote).fontWeight(.semibold).lineLimit(2)
                if let m = workout.minutes { Text(duration(m)).font(.caption2).foregroundStyle(Theme.soft) }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Theme.faint)
        }
        .glass()
    }
}

struct Numbers: View {
    let today: Today

    var body: some View {
        let items: [(String, String)] = [
            today.sleepMinutes.map { ("Sleep", duration($0)) },
            today.hrv.map { ("HRV", "\($0) ms") },
            today.restingHR.map { ("Resting HR", "\($0)") },
        ].compactMap { $0 }
        if !items.isEmpty {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { item in
                    VStack(spacing: 1) {
                        Text(item.1).font(.caption).fontWeight(.semibold).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                        Text(item.0).font(.system(size: 9)).foregroundStyle(Theme.faint).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .glass()
        }
    }
}
