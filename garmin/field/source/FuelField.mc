import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
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
            remind("Fuel: " + (p["n"] as String), true);
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
            var pair = Application.Storage.getValue(FieldApi.PAIR_KEY);
            if (pair instanceof Dictionary && pair["code"] instanceof String) {
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

        var label = "FUEL";
        dc.setColor(green, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, 2, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER);
        var bigFont = h > 90 ? Graphics.FONT_NUMBER_MEDIUM : Graphics.FONT_NUMBER_MILD;
        if (big.length() > 6 || !(big.toNumber() != null || big.find(":") != null)) { bigFont = Graphics.FONT_MEDIUM; }
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, bigFont, big, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        if (small.length() > 0 && h > 60) {
            dc.setColor(fg == Graphics.COLOR_WHITE ? 0x9AA5A0 : 0x55605B, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h - dc.getFontHeight(Graphics.FONT_XTINY) - 2, Graphics.FONT_XTINY, small, Graphics.TEXT_JUSTIFY_CENTER);
        }
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
        dc.setColor(0x6EE4B7, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, dc.getHeight() * 0.3, Graphics.FONT_MEDIUM, "FUEL", Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, dc.getHeight() * 0.5, Graphics.FONT_SMALL, text, Graphics.TEXT_JUSTIFY_CENTER);
    }
}
