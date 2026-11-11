import SwiftUI
import TrainerKit

/// Choose a workout → connect → ride → save. Shared by iPhone/iPad and Apple TV.
@MainActor @Observable
public final class RideFlowModel {
  public enum Screen: Equatable { case loading, choose, connect, ride, summary, failed(String) }
  public enum Upload: Equatable { case idle, uploading, saved(String?), failed(String) }

  public internal(set) var screen: Screen = .loading
  public private(set) var rides: [RidePlan] = []
  public private(set) var ftp: Int?
  public private(set) var miles = true
  public private(set) var selected: RidePlan?
  public private(set) var courses: [RideCourse] = []
  public private(set) var massKg: Double = 84
  /// Riding a race course instead of a workout.
  public private(set) var selectedCourse: RideCourse?
  /// Course riding: share of the real grade the trainer applies (remembered on this device).
  public var difficulty: Double = DeviceMemory.difficulty { didSet { DeviceMemory.difficulty = difficulty } }
  public private(set) var session: RideSession?
  public private(set) var upload: Upload = .idle
  public private(set) var pendingCount = 0
  /// A copy of the last ride file to share (Strava, Garmin Connect, Files) from the summary.
  public private(set) var shareURL: URL?
  public var rollers = false
  /// Apple TV: ride through an iPhone hub instead of the TV's own Bluetooth.
  public var useHub = false

  public let bluetooth = TrainerConnection()
  public let hub: HubClient?
  @ObservationIgnored let api: RideAPI
  @ObservationIgnored private let preselect: String?
  @ObservationIgnored private let preselectCourse: String?
  @ObservationIgnored private var lastFile: URL?

  /// `allowHub` on Apple TV; `preselect` = a planned workout id to jump straight to;
  /// `preselectCourse` = a race id whose bike course to ride.
  public init(api: RideAPI, preselect: String? = nil, preselectCourse: String? = nil, allowHub: Bool = false) {
    self.api = api
    self.preselect = preselect
    self.preselectCourse = preselectCourse
    self.hub = allowHub ? HubClient() : nil
  }

  var link: TrainerLink {
    if useHub, let hub { return hub }
    return bluetooth
  }

  public func load() async {
    screen = .loading
    pendingCount = PendingRides.all().count
    do {
      let r = try await api.rides(id: nil)
      rides = r.rides
      ftp = r.ftp
      miles = r.units != "km"
      courses = r.courses ?? []
      massKg = r.massKg ?? 84
      if let id = preselectCourse, let c = courses.first(where: { $0.id == id }) { chooseCourse(c) }
      else if let id = preselect, let plan = rides.first(where: { $0.id == id }) { choose(plan) } else { screen = .choose }
    } catch {
      screen = .failed(error.localizedDescription)
    }
    await retryPending()
  }

  /// nil = free ride.
  public func choose(_ plan: RidePlan?) {
    selected = plan
    selectedCourse = nil
    connect()
  }

  /// Ride a race's bike course.
  public func chooseCourse(_ course: RideCourse) {
    selected = nil
    selectedCourse = course
    connect()
  }

  private func connect() {
    screen = .connect
    if bluetooth.state != .connected { bluetooth.reconnect(trainer: DeviceMemory.trainer, strap: DeviceMemory.strap) }
    rollers = DeviceMemory.rollers(DeviceMemory.trainer)
  }

  public var canStart: Bool { useHub ? hub?.state == .connected : bluetooth.state == .connected }

  public func start() {
    let s = selectedCourse.map { RideSession(course: $0, massKg: massKg, link: link, rollers: rollers, difficulty: difficulty) }
      ?? RideSession(title: selected?.title ?? "Free ride", steps: selected?.steps ?? [], link: link, rollers: rollers)
    s.onFinish = { [weak self] in self?.end() }
    session = s
    upload = .idle
    screen = .ride
    s.start()
    setIdleTimer(disabled: true)
  }

  public func end() {
    guard let s = session, screen == .ride else { return }
    let data = s.finish()
    setIdleTimer(disabled: false)
    screen = .summary
    guard s.samples.count >= 60, !data.isEmpty else { upload = .failed("Rides under a minute aren't saved."); return }
    lastFile = PendingRides.save(data)
    shareURL = Self.shareCopy(data, title: s.title)
    Task { await send(data, file: lastFile) }
  }

  /// A temporary, nicely named copy (the pending copy is deleted once uploaded).
  private static func shareCopy(_ data: Data, title: String) -> URL? {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    let safe = title.replacingOccurrences(of: "[^A-Za-z0-9 ._-]", with: "", options: .regularExpression).prefix(60)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(f.string(from: Date())) \(safe.isEmpty ? "Diastole ride" : String(safe)).fit")
    return (try? data.write(to: url)) != nil ? url : nil
  }

  public func retryUpload() {
    guard let url = lastFile, let data = try? Data(contentsOf: url) else { return }
    Task { await send(data, file: url) }
  }

  public func backToList() {
    session = nil
    screen = .choose
  }

  private func send(_ data: Data, file: URL?) async {
    upload = .uploading
    do {
      let r = try await api.upload(data)
      if r.status == "unreadable" { upload = .failed("The ride file couldn't be read."); return }
      if let file { try? FileManager.default.removeItem(at: file) }
      upload = .saved(r.id)
    } catch {
      upload = .failed("Saved on this device. It will upload next time you open rides. (\(error.localizedDescription))")
    }
    pendingCount = PendingRides.all().count
  }

  /// Rides that failed to upload earlier.
  private func retryPending() async {
    for url in PendingRides.all() where url != lastFile {
      guard let data = try? Data(contentsOf: url) else { continue }
      if let r = try? await api.upload(data), r.status != "unreadable" { try? FileManager.default.removeItem(at: url) }
    }
    pendingCount = PendingRides.all().count
  }

  private func setIdleTimer(disabled: Bool) {
    #if canImport(UIKit)
    UIApplication.shared.isIdleTimerDisabled = disabled
    #endif
  }
}

#if canImport(UIKit)
import UIKit
#endif

public struct RideFlowView: View {
  @Bindable var model: RideFlowModel
  let onClose: () -> Void

  public init(model: RideFlowModel, onClose: @escaping () -> Void) {
    self.model = model
    self.onClose = onClose
  }

  public var body: some View {
    Group {
      switch model.screen {
      case .loading:
        ProgressView("Loading your rides…").frame(maxWidth: .infinity, maxHeight: .infinity)
      case let .failed(msg):
        VStack(spacing: 16) {
          Text("Couldn't load your rides").font(.title2.weight(.semibold))
          Text(msg).foregroundStyle(RidePalette.dim).multilineTextAlignment(.center)
          Button("Try again") { Task { await model.load() } }.buttonStyle(.borderedProminent)
          Button("Free ride instead") { model.choose(nil) }.buttonStyle(.bordered)
        }
        .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
      case .choose: chooser
      case .connect: connector
      case .ride:
        if let s = model.session {
          if s.isCourse { CourseDashboard(session: s, link: model.link, miles: model.miles, onEnd: model.end) }
          else { RideDashboard(session: s, link: model.link, ftp: model.selected?.ftp ?? model.ftp, miles: model.miles, onEnd: model.end) }
        }
      case .summary: summary
      }
    }
    .background(RidePalette.canvas.ignoresSafeArea())
    .foregroundStyle(.white)
    .preferredColorScheme(.dark)
    .task { if model.screen == .loading { await model.load() } }
  }

  private func page<C: View>(_ title: String, back: (() -> Void)?, @ViewBuilder content: () -> C) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        HStack {
          if let back { Button { back() } label: { Label("Back", systemImage: "chevron.left") }.buttonStyle(.bordered) }
          Spacer()
          Button { model.bluetooth.disconnectAll(); model.hub?.disconnect(); onClose() } label: { Label("Close", systemImage: "xmark") }.buttonStyle(.bordered)
        }
        Text(title).font(.largeTitle.weight(.semibold))
        content()
      }
      .padding(24)
      .frame(maxWidth: 900, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
  }

  private var chooser: some View {
    page("Ride", back: nil) {
      if model.pendingCount > 0 {
        Text("\(model.pendingCount) ride\(model.pendingCount == 1 ? "" : "s") waiting to upload").font(.footnote).foregroundStyle(RidePalette.amber)
      }
      if model.rides.isEmpty {
        Text("No bike workouts from your coach this week.").foregroundStyle(RidePalette.dim)
      }
      ForEach(model.rides) { plan in
        Button { model.choose(plan) } label: {
          VStack(alignment: .leading, spacing: 10) {
            HStack {
              Text(plan.title).font(.headline).lineLimit(2)
              Spacer()
              Text(dayLabel(plan.date)).font(.subheadline).foregroundStyle(RidePalette.dim)
            }
            WorkoutProfile(steps: plan.steps, ftp: plan.ftp, index: -1, compact: true).frame(height: 40)
            HStack(spacing: 12) {
              if plan.plannedSeconds > 0 { Text(clock(plan.plannedSeconds) + (plan.hasOpenSteps ? "+" : "")).font(.subheadline.monospacedDigit()) }
              Text("\(plan.steps.count) steps").font(.subheadline).foregroundStyle(RidePalette.dim)
            }
            if let why = plan.why { Text(why).font(.footnote).foregroundStyle(RidePalette.dim).lineLimit(3).multilineTextAlignment(.leading) }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(6)
        }
        .buttonStyle(.bordered)
      }
      if !model.courses.isEmpty {
        Text("Race courses").font(.title3.weight(.semibold)).padding(.top, 8)
        Text("Ride your race's bike course: the trainer feels every climb and descent.").font(.footnote).foregroundStyle(RidePalette.dim)
        ForEach(model.courses) { c in
          Button { model.chooseCourse(c) } label: {
            VStack(alignment: .leading, spacing: 10) {
              HStack {
                Text(c.title).font(.headline).lineLimit(2)
                Spacer()
                Text(dayLabel(c.date)).font(.subheadline).foregroundStyle(RidePalette.dim)
              }
              CourseProfile(course: c, compact: true).frame(height: 44)
              HStack(spacing: 12) {
                Text("\(distanceText(c.distanceM, miles: model.miles)) \(model.miles ? "mi" : "km")").font(.subheadline.monospacedDigit())
                Text("\(Int((model.miles ? c.gainM * 3.28084 : c.gainM).rounded())) \(model.miles ? "ft" : "m") up").font(.subheadline.monospacedDigit()).foregroundStyle(RidePalette.dim)
                if !c.climbs.isEmpty { Text("\(c.climbs.count) climb\(c.climbs.count == 1 ? "" : "s")").font(.subheadline).foregroundStyle(RidePalette.dim) }
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(6)
          }
          .buttonStyle(.bordered)
        }
      }
      Button { model.choose(nil) } label: {
        Label("Free ride", systemImage: "bicycle").frame(maxWidth: .infinity, alignment: .leading).padding(6)
      }
      .buttonStyle(.bordered)
    }
  }

  /// Course riding: how much of the real grade the trainer applies. Buttons, not a slider (tvOS has none).
  private var difficultyPicker: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Trainer difficulty").font(.headline)
        Spacer()
        Button { model.difficulty = max(0, ((model.difficulty - 0.1) * 10).rounded() / 10) } label: { Image(systemName: "minus") }.buttonStyle(.bordered)
          .accessibilityLabel("Less")
        Text("\(Int((model.difficulty * 100).rounded()))%").font(.headline.monospacedDigit()).frame(minWidth: 56)
        Button { model.difficulty = min(1, ((model.difficulty + 0.1) * 10).rounded() / 10) } label: { Image(systemName: "plus") }.buttonStyle(.bordered)
          .accessibilityLabel("More")
      }
      Text("How much of each climb the trainer makes you feel. 50% is a good start; 100% is the real grade, which can run out of gears on steep pitches. Your speed and distance always use the real grade.")
        .font(.footnote).foregroundStyle(RidePalette.dim)
    }
  }

  private var connector: some View {
    page(model.selectedCourse?.title ?? model.selected?.title ?? "Free ride", back: { model.screen = .choose }) {
      if let c = model.selectedCourse {
        CourseProfile(course: c).frame(height: 110)
        if c.hasTrack { CourseMap(course: c).frame(height: 200) }
        Text("\(distanceText(c.distanceM, miles: model.miles)) \(model.miles ? "mi" : "km") · \(Int((model.miles ? c.gainM * 3.28084 : c.gainM).rounded())) \(model.miles ? "ft" : "m") of climbing")
          .font(.subheadline.monospacedDigit()).foregroundStyle(RidePalette.dim)
        difficultyPicker
      }
      if let plan = model.selected {
        WorkoutProfile(steps: plan.steps, ftp: plan.ftp, index: -1).frame(height: 80)
        if !plan.steps.contains(where: { $0.targetWatts != nil }) {
          Text("This workout has no power targets, so the trainer stays in free-ride mode and shows your coach's targets as hints.").font(.footnote).foregroundStyle(RidePalette.dim)
        }
      }
      if let hub = model.hub {
        Picker("Connect through", selection: $model.useHub) {
          Text("This Apple TV").tag(false)
          Text("My iPhone (hub)").tag(true)
        }
        .pickerStyle(.segmented)
        if model.useHub { HubConnectView(hub: hub) } else { DevicePicker(connection: model.bluetooth, rollers: $model.rollers) }
      } else {
        DevicePicker(connection: model.bluetooth, rollers: $model.rollers)
      }
      Button { model.start() } label: { Text("Start ride").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6) }
        .buttonStyle(.borderedProminent).tint(RidePalette.accent).foregroundStyle(.black)
        .disabled(!model.canStart)
    }
  }

  private var summary: some View {
    let s = model.session
    let samples = s?.samples ?? []
    let watts = samples.compactMap(\.powerW)
    let hr = samples.compactMap(\.heartRateBpm)
    return page("Nice work", back: nil) {
      LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        tile("Time", clock(samples.count))
        tile("Distance", model.miles ? String(format: "%.1f mi", (s?.distanceM ?? 0) / 1609.344) : String(format: "%.1f km", (s?.distanceM ?? 0) / 1000))
        tile("Avg power", watts.isEmpty ? "–" : "\(watts.reduce(0, +) / watts.count) W")
        tile("Avg heart rate", hr.isEmpty ? "–" : "\(hr.reduce(0, +) / hr.count) bpm")
      }
      switch model.upload {
      case .idle, .uploading: HStack { ProgressView(); Text("Saving to Diastole…").foregroundStyle(RidePalette.dim) }
      case let .saved(id):
        Text("Saved to Diastole. Your coach can see it now.").foregroundStyle(RidePalette.accent)
        if let id { Button("View the ride") { model.api.openActivity(id); onClose() }.buttonStyle(.bordered) }
      case let .failed(msg):
        Text(msg).foregroundStyle(RidePalette.amber)
        Button("Try again") { model.retryUpload() }.buttonStyle(.bordered)
      }
      #if os(iOS)
      if let url = model.shareURL {
        ShareLink(item: url) { Label("Share ride file", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered)
        Text("Send it to Strava, Garmin Connect or Files.\(s?.isCourse == true ? " Course rides are marked virtual, so they don't count toward segments or outdoor records." : "")")
          .font(.footnote).foregroundStyle(RidePalette.dim)
      }
      #endif
      Button("Done") { model.backToList(); onClose() }.buttonStyle(.borderedProminent).tint(RidePalette.accent).foregroundStyle(.black)
    }
  }

  private func tile(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased()).font(.caption2.weight(.semibold)).tracking(1.2).foregroundStyle(RidePalette.dim)
      Text(value).font(.title2.monospacedDigit().weight(.semibold))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(RoundedRectangle(cornerRadius: 20).fill(RidePalette.card))
  }

  private func dayLabel(_ iso: String) -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: iso) else { return iso }
    if Calendar.current.isDateInToday(d) { return "Today" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
    if Calendar.current.isDateInYesterday(d) { return "Yesterday" }
    let out = DateFormatter(); out.dateFormat = "EEE MMM d"
    return out.string(from: d)
  }
}
