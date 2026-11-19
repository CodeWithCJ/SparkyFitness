import Toybox.Lang;
import Toybox.Math;

// Number formatting shared by the Goals page, its list and the glance.
(:glance)
module Format {
    // Energy is always sent in kcal; only the display changes.
    const KJ_PER_KCAL = 4.184d;

    // Shown in place of a figure the phone has not synced for today. Text
    // fonts only: the number fonts may not carry an en dash.
    const DASH = "–";
    const NUMBER_DASH = "--";

    // Half away from zero, like Swift's `rounded()` on the Apple Watch, so a
    // figure rounds the same way on both watches (-2.5 becomes -3).
    function roundHalfAway(value as Double) as Number {
        if (value >= 0) {
            return Math.floor(value + 0.5d).toNumber();
        }
        return -Math.floor(-value + 0.5d).toNumber();
    }

    // Whole numbers throughout: grams and calories to one decimal place is
    // false precision, and the extra glyphs cost more than they say.
    function whole(value as Double) as String {
        return roundHalfAway(value).toString();
    }

    // A kcal figure in the unit the account displays.
    function energy(kcal as Double, kilojoules as Boolean) as Number {
        if (kilojoules) {
            return roundHalfAway(kcal * KJ_PER_KCAL);
        }
        return roundHalfAway(kcal);
    }

    // A time of day as the watch's own clock shows it: "09:12" on a 24-hour
    // clock, "9:12" on a 12-hour one, where the caller adds AM or PM (they
    // are strings to translate, so they live with the other strings).
    function clock(hour as Number, minute as Number, is24Hour as Boolean) as String {
        var minutes = minute.format("%02d");
        if (is24Hour) {
            return hour.format("%02d") + ":" + minutes;
        }
        var twelveHour = hour % 12;
        return (twelveHour == 0 ? 12 : twelveHour).toString() + ":" + minutes;
    }

    // "/ 150g" against a goal, just the unit without one.
    function goalText(goal as Double?, unit as String) as String {
        if (goal == null) {
            return unit;
        }
        return "/ " + whole(goal) + unit;
    }

    // "62 / 150g", or "62 mg" with no goal: the row's figures on one line.
    function amountLine(consumed as Double, goal as Double?, unit as String) as String {
        var text = whole(consumed);
        var rest = goalText(goal, unit);
        if (rest.length() == 0) {
            return text;
        }
        return text + " " + rest;
    }
}
