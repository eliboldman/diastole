import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// One line in the glance loop: "Ready · 4x4' threshold" (or how to sign in).
(:glance)
class DiastoleGlance extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_TRANSPARENT, Graphics.COLOR_TRANSPARENT);
        dc.clear();
        var h = dc.getHeight();
        var today = Application.Storage.getValue("today");
        var top = "DIASTOLE";
        var line = "Open to sign in";
        var color = Ui.DIM;
        if (Application.Storage.getValue("token") != null) {
            line = "Updating…";
            if (today instanceof Dictionary) {
                var r = today["r"];
                var flag = (r instanceof Dictionary) ? r["o"] as String? : null;
                color = Ui.readinessColor(flag);
                top = flag == null ? "DIASTOLE" : (flag.equals("green") ? "READY" : (flag.equals("yellow") ? "EASE IN" : "RECOVERY"));
                var w = today["w"];
                if (w instanceof Array && w.size() > 0 && w[0] instanceof Dictionary) {
                    line = (w[0] as Dictionary)["t"] as String;
                } else {
                    line = "Nothing planned today";
                }
            }
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(6, h / 4, 4);
        dc.drawText(16, h / 4, Graphics.FONT_GLANCE, top, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        // One line only in a glance: shorten long workout names instead of running off the edge.
        if (dc.getTextWidthInPixels(line, Graphics.FONT_GLANCE) > dc.getWidth()) {
            line = Ui.ellipsize(dc, line, Graphics.FONT_GLANCE, dc.getWidth());
        }
        dc.drawText(0, (h * 3) / 4, Graphics.FONT_GLANCE, line, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
