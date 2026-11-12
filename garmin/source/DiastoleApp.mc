import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// Diastole for Garmin. Signed out: shows a pairing code to type at diastole.app/me/devices.
// Signed in: a background task refreshes today's plan every 30 minutes, so the glance and the
// pages work even when the phone is out of reach.
(:background)
class DiastoleApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {}

    function onStop(state as Dictionary?) as Void {}

    (:debug)
    function demo() as Void { Demo.seed(); if (Demo.ON) { Background.deleteTemporalEvent(); } }
    (:debug)
    function demoActive() as Boolean { return Demo.ON; }
    (:release)
    function demo() as Void {}
    (:release)
    function demoActive() as Boolean { return false; }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        demo();
        if (Api.token() == null) {
            var pair = new PairView();
            return [pair, new PairDelegate(pair)];
        }
        if (!demoActive()) { scheduleRefresh(); }
        var today = new TodayView();
        return [today, new TodayDelegate(today)];
    }

    (:glance, :release)
    function getGlanceView() as [WatchUi.GlanceView] or [WatchUi.GlanceView, WatchUi.GlanceViewDelegate] or Null {
        return [new DiastoleGlance()];
    }
    // Debug builds open straight into the app in the simulator (no glance first).
    (:glance, :debug)
    function getGlanceView() as [WatchUi.GlanceView] or [WatchUi.GlanceView, WatchUi.GlanceViewDelegate] or Null {
        return null;
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new RefreshService()];
    }

    // The background task hands back the fetched day (or an error code).
    function onBackgroundData(data as Application.PersistableType) as Void {
        if (demoActive()) { return; }
        if (data instanceof Dictionary) {
            if (data.hasKey("signedOut")) {
                signOut();
            } else {
                Application.Storage.setValue(Api.TODAY_KEY, data);
            }
            WatchUi.requestUpdate();
        }
    }

    function scheduleRefresh() as Void {
        if (Background.getTemporalEventRegisteredTime() == null) {
            Background.registerForTemporalEvent(new Time.Duration(30 * 60));
        }
    }
}

function signOut() as Void {
    Application.Storage.deleteValue(Api.TOKEN_KEY);
    Application.Storage.deleteValue(Api.TODAY_KEY);
    Background.deleteTemporalEvent();
}

function getApp() as DiastoleApp {
    return Application.getApp() as DiastoleApp;
}
