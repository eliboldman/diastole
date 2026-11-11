import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

// Background work for the fuel field: get a pairing code, check whether it's been typed in, then
// fetch the day's fueling plan. Each run hands one result back to FieldApp.onBackgroundData.
(:background)
class FieldService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        if (FieldApi.token() != null) {
            Communications.makeWebRequest(FieldApi.BASE + "/api/device/fuel", null, FieldApi.options(Communications.HTTP_REQUEST_METHOD_GET, true), method(:onFuel));
            return;
        }
        var pair = Application.Storage.getValue(FieldApi.PAIR_KEY);
        if (pair instanceof Dictionary && pair["exp"] instanceof Number && (pair["exp"] as Number) > Time.now().value()) {
            Communications.makeWebRequest(FieldApi.BASE + "/api/device/pair/poll", { "secret" => pair["secret"] },
                FieldApi.options(Communications.HTTP_REQUEST_METHOD_POST, false), method(:onPoll));
        } else {
            Communications.makeWebRequest(FieldApi.BASE + "/api/device/pair", { "kind" => "garmin_field", "label" => "Garmin fuel field" },
                FieldApi.options(Communications.HTTP_REQUEST_METHOD_POST, false), method(:onCode));
        }
    }

    function onCode(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            Background.exit({ "pair" => { "code" => data["code"], "secret" => data["secret"], "exp" => Time.now().value() + 570 } });
        } else {
            Background.exit(null);
        }
    }

    function onPoll(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            var s = data["status"];
            if (s instanceof String && s.equals("linked")) {
                Background.exit({ "token" => data["token"] });
                return;
            }
            if (s instanceof String && s.equals("expired")) {
                Background.exit({ "pair" => null });
                return;
            }
        }
        Background.exit(null);
    }

    function onFuel(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            Background.exit({ "fuel" => data });
        } else if (code == 401) {
            Background.exit({ "signedOut" => true });
        } else {
            Background.exit(null);
        }
    }
}
