import Foundation
import Observation
import RideUI
import Security

/// The Apple TV's sign-in: a device token from typing a pairing code on diastole.app.
/// The token lives in the Keychain; there's no password on the TV.
@MainActor @Observable
final class TVAccount {
    enum State: Equatable { case signedOut, pairing(code: String), signedIn(name: String?) }

    private(set) var state: State = .signedOut
    private(set) var error: String?
    private(set) var today: TodayInfo?
    @ObservationIgnored private var pollTask: Task<Void, Never>?

    static let baseURL: URL = {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "baseURL"), let u = URL(string: s) { return u }
        #endif
        return URL(string: "https://diastole.app")!
    }()

    var token: String? { Keychain.read() }

    init() {
        if token != nil { state = .signedIn(name: UserDefaults.standard.string(forKey: "tv.name")) }
    }

    // MARK: Pairing

    func startPairing() {
        error = nil
        pollTask?.cancel()
        pollTask = Task {
            do {
                struct Start: Decodable { let code: String; let secret: String; let expiresIn: Int; let pollEvery: Int }
                let start: Start = try await post("/api/device/pair", ["kind": "apple_tv", "label": "Apple TV"])
                state = .pairing(code: start.code)
                let deadline = Date().addingTimeInterval(TimeInterval(start.expiresIn))
                while !Task.isCancelled, Date() < deadline {
                    try await Task.sleep(for: .seconds(max(3, start.pollEvery)))
                    struct Poll: Decodable { let status: String; let token: String?; let name: String? }
                    let poll: Poll = try await post("/api/device/pair/poll", ["secret": start.secret])
                    if poll.status == "linked", let t = poll.token {
                        Keychain.write(t)
                        UserDefaults.standard.set(poll.name, forKey: "tv.name")
                        state = .signedIn(name: poll.name)
                        await refreshToday()
                        return
                    }
                    if poll.status == "expired" { break }
                }
                if !Task.isCancelled { startPairing() } // code ran out: show a fresh one
            } catch is CancellationError {
            } catch {
                self.error = "Couldn't reach Diastole. Check the TV's internet connection."
                state = .signedOut
            }
        }
    }

    func signOut() async {
        if token != nil { _ = try? await request("/api/device/signout", method: "POST", body: nil) }
        Keychain.delete()
        today = nil
        state = .signedOut
    }

    // MARK: Data

    func refreshToday() async {
        do {
            let (data, status) = try await request("/api/device/today", method: "GET", body: nil)
            if status == 401 { Keychain.delete(); state = .signedOut; return }
            today = try JSONDecoder().decode(TodayInfo.self, from: data)
        } catch {
            // keep the last one
        }
    }

    func request(_ path: String, method: String, body: Data?, contentType: String = "application/json") async throws -> (Data, Int) {
        var r = URLRequest(url: URL(string: path, relativeTo: Self.baseURL)!)
        r.httpMethod = method
        r.httpBody = body
        r.timeoutInterval = 30
        if body != nil { r.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: r)
        return (data, (resp as? HTTPURLResponse)?.statusCode ?? 0)
    }

    private func post<T: Decodable>(_ path: String, _ body: [String: String]) async throws -> T {
        let (data, status) = try await request(path, method: "POST", body: try JSONSerialization.data(withJSONObject: body))
        guard status == 200 else { throw RideAPIError("HTTP \(status)") }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// RideAPI with the TV's device token.
@MainActor
final class TokenRideAPI: RideAPI {
    let account: TVAccount
    init(account: TVAccount) { self.account = account }

    func rides(id: String?) async throws -> RidesResponse {
        let (data, status) = try await account.request(id.map { "/api/device/rides?id=\($0)" } ?? "/api/device/rides", method: "GET", body: nil)
        guard status == 200 else { throw RideAPIError(status == 401 ? "This TV was signed out. Sign in again." : "Diastole didn't answer (\(status)).") }
        return try JSONDecoder().decode(RidesResponse.self, from: data)
    }

    func upload(_ fit: Data) async throws -> UploadResult {
        let (data, status) = try await account.request("/api/device/upload", method: "POST", body: fit, contentType: "application/octet-stream")
        guard status == 200 else { throw RideAPIError("Upload failed (\(status)).") }
        return try JSONDecoder().decode(UploadResult.self, from: data)
    }

    func openActivity(_ id: String) {} // the TV has no browser; the summary says it's saved
}

/// /api/device/today (short keys keep the Garmin watch payload small).
struct TodayInfo: Decodable {
    struct Workout: Decodable, Identifiable { let id: String; let t: String; let s: String; let why: String?; let l: [String]; let min: Int? }
    struct Readiness: Decodable { let o: String; let t: String? }
    struct Metrics: Decodable { let hrv: Int?; let rhr: Int?; let sl: Int?; let ss: Int?; let bb: Int? }
    struct Next: Decodable { let t: String; let s: String }
    let n: String?
    let r: Readiness?
    let w: [Workout]
    let nx: [Next]
    let m: Metrics
}

enum Keychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.diastole.tv", kSecAttrAccount as String: "device-token"]

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
