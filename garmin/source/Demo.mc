import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// Simulator only (debug builds): sample data and a slideshow of every page, for screenshots.
// Release builds (store, -r) leave this out entirely.
(:debug)
module Demo {
    const ON = false; // true to preview in the simulator
    const CHECKIN = false; // also show the post-workout check-in first

    function seed() as Void {
        if (!ON) { return; }
        Application.Storage.setValue(Api.TOKEN_KEY, "demo-token-for-the-simulator-only");
        Application.Storage.setValue(Api.TODAY_KEY, {
            "v" => 1, "d" => "2026-11-12", "n" => "Eli", "u" => Time.now().value(),
            "r" => { "o" => "yellow", "t" => "Slept 7h17, training load 59% above usual. Keep it controlled." },
            "w" => [
                { "id" => "a", "t" => "Tens of Hundreds (Politely Firm)", "s" => "swim", "min" => 44,
                  "why" => "Controlled aerobic-threshold swim work to keep your swim strength sharp with minimal recovery cost.",
                  "l" => ["Warm-up 300 yd choice · easy", "4 × 50 yd free · very hard, rest 0:15", "10 × 100 yd free · all out, rest 0:15", "300 yd free pull with pull buoy · moderate", "Cool-down 200 yd choice · very easy"] },
                { "id" => "b", "t" => "Small potato intervals", "s" => "run", "min" => 95,
                  "f" => { "first" => 2100, "every" => 2100, "carbs" => 25, "drink" => 900, "n" => "Gel or chews (~25 g)" },
                  "l" => ["Warm-up 15 min easy", "6 × 3 min at 7:05/mi, 2 min jog", "Cool-down 10 min"] }
            ],
            "nx" => [{ "t" => "Easy Miles & Snappy Strides", "s" => "run", "d" => "2026-11-13" }],
            "m" => { "hrv" => 52, "rhr" => 48, "sl" => 437, "bb" => 71 }
        });
        if (CHECKIN) {
            var t = Application.Storage.getValue(Api.TODAY_KEY) as Dictionary;
            t["ck"] = { "a" => "demo-activity", "t" => "Tens of Hundreds (Politely Firm)", "s" => "swim", "min" => 34, "q" => 0 };
            Application.Storage.setValue(Api.TODAY_KEY, t);
            Application.Storage.deleteValue("ckDone");
        }
        System.println("demo seeded: " + (Application.Storage.getValue(Api.TODAY_KEY) != null));
    }
}
