import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// The home list. First: today's suggestion from Diastole (or a quick reset when there isn't one).
// Then every session with what it's for, the CO2 check, and how to link when the watch isn't.
class HomeMenu extends WatchUi.Menu2 {
    hidden var opened as Boolean = false;

    function initialize() {
        Menu2.initialize({ :title => "Breathe" });
        var sug = Net.suggestion();
        var k = sug != null ? sug["k"] as String : "sigh";
        var m = sug != null && sug["m"] instanceof Number ? sug["m"] as Number : (Plan.minutes(k))[0];
        addItem(new WatchUi.MenuItem("For you: " + Plan.title(k), m.toString() + " min · " + Plan.short(k), "s:" + k + ":" + m.toString(), null));
        for (var i = 0; i < Plan.KINDS.size(); i++) {
            var kind = Plan.KINDS[i] as String;
            var sub = kind.equals("resonance") ? Plan.short(kind) + " · " + Plan.paceText(Net.pace()) + "/min" : Plan.short(kind);
            addItem(new WatchUi.MenuItem(Plan.title(kind), sub, "s:" + kind + ":0", null));
        }
        addItem(new WatchUi.MenuItem("CO2 check", "Seated breath hold, timed", "hold", null)); // not recorded as an activity
        if (Net.token() == null) {
            addItem(new WatchUi.MenuItem("Link to Diastole", "Saves your sessions", "link", null));
        }
    }

    // Opened from the widget's Breathe card: straight to the suggested session.
    function onShow() as Void {
        Menu2.onShow();
        if (opened) { return; }
        opened = true;
        var launch = (Application.getApp() as BreatheApp).launch;
        if (launch != null && launch["k"] instanceof String) {
            var m = launch["m"] instanceof Number ? launch["m"] as Number : 0;
            Nav.ready(launch["k"] as String, m);
        }
    }
}

class HomeDelegate extends WatchUi.Menu2InputDelegate {
    hidden var menu as HomeMenu;

    function initialize(menu as HomeMenu) {
        Menu2InputDelegate.initialize();
        self.menu = menu;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId() as String;
        if (id.equals("hold")) {
            var v = new HoldView();
            WatchUi.pushView(v, new HoldDelegate(v), WatchUi.SLIDE_LEFT);
        } else if (id.equals("link")) {
            var v = new NoteView("Link to Diastole", "On the watch, open the Diastole widget and its Breathe card, then press Start. Sessions you do before linking are kept and sent once linked.");
            WatchUi.pushView(v, new NoteDelegate(), WatchUi.SLIDE_LEFT);
        } else {
            var parts = Look.split2(id);
            Nav.ready(parts[0], parts[1].toNumber() as Number);
        }
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

module Nav {
    // The ready screen for a session; minutes 0 = its default length.
    function ready(k as String, minutes as Number) as Void {
        var v = new ReadyView(k, minutes);
        WatchUi.pushView(v, new ReadyDelegate(v), WatchUi.SLIDE_LEFT);
    }
}
