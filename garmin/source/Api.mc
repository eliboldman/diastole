import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;

// Talking to diastole.app. Annotated so the background service can use it too.
(:background)
module Api {
    const BASE = "https://diastole.app";
    const TOKEN_KEY = "token";
    const TODAY_KEY = "today";

    function token() as String? {
        var t = Application.Storage.getValue(TOKEN_KEY);
        return t instanceof String ? t : null;
    }

    function jsonOptions(method as Communications.HttpRequestMethod, withToken as Boolean) as Dictionary {
        var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON } as Dictionary;
        var t = token();
        if (withToken && t != null) {
            headers["Authorization"] = "Bearer " + t;
        }
        return {
            :method => method,
            :headers => headers,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
    }

    // GET /api/device/today. callback(code as Number, data as Dictionary or Null)
    function fetchToday(callback as Method) as Void {
        Communications.makeWebRequest(BASE + "/api/device/today", null, jsonOptions(Communications.HTTP_REQUEST_METHOD_GET, true), callback);
    }
}
