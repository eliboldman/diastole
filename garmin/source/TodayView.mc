import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.WatchUi;

// Signed in: pages you scroll with up/down. A finished session without a check-in opens the
// check-in first (see CheckinView).
//   0 Today    readiness + first workout + why
//   1 Steps    the workout's steps (each workout gets its own page)
//   2 Body     HRV, resting HR, sleep, Body Battery
//   3 Tomorrow
// Start refreshes; holding Up (menu) signs out.
class TodayView extends WatchUi.View {
    var page as Number = 0;
    var loading as Boolean = false;
    var error as String? = null;

    function initialize() {
        View.initialize();
    }

    hidden var offered as Boolean = false;

    function onShow() as Void {
        // Refresh if the stored day is older than 15 minutes (or missing).
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
        return 3 + workouts().size(); // today, steps per workout, body, tomorrow
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
        if (t == null) {
            Ui.drawWrapped(dc, dc.getHeight() / 2 - 20, loading ? "Loading today…" : (error != null ? error : "Press Start to load"), Graphics.FONT_SMALL, Ui.DIM, 3);
            return;
        }
        var ws = workouts();
        if (page == 0) {
            drawToday(dc, t, ws);
        } else if (page <= ws.size()) {
            drawSteps(dc, ws[page - 1] as Dictionary);
        } else if (page == ws.size() + 1) {
            drawBody(dc, t);
        } else {
            drawTomorrow(dc, t);
        }
        drawDots(dc);
        if (loading || error != null) {
            dc.setColor(error != null ? Ui.AMBER : Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(dc.getWidth() / 2, dc.getHeight() * 0.88, Graphics.FONT_XTINY, loading ? "Updating…" : error, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    hidden function drawToday(dc as Graphics.Dc, t as Dictionary, ws as Array) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var r = t["r"];
        var flag = r instanceof Dictionary ? r["o"] as String? : null;
        dc.setColor(Ui.readinessColor(flag), Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(6);
        dc.drawArc(w / 2, h / 2, w / 2 - 4, Graphics.ARC_COUNTER_CLOCKWISE, 200, 340);
        Ui.drawWrapped(dc, (h * 0.12).toNumber(), Ui.readinessText(flag).toUpper(), Graphics.FONT_XTINY, Ui.readinessColor(flag), 1);
        var y = (h * 0.26).toNumber();
        if (ws.size() == 0) {
            Ui.drawWrapped(dc, y + 20, "Nothing planned today", Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 2);
            return;
        }
        var first = ws[0] as Dictionary;
        var sub = Ui.sportName(first["s"] as String?);
        if (first["min"] instanceof Number) { sub = sub + " · " + (first["min"] as Number).toString() + " min"; }
        dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, y, Graphics.FONT_XTINY, sub, Graphics.TEXT_JUSTIFY_CENTER);
        y += dc.getFontHeight(Graphics.FONT_XTINY);
        y = Ui.drawWrapped(dc, y, first["t"] as String, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 2);
        var why = first["why"];
        if (why instanceof String) {
            Ui.drawWrapped(dc, y + 4, why, Graphics.FONT_XTINY, Ui.DIM, 3);
        } else if (ws.size() > 1) {
            Ui.drawWrapped(dc, y + 4, "+ " + ((ws[1] as Dictionary)["t"] as String), Graphics.FONT_XTINY, Ui.DIM, 2);
        }
    }

    hidden function drawSteps(dc as Graphics.Dc, wk as Dictionary) as Void {
        var h = dc.getHeight();
        var y = Ui.drawWrapped(dc, (h * 0.1).toNumber(), (wk["t"] as String).toUpper(), Graphics.FONT_XTINY, Ui.GREEN, 2) + 4;
        if (y < h * 0.22) { y = (h * 0.22).toNumber(); }
        var lines = wk["l"];
        var f = wk["f"];
        if (f instanceof Dictionary && f["first"] instanceof Number && f["every"] instanceof Number) {
            var fuel = "Fuel: " + (f["n"] as String) + " at " + ((f["first"] as Number) / 60).toString() + " min, then every " + ((f["every"] as Number) / 60).toString();
            y = Ui.drawWrapped(dc, y, fuel, Graphics.FONT_XTINY, Ui.AMBER, 2) + 4;
        }
        if (!(lines instanceof Array) || lines.size() == 0) {
            Ui.drawWrapped(dc, y + 20, "Open on your phone for the steps", Graphics.FONT_XTINY, Ui.DIM, 2);
            return;
        }
        for (var i = 0; i < lines.size() && y < h * 0.82; i++) {
            y = Ui.drawWrapped(dc, y, lines[i] as String, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, 2) + 2;
        }
    }

    hidden function drawBody(dc as Graphics.Dc, t as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var m = t["m"] instanceof Dictionary ? t["m"] as Dictionary : {};
        dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.12, Graphics.FONT_XTINY, "LAST NIGHT", Graphics.TEXT_JUSTIFY_CENTER);
        var rows = [] as Array<Array<String>>;
        if (m["hrv"] instanceof Number) { rows.add(["HRV", (m["hrv"] as Number).toString() + " ms"]); }
        if (m["rhr"] instanceof Number) { rows.add(["Resting HR", (m["rhr"] as Number).toString()]); }
        if (m["sl"] instanceof Number) {
            var sl = m["sl"] as Number;
            rows.add(["Sleep", (sl / 60).toString() + "h " + (sl % 60).format("%02d") + "m"]);
        }
        if (m["ss"] instanceof Number) { rows.add(["Sleep score", (m["ss"] as Number).toString()]); }
        if (m["bb"] instanceof Number) { rows.add(["Body Battery", (m["bb"] as Number).toString()]); }
        if (rows.size() == 0) {
            Ui.drawWrapped(dc, h / 2 - 10, "No numbers yet today", Graphics.FONT_SMALL, Ui.DIM, 2);
            return;
        }
        var y = (h * 0.26).toNumber();
        var rowH = dc.getFontHeight(Graphics.FONT_SMALL) + 2;
        for (var i = 0; i < rows.size(); i++) {
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.18, y, Graphics.FONT_XTINY, rows[i][0], Graphics.TEXT_JUSTIFY_LEFT);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.82, y - 4, Graphics.FONT_SMALL, rows[i][1], Graphics.TEXT_JUSTIFY_RIGHT);
            y += rowH;
        }
    }

    hidden function drawTomorrow(dc as Graphics.Dc, t as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.12, Graphics.FONT_XTINY, "TOMORROW", Graphics.TEXT_JUSTIFY_CENTER);
        var nx = t["nx"];
        if (!(nx instanceof Array) || nx.size() == 0) {
            Ui.drawWrapped(dc, h / 2 - 10, "Nothing planned yet", Graphics.FONT_SMALL, Ui.DIM, 2);
            return;
        }
        var y = (h * 0.3).toNumber();
        for (var i = 0; i < nx.size(); i++) {
            var n = nx[i] as Dictionary;
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, y, Graphics.FONT_XTINY, Ui.sportName(n["s"] as String?), Graphics.TEXT_JUSTIFY_CENTER);
            y += dc.getFontHeight(Graphics.FONT_XTINY);
            y = Ui.drawWrapped(dc, y, n["t"] as String, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 2) + 6;
        }
    }

    // Page dots down the right edge.
    hidden function drawDots(dc as Graphics.Dc) as Void {
        var n = pageCount();
        var x = dc.getWidth() - 10;
        var y0 = dc.getHeight() / 2 - (n - 1) * 5;
        for (var i = 0; i < n; i++) {
            dc.setColor(i == page ? Graphics.COLOR_WHITE : Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x, y0 + i * 10, i == page ? 3 : 2);
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
        view.page = (view.page + 1) % view.pageCount();
        WatchUi.requestUpdate();
        return true;
    }

    function onPreviousPage() as Boolean {
        view.page = (view.page - 1 + view.pageCount()) % view.pageCount();
        WatchUi.requestUpdate();
        return true;
    }

    function onSelect() as Boolean {
        view.refresh();
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
