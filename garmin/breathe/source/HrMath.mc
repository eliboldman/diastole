import Toybox.Lang;
import Toybox.Math;

// Heart-rate summary of a session, the same math as lib/breath/hr.ts: average heart rate over the
// first and last minute, the per-breath swing (peak to trough in each breath window, skipping the
// settling period), and RMSSD from beat-to-beat intervals.
module HrMath {
    // ts: seconds from the start (Float), bpm: Numbers. Swing over [from, to) with breath windows
    // of cycleS seconds, after `settle` seconds. Null with fewer than 3 full windows.
    function swing(ts as Array, bpm as Array, from as Float, to as Float, cycleS as Float, settle as Float) as Float? {
        if (cycleS <= 0) { return null; }
        var sum = 0.0;
        var n = 0;
        var need = (cycleS / 2).toNumber();
        if (need < 3) { need = 3; }
        var i = 0;
        var w = from + settle;
        while (w + cycleS <= to + 0.5) {
            var hi = -1;
            var lo = 999;
            var c = 0;
            while (i < ts.size() && (ts[i] as Float) < w) { i++; }
            var j = i;
            while (j < ts.size() && (ts[j] as Float) < w + cycleS) {
                var b = bpm[j] as Number;
                if (b > hi) { hi = b; }
                if (b < lo) { lo = b; }
                c++;
                j++;
            }
            if (c >= need) { sum += hi - lo; n++; }
            w += cycleS;
        }
        if (n < 3) { return null; }
        return Math.round(sum / n * 10) / 10.0;
    }

    function rmssd(rr as Array) as Float? {
        var sum = 0.0;
        var n = 0;
        for (var i = 1; i < rr.size(); i++) {
            var a = (rr[i - 1] as Number).toFloat();
            var b = (rr[i] as Number).toFloat();
            if (a <= 0 || (b - a).abs() / a > 0.2) { continue; }
            sum += (b - a) * (b - a);
            n++;
        }
        if (n < 30) { return null; }
        return Math.round(Math.sqrt(sum / n) * 10) / 10.0;
    }

    // Average bpm of samples with lo <= t <= hi, or null.
    function meanBetween(ts as Array, bpm as Array, lo as Float, hi as Float) as Number? {
        var sum = 0;
        var n = 0;
        for (var i = 0; i < ts.size(); i++) {
            var t = ts[i] as Float;
            if (t >= lo && t <= hi) { sum += bpm[i] as Number; n++; }
        }
        return n > 0 ? Math.round(sum.toFloat() / n).toNumber() : null;
    }
}
