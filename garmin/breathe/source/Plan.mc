import Toybox.Lang;

// The sessions, mirroring lib/breath/plan.ts on the website (keep the two in step).
module Plan {
    const DEFAULT_PACE = 5.5;
    const FINDER_PACES = [6.5, 6.0, 5.5, 5.0, 4.5];
    const FINDER_STEP_MS = 90000;
    const KINDS = ["resonance", "downshift", "sigh", "box", "finder"];

    function title(k as String) as String {
        if (k.equals("resonance")) { return "Recovery breathing"; }
        if (k.equals("downshift")) { return "Sleep downshift"; }
        if (k.equals("sigh")) { return "Cyclic sighing"; }
        if (k.equals("box")) { return "Race-day focus"; }
        return "Find your pace";
    }

    // What it's for, in a few words (menu sub-label and the ready screen).
    function short(k as String) as String {
        if (k.equals("resonance")) { return "Switch into recovery"; }
        if (k.equals("downshift")) { return "Settle for sleep"; }
        if (k.equals("sigh")) { return "Quick stress reset"; }
        if (k.equals("box")) { return "Calm nerves, stay sharp"; }
        return "Your own best pace";
    }

    // How to do it, one line for the ready screen.
    function how(k as String, pace as Float) as String {
        if (k.equals("resonance")) { return "In as the circle grows, out as it shrinks. " + paceText(pace) + " a minute."; }
        if (k.equals("downshift")) { return "In for 4. Out slowly for 6, then 7, then 8."; }
        if (k.equals("sigh")) { return "Breathe in, a second sip on top, then a long sigh out."; }
        if (k.equals("box")) { return "In 4, hold 4, out 4, pause 4. No straining."; }
        return "Five paces, 90 seconds each. Sit still; your heart rate picks the winner.";
    }

    function minutes(k as String) as Array<Number> {
        if (k.equals("resonance")) { return [10, 5, 15]; }
        if (k.equals("downshift")) { return [8, 5, 12]; }
        if (k.equals("sigh")) { return [5, 3]; }
        if (k.equals("box")) { return [3, 5]; }
        return [8];
    }

    function paceText(p as Float) as String {
        return p.format("%.1f");
    }

    // The finder's pace at this point of the session.
    function finderPace(ms as Number) as Float {
        var i = ms / FINDER_STEP_MS;
        if (i > 4) { i = 4; }
        return FINDER_PACES[i] as Float;
    }

    // One breath cycle as [[phase, ms], ...]. progress 0..1 (the downshift lengthens the breath out).
    // Phases: "in", "top" (sigh's second sip), "hold", "out", "rest".
    function cycle(k as String, pace as Float, progress as Float) as Array<Array> {
        if (k.equals("resonance") || k.equals("finder")) {
            var half = (60000.0 / pace / 2).toNumber();
            return [["in", half], ["out", half]];
        }
        if (k.equals("downshift")) {
            var out = progress < 0.3334 ? 6000 : (progress < 0.6667 ? 7000 : 8000);
            return [["in", 4000], ["out", out]];
        }
        if (k.equals("sigh")) {
            return [["in", 3000], ["top", 1500], ["out", 6500], ["rest", 1000]];
        }
        return [["in", 4000], ["hold", 4000], ["out", 4000], ["rest", 4000]];
    }

    function word(phase as String) as String {
        if (phase.equals("in")) { return "Breathe in"; }
        if (phase.equals("top")) { return "Sip more in"; }
        if (phase.equals("hold")) { return "Hold"; }
        if (phase.equals("out")) { return "Breathe out"; }
        return "Pause";
    }

    // CO2 check bands (lib/breath/plan.ts holdBand).
    function holdBand(s as Number) as String {
        if (s < 15) { return "Low"; }
        if (s < 25) { return "Fair"; }
        if (s < 40) { return "Good"; }
        return "Great";
    }
}
