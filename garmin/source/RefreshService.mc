import Toybox.Background;
import Toybox.Lang;
import Toybox.System;

// Runs in the background every 30 minutes: fetches today and passes it to the app.
(:background)
class RefreshService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        if (Api.token() == null) {
            Background.exit(null);
            return;
        }
        Api.fetchToday(method(:onToday));
    }

    function onToday(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary) {
            try {
                Background.exit(data);
            } catch (e instanceof Background.ExitDataSizeLimitException) {
                // Too big for this watch: drop the step lists and keep the rest.
                var w = data["w"];
                if (w instanceof Array) {
                    for (var i = 0; i < w.size(); i++) {
                        if (w[i] instanceof Dictionary) { (w[i] as Dictionary)["l"] = []; }
                    }
                }
                Background.exit(data);
            }
        } else if (code == 401) {
            Background.exit({ "signedOut" => true });
        } else {
            Background.exit(null); // offline or busy: keep what we have
        }
    }
}
