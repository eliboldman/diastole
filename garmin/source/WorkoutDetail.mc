import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// One session, all of it: title, why, fueling, then every step on its own frosted card. Nothing
// is cut off; up/down (or a swipe) glides the page. Back returns to the cards.
class WorkoutDetail extends WatchUi.View {
    var wk as Dictionary;
    var scroll as Number = 0; // px scrolled (animated)
    hidden var target as Number = 0;
    hidden var contentH as Number = 0;
    hidden var built as Boolean = false;
    // Laid-out rows: [kind, lines, font, color]
    hidden var rows as Array<Array> = [] as Array<Array>;
    hidden var rowTops as Array<Number> = [] as Array<Number>;

    function initialize(wk as Dictionary) {
        View.initialize();
        self.wk = wk;
    }

    hidden function width(dc as Graphics.Dc) as Number {
        return (dc.getWidth() * (Ui.isRound() ? 0.72 : 0.88)).toNumber();
    }

    hidden function build(dc as Graphics.Dc) as Void {
        var cw = width(dc);
        rows = [] as Array<Array>;
        var head = Ui.sportName(wk["s"] as String?).toUpper();
        if (wk["min"] instanceof Number) { head = head + "  ·  ~" + Lay.hm(wk["min"] as Number); }
        rows.add(["text", [head], Graphics.FONT_XTINY, Ui.GREEN]);
        rows.add(["text", Lay.wrap(dc, wk["t"] as String, Graphics.FONT_SMALL, cw), Graphics.FONT_SMALL, Graphics.COLOR_WHITE]);
        if (wk["why"] instanceof String) {
            rows.add(["text", Lay.wrap(dc, wk["why"] as String, Graphics.FONT_XTINY, cw), Graphics.FONT_XTINY, Ui.DIM]);
        }
        var f = wk["f"];
        if (f instanceof Dictionary && f["first"] instanceof Number && f["every"] instanceof Number) {
            var text = (f["n"] as String) + " at " + ((f["first"] as Number) / 60).toString() + " min, then every " + ((f["every"] as Number) / 60).toString() + " min.";
            if (f["drink"] instanceof Number && (f["drink"] as Number) > 0) { text = text + " Sips every " + ((f["drink"] as Number) / 60).toString() + " min."; }
            rows.add(["fuel", Lay.wrap(dc, text, Graphics.FONT_XTINY, cw - 20), Graphics.FONT_XTINY, Ui.AMBER]);
        }
        var lines = wk["l"] instanceof Array ? wk["l"] as Array : [];
        if (lines.size() == 0) {
            rows.add(["text", Lay.wrap(dc, "Open the session on your phone for the steps.", Graphics.FONT_XTINY, cw), Graphics.FONT_XTINY, Ui.DIM]);
        }
        for (var i = 0; i < lines.size(); i++) {
            rows.add(["step", Lay.wrap(dc, lines[i] as String, Graphics.FONT_XTINY, cw - 20), Graphics.FONT_XTINY, Graphics.COLOR_WHITE]);
        }
        // Tops, with room above and below so the first and last rows can reach mid-screen.
        rowTops = [] as Array<Number>;
        var y = (dc.getHeight() * 0.16).toNumber();
        for (var r = 0; r < rows.size(); r++) {
            rowTops.add(y);
            y += rowHeight(dc, rows[r]) + gapAfter(rows[r]);
        }
        contentH = y + (dc.getHeight() * 0.16).toNumber();
        built = true;
    }

    hidden function rowHeight(dc as Graphics.Dc, row as Array) as Number {
        var n = (row[1] as Array).size();
        var lh = dc.getFontHeight(row[2] as Graphics.FontType);
        var pad = (row[0] as String).equals("text") ? 0 : 14;
        return n * lh + pad;
    }

    hidden function gapAfter(row as Array) as Number {
        return (row[0] as String).equals("step") ? 6 : 10;
    }

    function maxScroll() as Number {
        var h = System.getDeviceSettings().screenHeight;
        return contentH > h ? contentH - h : 0;
    }

    // Moves by about two thirds of a screen, gliding.
    function move(dir as Number) as Boolean {
        if (!built) { return false; }
        var h = System.getDeviceSettings().screenHeight;
        var next = target + dir * (h * 0.6).toNumber();
        if (next < 0) { next = 0; }
        if (next > maxScroll()) { next = maxScroll(); }
        if (next == target) { return false; }
        target = next;
        WatchUi.animate(self, :scroll, WatchUi.ANIM_TYPE_EASE_OUT, scroll, target, 0.25, null);
        return true;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        if (!built) { build(dc); }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cw = width(dc);
        var x0 = (w - cw) / 2;
        for (var r = 0; r < rows.size(); r++) {
            var row = rows[r];
            var top = rowTops[r] - scroll;
            var rh = rowHeight(dc, row);
            if (top + rh < 0 || top > h) { continue; }
            var kind = row[0] as String;
            var font = row[2] as Graphics.FontType;
            var lh = dc.getFontHeight(font);
            var lines = row[1] as Array;
            if (!kind.equals("text")) {
                Lay.card(dc, x0, top, cw, rh, 14, kind.equals("fuel") ? 0x2A2412 : Ui.CARD);
                if (kind.equals("fuel")) {
                    dc.setColor(Ui.AMBER, Graphics.COLOR_TRANSPARENT);
                    dc.fillRoundedRectangle(x0, top + 8, 4, rh - 16, 2);
                }
            }
            dc.setColor(row[3] as Number, Graphics.COLOR_TRANSPARENT);
            var ty = top + (kind.equals("text") ? 0 : 7);
            for (var i = 0; i < lines.size(); i++) {
                dc.drawText(w / 2, ty + i * lh, font, lines[i] as String, Graphics.TEXT_JUSTIFY_CENTER);
            }
        }
        drawScrollbar(dc);
    }

    // A short arc (round) or bar (rectangular) on the right showing where you are.
    hidden function drawScrollbar(dc as Graphics.Dc) as Void {
        var ms = maxScroll();
        if (ms == 0) { return; }
        var w = dc.getWidth();
        var h = dc.getHeight();
        var frac = scroll.toFloat() / ms;
        if (Ui.isRound()) {
            var span = 50; // degrees of track, centered on 3 o'clock
            var thumb = 14;
            dc.setPenWidth(4);
            dc.setColor(Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(w / 2, h / 2, w / 2 - 6, Graphics.ARC_CLOCKWISE, span / 2, -span / 2);
            var start = span / 2 - (frac * (span - thumb)).toNumber();
            dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(w / 2, h / 2, w / 2 - 6, Graphics.ARC_CLOCKWISE, start, start - thumb);
            dc.setPenWidth(1);
        } else {
            var track = (h * 0.5).toNumber();
            var y0 = (h - track) / 2;
            var th = 30;
            dc.setColor(Ui.EDGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w - 6, y0, 4, track, 2);
            dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w - 6, y0 + (frac * (track - th)).toNumber(), 4, th, 2);
        }
    }
}

class WorkoutDetailDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as WorkoutDetail;

    function initialize(view as WorkoutDetail) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onNextPage() as Boolean { view.move(1); return true; }
    function onPreviousPage() as Boolean { view.move(-1); return true; }
    function onSelect() as Boolean {
        if (!view.move(1)) { WatchUi.popView(WatchUi.SLIDE_RIGHT); } // at the end, Start goes back
        return true;
    }
    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
