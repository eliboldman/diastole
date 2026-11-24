import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;
import Toybox.WatchUi;

// diastole.app for the Breathe app. It signs in with the Diastole widget's token (handed over when
// the widget opens Breathe). Finished sessions go into an outbox and are sent when the phone is
// reachable and the watch is linked, so nothing is lost offline.
module Net {
    const BASE = "https://diastole.app";
    const OUTBOX_MAX = 20;

    function token() as String? {
        var t = Application.Storage.getValue("token");
        return t instanceof String ? t : null;
    }

    function options(method as Communications.HttpRequestMethod) as Dictionary {
        var headers = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON } as Dictionary;
        var t = token();
        if (t != null) { headers["Authorization"] = "Bearer " + t; }
        return { :method => method, :headers => headers, :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON };
    }

    // The athlete's pace (from the pace finder) or 5.5.
    function pace() as Float {
        var p = Application.Storage.getValue("pace");
        if (p instanceof Float) { return p; }
        if (p instanceof Number) { return p.toFloat(); }
        if (p instanceof Double) { return p.toFloat(); }
        return Plan.DEFAULT_PACE;
    }

    function setPace(p as Numeric) as Void {
        var f = p.toFloat();
        if (f >= 3.0 && f <= 12.0) { Application.Storage.setValue("pace", f); }
    }

    // Today's suggestion { k, m, y } or null.
    function suggestion() as Dictionary? {
        var s = Application.Storage.getValue("sug");
        return s instanceof Dictionary && s["k"] instanceof String ? s : null;
    }

    // ── Outbox ─────────────────────────────────────────────────────────────
    function outbox() as Array {
        var o = Application.Storage.getValue("out");
        return o instanceof Array ? o : [];
    }

    // Adds a finished session/hold ({..., "at" => unix seconds}) and tries to send everything.
    function queue(body as Dictionary) as Void {
        var o = outbox();
        o.add(body);
        while (o.size() > OUTBOX_MAX) { o = o.slice(1, null); }
        Application.Storage.setValue("out", o);
    }

    function isNum(v) as Boolean {
        return v instanceof Number || v instanceof Float || v instanceof Double;
    }

    function now() as Number {
        return Time.now().value();
    }
}

// Sends the outbox one at a time, then refreshes the suggestion and pace. `done` (optional) gets
// called with the result of the first send: 200 / negative (no phone) / 0 (not linked) / other.
class Sync {
    hidden var done as Method?;
    hidden var first as Boolean = true;

    function initialize(done as Method?) {
        self.done = done;
    }

    function start() as Void {
        if (Net.token() == null) { report(0, null); return; }
        sendNext();
    }

    hidden function sendNext() as Void {
        var o = Net.outbox();
        if (o.size() == 0) { fetch(); return; }
        Communications.makeWebRequest(Net.BASE + "/api/device/breath", o[0] as Dictionary, Net.options(Communications.HTTP_REQUEST_METHOD_POST), method(:onSent));
    }

    function onSent(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 401) { Application.Storage.deleteValue("token"); report(0, null); return; }
        if (code < 0 || code >= 500) { report(code, null); return; } // try again next time
        // 200, or 4xx the server won't ever accept: either way it leaves the outbox.
        var o = Net.outbox();
        if (o.size() > 0) { Application.Storage.setValue("out", o.slice(1, null)); }
        if (code == 200 && data instanceof Dictionary && Net.isNum(data["pace"])) { Net.setPace(data["pace"] as Numeric); }
        report(code, data instanceof Dictionary ? data : null);
        sendNext();
    }

    hidden function fetch() as Void {
        Communications.makeWebRequest(Net.BASE + "/api/device/breath", null, Net.options(Communications.HTTP_REQUEST_METHOD_GET), method(:onFetched));
    }

    function onFetched(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 401) { Application.Storage.deleteValue("token"); }
        if (code == 200 && data instanceof Dictionary) {
            if (data["k"] instanceof String) { Application.Storage.setValue("sug", { "k" => data["k"], "m" => data["m"], "y" => data["y"] }); }
            if (Net.isNum(data["p"])) { Net.setPace(data["p"] as Numeric); }
            WatchUi.requestUpdate();
        }
        report(code == 200 ? 1 : code, null);
    }

    // Only the first result goes to `done` (the send of the session just finished, if any).
    hidden function report(code as Number, data as Dictionary?) as Void {
        if (!first) { return; }
        first = false;
        if (done != null) { (done as Method).invoke(code, data); }
    }
}
