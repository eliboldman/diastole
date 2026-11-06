import SwiftUI
import UIKit
import WebKit

/// One web view showing Diastole pages. All pages share the default data store, so they share the
/// web sign-in. The page knows it's inside the app (html[data-app="ios"]).
final class WebPage: NSObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    let root: URL
    private let refresh = UIRefreshControl()

    init(root: URL) {
        self.root = root
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "Mobile/15E148 DiastoleiOS/\(AppConfig.version)"
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addUserScript(
            WKUserScript(source: "document.documentElement.dataset.app = 'ios';", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        // The left-edge swipe opens the page menu (handled by the page), so no swipe-back here; the menu has Back.
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = Theme.canvasUI
        webView.underPageBackgroundColor = Theme.canvasUI
        webView.scrollView.backgroundColor = Theme.canvasUI
        // The page handles safe areas itself (viewport-fit=cover + env(safe-area-inset-*)).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        webView.isInspectable = true // Safari → Develop → Simulator
        #endif

        refresh.tintColor = Theme.accentUI
        refresh.addTarget(self, action: #selector(pulled), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        webView.load(URLRequest(url: root))
    }

    @objc private func pulled() { webView.reload() }

    /// Back to the first page, or to the top if already there.
    func reselect() {
        if webView.url?.path == root.path {
            webView.evaluateJavaScript("window.scrollTo({ top: 0, behavior: 'smooth' })")
        } else {
            webView.load(URLRequest(url: root))
        }
    }

    func open(_ url: URL) { webView.load(URLRequest(url: url)) }

    // MARK: navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        switch scheme {
        case "http", "https":
            // Our pages, embedded frames, and redirects (e.g. Garmin's sign-in round trip) stay here;
            // a link the user taps to another site opens in Safari.
            if AppConfig.isOwn(url) || action.targetFrame?.isMainFrame == false || action.navigationType != .linkActivated {
                return decisionHandler(.allow)
            }
        case "about", "blob", "data":
            return decisionHandler(.allow)
        default:
            break // mailto:, tel:, sms:
        }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh.endRefreshing()
        PushCenter.shared.pageLoaded(self)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { refresh.endRefreshing() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { refresh.endRefreshing() }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // MARK: UI

    /// target=_blank / window.open: open in Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if AppConfig.isOwn(url) { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    /// Voice notes and photos: the OS asks once for the mic/camera; don't ask again per page.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == AppConfig.baseURL.host() ? .grant : .deny)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        present(message, actions: [UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }], fallback: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        present(message, actions: [
            UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) },
            UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) },
        ], fallback: { completionHandler(false) })
    }

    private func present(_ message: String, actions: [UIAlertAction], fallback: @escaping () -> Void) {
        guard let top = UIApplication.shared.topViewController else { return fallback() }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        actions.forEach(alert.addAction)
        top.present(alert, animated: true)
    }
}

/// Hosts a page's web view in SwiftUI. The web view lives in the WebPage, so SwiftUI can rebuild this
/// wrapper without reloading the page.
struct WebContainer: UIViewRepresentable {
    let page: WebPage

    func makeUIView(context: Context) -> UIView {
        let host = UIView()
        host.backgroundColor = Theme.canvasUI
        let web = page.webView
        web.removeFromSuperview()
        web.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            web.topAnchor.constraint(equalTo: host.topAnchor),
            web.bottomAnchor.constraint(equalTo: host.bottomAnchor),
        ])
        return host
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
