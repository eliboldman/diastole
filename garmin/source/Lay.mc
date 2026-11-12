import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// Layout helpers for the full-screen pages (kept out of the glance to save its memory).
module Lay {
    // Lays text out from y, following the round screen's width line by line. Returns the lines,
    // or null when it needs more than maxLines (caller tries a smaller font).
    function layout(dc as Graphics.Dc, y as Number, text as String, font as Graphics.FontType, maxLines as Number, fixedWidth as Number?) as Array<String>? {
        var h = dc.getFontHeight(font);
        var words = Ui.split(text, " ");
        var out = [] as Array<String>;
        var i = 0;
        while (i < words.size()) {
            if (out.size() == maxLines) { return null; }
            var width = fixedWidth != null ? fixedWidth : Ui.widthAt(dc, y, h);
            var line = words[i];
            i++;
            while (i < words.size() && dc.getTextWidthInPixels(line + " " + words[i], font) <= width) {
                line = line + " " + words[i];
                i++;
            }
            if (dc.getTextWidthInPixels(line, font) > width) { line = Ui.ellipsize(dc, line, font, width); }
            out.add(line);
            y += h;
        }
        return out;
    }

    // The largest of fonts that fits text in maxLines, drawn centered at y (+ oy, the page's slide
    // offset). Only the smallest font falls back to "…". Returns the y after the text (no offset).
    function drawFit(dc as Graphics.Dc, y as Number, oy as Number, text as String, fonts as Array<Graphics.FontType>, color as Number, maxLines as Number) as Number {
        var font = fonts[fonts.size() - 1];
        var lines = null as Array<String>?;
        for (var f = 0; f < fonts.size(); f++) {
            lines = layout(dc, y, text, fonts[f], maxLines, null);
            if (lines != null) { font = fonts[f]; break; }
        }
        if (lines == null) {
            lines = layout(dc, y, text, font, 99, null) as Array<String>;
            var keep = lines.slice(0, maxLines) as Array<String>;
            if (lines.size() > maxLines) {
                var lh = dc.getFontHeight(font);
                keep[maxLines - 1] = Ui.ellipsize(dc, keep[maxLines - 1] + " " + lines[maxLines], font, Ui.widthAt(dc, y + (maxLines - 1) * lh, lh));
            }
            lines = keep;
        }
        var lh = dc.getFontHeight(font);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(dc.getWidth() / 2, y + oy + i * lh, font, lines[i], Graphics.TEXT_JUSTIFY_CENTER);
        }
        return y + lines.size() * lh;
    }

    // Word-wrap to a fixed width (scrolling content). Never truncates.
    function wrap(dc as Graphics.Dc, text as String, font as Graphics.FontType, width as Number) as Array<String> {
        return layout(dc, 0, text, font, 999, width) as Array<String>;
    }

    // A rounded "pill" with centered text: buttons and tags.
    function pill(dc as Graphics.Dc, cx as Number, cy as Number, text as String, font as Graphics.FontType, fill as Number, ink as Number) as Void {
        var tw = dc.getTextWidthInPixels(text, font);
        var th = dc.getFontHeight(font);
        var pw = tw + th;
        dc.setColor(fill, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - pw / 2, cy - th / 2 - 2, pw, th + 4, (th + 4) / 2);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, font, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function hm(minutes as Number) as String {
        return minutes >= 60 ? (minutes / 60).toString() + "h" + (minutes % 60).format("%02d") : minutes.toString() + " min";
    }


    // AMOLED screens show the app's dark frosted cards; memory-in-pixel screens (few colors) would
    // turn them black, so those get an outline instead.
    function amoled() as Boolean {
        var s = System.getDeviceSettings();
        return (s has :requiresBurnInProtection) && s.requiresBurnInProtection;
    }

    function card(dc as Graphics.Dc, x as Numeric, y as Numeric, w as Numeric, h as Numeric, r as Numeric, fill as Number) as Void {
        if (amoled() || !Ui.isRound()) {
            dc.setColor(fill, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y, w, h, r);
        } else {
            dc.setColor(0x555555, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawRoundedRectangle(x, y, w, h, r);
            dc.setPenWidth(1);
        }
    }
}
