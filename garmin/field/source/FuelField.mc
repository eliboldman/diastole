import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// The day's fueling plan for this activity: the planned session matching the sport (or the only
// one), else a general rule that starts after an hour.
module FuelPlan {
    function today() as Dictionary? { return FieldApi.today(); }

    function sportOfActivity() as String? {
        if (!(Activity has :getProfileInfo)) { return null; }
        var p = Activity.getProfileInfo();
        if (p == null) { return null; }
        var s = p.sport;
        if (s == Activity.SPORT_RUNNING) { return "run"; }
        if (s == Activity.SPORT_CYCLING) { return "bike"; }
        if (s == Activity.SPORT_SWIMMING) { return "swim"; }
        return null;
    }

    // { "first", "every", "carbs", "drink", "n" } in seconds/grams, plus "planned" true/false.
    function pick() as Dictionary {
        var day = today();
        var list = day != null && day["w"] instanceof Array ? day["w"] as Array : [];
        var sport = sportOfActivity();
        var match = null;
        for (var i = 0; i < list.size(); i++) {
            var w = list[i] as Dictionary;
            if (sport != null && w["s"] instanceof String && (w["s"] as String).equals(sport)) { match = w; break; }
        }
        if (match == null && list.size() == 1) { match = list[0]; }
        if (match instanceof Dictionary) {
            var f = (match as Dictionary)["f"];
            if (f instanceof Dictionary) {
                f["planned"] = true;
                return f;
            }
            return { "planned" => true, "none" => true }; // planned, but short enough to need nothing
        }
        // No plan for this: fuel if it turns into a long one.
        return { "first" => 60 * 60, "every" => 30 * 60, "carbs" => 25, "drink" => 20 * 60, "n" => "Gel or chews (~25 g)", "planned" => false };
    }
}

// Text that fits wherever the field sits. On round watches a slot touching the bezel (top, bottom
// or a side) loses width toward that edge; obscurity flags say which edges touch it.
module FieldText {
    // Usable width for a line spanning y..y+lh in a w x h area with the given obscurity flags.
    function widthAt(w as Number, h as Number, flags as Number, y as Number, lh as Number) as Number {
        var full = w - 8;
        var ds = System.getDeviceSettings();
        var left = (flags & WatchUi.DataField.OBSCURE_LEFT) != 0;
        var right = (flags & WatchUi.DataField.OBSCURE_RIGHT) != 0;
        if (ds.screenShape != System.SCREEN_SHAPE_ROUND || (!left && !right && (flags & (WatchUi.DataField.OBSCURE_TOP | WatchUi.DataField.OBSCURE_BOTTOM)) == 0)) {
            return full;
        }
        var r = ds.screenWidth / 2.0;
        // Where the field's top sits on screen.
        var top = 0.0;
        if ((flags & WatchUi.DataField.OBSCURE_TOP) != 0) { top = 0.0; }
        else if ((flags & WatchUi.DataField.OBSCURE_BOTTOM) != 0) { top = ds.screenHeight - h; }
        else { top = (ds.screenHeight - h) / 2.0; }
        var a = top + y - r;
        var b = top + y + lh - r;
        var d = a.abs() > b.abs() ? a.abs() : b.abs();
        if (a < 0 && b > 0) { d = 0; }
        if (d >= r) { return 0; }
        var half = Math.sqrt(r * r - d * d) - 12;
        var avail = full.toFloat();
        if (left && right) { avail = 2 * half; }
        else if (left) { avail = 2 * (w / 2.0 - (r - half)); }              // field starts at the screen's left edge
        else if (right) { avail = 2 * ((r + half) - (ds.screenWidth - w / 2.0)); } // field ends at the right edge
        if (avail > full) { avail = full.toFloat(); }
        return avail < 0 ? 0 : avail.toNumber();
    }

    function ellipsize(dc as Graphics.Dc, s as String, font as Graphics.FontType, width as Number) as String {
        var t = s;
        while (t.length() > 0 && dc.getTextWidthInPixels(t + "…", font) > width) {
            t = t.substring(0, t.length() - 1) as String;
        }
        return t + "…";
    }

    // Word-wraps text into at most maxLines lines starting at y, each fitted to its own width.
    function lines(dc as Graphics.Dc, flags as Number, y as Number, text as String, font as Graphics.FontType, maxLines as Number) as Array<String> {
        var out = [] as Array<String>;
        var lh = dc.getFontHeight(font);
        var words = [] as Array<String>;
        var rest = text;
        var i = rest.find(" ");
        while (i != null) {
            words.add(rest.substring(0, i) as String);
            rest = rest.substring(i + 1, rest.length()) as String;
            i = rest.find(" ");
        }
        words.add(rest);
        var k = 0;
        for (var n = 0; n < maxLines && k < words.size(); n++) {
            var width = widthAt(dc.getWidth(), dc.getHeight(), flags, y + n * lh, lh);
            var line = words[k];
            k++;
            while (k < words.size() && dc.getTextWidthInPixels(line + " " + words[k], font) <= width) {
                line = line + " " + words[k];
                k++;
            }
            if ((n == maxLines - 1 && k < words.size()) || dc.getTextWidthInPixels(line, font) > width) {
                line = ellipsize(dc, line, font, width);
            }
            out.add(line);
        }
        return out;
    }

    function draw(dc as Graphics.Dc, y as Number, ls as Array<String>, font as Graphics.FontType) as Void {
        var lh = dc.getFontHeight(font);
        for (var i = 0; i < ls.size(); i++) {
            dc.drawText(dc.getWidth() / 2, y + i * lh, font, ls[i], Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    // First y at or below `from` (stepping toward `to`) where text fits on one line.
    function firstFit(dc as Graphics.Dc, flags as Number, text as String, font as Graphics.FontType, from as Number, to as Number) as Number {
        var lh = dc.getFontHeight(font);
        var tw = dc.getTextWidthInPixels(text, font);
        var step = to >= from ? 2 : -2;
        for (var y = from; step > 0 ? y <= to : y >= to; y += step) {
            if (widthAt(dc.getWidth(), dc.getHeight(), flags, y, lh) >= tw) { return y; }
        }
        return to;
    }
}

class FuelField extends WatchUi.DataField {
    hidden var plan as Dictionary? = null;
    hidden var elapsed as Number = 0; // timer seconds
    hidden var carbsDone as Number = 0; // carb reminders fired
    hidden var drinksDone as Number = 0;
    hidden var flashUntil as Number = 0; // show "now" this long after a reminder
    hidden var flashText as String = "";

    function initialize() {
        DataField.initialize();
    }

    function onTimerStart() as Void { plan = FuelPlan.pick(); }
    function onTimerReset() as Void {
        plan = null;
        carbsDone = 0;
        drinksDone = 0;
        flashUntil = 0;
    }

    function compute(info as Activity.Info) as Void {
        var t = info.timerTime;
        elapsed = t != null ? (t / 1000) : 0;
        if (plan == null || (elapsed < 60 && !(plan["planned"] as Boolean) && FuelPlan.today() != null)) { plan = FuelPlan.pick(); }
        var p = plan as Dictionary;
        if (p.hasKey("none") || !(p["first"] instanceof Number) || elapsed == 0) { return; }
        var first = p["first"] as Number;
        var every = p["every"] as Number;
        var drink = p["drink"] instanceof Number ? p["drink"] as Number : 0;
        // Carbs: due at first, first + every, …
        var carbsDue = elapsed < first ? 0 : (elapsed - first) / every + 1;
        if (carbsDue > carbsDone) {
            carbsDone = carbsDue;
            remind(p["n"] as String, true);
        } else if (drink > 0 && elapsed / drink > drinksDone) {
            drinksDone = elapsed / drink;
            // Skip a drink buzz that lands within 2 minutes of a carb one.
            var nextCarb = elapsed < first ? first : first + carbsDone * every;
            if (nextCarb - elapsed > 120 && elapsed - (first + (carbsDone - 1) * every) > 120) { remind("Drink", false); }
        }
    }

    hidden function remind(text as String, strong as Boolean) as Void {
        flashText = text;
        flashUntil = elapsed + 45;
        if (Attention has :vibrate) {
            Attention.vibrate(strong
                ? [new Attention.VibeProfile(100, 400), new Attention.VibeProfile(0, 200), new Attention.VibeProfile(100, 400)]
                : [new Attention.VibeProfile(60, 300)]);
        }
        if (strong && Attention has :playTone) { Attention.playTone(Attention.TONE_ALERT_HI); }
        if (strong && WatchUi.DataField has :showAlert) { showAlert(new FuelAlert(text)); }
    }

    hidden function mmss(sec as Number) as String {
        if (sec < 0) { sec = 0; }
        return (sec / 60).toString() + ":" + (sec % 60).format("%02d");
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var bg = getBackgroundColor();
        var fg = bg == Graphics.COLOR_BLACK ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        dc.setColor(fg, bg);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var green = 0x2DBE8A;

        var big = "";
        var small = "";
        if (FieldApi.token() == null) {
            var pair = FieldApi.livePair(); // never show an expired code
            if (pair != null) {
                big = pair["code"] as String;
                small = "diastole.app/me/devices";
            } else {
                big = "Diastole";
                small = "Getting a code…";
            }
        } else if (elapsed < flashUntil) {
            big = "Now";
            small = flashText;
        } else {
            var p = plan != null ? plan as Dictionary : FuelPlan.pick();
            if (p.hasKey("none")) {
                big = "—";
                small = "No fuel needed";
            } else {
                var first = p["first"] as Number;
                var every = p["every"] as Number;
                var nextCarb = elapsed < first ? first : first + ((elapsed - first) / every + 1) * every;
                big = mmss(nextCarb - elapsed);
                var drink = p["drink"] instanceof Number ? p["drink"] as Number : 0;
                small = (p["planned"] as Boolean) ? "to fuel" : "to fuel (no plan)";
                if (drink > 0) { small = small + " · drink " + mmss((elapsed / drink + 1) * drink - elapsed); }
            }
        }

        var flags = getObscurityFlags();
        var xt = Graphics.FONT_XTINY;
        var lh = dc.getFontHeight(xt);

        // Label: as high as it fits without touching the bezel.
        var labelY = FieldText.firstFit(dc, flags, "FUEL", xt, 2, h / 3);
        dc.setColor(green, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, labelY, xt, "FUEL", Graphics.TEXT_JUSTIFY_CENTER);
        var topFree = labelY + lh;

        // Bottom text: one line in short fields, two where there's room; pushed up off a bottom bezel.
        var smallLines = [] as Array<String>;
        var bottomFree = h;
        if (small.length() > 0 && h > 60) {
            var maxLines = h > 140 ? 2 : 1;
            var y0 = h - maxLines * lh - 2;
            if ((flags & OBSCURE_BOTTOM) != 0) {
                // Move up until the first line is at least 70% of the field wide.
                while (y0 > h / 2 && FieldText.widthAt(w, h, flags, y0 + (maxLines - 1) * lh, lh) < w * 0.7) { y0 -= 2; }
            }
            smallLines = FieldText.lines(dc, flags, y0, small, xt, maxLines);
            y0 += (maxLines - smallLines.size()) * lh; // sit one-line text where the last line would be
            dc.setColor(fg == Graphics.COLOR_WHITE ? 0x9AA5A0 : 0x55605B, Graphics.COLOR_TRANSPARENT);
            FieldText.draw(dc, y0, smallLines, xt);
            bottomFree = y0;
        }

        // Big value in the space between, shrinking the font until it fits.
        var fonts = big.find(":") != null
            ? [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] // number fonts only have digits and ":"
            : [Graphics.FONT_LARGE, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY];
        var cy = (topFree + bottomFree) / 2;
        var bigFont = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            var f = fonts[i] as Graphics.FontType;
            var fh = dc.getFontHeight(f);
            if (fh <= (bottomFree - topFree) + 8 && dc.getTextWidthInPixels(big, f) <= FieldText.widthAt(w, h, flags, cy - fh / 2, fh)) {
                bigFont = f;
                break;
            }
        }
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, cy, bigFont, big, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

// Full-screen alert when carbs are due (watches that support data field alerts).
class FuelAlert extends WatchUi.DataFieldAlert {
    hidden var text as String;

    function initialize(text as String) {
        DataFieldAlert.initialize();
        self.text = text;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var h = dc.getHeight();
        var all = WatchUi.DataField.OBSCURE_TOP | WatchUi.DataField.OBSCURE_BOTTOM | WatchUi.DataField.OBSCURE_LEFT | WatchUi.DataField.OBSCURE_RIGHT;
        dc.setColor(0x6EE4B7, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, h * 0.24, Graphics.FONT_MEDIUM, text.equals("Drink") ? "DRINK" : "FUEL", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        var y = (h * 0.44).toNumber();
        FieldText.draw(dc, y, FieldText.lines(dc, all, y, text, Graphics.FONT_SMALL, 3), Graphics.FONT_SMALL);
    }
}
