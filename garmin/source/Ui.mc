import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.WatchUi;

// Shared drawing helpers: Diastole colors and word-wrapped text that fits round screens.
(:glance)
module Ui {
    const GREEN = 0x6EE4B7;
    const AMBER = 0xFAC759;
    const RED = 0xFA736B;
    const DIM = 0x8A9590;
    const FAINT = 0x4F5A56;
    const CARD = 0x15201C; // the app's frosted cards, on black
    const EDGE = 0x24332E;

    function readinessColor(flag as String?) as Number {
        if (flag == null) { return DIM; }
        if (flag.equals("green")) { return GREEN; }
        if (flag.equals("yellow")) { return AMBER; }
        return RED;
    }

    function readinessText(flag as String?) as String {
        if (flag == null) { return "No readiness yet"; }
        if (flag.equals("green")) { return "Ready to train"; }
        if (flag.equals("yellow")) { return "Take it easier"; }
        return "Recovery day";
    }

    function sportName(s as String?) as String {
        if (s == null) { return ""; }
        if (s.equals("bike")) { return "Ride"; }
        if (s.equals("run")) { return "Run"; }
        if (s.equals("swim")) { return "Swim"; }
        if (s.equals("strength")) { return "Strength"; }
        return s;
    }

    function split(s as String, sep as String) as Array<String> {
        var out = [] as Array<String>;
        var rest = s;
        var i = rest.find(sep);
        while (i != null) {
            out.add(rest.substring(0, i) as String);
            rest = rest.substring(i + sep.length(), rest.length()) as String;
            i = rest.find(sep);
        }
        out.add(rest);
        return out;
    }

    function isRound() as Boolean {
        return System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
    }

    // Usable text width for a line spanning y..y+lineH. Round screens are narrower near the top
    // and bottom, so this follows the circle (minus a margin for the bezel and page dots).
    function widthAt(dc as Graphics.Dc, y as Number, lineH as Number) as Number {
        var w = dc.getWidth();
        if (!isRound()) {
            return (w * 0.9).toNumber();
        }
        var r = w / 2.0;
        var cy = dc.getHeight() / 2.0;
        var d = (y - cy).abs();
        var d2 = (y + lineH - cy).abs();
        if (d2 > d) { d = d2; }
        if (y < cy && y + lineH > cy) { d = 0; }
        if (d >= r) { return 0; }
        var chord = 2 * Math.sqrt(r * r - d * d) - 44; // bezel + page dots
        var cap = w * 0.86;
        return (chord < cap ? chord : cap).toNumber();
    }

    // Cuts s down until s + "…" fits in width.
    function ellipsize(dc as Graphics.Dc, s as String, font as Graphics.FontType, width as Number) as String {
        var t = s;
        while (t.length() > 0 && dc.getTextWidthInPixels(t + "…", font) > width) {
            t = t.substring(0, t.length() - 1) as String;
        }
        return t + "…";
    }

    // Draws text centered from y, word-wrapped to the screen's width at each line; returns the y
    // after the last line. Text that doesn't fit in maxLines ends with "…".
    function drawWrapped(dc as Graphics.Dc, y as Number, text as String, font as Graphics.FontType, color as Number, maxLines as Number) as Number {
        var cx = dc.getWidth() / 2;
        var h = dc.getFontHeight(font);
        var words = split(text, " ");
        var i = 0;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        for (var n = 0; n < maxLines && i < words.size(); n++) {
            var width = widthAt(dc, y, h);
            var line = words[i];
            i++;
            while (i < words.size() && dc.getTextWidthInPixels(line + " " + words[i], font) <= width) {
                line = line + " " + words[i];
                i++;
            }
            var last = n == maxLines - 1;
            if ((last && i < words.size()) || dc.getTextWidthInPixels(line, font) > width) {
                line = ellipsize(dc, line, font, width);
            }
            dc.drawText(cx, y, font, line, Graphics.TEXT_JUSTIFY_CENTER);
            y += h;
        }
        return y;
    }

}
