import Toybox.Application;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

// Signed out: asks Diastole for a code, shows it, and polls until the athlete types it on
// diastole.app/me/devices. The watch then keeps a token and switches to today's plan.
class PairView extends WatchUi.View {
    var code as String? = null;
    var message as String = "Getting a code…";
    hidden var secret as String? = null;
    hidden var timer as Timer.Timer = new Timer.Timer();
    hidden var polls as Number = 0;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        if (code == null) { requestCode(); }
    }

    function onHide() as Void {
        timer.stop();
    }

    function requestCode() as Void {
        code = null;
        message = "Getting a code…";
        polls = 0;
        WatchUi.requestUpdate();
        Communications.makeWebRequest(Api.BASE + "/api/device/pair", { "kind" => "garmin_watch", "label" => "Garmin watch" },
            Api.jsonOptions(Communications.HTTP_REQUEST_METHOD_POST, false), method(:onCode));
    }

    function onCode(status as Number, data as Dictionary or String or Null) as Void {
        if (status == 200 && data instanceof Dictionary) {
            code = data["code"] as String;
            secret = data["secret"] as String;
            message = "diastole.app/me/devices";
            timer.start(method(:poll), 5000, true);
        } else {
            message = status < 0 ? "Phone not connected. Open Garmin Connect, then press Start." : "Couldn't reach Diastole. Press Start to retry.";
        }
        WatchUi.requestUpdate();
    }

    function poll() as Void {
        polls += 1;
        if (polls > 120) { // 10 minutes: the code expired
            timer.stop();
            requestCode();
            return;
        }
        Communications.makeWebRequest(Api.BASE + "/api/device/pair/poll", { "secret" => secret },
            Api.jsonOptions(Communications.HTTP_REQUEST_METHOD_POST, false), method(:onPoll));
    }

    function onPoll(status as Number, data as Dictionary or String or Null) as Void {
        if (status != 200 || !(data instanceof Dictionary)) { return; } // keep polling
        var s = data["status"] as String;
        if (s.equals("linked")) {
            timer.stop();
            Application.Storage.setValue(Api.TOKEN_KEY, data["token"]);
            getApp().scheduleRefresh();
            var today = new TodayView();
            WatchUi.switchToView(today, new TodayDelegate(today), WatchUi.SLIDE_LEFT);
            today.refresh();
        } else if (s.equals("expired")) {
            timer.stop();
            requestCode();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Ui.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.14, Graphics.FONT_XTINY, "SIGN IN TO DIASTOLE", Graphics.TEXT_JUSTIFY_CENTER);
        if (code != null) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.36, Graphics.FONT_NUMBER_MILD, code, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            Ui.drawWrapped(dc, (h * 0.52).toNumber(), "Type this code at", Graphics.FONT_XTINY, Ui.DIM, 1);
        }
        Ui.drawWrapped(dc, (h * (code != null ? 0.62 : 0.4)).toNumber(), message, Graphics.FONT_XTINY, code != null ? Graphics.COLOR_WHITE : Ui.DIM, 4);
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    hidden var view as PairView;

    function initialize(view as PairView) {
        BehaviorDelegate.initialize();
        self.view = view;
    }

    function onSelect() as Boolean {
        if (view.code == null) { view.requestCode(); }
        return true;
    }
}
