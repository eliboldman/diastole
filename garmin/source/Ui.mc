import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Shared drawing helpers: Diastole colors and word-wrapped text that fits round screens.
(:glance)
module Ui {
    const GREEN = 0x6EE4B7;
    const AMBER = 0xFAC759;
    const RED = 0xFA736B;
    const DIM = 0x8A9590;

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

    // Splits text into lines no wider than `width` pixels.
    function wrap(dc as Graphics.Dc, text as String, font as Graphics.FontType, width as Number) as Array<String> {
        var lines = [] as Array<String>;
        var words = split(text, " ");
        var line = "";
        for (var i = 0; i < words.size(); i++) {
            var next = line.length() == 0 ? words[i] : line + " " + words[i];
            if (dc.getTextWidthInPixels(next, font) <= width || line.length() == 0) {
                line = next;
            } else {
                lines.add(line);
                line = words[i];
            }
        }
        if (line.length() > 0) { lines.add(line); }
        return lines;
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

    // Draws wrapped lines centered from y; returns the y after the last line.
    function drawWrapped(dc as Graphics.Dc, y as Number, text as String, font as Graphics.FontType, color as Number, maxLines as Number) as Number {
        var w = dc.getWidth();
        var lines = wrap(dc, text, font, (w * 0.8).toNumber());
        var h = dc.getFontHeight(font);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < lines.size() && i < maxLines; i++) {
            var s = lines[i];
            if (i == maxLines - 1 && lines.size() > maxLines) { s = s + "…"; }
            dc.drawText(w / 2, y, font, s, Graphics.TEXT_JUSTIFY_CENTER);
            y += h;
        }
        return y;
    }
}
