import SwiftUI
import WatchKit

/// After a session: how it felt (1–5), how hard (1–10 on the crown), and, for long ones, how the
/// fueling went. Saves to the same check-in the app shows; sore spots and notes stay in the app.
struct CheckInView: View {
    @Environment(WatchAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    let pending: PendingCheckIn

    @State private var feel: Int?
    @State private var rpe = 5.0
    @State private var fuel: String?
    @State private var saving = false
    @State private var failed = false

    private let faces = ["😫", "😕", "😐", "🙂", "😄"]
    private let feelWords = ["Awful", "Rough", "Okay", "Good", "Great"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(pending.title).font(.footnote).foregroundStyle(Theme.soft).lineLimit(2)

                Text("How did it feel?").font(.headline)
                HStack(spacing: 2) {
                    ForEach(0..<5, id: \.self) { i in
                        Button {
                            feel = i + 1
                            WKInterfaceDevice.current().play(.click)
                        } label: {
                            Text(faces[i]).font(.title3)
                                .frame(maxWidth: .infinity, minHeight: 34)
                                .background(feel == i + 1 ? Theme.accent.opacity(0.3) : Color.white.opacity(0.06), in: .rect(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(feelWords[i])
                    }
                }
                if let feel { Text(feelWords[feel - 1]).font(.caption2).foregroundStyle(Theme.accent) }

                Text("How hard?").font(.headline).padding(.top, 2)
                HStack {
                    Button { rpe = max(1, rpe - 1) } label: { Image(systemName: "minus") }.frame(width: 36)
                    VStack(spacing: 0) {
                        Text("\(Int(rpe))").font(.title2).fontWeight(.semibold).monospacedDigit()
                        Text(effortWord(Int(rpe))).font(.system(size: 10)).foregroundStyle(Theme.soft)
                    }
                    .frame(maxWidth: .infinity)
                    .focusable()
                    .digitalCrownRotation($rpe, from: 1, through: 10, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                    Button { rpe = min(10, rpe + 1) } label: { Image(systemName: "plus") }.frame(width: 36)
                }
                .glass()

                if pending.askFuel {
                    Text("Did you fuel?").font(.headline).padding(.top, 2)
                    HStack(spacing: 4) {
                        ForEach([("all", "All"), ("some", "Some"), ("none", "None")], id: \.0) { key, word in
                            Button { fuel = key } label: {
                                Text(word).font(.caption).frame(maxWidth: .infinity, minHeight: 30)
                                    .background(fuel == key ? Theme.accent.opacity(0.3) : Color.white.opacity(0.06), in: .rect(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Button {
                    Task { await save() }
                } label: {
                    Text(saving ? "Saving…" : "Save").frame(maxWidth: .infinity).foregroundStyle(.black).fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .disabled(feel == nil || saving)
                if failed { Text("Didn't save. Check your connection and try again.").font(.caption2).foregroundStyle(.orange) }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle("Check-in")
    }

    private func effortWord(_ v: Int) -> String {
        switch v {
        case ...2: "Very easy"
        case 3...4: "Easy"
        case 5...6: "Moderate"
        case 7...8: "Hard"
        default: "Max"
        }
    }

    private func save() async {
        guard let feel else { return }
        saving = true
        failed = false
        let ok = await account.checkIn(activity: pending.activity, feel: feel, rpe: Int(rpe), fuel: fuel)
        saving = false
        if ok {
            WKInterfaceDevice.current().play(.success)
            dismiss()
        } else {
            failed = true
            WKInterfaceDevice.current().play(.failure)
        }
    }
}
