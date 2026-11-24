import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// The CO2 check: a seated, comfortable breath hold, timed. Safety first (Start confirms seated and
// away from water), then how to do it, the stopwatch, and the result (Start saves, Back redoes).
class HoldView extends WatchUi.View {
    var stage as Number = 0; // 0 safety, 1 how, 2 holding, 3 result
    hidden var startedAt as Number = 0;
    var result as Number = 0;
    hidden var timer as Timer.Timer?;
    hidden var status as String? = null;

    function initialize() {
        View.initialize();
    }

    function next() as Void {
        if (stage == 0 || stage == 1) {
            stage += 1;
            if (stage == 2) {
                startedAt = System.getTimer();
                timer = new Timer.Timer();
                (timer as Timer.Timer).start(method(:tick), 200, true);
                Look.cue("hold");
            }
        } else if (stage == 2) {
            result = (System.getTimer() - startedAt + 500) / 1000;
            stopTimer();
            Look.cue("in");
            stage = 3;
        } else if (status == null) {
            if (result < 1) { WatchUi.popView(WatchUi.SLIDE_RIGHT); return; }
            status = "Saving…";
            Net.queue({ "hold" => result, "at" => Net.now() });
            new Sync(method(:onSync)).start();
        } else {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        WatchUi.requestUpdate();
    }

    // Back on the result: try again. Elsewhere: leave.
    function back() as Boolean {
        if (stage == 3 && status == null) { stage = 1; WatchUi.requestUpdate(); return true; }
        if (stage == 2) { stopTimer(); stage = 1; WatchUi.requestUpdate(); return true; }
        return false;
    }

    function onSync(code as Number, data as Dictionary?) as Void {
        status = code == 200 ? "Saved to Diastole" : (code == 0 ? "Kept on watch. Link via the widget to save" : "Kept on watch. Sends when your phone connects");
        WatchUi.requestUpdate();
    }

    function tick() as Void { WatchUi.requestUpdate(); }

    hidden function stopTimer() as Void {
        if (timer != null) { (timer as Timer.Timer).stop(); timer = null; }
    }

    function onHide() as Void {
        if (stage == 2) { stopTimer(); stage = 1; }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var y = Look.text(dc, (h * 0.12).toNumber(), "CO2 CHECK", Graphics.FONT_XTINY, Look.GREEN, 1) + 2;
        if (stage == 0) {
            y = Look.text(dc, y, "Seated only. Never in or near water, or driving.", Graphics.FONT_SMALL, Look.AMBER, 4) + 2;
            Look.text(dc, y, "Skip it if pregnant or with a heart, lung or seizure condition.", Graphics.FONT_XTINY, Look.DIM, 3);
            Look.pill(dc, w / 2, (h * 0.85).toNumber(), "I'm seated", Graphics.FONT_XTINY, Look.GREEN, Graphics.COLOR_BLACK);
        } else if (stage == 1) {
            y = Look.text(dc, y, "Breathe quietly through your nose for a minute.", Graphics.FONT_XTINY, Graphics.COLOR_WHITE, 3) + 4;
            Look.text(dc, y, "Then breathe out normally, pinch your nose and press Start. Press again at the first clear urge to breathe.", Graphics.FONT_XTINY, Look.DIM, 5);
            Look.pill(dc, w / 2, (h * 0.85).toNumber(), "Start hold", Graphics.FONT_XTINY, Look.GREEN, Graphics.COLOR_BLACK);
        } else if (stage == 2) {
            var s = (System.getTimer() - startedAt) / 1000;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2 - 6, Graphics.FONT_NUMBER_HOT, s.toString(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            Look.text(dc, (h * 0.72).toNumber(), "Start at the first urge", Graphics.FONT_XTINY, Look.DIM, 2);
        } else {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.40).toNumber(), Graphics.FONT_NUMBER_MEDIUM, result.toString() + "s", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            Look.text(dc, (h * 0.55).toNumber(), Plan.holdBand(result) + ". Track your own trend.", Graphics.FONT_XTINY, Look.GREEN, 2);
            if (status == null) {
                Look.text(dc, (h * 0.68).toNumber(), "Back to redo", Graphics.FONT_XTINY, Look.DIM, 1);
                Look.pill(dc, w / 2, (h * 0.85).toNumber(), "Save", Graphics.FONT_XTINY, Look.GREEN, Graphics.COLOR_BLACK);
            } else {
                Look.text(dc, (h * 0.68).toNumber(), status as String, Graphics.FONT_XTINY, (status as String).equals("Saved to Diastole") ? Look.GREEN : Look.AMBER, 3);
            }
        }
    }
}

class HoldDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as HoldView;

    function initialize(view as HoldView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onSelect() as Boolean { view.next(); return true; }

    function onBack() as Boolean {
        if (view.back()) { return true; }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
