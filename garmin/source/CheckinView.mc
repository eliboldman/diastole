import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// After a session: how it felt, how hard (RPE), and (for longer sessions) whether the fuel went
// in. Up/down changes the answer, Start moves on, Back goes back (or skips on the first question).
// Saved to the same check-in the app shows; sore spots and notes can still be added there.
class CheckinView extends WatchUi.View {
    const FEEL = ["Awful", "Rough", "OK", "Good", "Great"];
    const RPE = ["Very easy", "Easy", "Easy", "Moderate", "Moderate", "Hard", "Hard", "Very hard", "Very hard", "All out"];
    const FUEL = ["Took it all", "Some of it", "None"];
    const FUEL_KEYS = ["all", "some", "none"];

    var ck as Dictionary;
    var step as Number = 0; // 0 feel, 1 rpe, 2 fuel
    var feel as Number = 4; // 1..5
    var rpe as Number = 5; // 1..10
    var fuel as Number = 0; // index into FUEL
    var sending as Boolean = false;
    var error as String? = null;

    function initialize(ck as Dictionary) {
        View.initialize();
        self.ck = ck;
    }

    function asksFuel() as Boolean {
        return ck["q"] instanceof Number && (ck["q"] as Number) == 1;
    }

    function lastStep() as Number {
        return asksFuel() ? 2 : 1;
    }

    function change(by as Number) as Void {
        if (step == 0) { feel = clamp(feel + by, 1, 5); }
        else if (step == 1) { rpe = clamp(rpe + by, 1, 10); }
        else { fuel = clamp(fuel - by, 0, 2); } // up = better
        WatchUi.requestUpdate();
    }

    hidden function clamp(v as Number, lo as Number, hi as Number) as Number {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    function next() as Void {
        if (sending) { return; }
        if (step < lastStep()) {
            step += 1;
            WatchUi.requestUpdate();
            return;
        }
        send();
    }

    function send() as Void {
        sending = true;
        error = null;
        WatchUi.requestUpdate();
        var body = { "a" => ck["a"], "feel" => feel, "rpe" => rpe } as Dictionary;
        if (asksFuel()) { body["fuel"] = FUEL_KEYS[fuel]; }
        Communications.makeWebRequest(Api.BASE + "/api/device/checkin", body,
            Api.jsonOptions(Communications.HTTP_REQUEST_METHOD_POST, true), method(:onSent));
    }

    function onSent(code as Number, data as Dictionary or String or Null) as Void {
        sending = false;
        if (code == 200) {
            Checkin.done(ck["a"] as String);
            WatchUi.popView(WatchUi.SLIDE_UP);
            return;
        }
        error = code < 0 ? "Phone not connected. Start to retry." : "Couldn't save. Start to retry.";
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        // Progress: one short pill per question, the current one bright.
        var n = lastStep() + 1;
        var pw = 18;
        var x0 = w / 2 - (n * pw + (n - 1) * 6) / 2;
        for (var i = 0; i < n; i++) {
            dc.setColor(i <= step ? Ui.GREEN : Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x0 + i * (pw + 6), h * 0.1, pw, 5, 2);
        }
        var title = step == 0 ? "How did it feel?" : (step == 1 ? "How hard was it?" : "Did the fuel go in?");
        var y = Lay.drawFit(dc, (h * 0.17).toNumber(), 0, title, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], Graphics.COLOR_WHITE, 1);
        if (step == 0) { y = Lay.drawFit(dc, y, 0, ck["t"] as String, [Graphics.FONT_XTINY], Ui.DIM, 1); }

        // The answer, big, with a colored scale under it.
        var big = step == 0 ? FEEL[feel - 1] : (step == 1 ? rpe.toString() : FUEL[fuel]);
        var small = step == 1 ? RPE[rpe - 1] : "";
        var color = step == 0 ? [Ui.RED, Ui.AMBER, Ui.DIM, Ui.GREEN, Ui.GREEN][feel - 1] : (step == 1 ? (rpe >= 8 ? Ui.RED : (rpe >= 5 ? Ui.AMBER : Ui.GREEN)) : (fuel == 0 ? Ui.GREEN : (fuel == 1 ? Ui.AMBER : Ui.DIM)));
        var bigFont = step == 1 ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_MEDIUM;
        var bh = dc.getFontHeight(bigFont);
        var vy = y + 6 + bh / 2;
        if (vy < h * 0.47) { vy = (h * 0.47).toNumber(); }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, vy, bigFont, big, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var scaleY = vy + bh / 2 + 6;
        var count = step == 0 ? 5 : (step == 1 ? 10 : 3);
        var at = step == 0 ? feel - 1 : (step == 1 ? rpe - 1 : 2 - fuel);
        var seg = (w * 0.5).toNumber() / count;
        var sx = w / 2 - (seg * count) / 2;
        for (var i = 0; i < count; i++) {
            dc.setColor(i <= at ? color : Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(sx + i * seg + 1, scaleY, seg - 2, 6, 3);
        }
        if (small.length() > 0) {
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, scaleY + 10, Graphics.FONT_XTINY, small, Graphics.TEXT_JUSTIFY_CENTER);
        }

        var foot = error != null ? error : (sending ? "Saving…" : (step < lastStep() ? "Next  ›" : "Save"));
        if (error != null) { Lay.drawFit(dc, (h * 0.8).toNumber(), 0, foot, [Graphics.FONT_XTINY], Ui.AMBER, 2); }
        else { Lay.pill(dc, w / 2, (h * 0.84).toNumber(), foot, Graphics.FONT_XTINY, Ui.GREEN, Graphics.COLOR_BLACK); }
    }
}

class CheckinDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as CheckinView;

    function initialize(view as CheckinView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onPreviousPage() as Boolean { view.change(1); return true; }
    function onNextPage() as Boolean { view.change(-1); return true; }
    function onSelect() as Boolean { view.next(); return true; }

    function onBack() as Boolean {
        if (view.step > 0) {
            view.step -= 1;
            WatchUi.requestUpdate();
        } else {
            Checkin.done(view.ck["a"] as String); // skipped: don't ask again for this session
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
        return true;
    }
}

// Which session (if any) still needs a check-in, remembering ones answered or skipped here.
module Checkin {
    const DONE_KEY = "ckDone";

    function pending(today as Dictionary?) as Dictionary? {
        if (today == null) { return null; }
        var ck = today["ck"];
        if (!(ck instanceof Dictionary) || !(ck["a"] instanceof String)) { return null; }
        var done = Application.Storage.getValue(DONE_KEY);
        if (done instanceof String && done.equals(ck["a"])) { return null; }
        return ck;
    }

    function done(id as String) as Void {
        Application.Storage.setValue(DONE_KEY, id);
    }

    // Opens the check-in over whatever is showing, once per session.
    function offer(today as Dictionary?) as Boolean {
        var ck = pending(today);
        if (ck == null) { return false; }
        var v = new CheckinView(ck);
        WatchUi.pushView(v, new CheckinDelegate(v), WatchUi.SLIDE_UP);
        return true;
    }
}
