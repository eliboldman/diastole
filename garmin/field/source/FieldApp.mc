import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// Diastole Fuel: add it to a data screen. Signed out it shows a code to type at
// diastole.app/me/devices; signed in it counts down to the next carb and drink reminder from the
// day's planned session and buzzes when they're due.
(:background)
class FieldApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        schedule();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        return [new FuelField()];
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new FieldService()];
    }

    // Every 5 minutes while pairing (the code lasts 10) or until today's plan arrives, then hourly.
    // Signed out with no live code: ask for one right away (Garmin still holds it to 5 minutes
    // after the last background run) instead of waiting a full period.
    function schedule() as Void {
        if (FieldApi.token() == null && FieldApi.livePair() == null) {
            Background.registerForTemporalEvent(Time.now());
            return;
        }
        var every = FieldApi.token() == null || FieldApi.today() == null ? 5 * 60 : 60 * 60;
        var current = Background.getTemporalEventRegisteredTime();
        if (current == null || !(current instanceof Time.Duration) || (current as Time.Duration).value() != every) {
            Background.registerForTemporalEvent(new Time.Duration(every));
        }
    }

    function onBackgroundData(data as Application.PersistableType) as Void {
        if (!(data instanceof Dictionary)) {
            schedule(); // a failed run (no phone) must still leave the next one booked
            return;
        }
        if (data.hasKey("pair")) {
            var p = data["pair"];
            if (p == null) { Application.Storage.deleteValue(FieldApi.PAIR_KEY); }
            else { Application.Storage.setValue(FieldApi.PAIR_KEY, p as Application.PropertyValueType); }
            schedule();
        }
        if (data["token"] instanceof String) {
            Application.Storage.setValue(FieldApi.TOKEN_KEY, data["token"] as String);
            Application.Storage.deleteValue(FieldApi.PAIR_KEY);
            schedule();
        }
        if (data["fuel"] instanceof Dictionary) {
            Application.Storage.setValue(FieldApi.FUEL_KEY, data["fuel"] as Application.PropertyValueType);
            schedule();
        }
        if (data.hasKey("signedOut")) {
            Application.Storage.deleteValue(FieldApi.TOKEN_KEY);
            Application.Storage.deleteValue(FieldApi.FUEL_KEY);
            schedule();
        }
        WatchUi.requestUpdate();
    }
}
