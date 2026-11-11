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
        var title = step == 0 ? "HOW DID IT FEEL?" : (step == 1 ? "HOW HARD? (RPE)" : "DID THE FUEL GO IN?");
        var ty = Ui.drawWrapped(dc, (h * 0.1).toNumber(), title, Graphics.FONT_XTINY, Ui.GREEN, 2);
        if (step == 0) {
            Ui.drawWrapped(dc, ty > h * 0.22 ? ty : (h * 0.22).toNumber(), ck["t"] as String, Graphics.FONT_XTINY, Ui.DIM, 1);
        }

        var big = step == 0 ? FEEL[feel - 1] : (step == 1 ? rpe.toString() : FUEL[fuel]);
        var small = step == 1 ? RPE[rpe - 1] : "";
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.48, step == 1 ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_MEDIUM, big, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (small.length() > 0) {
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.63, Graphics.FONT_XTINY, small, Graphics.TEXT_JUSTIFY_CENTER);
        }
        // Up/down hints.
        dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[w / 2 - 8, h * 0.33], [w / 2 + 8, h * 0.33], [w / 2, h * 0.29]]);
        dc.fillPolygon([[w / 2 - 8, h * 0.70], [w / 2 + 8, h * 0.70], [w / 2, h * 0.74]]);

        var foot = error != null ? error : (sending ? "Saving…" : (step < lastStep() ? "Start: next" : "Start: save"));
        Ui.drawWrapped(dc, (h * 0.8).toNumber(), foot, Graphics.FONT_XTINY, error != null ? Ui.AMBER : Ui.DIM, 2);
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
