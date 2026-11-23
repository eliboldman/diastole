import CoreBluetooth
import UIKit
import WebKit

/// Live heart rate for Diastole's web pages (the Breathe player). The page asks with {type: "hrStart"} /
/// {type: "hrStop"}; this finds a standard Bluetooth heart-rate sensor (a Garmin watch with Broadcast
/// Heart Rate on, a chest strap, an armband), and sends each reading back as a 'diastole:hr' event:
/// {bpm, rr: [ms], device, status: "connected" | "lost" | "idle", error}. The page only offers it when
/// window.__diastoleCaps includes "hr" (WebPage sets that), so older app builds never show the button.
final class HeartRateBridge: NSObject {
    static let shared = HeartRateBridge()

    private static let service = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")
    private static let scanSeconds: UInt64 = 4

    private weak var webView: WKWebView?
    private var central: CBCentralManager?
    private var sensor: CBPeripheral?
    private var found: [UUID: (p: CBPeripheral, name: String, rssi: Int)] = [:]
    private var wanted = false // the page wants heart rate (start until stop)
    private var scanning = false
    private var scanToken = 0

    func start(from webView: WKWebView?) {
        self.webView = webView
        wanted = true
        if let sensor, sensor.state == .connected {
            send(["status": "connected", "device": sensor.name ?? "Heart-rate sensor"])
            return
        }
        if central == nil {
            // The first time, iOS asks for Bluetooth permission; the state callback then starts the scan.
            central = CBCentralManager(delegate: self, queue: .main)
        } else {
            onState()
        }
    }

    func stop() {
        wanted = false
        scanning = false
        scanToken += 1
        central?.stopScan()
        if let sensor { central?.cancelPeripheralConnection(sensor) }
        sensor = nil
        found = [:]
    }

    // MARK: flow

    private func onState() {
        guard wanted, let central else { return }
        switch central.state {
        case .poweredOn: scan()
        case .poweredOff: fail("Bluetooth is off. Turn it on in Control Center and try again.")
        case .unauthorized: fail("Diastole doesn't have Bluetooth access. Turn it on in Settings › Diastole › Bluetooth.")
        case .unsupported: fail("This iPhone can't connect to Bluetooth sensors.")
        default: break // resetting / unknown: wait for the next update
        }
    }

    private func scan() {
        guard let central, !scanning else { return }
        if let old = sensor { central.cancelPeripheralConnection(old) } // a lost sensor from before
        sensor = nil
        found = [:]
        // A sensor this iPhone is already connected to (another app) can still be shared.
        for p in central.retrieveConnectedPeripherals(withServices: [Self.service]) {
            found[p.identifier] = (p, p.name ?? "Heart-rate sensor", 0)
        }
        scanning = true
        scanToken += 1
        let token = scanToken
        central.scanForPeripherals(withServices: [Self.service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: Self.scanSeconds * 1_000_000_000)
            guard token == self.scanToken, self.scanning else { return }
            self.finishScan()
        }
    }

    private func finishScan() {
        scanning = false
        central?.stopScan()
        let list = found.values.sorted { $0.rssi > $1.rssi }
        if list.isEmpty {
            return fail("No heart-rate sensor found. On a Garmin, turn on Broadcast Heart Rate, keep it close, and try again.")
        }
        if list.count == 1 { return connect(list[0].p, name: list[0].name) }
        guard let top = UIApplication.shared.topViewController else { return connect(list[0].p, name: list[0].name) }
        let sheet = UIAlertController(title: "Heart-rate sensors", message: "Pick yours", preferredStyle: .actionSheet)
        for d in list {
            sheet.addAction(UIAlertAction(title: d.name, style: .default) { _ in self.connect(d.p, name: d.name) })
        }
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            self.wanted = false
            self.send(["status": "idle"])
        })
        sheet.popoverPresentationController?.sourceView = top.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
        top.present(sheet, animated: true)
    }

    private func connect(_ p: CBPeripheral, name: String) {
        sensor = p
        p.delegate = self
        central?.connect(p)
    }

    private func fail(_ message: String) {
        wanted = false
        send(["status": "idle", "error": message])
    }

    private func send(_ detail: [String: Any]) {
        guard let webView else { return stop() } // the page is gone: stop listening
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('diastole:hr', { detail: \(json) }))")
    }

    /// Heart Rate Measurement (0x2A37): flags, bpm (8 or 16 bit), optional energy, optional RR intervals (1/1024 s).
    static func parse(_ data: Data) -> (bpm: Int, rr: [Int])? {
        let b = [UInt8](data)
        guard b.count >= 2 else { return nil }
        let flags = b[0]
        var i = 1
        let bpm: Int
        if flags & 0x01 != 0 {
            guard b.count >= 3 else { return nil }
            bpm = Int(b[1]) | Int(b[2]) << 8
            i = 3
        } else {
            bpm = Int(b[1])
            i = 2
        }
        if flags & 0x08 != 0 { i += 2 }
        var rr: [Int] = []
        if flags & 0x10 != 0 {
            while i + 1 < b.count {
                rr.append(Int((Double(Int(b[i]) | Int(b[i + 1]) << 8) / 1024 * 1000).rounded()))
                i += 2
            }
        }
        return bpm > 0 ? (bpm, rr) : nil
    }

    // MARK: callbacks (main queue)

    fileprivate func onDiscover(_ p: CBPeripheral, name: String?, rssi: Int) {
        guard scanning else { return }
        found[p.identifier] = (p, name ?? p.name ?? "Heart-rate sensor", rssi)
    }

    fileprivate func onConnect(_ p: CBPeripheral) {
        guard p == sensor else { return }
        p.discoverServices([Self.service])
    }

    fileprivate func onDisconnect(_ p: CBPeripheral) {
        guard p == sensor else { return }
        if wanted {
            send(["status": "lost"])
            central?.connect(p) // iOS keeps trying until it's back in range
        }
    }

    fileprivate func onServices(_ p: CBPeripheral) {
        guard let s = p.services?.first(where: { $0.uuid == Self.service }) else { return fail("That device doesn't send heart rate.") }
        p.discoverCharacteristics([Self.measurement], for: s)
    }

    fileprivate func onCharacteristics(_ p: CBPeripheral, _ s: CBService) {
        guard let c = s.characteristics?.first(where: { $0.uuid == Self.measurement }) else { return fail("That device doesn't send heart rate.") }
        p.setNotifyValue(true, for: c)
        send(["status": "connected", "device": p.name ?? "Heart-rate sensor"])
    }

    fileprivate func onValue(_ p: CBPeripheral, _ c: CBCharacteristic) {
        guard wanted, p == sensor, c.uuid == Self.measurement, let data = c.value, let m = Self.parse(data) else { return }
        send(["bpm": m.bpm, "rr": m.rr, "device": p.name ?? "Heart-rate sensor"])
    }
}

extension HeartRateBridge: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated { onState() }
    }
    nonisolated func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let r = rssi.intValue
        nonisolated(unsafe) let p_ = p
        MainActor.assumeIsolated { onDiscover(p_, name: name, rssi: r) }
    }
    nonisolated func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        nonisolated(unsafe) let p_ = p
        MainActor.assumeIsolated { onConnect(p_) }
    }
    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        nonisolated(unsafe) let p_ = p
        MainActor.assumeIsolated { onDisconnect(p_) }
    }
    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        nonisolated(unsafe) let p_ = p
        MainActor.assumeIsolated { onDisconnect(p_) }
    }
    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        nonisolated(unsafe) let p_ = p
        MainActor.assumeIsolated { onServices(p_) }
    }
    nonisolated func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        nonisolated(unsafe) let p_ = p
        nonisolated(unsafe) let s_ = s
        MainActor.assumeIsolated { onCharacteristics(p_, s_) }
    }
    nonisolated func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        nonisolated(unsafe) let p_ = p
        nonisolated(unsafe) let c_ = c
        MainActor.assumeIsolated { onValue(p_, c_) }
    }
}
