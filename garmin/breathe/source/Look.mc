import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

// Diastole colors and small drawing helpers (same palette as the widget).
module Look {
    const GREEN = 0x6EE4B7;
    const AMBER = 0xFAC759;
    const DIM = 0x8A9590;
    const EDGE = 0x24332E;

    function isRound() as Boolean {
        return System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
    }

    // AMOLED gets the soft filled orb; memory-in-pixel screens (few colors) get brighter ink.
    function amoled() as Boolean {
        var s = System.getDeviceSettings();
        return (s has :requiresBurnInProtection) && s.requiresBurnInProtection;
    }

    // Usable width for a line at y (round screens are narrower near the top and bottom).
    function widthAt(dc as Graphics.Dc, y as Number, lineH as Number) as Number {
        var w = dc.getWidth();
        if (!isRound()) { return (w * 0.9).toNumber(); }
        var r = w / 2.0;
        var cy = dc.getHeight() / 2.0;
        var d = (y - cy).abs();
        var d2 = (y + lineH - cy).abs();
        if (d2 > d) { d = d2; }
        if (y < cy && y + lineH > cy) { d = 0; }
        if (d >= r) { return 0; }
        var chord = 2 * Math.sqrt(r * r - d * d) - 30;
        var cap = w * 0.86;
        return (chord < cap ? chord : cap).toNumber();
    }

    // Word-wraps text centered from y following the screen's shape; returns the y after it.
    function text(dc as Graphics.Dc, y as Number, s as String, font as Graphics.FontType, color as Number, maxLines as Number) as Number {
        var h = dc.getFontHeight(font);
        var words = split(s);
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
            if (n == maxLines - 1 && i < words.size()) { line = line + "…"; }
            dc.drawText(dc.getWidth() / 2, y, font, line, Graphics.TEXT_JUSTIFY_CENTER);
            y += h;
        }
        return y;
    }

    function split(s as String) as Array<String> {
        var out = [] as Array<String>;
        var rest = s;
        var i = rest.find(" ");
        while (i != null) {
            out.add(rest.substring(0, i) as String);
            rest = rest.substring(i + 1, rest.length()) as String;
            i = rest.find(" ");
        }
        out.add(rest);
        return out;
    }

    // "s:kind:minutes" (a menu item id) → [kind, minutes]
    function split2(id as String) as Array<String> {
        var rest = id.substring(2, id.length()) as String;
        var i = rest.find(":") as Number;
        return [rest.substring(0, i) as String, rest.substring(i + 1, rest.length()) as String];
    }

    function pill(dc as Graphics.Dc, cx as Number, cy as Number, s as String, font as Graphics.FontType, fill as Number, ink as Number) as Void {
        var tw = dc.getTextWidthInPixels(s, font);
        var th = dc.getFontHeight(font);
        var pw = tw + th;
        dc.setColor(fill, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - pw / 2, cy - th / 2 - 2, pw, th + 4, (th + 4) / 2);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, font, s, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function clock(sec as Number) as String {
        if (sec < 0) { sec = 0; }
        return (sec / 60).toString() + ":" + (sec % 60).format("%02d");
    }

    // ── Buzz cues, so eyes can stay closed ──────────────────────────────────
    // Breathe in: one long buzz. Breathe out: two short. Hold / sip / pause: one tap.
    function cue(phase as String) as Void {
        if (phase.equals("in")) { buzz([new Attention.VibeProfile(60, 320)], Attention.TONE_KEY); }
        else if (phase.equals("out")) { buzz([new Attention.VibeProfile(60, 110), new Attention.VibeProfile(0, 110), new Attention.VibeProfile(60, 110)], Attention.TONE_LOUD_BEEP); }
        else { buzz([new Attention.VibeProfile(40, 60)], Attention.TONE_KEY); }
    }

    function done() as Void {
        buzz([new Attention.VibeProfile(80, 400), new Attention.VibeProfile(0, 150), new Attention.VibeProfile(80, 400)], Attention.TONE_SUCCESS);
    }

    function nudge() as Void {
        buzz([new Attention.VibeProfile(50, 90), new Attention.VibeProfile(0, 90), new Attention.VibeProfile(50, 90), new Attention.VibeProfile(0, 90), new Attention.VibeProfile(50, 90)], Attention.TONE_ALERT_HI);
    }

    // Vibrates where the watch can and the athlete allows it; bike computers without a motor beep.
    function buzz(p as Array<Attention.VibeProfile>, tone as Attention.Tone) as Void {
        var s = System.getDeviceSettings();
        if ((Attention has :vibrate) && s.vibrateOn) { Attention.vibrate(p); }
        else if ((Attention has :playTone) && s.tonesOn) { Attention.playTone(tone); }
    }
}
