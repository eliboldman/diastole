import SwiftUI
import UIKit

enum AppConfig {
    /// The web app the shell wraps. Debug builds can point elsewhere with the launch argument
    /// `-baseURL http://localhost:3999` (Edit Scheme → Run → Arguments).
    static let baseURL: URL = {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "baseURL"), let u = URL(string: s) { return u }
        #endif
        return URL(string: "https://diastole.app")!
    }()

    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"

    static func url(_ path: String) -> URL { URL(string: path, relativeTo: baseURL)!.absoluteURL }

    /// Pages served by Diastole itself stay in the app; everything else opens in Safari.
    static func isOwn(_ url: URL) -> Bool { url.host() == baseURL.host() && url.port == baseURL.port }

    /// Cookies set by Diastole's host (the cookie domain may carry a leading dot).
    static func isOwnCookie(_ c: HTTPCookie) -> Bool {
        let host = baseURL.host() ?? ""
        let domain = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
        return host == domain || host.hasSuffix("." + domain)
    }
}

enum Theme {
    static let canvasUI = UIColor(red: 0x0d / 255, green: 0x15 / 255, blue: 0x13 / 255, alpha: 1)
    static let canvas = Color(uiColor: canvasUI)
    static let accentUI = UIColor(red: 0.431, green: 0.894, blue: 0.718, alpha: 1)
}

extension UIApplication {
    /// The view controller on top, for presenting alerts from the web views.
    var topViewController: UIViewController? {
        let window = connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        var top = window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}
