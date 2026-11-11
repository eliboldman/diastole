import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

// diastole.app for the fuel field. The field can't make requests itself during an activity, so
// everything goes through the background service (FieldService).
(:background)
module FieldApi {
    const BASE = "https://diastole.app";
    const TOKEN_KEY = "token";
    const PAIR_KEY = "pair"; // { "code", "secret", "exp" } while waiting to be linked
    const FUEL_KEY = "fuel"; // the day's plan from /api/device/fuel

    function token() as String? {
        var t = Application.Storage.getValue(TOKEN_KEY);
        return t instanceof String ? t : null;
    }

    function localDay() as String {
        var d = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return d.year.format("%04d") + "-" + (d.month as Number).format("%02d") + "-" + d.day.format("%02d");
    }

    // The stored plan, if it's for today.
    function today() as Dictionary? {
        var f = Application.Storage.getValue(FUEL_KEY);
        if (!(f instanceof Dictionary) || !(f["d"] instanceof String) || !(f["d"] as String).equals(localDay())) { return null; }
        return f;
    }

    function options(method as Communications.HttpRequestMethod, withToken as Boolean) as Dictionary {
        var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON } as Dictionary;
        var t = token();
        if (withToken && t != null) { headers["Authorization"] = "Bearer " + t; }
        return { :method => method, :headers => headers, :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON };
    }
}
