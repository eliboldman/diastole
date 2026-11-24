import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// A guided session. A circle grows as you breathe in and shrinks as you breathe out, with a buzz at
// every change (long = in, two short = out, a tap = hold/pause) so eyes can stay closed. The ring
// around the edge fills as the session goes. Wrist heart rate (and beat-to-beat intervals where the
// watch gives them) is recorded for the summary. Start pauses; Back offers resume / finish / discard.
class PlayerView extends WatchUi.View {
    const LEAD_MS = 3000; // "Get ready" before the first breath
    const TICK_MS = 100;

    var kind as String;
    var totalMs as Number;
    var pace as Float;

    // Clock (ms of breathing done, not counting pauses or the lead-in).
    hidden var acc as Number = 0;
    hidden var since as Number = 0; // System.getTimer() when last resumed
    var running as Boolean = false;
    var started as Boolean = false;
    var finished as Boolean = false;
    hidden var leadLeft as Number = LEAD_MS;

    // The breath cycle in progress.
    hidden var phases as Array<Array> = [] as Array<Array>;
    hidden var phaseIdx as Number = 0;
    hidden var phaseStart as Number = 0; // clock ms
    hidden var cycleStart as Number = 0;
    hidden var cyclePace as Float = 5.5;
    hidden var banner as String? = null; // "Now 6.0 a minute" for a few seconds
    hidden var bannerUntil as Number = 0;

    // Heart rate.
    var ts as Array = []; // seconds into the session (Float)
    var bpm as Array = [];
    var rr as Array = [];
    var hrNow as Number? = null;

    hidden var timer as Timer.Timer?;

    function initialize(kind as String, minutes as Number) {
        View.initialize();
        self.kind = kind;
        totalMs = kind.equals("finder") ? Plan.FINDER_STEP_MS * 5 : minutes * 60000;
        pace = Net.pace();
        cyclePace = pace;
    }

    function onShow() as Void {
        if (timer == null && !finished) {
            startSensors();
            timer = new Timer.Timer();
            (timer as Timer.Timer).start(method(:tick), TICK_MS, true);
            since = System.getTimer();
            running = true;
        }
    }

    (:debug)
    function debugShort(ms as Number) as Void { totalMs = ms; }

    // ── Clock ──────────────────────────────────────────────────────────────
    function clockMs() as Number {
        return acc + (running && started ? System.getTimer() - since : 0);
    }

    function tick() as Void {
        if (finished) { return; }
        if (running && !started) {
            var now = System.getTimer();
            leadLeft -= now - since;
            since = now;
            if (leadLeft <= 0) {
                started = true;
                newCycle(0);
                Look.cue("in");
            }
            WatchUi.requestUpdate();
            return;
        }
        if (!running) { return; }
        var t = clockMs();
        if (t >= totalMs) { finish(true); return; }
        // Move through phases (more than one if the watch was busy).
        var moved = false;
        while (t >= phaseStart + (phases[phaseIdx][1] as Number)) {
            phaseStart += phases[phaseIdx][1] as Number;
            phaseIdx++;
            if (phaseIdx >= phases.size()) { newCycle(phaseStart); }
            moved = true;
        }
        if (moved) { Look.cue(phases[phaseIdx][0] as String); log(t); }
        fake(t);
        WatchUi.requestUpdate();
    }

    (:debug)
    hidden function log(t as Number) as Void { System.println("t=" + t + " " + phases[phaseIdx][0] + " pace=" + cyclePace + " hr=" + hrNow + " n=" + ts.size()); }
    (:release)
    hidden function log(t as Number) as Void {}

    // Simulator: a heart rate that swings with the breath (bigger at slower paces), plus beat intervals.
    (:debug) hidden var lastFake as Number = -1000;
    (:debug)
    hidden function fake(t as Number) as Void {
        if (Debug.AUTO.equals("") || t - lastFake < 1000) { return; }
        lastFake = t;
        var amp = 12.0 - cyclePace; // 4.5/min swings most
        var b = (62 + amp * Math.sin(2 * Math.PI * t / (60000.0 / cyclePace))).toNumber();
        hrNow = b;
        ts.add(t / 1000.0);
        bpm.add(b);
        rr.add(60000 / b);
    }
    (:release)
    hidden function fake(t as Number) as Void {}

    hidden function newCycle(at as Number) as Void {
        var p = pace;
        if (kind.equals("finder")) {
            p = Plan.finderPace(at);
            if (at > 0 && p != cyclePace) {
                banner = "Now " + Plan.paceText(p) + " a minute";
                bannerUntil = at + 6000;
            }
        }
        cyclePace = p;
        phases = Plan.cycle(kind, p, at.toFloat() / totalMs);
        phaseIdx = 0;
        phaseStart = at;
        cycleStart = at;
    }

    function togglePause() as Void {
        if (finished) { return; }
        if (running) { pause(); } else { resume(); }
    }

    function pause() as Void {
        if (!running) { return; }
        if (started) { acc += System.getTimer() - since; }
        running = false;
        WatchUi.requestUpdate();
    }

    function resume() as Void {
        if (running || finished) { return; }
        since = System.getTimer();
        running = true;
        WatchUi.requestUpdate();
    }

    // Ends the session and shows the summary (or, if discarded, goes back to the list).
    function finish(save as Boolean) as Void {
        if (finished) { return; }
        pause();
        finished = true;
        stopAll();
        if (save && acc >= 30000) {
            Look.done();
            var d = new DoneView(self);
            WatchUi.switchToView(d, new DoneDelegate(d), WatchUi.SLIDE_LEFT);
        } else {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        }
    }

    function stopAll() as Void {
        if (timer != null) { (timer as Timer.Timer).stop(); timer = null; }
        if (Sensor has :unregisterSensorDataListener) { Sensor.unregisterSensorDataListener(); }
        Sensor.enableSensorEvents(null);
    }

    function seconds() as Number {
        return (acc / 1000).toNumber();
    }

    // ── Sensors ────────────────────────────────────────────────────────────
    hidden function startSensors() as Void {
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
        Sensor.enableSensorEvents(method(:onSensor));
        if (Sensor has :registerSensorDataListener) {
            try {
                Sensor.registerSensorDataListener(method(:onData), { :period => 1, :heartBeatIntervals => { :enabled => true } });
            } catch (e) {
                // No beat-to-beat intervals on this watch: heart rate alone still gives the swing.
            }
        }
    }

    function onSensor(info as Sensor.Info) as Void {
        var b = info.heartRate;
        hrNow = b;
        if (b == null || !running || !started || b < 25 || b > 240) { return; }
        if (ts.size() >= 2400) { return; }
        ts.add(clockMs() / 1000.0);
        bpm.add(b);
    }

    function onData(data as Sensor.SensorData) as Void {
        if (!running || !started) { return; }
        var h = data.heartRateData;
        if (h == null || h.heartBeatIntervals == null) { return; }
        var iv = h.heartBeatIntervals as Array<Number>;
        for (var i = 0; i < iv.size() && rr.size() < 3000; i++) {
            var x = iv[i];
            if (x >= 270 && x <= 2000) { rr.add(x); }
        }
    }

    // ── Drawing ────────────────────────────────────────────────────────────
    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var cy = (h * 0.45).toNumber();
        var t = clockMs();
        var rMin = w * 0.13;
        var rMax = w * 0.26; // stays clear of the words below

        // Progress ring.
        var frac = started ? t.toFloat() / totalMs : 0.0;
        if (Look.isRound()) {
            dc.setPenWidth(5);
            dc.setColor(Look.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(w / 2, h / 2, w / 2 - 4);
            if (frac > 0.003) {
                dc.setColor(Look.GREEN, Graphics.COLOR_TRANSPARENT);
                dc.drawArc(w / 2, h / 2, w / 2 - 4, Graphics.ARC_CLOCKWISE, 90, 90 - (frac * 360).toNumber());
            }
            dc.setPenWidth(1);
        } else {
            dc.setColor(Look.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(0, h - 5, w, 5);
            dc.setColor(Look.GREEN, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(0, h - 5, (w * frac).toNumber(), 5);
        }

        // Top line: time left (the finder also shows the pace).
        var top = started ? Look.clock((totalMs - t + 999) / 1000) + " left" : "Get ready";
        if (kind.equals("finder") && started) { top = Plan.paceText(cyclePace) + "/min · " + top; }
        if (banner != null && t < bannerUntil) { top = banner as String; }
        dc.setColor(banner != null && t < bannerUntil ? Look.AMBER : Look.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, (h * 0.12).toNumber(), Graphics.FONT_XTINY, top, Graphics.TEXT_JUSTIFY_CENTER);

        // The circle.
        var r = rMin;
        var word = "Get ready";
        var count = ((leadLeft + 999) / 1000).toString();
        if (started) {
            var ph = phases[phaseIdx][0] as String;
            var len = phases[phaseIdx][1] as Number;
            var into = (t - phaseStart).toFloat() / len;
            if (into > 1.0) { into = 1.0; }
            var ease = (1 - Math.cos(Math.PI * into)) / 2;
            var topR = kind.equals("sigh") ? rMax * 0.86 : rMax; // sigh: the sip fills the last bit
            if (ph.equals("in")) { r = rMin + (topR - rMin) * ease; }
            else if (ph.equals("top")) { r = topR + (rMax - topR) * ease; }
            else if (ph.equals("hold")) { r = rMax; }
            else if (ph.equals("out")) { r = rMax - (rMax - rMin) * ease; }
            else { r = rMin; }
            word = Plan.word(ph);
            count = ((phaseStart + len - t + 999) / 1000).toString();
        }
        if (Look.amoled()) {
            dc.setColor(0x1F5546, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx, cy, r);
        }
        dc.setColor(Look.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(Look.amoled() ? 3 : 5);
        dc.drawCircle(cx, cy, r);
        dc.setPenWidth(1);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, Graphics.FONT_MEDIUM, count, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // The instruction, then heart rate.
        var wy = (h * 0.78).toNumber();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, wy, Graphics.FONT_SMALL, word, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (hrNow != null) {
            dc.setColor(Look.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, (h * 0.885).toNumber(), Graphics.FONT_XTINY, (hrNow as Number).toString() + " bpm", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        if (!running) {
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
            var fh = dc.getFontHeight(Graphics.FONT_XTINY);
            dc.fillRectangle(0, wy - fh, w, fh * 2);
            Look.pill(dc, cx, wy, "Paused · Start resumes", Graphics.FONT_XTINY, Look.AMBER, Graphics.COLOR_BLACK);
        }
    }
}

class PlayerDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as PlayerView;

    function initialize(view as PlayerView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onSelect() as Boolean {
        view.togglePause();
        return true;
    }

    // Back: pause, then resume / finish and save / discard.
    function onBack() as Boolean {
        view.pause();
        var menu = new WatchUi.Menu2({ :title => "Paused" });
        menu.addItem(new WatchUi.MenuItem("Resume", null, :resume, null));
        menu.addItem(new WatchUi.MenuItem("Finish and save", null, :finish, null));
        menu.addItem(new WatchUi.MenuItem("Discard", null, :discard, null));
        WatchUi.pushView(menu, new PauseDelegate(view), WatchUi.SLIDE_UP);
        return true;
    }

    // Don't let up/down or menu leave the session by accident.
    function onNextPage() as Boolean { return true; }
    function onPreviousPage() as Boolean { return true; }
    function onMenu() as Boolean { return onBack(); }
}

class PauseDelegate extends WatchUi.Menu2InputDelegate {
    hidden var view as PlayerView;

    function initialize(view as PlayerView) {
        Menu2InputDelegate.initialize();
        self.view = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :resume) { view.resume(); }
        else { view.finish(id == :finish); }
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        view.resume();
    }
}
