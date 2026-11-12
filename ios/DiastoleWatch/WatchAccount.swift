import Foundation
import Observation
import Security
import WatchConnectivity

/// The watch's sign-in and data. The iPhone app hands over a device token (WatchConnectivity), so
/// there's nothing to type; without a nearby iPhone it can show a pairing code like the Apple TV.
@MainActor @Observable
final class WatchAccount {
    enum State: Equatable { case signedOut, pairing(code: String), signedIn }

    private(set) var state: State = .signedOut
    private(set) var today: Today?
    private(set) var loading = false
    private(set) var offline = false
    private(set) var lastUpdated: Date?
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private let phone = PhoneLink()

    static let baseURL = URL(string: "https://diastole.app")!
    var token: String? { Keychain.read() }

    init() {
        if token != nil { state = .signedIn }
        phone.onToken = { [weak self] token in self?.adopt(token) }
        phone.onSignOut = { [weak self] in self?.forget() }
        phone.start()
        #if DEBUG
        if token == nil, UserDefaults.standard.bool(forKey: "pairOnLaunch") { startPairing() } // simulator testing
        #endif
    }

    /// Ask the iPhone app for a token (it answers when it's open and signed in).
    func askPhone() { phone.requestToken() }

    private func adopt(_ token: String) {
        pollTask?.cancel()
        Keychain.write(token)
        state = .signedIn
        Task { await refresh() }
    }

    private func forget() {
        pollTask?.cancel()
        Keychain.delete()
        today = nil
        state = .signedOut
    }

    // MARK: Pairing code (no iPhone nearby)

    func startPairing() {
        pollTask?.cancel()
        pollTask = Task {
            do {
                let (data, status) = try await request("/api/device/pair", method: "POST", body: ["kind": "apple_watch", "label": "Apple Watch"])
                guard status == 200, let j = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let code = j["code"] as? String, let secret = j["secret"] as? String else { throw URLError(.badServerResponse) }
                state = .pairing(code: code)
                let deadline = Date().addingTimeInterval(TimeInterval((j["expiresIn"] as? Int) ?? 600))
                while !Task.isCancelled, Date() < deadline {
                    try await Task.sleep(for: .seconds(max(3, (j["pollEvery"] as? Int) ?? 5)))
                    let (pd, _) = try await request("/api/device/pair/poll", method: "POST", body: ["secret": secret])
                    let p = (try? JSONSerialization.jsonObject(with: pd) as? [String: Any]) ?? [:]
                    if p["status"] as? String == "linked", let t = p["token"] as? String { return adopt(t) }
                    if p["status"] as? String == "expired" { break }
                }
                if !Task.isCancelled { state = .signedOut }
            } catch is CancellationError {
            } catch {
                offline = true
                state = .signedOut
            }
        }
    }

    func cancelPairing() {
        pollTask?.cancel()
        state = .signedOut
    }

    // MARK: Data

    func refresh() async {
        guard token != nil, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let (data, status) = try await request("/api/device/today?apple=1", method: "GET", body: nil)
            if status == 401 { return forget() }
            if status == 200, let t = Today(data: data) {
                today = t
                lastUpdated = Date()
                offline = false
            }
        } catch {
            offline = true // keep showing the last copy
        }
    }

    /// The post-workout check-in. Returns false when it didn't save.
    func checkIn(activity: String, feel: Int, rpe: Int, fuel: String?) async -> Bool {
        var body: [String: Any] = ["a": activity, "feel": feel, "rpe": rpe]
        if let fuel { body["fuel"] = fuel }
        guard let (_, status) = try? await request("/api/device/checkin", method: "POST", body: body), status == 200 else { return false }
        await refresh()
        return true
    }

    private func request(_ path: String, method: String, body: [String: Any]?) async throws -> (Data, Int) {
        var r = URLRequest(url: URL(string: path, relativeTo: Self.baseURL)!)
        r.httpMethod = method
        r.timeoutInterval = 25
        if let body {
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: r)
        return (data, (resp as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

/// WatchConnectivity with the iPhone app: it sends {token} after linking, {signout} on sign-out.
final class PhoneLink: NSObject, WCSessionDelegate {
    var onToken: ((String) -> Void)?
    var onSignOut: (() -> Void)?

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func requestToken() {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return }
        s.sendMessage(["want": "token"], replyHandler: nil, errorHandler: nil)
    }

    private func apply(_ context: [String: Any]) {
        if context["signout"] != nil { onSignOut?() } else if let t = context["token"] as? String, !t.isEmpty, t != Keychain.read() { onToken?(t) }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let token = session.receivedApplicationContext["token"] as? String
        let out = session.receivedApplicationContext["signout"] != nil
        Task { @MainActor in
            if out { self.apply(["signout": true]) } else if let token { self.apply(["token": token]) }
            if Keychain.read() == nil { self.requestToken() }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        let token = context["token"] as? String
        let out = context["signout"] != nil
        Task { @MainActor in out ? self.apply(["signout": true]) : self.apply(["token": token ?? ""]) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in if Keychain.read() == nil { self.requestToken() } }
    }
}

enum Keychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.diastole.watch", kSecAttrAccount as String: "device-token"]

    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func write(_ token: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() { SecItemDelete(query as CFDictionary) }
}
