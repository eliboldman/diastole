import AVFoundation
import UIKit
import VisionKit
import WebKit

/// Scans a food barcode with the camera (VisionKit) and hands the number back to the page,
/// which looks it up. Nothing but the number leaves the phone.
final class BarcodeScanner: NSObject, DataScannerViewControllerDelegate {
    static let shared = BarcodeScanner()
    private weak var webView: WKWebView?
    private var scanner: DataScannerViewController?
    private var done = false

    func start(from webView: WKWebView?) {
        guard scanner == nil else { return }
        self.webView = webView
        Task {
            let allowed = await AVCaptureDevice.requestAccess(for: .video)
            guard allowed, DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
                return send(["error": allowed ? "unavailable" : "denied"])
            }
            let vc = DataScannerViewController(
                recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
                qualityLevel: .balanced,
                recognizesMultipleItems: false,
                isHighFrameRateTrackingEnabled: false,
                isHighlightingEnabled: true
            )
            vc.delegate = self
            vc.title = "Scan a barcode"
            vc.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self] _ in self?.finish(nil) })
            let nav = UINavigationController(rootViewController: vc)
            nav.modalPresentationStyle = .fullScreen
            done = false
            scanner = vc
            UIApplication.shared.topViewController?.present(nav, animated: true) { try? vc.startScanning() }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case let .barcode(barcode) = item, let code = barcode.payloadStringValue {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                return finish(code)
            }
        }
    }

    private func finish(_ code: String?) {
        guard !done else { return }
        done = true
        scanner?.stopScanning()
        scanner?.navigationController?.dismiss(animated: true)
        scanner = nil
        send(code.map { ["code": $0] } ?? ["error": "cancelled"])
    }

    private func send(_ detail: [String: String]) {
        guard let webView, let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('diastole:barcode', { detail: \(json) }))")
    }
}
