import Foundation
import WebKit

/// No connection: instead of a blank screen, today's workout (steps written out, saved when Today
/// last loaded) and a box to jot down a meal. Jotted meals open the meal logger, filled in, once
/// the app is back online.
enum OfflinePage {
    private static let queueKey = "offline.meals"

    static func isOffline(_ error: Error) -> Bool {
        let codes: Set<Int> = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed, NSURLErrorDataNotAllowed]
        return (error as NSError).domain == NSURLErrorDomain && codes.contains((error as NSError).code)
    }

    static func queueMeal(_ text: String) {
        let t = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
        guard !t.isEmpty else { return }
        var list = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
        list.append(t)
        UserDefaults.standard.set(Array(list.suffix(10)), forKey: queueKey)
    }

    /// Back online: the jotted meals, once (the caller opens the logger with them).
    static func takeQueued() -> String? {
        guard let list = UserDefaults.standard.stringArray(forKey: queueKey), !list.isEmpty else { return nil }
        UserDefaults.standard.removeObject(forKey: queueKey)
        return list.joined(separator: "; ")
    }

    static func show(in webView: WKWebView) {
        webView.loadHTMLString(html(), baseURL: AppConfig.url("/offline"))
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func html() -> String {
        let snap = TodayShare.load()
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let today = f.string(from: .now)
        var body = ""
        if let snap, snap["date"] as? String == today {
            let ready = snap["readiness"] as? String ?? "unknown"
            let readyText = ["green": "Ready to go", "yellow": "Go a little easier", "red": "Back off today"][ready] ?? "Readiness unknown"
            body += "<p class=\"ready \(esc(ready))\">● \(esc(readyText))</p>"
            if let w = snap["workout"] as? [String: Any] {
                body += "<h2>\(esc(w["title"] as? String ?? "Today's workout"))\((w["time"] as? String).map { " · \(esc($0))" } ?? "")</h2>"
                let lines = w["lines"] as? [String] ?? []
                body += lines.isEmpty ? "<p class=\"dim\">Steps aren't saved for this one.</p>" : "<ol>" + lines.map { "<li>\(esc($0))</li>" }.joined() + "</ol>"
            } else {
                body += "<h2>No workout today</h2>"
            }
            if let next = snap["next"] as? [[String: Any]], !next.isEmpty {
                body += "<h3>Coming up</h3><ul>" + next.map { "<li>\(esc($0["date"] as? String ?? "")) · \(esc($0["title"] as? String ?? ""))</li>" }.joined() + "</ul>"
            }
        } else {
            body += "<p class=\"dim\">Open Today once while you're online and your workout will be here next time.</p>"
        }
        return """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <style>
        :root{color-scheme:dark}body{margin:0;padding:calc(env(safe-area-inset-top) + 20px) 20px 40px;background:#0b0f0e;color:#f2f5f4;font:16px -apple-system,system-ui}
        .tag{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#fcd34d}h1{font-size:28px;margin:6px 0 16px}h2{font-size:20px;margin:18px 0 8px}h3{font-size:14px;color:#9aa5a1;margin-top:22px}
        .ready{font-weight:600}.green{color:#6ee7b7}.yellow{color:#fcd34d}.red{color:#f87171}.unknown,.dim{color:#9aa5a1}
        ol,ul{padding-left:20px;line-height:1.6}textarea{width:100%;box-sizing:border-box;min-height:70px;margin-top:8px;border-radius:14px;border:1px solid #2a3330;background:#141a18;color:#f2f5f4;padding:10px;font:inherit}
        button{min-height:44px;border:0;border-radius:14px;padding:0 16px;font:600 15px -apple-system;margin-top:8px}.go{background:#6ee7b7;color:#052e1f}.ghost{background:#1c2422;color:#f2f5f4}.box{margin-top:24px;padding:16px;border:1px solid #232c29;border-radius:20px}
        </style></head><body>
        <p class="tag">Offline</p><h1>Today</h1>\(body)
        <div class="box"><strong>Ate something?</strong><p class="dim" style="margin:4px 0 0">Jot it down. It opens in the meal logger, filled in, when you're back online.</p>
        <textarea id="m" maxlength="300" placeholder="e.g. Greek yogurt and a banana"></textarea>
        <button class="go" onclick="var v=document.getElementById('m').value;if(v.trim()){window.webkit.messageHandlers.diastole.postMessage({type:'queueMeal',text:v});document.getElementById('m').value='';document.getElementById('ok').textContent='Saved for later ✓'}">Save for later</button>
        <p id="ok" class="green"></p></div>
        <button class="ghost" onclick="window.webkit.messageHandlers.diastole.postMessage({type:'retry'})">Try again</button>
        </body></html>
        """
    }
}
