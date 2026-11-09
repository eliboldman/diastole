import RideUI
import SwiftUI
import UIKit
import WebKit

/// Opens the native ride screen (Bluetooth trainer control) or the Apple TV hub screen over the
/// web view. The ride screen talks to Diastole through the signed-in web view, so the website
/// keeps owning sign-in.
@MainActor
enum RideCoordinator {
    private static weak var presented: UIViewController?

    static func startRide(id: String?, from webView: WKWebView?) {
        guard presented == nil, let webView else { return }
        let api = WebRideAPI(webView: webView)
        let model = RideFlowModel(api: api, preselect: id)
        present(RideFlowView(model: model, onClose: dismiss))
    }

    static func openHub() {
        guard presented == nil else { return }
        present(HubHostView(onClose: dismiss))
    }

    private static func present<V: View>(_ view: V) {
        let host = UIHostingController(rootView: view)
        host.modalPresentationStyle = .fullScreen
        host.view.backgroundColor = Theme.canvasUI
        presented = host
        UIApplication.shared.topViewController?.present(host, animated: true)
    }

    static func dismiss() {
        presented?.dismiss(animated: true)
        presented = nil
    }
}

/// RideAPI over the page's own fetch (cookies, session refresh and all).
@MainActor
final class WebRideAPI: RideAPI {
    private weak var webView: WKWebView?
    init(webView: WKWebView) { self.webView = webView }

    func rides(id: String?) async throws -> RidesResponse {
        let path = id.map { "/api/ride/plan?id=\($0)" } ?? "/api/ride/plan"
        let js = """
        const r = await fetch(path, { cache: 'no-store' });
        return JSON.stringify({ status: r.status, text: await r.text() });
        """
        let (status, text) = try await call(js, ["path": path])
        guard status == 200 else { throw RideAPIError(status == 401 ? "You're signed out. Sign in again in the app." : "Diastole didn't answer (\(status)).") }
        return try JSONDecoder().decode(RidesResponse.self, from: Data(text.utf8))
    }

    func upload(_ fit: Data) async throws -> UploadResult {
        let js = """
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const r = await fetch('/api/ride/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
        return JSON.stringify({ status: r.status, text: await r.text() });
        """
        let (status, text) = try await call(js, ["b64": fit.base64EncodedString()])
        guard status == 200 else { throw RideAPIError("Upload failed (\(status)).") }
        return try JSONDecoder().decode(UploadResult.self, from: Data(text.utf8))
    }

    func openActivity(_ id: String) {
        webView?.load(URLRequest(url: AppConfig.url("/activity/\(id)")))
    }

    private func call(_ js: String, _ args: [String: Any]) async throws -> (Int, String) {
        guard let webView else { throw RideAPIError("The app page closed. Try again.") }
        guard let out = try await webView.callAsyncJavaScript(js, arguments: args, contentWorld: .page) as? String,
              let parsed = try JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any] else {
            throw RideAPIError("Couldn't reach Diastole.")
        }
        return ((parsed["status"] as? Int) ?? 0, (parsed["text"] as? String) ?? "")
    }
}
