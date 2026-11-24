import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// Diastole Breathe. Opens on a list: today's suggestion first, then every session and the CO2 check.
// The Diastole widget's Breathe card opens it with { token, k, m, p } so it's linked and goes
// straight to the suggested session. Works without a link too (sessions wait in the outbox).
class BreatheApp extends Application.AppBase {
    var launch as Dictionary? = null; // the widget's hand-off, if any

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        if (state == null) { return; }
        if (state["token"] instanceof String) { Application.Storage.setValue("token", state["token"]); }
        if (Net.isNum(state["p"])) { Net.setPace(state["p"] as Numeric); }
        if (state["k"] instanceof String) {
            Application.Storage.setValue("sug", { "k" => state["k"], "m" => state["m"], "y" => state["y"] });
            launch = state;
        }
    }

    function onStop(state as Dictionary?) as Void {}

    (:debug)
    function auto() as [WatchUi.Views, WatchUi.InputDelegates]? {
        if (Debug.AUTO.equals("")) { return null; }
        if (Debug.AUTO.equals("hold")) { var hv = new HoldView(); return [hv, new HoldDelegate(hv)]; }
        var p = new PlayerView(Debug.AUTO, 1);
        p.debugShort(Debug.SHORT_MS);
        return [p, new PlayerDelegate(p)];
    }
    (:release)
    function auto() as [WatchUi.Views, WatchUi.InputDelegates]? { return null; }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var a = auto();
        if (a != null) { return a; }
        new Sync(null).start(); // send anything waiting, refresh today's suggestion
        var menu = new HomeMenu();
        return [menu, new HomeDelegate(menu)];
    }
}
