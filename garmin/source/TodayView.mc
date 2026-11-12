import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

// Signed in: cards you move through with up/down (or a swipe), each sliding in like the app's
// pages. A finished session without a check-in opens the check-in first (see CheckinView).
//   Today      readiness ring, the first session, last night at a glance
//   Workout    one card per session; Start opens every step (WorkoutDetail)
//   Last night sleep, HRV, resting HR, Body Battery
//   Tomorrow
// Start on Today/Last night/Tomorrow refreshes; holding Up (menu) has Refresh and Sign out.
class TodayView extends WatchUi.View {
    var page as Number = 0;
    var loading as Boolean = false;
    var error as String? = null;
    // Slide animation: the incoming page is drawn `shift` px from its place (0 = settled).
    var shift as Number = 0;
    hidden var from as Number = -1;
    hidden var offered as Boolean = false;

    function initialize() {
        View.initialize();
    }

    // Simulator slideshow (debug builds): every card, then a workout's steps, scrolled.
    (:debug) hidden var demoTimer as Timer.Timer? = null;
    (:debug) hidden var demoTick as Number = 0;
    (:debug)
    function startDemo() as Void {
        if (demoTimer != null || !Demo.ON) { return; }
        demoTimer = new Timer.Timer();
        (demoTimer as Timer.Timer).start(method(:demoStep), 2500, true);
    }
    (:debug)
    function demoStep() as Void {
        demoTick += 1;
        if (demoTick < pageCount()) { go(1); }
        else if (demoTick == pageCount()) {
            go(1);
            var wk = workoutAt(1);
            if (wk != null) { var d = new WorkoutDetail(wk); WatchUi.pushView(d, new WorkoutDetailDelegate(d), WatchUi.SLIDE_LEFT); }
        } else { (demoTimer as Timer.Timer).stop(); }
    }
    (:release)
    function startDemo() as Void {}

    function onShow() as Void {
        startDemo();
        var t = data();
        if (t == null || !(t["u"] instanceof Number) || Time.now().value() - (t["u"] as Number) > 900) { refresh(); }
        else { offerCheckin(); }
    }

    hidden function offerCheckin() as Void {
        if (!offered) { offered = Checkin.offer(data()); }
    }

    function data() as Dictionary? {
        var t = Application.Storage.getValue(Api.TODAY_KEY);
        return t instanceof Dictionary ? t : null;
    }

    function workouts() as Array {
        var t = data();
        var w = t != null ? t["w"] : null;
        return w instanceof Array ? w : [];
    }

    function pageCount() as Number {
        return 3 + workouts().size();
    }

    // The workout on this page, or null (Today, Last night, Tomorrow).
    function workoutAt(p as Number) as Dictionary? {
        var ws = workouts();
        return p >= 1 && p <= ws.size() ? ws[p - 1] as Dictionary : null;
    }

    function go(by as Number) as Void {
        var n = pageCount();
        from = page;
        page = (page + by + n) % n;
        var h = System.getDeviceSettings().screenHeight;
        shift = by > 0 ? h : -h;
        WatchUi.animate(self, :shift, WatchUi.ANIM_TYPE_EASE_OUT, shift, 0, 0.28, method(:settled));
        WatchUi.requestUpdate();
    }

    function settled() as Void {
        from = -1;
        shift = 0;
        WatchUi.requestUpdate();
    }

    function refresh() as Void {
        loading = true;
        error = null;
        WatchUi.requestUpdate();
        Api.fetchToday(method(:onToday));
    }

    function onToday(code as Number, d as Dictionary or String or Null) as Void {
        loading = false;
        if (code == 200 && d instanceof Dictionary) {
            Application.Storage.setValue(Api.TODAY_KEY, d);
            if (page >= pageCount()) { page = 0; }
            offerCheckin();
        } else if (code == 401) {
            signOut();
            var pair = new PairView();
            WatchUi.switchToView(pair, new PairDelegate(pair), WatchUi.SLIDE_RIGHT);
            return;
        } else {
            error = code < 0 ? "Phone not connected" : "Couldn't update";
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var t = data();
        var h = dc.getHeight();
        if (t == null) {
            Lay.drawFit(dc, h / 2 - 30, 0, loading ? "Loading today…" : (error != null ? error : "Press Start to load"), [Graphics.FONT_SMALL, Graphics.FONT_XTINY], Ui.DIM, 3);
            return;
        }
        if (from >= 0 && shift != 0) {
            drawPage(dc, t, from, shift > 0 ? shift - h : shift + h);
        }
        drawPage(dc, t, page, shift);
        drawDots(dc);
        if (loading || error != null) {
            dc.setColor(error != null ? Ui.AMBER : Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(dc.getWidth() / 2, h * 0.9, Graphics.FONT_XTINY, loading ? "Updating…" : error, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    hidden function drawPage(dc as Graphics.Dc, t as Dictionary, p as Number, oy as Number) as Void {
        var ws = workouts();
        if (p == 0) { drawToday(dc, t, ws, oy); }
        else if (p <= ws.size()) { drawWorkout(dc, ws[p - 1] as Dictionary, p, ws.size(), oy); }
        else if (p == ws.size() + 1) { drawNight(dc, t, oy); }
        else { drawTomorrow(dc, t, oy); }
    }

    // ── Today ──────────────────────────────────────────────────────────────
    hidden function drawToday(dc as Graphics.Dc, t as Dictionary, ws as Array, oy as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var r = t["r"];
        var flag = r instanceof Dictionary ? r["o"] as String? : null;
        var color = Ui.readinessColor(flag);
        // Readiness: a ring around the edge, filled by how ready (full, two thirds, a third).
        var fill = flag == null ? 0 : (flag.equals("green") ? 360 : (flag.equals("yellow") ? 240 : 120));
        if (Ui.isRound()) {
            dc.setPenWidth(8);
            dc.setColor(Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(w / 2, h / 2 + oy, w / 2 - 6);
            if (fill > 0) {
                dc.setColor(color, Graphics.COLOR_TRANSPARENT);
                if (fill == 360) { dc.drawCircle(w / 2, h / 2 + oy, w / 2 - 6); }
                else { dc.drawArc(w / 2, h / 2 + oy, w / 2 - 6, Graphics.ARC_CLOCKWISE, 90, 90 - fill); }
            }
            dc.setPenWidth(1);
        } else {
            dc.setColor(Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w * 0.2, h * 0.05 + oy, w * 0.6, 8, 4);
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w * 0.2, h * 0.05 + oy, w * 0.6 * fill / 360, 8, 4);
        }
        var y = (h * 0.15).toNumber();
        y = Lay.drawFit(dc, y, oy, Ui.readinessText(flag).toUpper(), [Graphics.FONT_XTINY], color, 1);
        var note = r instanceof Dictionary && r["t"] instanceof String ? r["t"] as String : null;
        if (ws.size() == 0) {
            y = Lay.drawFit(dc, (h * 0.34).toNumber(), oy, "Nothing planned today", [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL], Graphics.COLOR_WHITE, 2);
            if (note != null) { Lay.drawFit(dc, y + 6, oy, note, [Graphics.FONT_XTINY], Ui.DIM, 3); }
            drawTonightStrip(dc, t, oy);
            return;
        }
        var first = ws[0] as Dictionary;
        y = (h * 0.29).toNumber();
        var sub = Ui.sportName(first["s"] as String?).toUpper();
        if (first["min"] instanceof Number) { sub = sub + "  ·  " + Lay.hm(first["min"] as Number); }
        dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, y + oy, Graphics.FONT_XTINY, sub, Graphics.TEXT_JUSTIFY_CENTER);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 2;
        y = Lay.drawFit(dc, y, oy, first["t"] as String, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], Graphics.COLOR_WHITE, 3);
        // Below the title: the button, then (if there's room) the second session, then last night.
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        var stripY = (h * 0.8).toNumber();
        var py = y + 8 + fh / 2;
        if (py + fh / 2 + 4 <= stripY) {
            Lay.pill(dc, w / 2, py + oy, "Start  ›  steps", Graphics.FONT_XTINY, Ui.GREEN, Graphics.COLOR_BLACK);
            y = py + fh / 2 + 4;
        }
        if (ws.size() > 1 && y + fh <= stripY) {
            Lay.drawFit(dc, y + 2, oy, "+ " + ((ws[1] as Dictionary)["t"] as String), [Graphics.FONT_XTINY], Ui.DIM, 1);
        }
        drawTonightStrip(dc, t, oy);
    }

    // "7h17 sleep · HRV 52" along the bottom of Today.
    hidden function drawTonightStrip(dc as Graphics.Dc, t as Dictionary, oy as Number) as Void {
        var m = t["m"] instanceof Dictionary ? t["m"] as Dictionary : {};
        var parts = [] as Array<String>;
        if (m["sl"] instanceof Number) { parts.add(Lay.hm(m["sl"] as Number) + " sleep"); }
        if (m["hrv"] instanceof Number) { parts.add("HRV " + (m["hrv"] as Number).toString()); }
        else if (m["rhr"] instanceof Number) { parts.add("RHR " + (m["rhr"] as Number).toString()); }
        if (parts.size() == 0) { return; }
        var y = (dc.getHeight() * 0.8).toNumber();
        var text = parts.size() == 2 ? parts[0] + "  ·  " + parts[1] : parts[0];
        // Narrow bottoms of small round screens: just the sleep.
        if (dc.getTextWidthInPixels(text, Graphics.FONT_XTINY) > Ui.widthAt(dc, y, dc.getFontHeight(Graphics.FONT_XTINY))) { text = parts[0]; }
        Lay.drawFit(dc, y, oy, text, [Graphics.FONT_XTINY], Ui.DIM, 1);
    }

    // ── One workout ───────────────────────────────────────────────────────
    hidden function drawWorkout(dc as Graphics.Dc, wk as Dictionary, p as Number, n as Number, oy as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var head = Ui.sportName(wk["s"] as String?).toUpper();
        if (n > 1) { head = head + "  " + p.toString() + "/" + n.toString(); }
        var y = Lay.drawFit(dc, (h * 0.12).toNumber(), oy, head, [Graphics.FONT_XTINY], Ui.GREEN, 1) + 2;
        y = Lay.drawFit(dc, y, oy, wk["t"] as String, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], Graphics.COLOR_WHITE, 2) + 4;
        // Duration and fuel as two quiet facts.
        var facts = [] as Array<String>;
        if (wk["min"] instanceof Number) { facts.add("~" + Lay.hm(wk["min"] as Number)); }
        var f = wk["f"];
        if (f instanceof Dictionary && f["first"] instanceof Number) { facts.add("fuel from " + ((f["first"] as Number) / 60).toString() + " min"); }
        if (facts.size() > 0) {
            var text = facts.size() == 2 ? facts[0] + "  ·  " + facts[1] : facts[0];
            y = Lay.drawFit(dc, y, oy, text, [Graphics.FONT_XTINY], f instanceof Dictionary ? Ui.AMBER : Ui.DIM, 1) + 6;
        }
        // A preview of the first steps on a card; Start shows them all.
        var lines = wk["l"] instanceof Array ? wk["l"] as Array : [];
        var more = "Open  ›";
        if (lines.size() > 0) {
            var cardTop = y;
            var cardW = Ui.widthAt(dc, y, (h * 0.24).toNumber());
            var lh = dc.getFontHeight(Graphics.FONT_XTINY);
            // As many steps as fit above the button, each wrapped to at most two lines.
            var room = ((h * 0.74).toNumber() - cardTop - 12) / lh;
            if (room > 5) { room = 5; }
            var rowsOut = [] as Array<String>;
            var shown = 0;
            for (var i = 0; i < lines.size() && i < 4; i++) {
                var wrapped = Lay.wrap(dc, lines[i] as String, Graphics.FONT_XTINY, cardW - 16);
                if (wrapped.size() > 2) {
                    wrapped = [wrapped[0], Ui.ellipsize(dc, wrapped[1] + " " + wrapped[2], Graphics.FONT_XTINY, cardW - 16)] as Array<String>;
                }
                if (rowsOut.size() + wrapped.size() > room && shown > 0) { break; }
                rowsOut.addAll(wrapped);
                shown += 1;
            }
            var cardH = rowsOut.size() * lh + 12;
            Lay.card(dc, (w - cardW) / 2, cardTop + oy, cardW, cardH, 14, Ui.CARD);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            for (var i = 0; i < rowsOut.size(); i++) {
                dc.drawText(w / 2, cardTop + 6 + i * lh + oy, Graphics.FONT_XTINY, rowsOut[i], Graphics.TEXT_JUSTIFY_CENTER);
            }
            y = cardTop + cardH;
            more = shown < lines.size() ? "All " + lines.size().toString() + " steps  ›" : "Open  ›";
        }
        var py = y + 10 + dc.getFontHeight(Graphics.FONT_XTINY) / 2;
        if (py > h * 0.84) { py = (h * 0.84).toNumber(); }
        Lay.pill(dc, w / 2, py + oy, more, Graphics.FONT_XTINY, Ui.GREEN, Graphics.COLOR_BLACK);
    }

    // ── Last night ────────────────────────────────────────────────────────
    hidden function drawNight(dc as Graphics.Dc, t as Dictionary, oy as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var m = t["m"] instanceof Dictionary ? t["m"] as Dictionary : {};
        Lay.drawFit(dc, (h * 0.13).toNumber(), oy, "LAST NIGHT", [Graphics.FONT_XTINY], Ui.GREEN, 1);
        var tiles = [] as Array<Array<String>>;
        if (m["sl"] instanceof Number) { tiles.add([Lay.hm(m["sl"] as Number), "Sleep"]); }
        if (m["hrv"] instanceof Number) { tiles.add([(m["hrv"] as Number).toString(), "HRV ms"]); }
        if (m["rhr"] instanceof Number) { tiles.add([(m["rhr"] as Number).toString(), "Resting HR"]); }
        if (m["bb"] instanceof Number) { tiles.add([(m["bb"] as Number).toString(), "Battery"]); }
        else if (m["ss"] instanceof Number) { tiles.add([(m["ss"] as Number).toString(), "Sleep score"]); }
        if (tiles.size() == 0) {
            Lay.drawFit(dc, h / 2 - 20, oy, "No numbers yet today", [Graphics.FONT_SMALL, Graphics.FONT_XTINY], Ui.DIM, 2);
            return;
        }
        // A 2×2 grid of frosted tiles.
        var gap = 6;
        var gw = (w * 0.68).toNumber();
        var tw = (gw - gap) / 2;
        var th = (h * 0.24).toNumber();
        var top = (h * 0.25).toNumber();
        var big = Graphics.FONT_MEDIUM;
        for (var i = 0; i < tiles.size(); i++) {
            var col = i % 2;
            var row = i / 2;
            var x = (w - gw) / 2 + col * (tw + gap);
            var yy = top + row * (th + gap);
            Lay.card(dc, x, yy + oy, tw, th, 16, Ui.CARD);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + tw / 2, yy + th * 0.42 + oy, big, tiles[i][0], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            var label = tiles[i][1];
            if (dc.getTextWidthInPixels(label, Graphics.FONT_XTINY) > tw - 8) { label = Ui.ellipsize(dc, label, Graphics.FONT_XTINY, tw - 8); }
            dc.drawText(x + tw / 2, yy + th * 0.78 + oy, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // ── Tomorrow ──────────────────────────────────────────────────────────
    hidden function drawTomorrow(dc as Graphics.Dc, t as Dictionary, oy as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Lay.drawFit(dc, (h * 0.13).toNumber(), oy, "TOMORROW", [Graphics.FONT_XTINY], Ui.GREEN, 1);
        var nx = t["nx"];
        if (!(nx instanceof Array) || nx.size() == 0) {
            Lay.drawFit(dc, h / 2 - 20, oy, "Nothing planned yet", [Graphics.FONT_SMALL, Graphics.FONT_XTINY], Ui.DIM, 2);
            return;
        }
        var y = (h * (nx.size() == 1 ? 0.36 : 0.27)).toNumber();
        for (var i = 0; i < nx.size(); i++) {
            var n = nx[i] as Dictionary;
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y + oy, Graphics.FONT_XTINY, Ui.sportName(n["s"] as String?).toUpper(), Graphics.TEXT_JUSTIFY_CENTER);
            y += dc.getFontHeight(Graphics.FONT_XTINY);
            y = Lay.drawFit(dc, y, oy, n["t"] as String, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], Graphics.COLOR_WHITE, 2) + 10;
        }
    }

    // Page position along the right edge: the current one is a longer pill.
    hidden function drawDots(dc as Graphics.Dc) as Void {
        var n = pageCount();
        var x = dc.getWidth() - (Ui.isRound() ? 14 : 8);
        var step = 11;
        var y0 = dc.getHeight() / 2 - ((n - 1) * step) / 2 - 4;
        for (var i = 0; i < n; i++) {
            var y = y0 + i * step + (i > page ? 8 : 0);
            if (i == page) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(x - 3, y - 3, 6, 14, 3);
            } else {
                dc.setColor(Ui.FAINT, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(x, y, 3);
            }
        }
    }
}

class TodayDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as TodayView;

    function initialize(view as TodayView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onNextPage() as Boolean {
        view.go(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        view.go(-1);
        return true;
    }

    // Start (or a tap): opens the session on a workout card or Today; refreshes elsewhere.
    function onSelect() as Boolean {
        var wk = view.workoutAt(view.page == 0 ? 1 : view.page);
        if (wk != null && view.page <= view.workouts().size()) {
            var d = new WorkoutDetail(wk);
            WatchUi.pushView(d, new WorkoutDetailDelegate(d), WatchUi.SLIDE_LEFT);
        } else {
            view.refresh();
        }
        return true;
    }

    function onMenu() as Boolean {
        var menu = new WatchUi.Menu2({ :title => "Diastole" });
        menu.addItem(new WatchUi.MenuItem("Refresh", null, :refresh, null));
        menu.addItem(new WatchUi.MenuItem("Sign out of watch", null, :signout, null));
        WatchUi.pushView(menu, new TodayMenuDelegate(view), WatchUi.SLIDE_UP);
        return true;
    }
}

class TodayMenuDelegate extends WatchUi.Menu2InputDelegate {
    hidden var view as TodayView;

    function initialize(view as TodayView) {
        Menu2InputDelegate.initialize();
        self.view = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (item.getId() == :refresh) {
            view.refresh();
        } else {
            // The server token stays valid until removed on diastole.app; tell it we're leaving.
            var opts = Api.jsonOptions(Communications.HTTP_REQUEST_METHOD_POST, true);
            Communications.makeWebRequest(Api.BASE + "/api/device/signout", {}, opts, method(:onSignedOut));
            signOut();
            var pair = new PairView();
            WatchUi.switchToView(pair, new PairDelegate(pair), WatchUi.SLIDE_RIGHT);
        }
    }

    function onSignedOut(code as Number, data as Dictionary or String or Null) as Void {}
}
