import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

// After a session: how long, heart rate first minute → last minute, the per-breath swing, and
// whether it reached Diastole. The pace finder shows the pace it found (by heart-rate swing; when
// the watch couldn't read enough heart rate, it asks which pace felt calmest).
class DoneView extends WatchUi.View {
    hidden var kind as String;
    hidden var secs as Number;
    hidden var body as Dictionary;
    hidden var hrStart as Number? = null;
    hidden var hrEnd as Number? = null;
    hidden var swing as Float? = null;
    var needsBest as Boolean = false;
    hidden var status as String = "Saving…";
    hidden var foundPace as Float? = null;
    hidden var sent as Boolean = false;
    hidden var asked as Boolean = false;
    hidden var askTimer as Timer.Timer? = null;

    function initialize(p as PlayerView) {
        View.initialize();
        kind = p.kind;
        secs = p.seconds();
        body = { "k" => kind, "sec" => secs, "p" => p.pace, "at" => Net.now() } as Dictionary;
        summarise(p);
        if (kind.equals("finder")) {
            body["p"] = null;
            var sws = body["hr"] instanceof Dictionary ? (body["hr"] as Dictionary)["sws"] : null;
            needsBest = !(sws instanceof Dictionary) || (sws as Dictionary).size() < 4;
        }
    }

    hidden function summarise(p as PlayerView) as Void {
        var ts = p.ts;
        var n = ts.size();
        var hr = {} as Dictionary;
        if (n >= 20) {
            var end = ts[n - 1] as Float;
            var edge = end / 3 < 60 ? end / 3 : 60.0;
            hrStart = HrMath.meanBetween(ts, p.bpm, 0.0, edge);
            hrEnd = HrMath.meanBetween(ts, p.bpm, end - edge, end);
            if (hrStart != null) { hr["s"] = hrStart; }
            if (hrEnd != null) { hr["e"] = hrEnd; }
            if (kind.equals("finder")) {
                // One swing per pace, each over its own 90 s (settling 20 s).
                var sws = {} as Dictionary;
                for (var i = 0; i < 5; i++) {
                    var pc = Plan.FINDER_PACES[i] as Float;
                    var from = i * 90.0;
                    var sw = HrMath.swing(ts, p.bpm, from, from + 90.0, 60.0 / pc, 20.0);
                    if (sw != null) { sws[Plan.paceText(pc)] = sw; }
                }
                if (sws.size() > 0) { hr["sws"] = sws; }
            } else {
                var cyc = Plan.cycle(kind, p.pace, 0.0);
                var ms = 0;
                for (var i = 0; i < cyc.size(); i++) { ms += cyc[i][1] as Number; }
                swing = HrMath.swing(ts, p.bpm, 0.0, end, ms / 1000.0, 30.0);
                if (swing != null) { hr["sw"] = swing; }
            }
        }
        var rm = HrMath.rmssd(p.rr);
        if (rm != null) { hr["rm"] = rm; }
        if (hr.size() > 0) { body["hr"] = hr; }
    }

    function onShow() as Void {
        if (needsBest) {
            if (!asked) {
                asked = true;
                askTimer = new Timer.Timer();
                (askTimer as Timer.Timer).start(method(:ask), 400, false);
            }
            return;
        }
        if (!sent) { send(); }
    }

    function ask() as Void {
        var menu = new WatchUi.Menu2({ :title => "Calmest pace?" });
        for (var i = 0; i < 5; i++) {
            menu.addItem(new WatchUi.MenuItem(Plan.paceText(Plan.FINDER_PACES[i] as Float) + " a minute", i == 0 ? "the first" : (i == 4 ? "the last" : null), i, null));
        }
        WatchUi.pushView(menu, new BestMenuDelegate(self), WatchUi.SLIDE_UP);
    }

    // The finder without enough heart rate: the pace that felt calmest decides.
    function setBest(pace as Float) as Void {
        body["best"] = pace;
        needsBest = false;
        send();
    }

    hidden function send() as Void {
        sent = true;
        Net.queue(body);
        new Sync(method(:onSync)).start();
    }

    function onSync(code as Number, data as Dictionary?) as Void {
        if (code == 200) {
            status = "Saved to Diastole";
            if (kind.equals("finder") && data != null && Net.isNum(data["pace"])) { foundPace = (data["pace"] as Numeric).toFloat(); }
        } else if (code == 0) {
            status = "Kept on watch. Link via the Diastole widget to save";
        } else if (code < 0) {
            status = "Kept on watch. Sends when your phone connects";
        } else {
            status = "Couldn't save this one";
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var y = Look.text(dc, (h * 0.12).toNumber(), "NICE WORK", Graphics.FONT_XTINY, Look.GREEN, 1);
        y = Look.text(dc, y, Plan.title(kind), Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 1);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        var big = Look.clock(secs);
        if (kind.equals("finder") && foundPace != null) { big = Plan.paceText(foundPace as Float) + "/min"; }
        dc.drawText(w / 2, (h * 0.44).toNumber(), Graphics.FONT_NUMBER_MILD, big, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        var ly = (h * 0.58).toNumber();
        if (needsBest) {
            ly = Look.text(dc, ly, "Heart rate was patchy. Pick the pace that felt calmest.", Graphics.FONT_XTINY, Look.DIM, 3);
            return;
        }
        if (kind.equals("finder") && foundPace != null) {
            ly = Look.text(dc, ly, "Your pace. Recovery breathing uses it now.", Graphics.FONT_XTINY, Look.DIM, 2);
        } else if (hrStart != null && hrEnd != null) {
            var line = "HR " + (hrStart as Number).toString() + " → " + (hrEnd as Number).toString();
            if (swing != null) { line = line + "  ·  swing " + (swing as Float).format("%.1f"); }
            ly = Look.text(dc, ly, line, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, 2);
        }
        Look.text(dc, ly + 4, status, Graphics.FONT_XTINY, status.equals("Saved to Diastole") ? Look.GREEN : Look.AMBER, 3);
    }
}

class DoneDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as DoneView;

    function initialize(view as DoneView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onSelect() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}

// The finder, when heart rate was too patchy: which pace felt calmest?
class BestMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var view as DoneView;

    function initialize(view as DoneView) {
        Menu2InputDelegate.initialize();
        self.view = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        view.setBest(Plan.FINDER_PACES[item.getId() as Number] as Float);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        view.setBest(Plan.DEFAULT_PACE);
    }
}
