import Toybox.Lang;

// Simulator only (debug builds): AUTO = a kind ("sigh", "finder", "hold"...) opens straight into it
// with SHORT_MS as the length, logging each step, so the flow can be checked without pressing buttons.
// Release builds (store, -r) leave this out.
(:debug)
module Debug {
    const AUTO = "";
    const SHORT_MS = 40000;
}
