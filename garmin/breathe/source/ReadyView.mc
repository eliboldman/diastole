import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Before a session: what it's for, how to do it, and the length (up/down changes it). Start begins.
class ReadyView extends WatchUi.View {
    var kind as String;
    var lengths as Array<Number>;
    var pick as Number = 0;

    function initialize(kind as String, minutes as Number) {
        View.initialize();
        self.kind = kind;
        lengths = Plan.minutes(kind);
        for (var i = 0; i < lengths.size(); i++) {
            if (lengths[i] == minutes) { pick = i; }
        }
    }

    function change(by as Number) as Void {
        if (lengths.size() < 2) { return; }
        pick = (pick + by + lengths.size()) % lengths.size();
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var y = Look.text(dc, (h * 0.11).toNumber(), Plan.short(kind).toUpper(), Graphics.FONT_XTINY, Look.GREEN, 1);
        y = Look.text(dc, y, Plan.title(kind), Graphics.FONT_SMALL, Graphics.COLOR_WHITE, 2) + 2;
        // The length, with arrows when there's a choice; the how-to gets the lines that fit above it.
        var my = (h * 0.66).toNumber();
        var room = (my - dc.getFontHeight(Graphics.FONT_MEDIUM) / 2 - 2 - y) / dc.getFontHeight(Graphics.FONT_XTINY);
        if (room > 3) { room = 3; }
        if (room > 0) { Look.text(dc, y, Plan.how(kind, Net.pace()), Graphics.FONT_XTINY, Look.DIM, room); }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, my, Graphics.FONT_MEDIUM, lengths[pick].toString() + " min", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (lengths.size() > 1) {
            var tw = dc.getTextWidthInPixels(lengths[pick].toString() + " min", Graphics.FONT_MEDIUM) / 2 + 14;
            dc.setColor(Look.DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillPolygon([[w / 2 - tw, my - 5], [w / 2 - tw - 8, my + 4], [w / 2 - tw + 8, my + 4]]);
            dc.fillPolygon([[w / 2 + tw, my + 5], [w / 2 + tw - 8, my - 4], [w / 2 + tw + 8, my - 4]]);
        }
        Look.pill(dc, w / 2, (h * 0.83).toNumber(), "Start", Graphics.FONT_SMALL, Look.GREEN, Graphics.COLOR_BLACK);
    }
}

class ReadyDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as ReadyView;

    function initialize(view as ReadyView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onNextPage() as Boolean { view.change(1); return true; }
    function onPreviousPage() as Boolean { view.change(-1); return true; }

    function onSelect() as Boolean {
        var p = new PlayerView(view.kind, view.lengths[view.pick]);
        WatchUi.switchToView(p, new PlayerDelegate(p), WatchUi.SLIDE_LEFT);
        return true;
    }
}

// A screen of text (help); any button goes back.
class NoteView extends WatchUi.View {
    hidden var head as String;
    hidden var body as String;

    function initialize(head as String, body as String) {
        View.initialize();
        self.head = head;
        self.body = body;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var y = Look.text(dc, (dc.getHeight() * 0.14).toNumber(), head, Graphics.FONT_SMALL, Look.GREEN, 2) + 4;
        Look.text(dc, y, body, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, 8);
    }
}

class NoteDelegate extends WatchUi.BehaviorDelegate {
    function initialize() { BehaviorDelegate.initialize(); }
    function onSelect() as Boolean { WatchUi.popView(WatchUi.SLIDE_RIGHT); return true; }
}
