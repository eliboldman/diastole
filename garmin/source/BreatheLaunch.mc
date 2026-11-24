import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// Opens the Diastole Breathe app (a separate device app, so long sessions never time out the way a
// widget does). It hands over the watch's sign-in and today's suggestion, so Breathe is linked and
// opens on the suggested session.
module BreatheLaunch {
    const URI = "manifest-id://50ddd57e-7221-4f02-9ad5-fe9385b94d2b";

    function title(k as String) as String {
        if (k.equals("resonance")) { return "Recovery breathing"; }
        if (k.equals("downshift")) { return "Sleep downshift"; }
        if (k.equals("sigh")) { return "Cyclic sighing"; }
        if (k.equals("box")) { return "Race-day focus"; }
        if (k.equals("finder")) { return "Find your pace"; }
        return "Guided breathing";
    }

    function open(view as TodayView) as Void {
        var args = {} as Dictionary;
        var t = Api.token();
        if (t != null) { args["token"] = t; }
        var d = view.data();
        var br = d != null && d["br"] instanceof Dictionary ? d["br"] as Dictionary : null;
        if (br != null) {
            if (br["k"] instanceof String) { args["k"] = br["k"]; }
            if (br["m"] instanceof Number) { args["m"] = br["m"]; }
            if (br["y"] instanceof String) { args["y"] = br["y"]; }
            if (br["p"] != null) { args["p"] = br["p"]; }
        }
        try {
            System.exitTo(new System.Intent(URI, args));
        } catch (e instanceof System.AppNotInstalledException) {
            view.notice = "Get Diastole Breathe from the Connect IQ store, then press Start here.";
            WatchUi.requestUpdate();
        } catch (e) {
            view.notice = "Couldn't open Breathe. Open it from your apps list.";
            WatchUi.requestUpdate();
        }
    }
}
