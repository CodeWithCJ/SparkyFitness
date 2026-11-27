import Toybox.Lang;
import Toybox.Test;

(:test)
function goalsParseNeedsADictionary(logger as Logger) as Boolean {
    Test.assert(Goals.parse(null) == null);
    Test.assert(Goals.parse("goals") == null);
    Test.assert(Goals.parse([1, 2] as Array<Number>) == null);
    return true;
}

// Number, Long, Float and Double all arrive from the Connect IQ Mobile SDK.
(:test)
function goalsParseReadsEveryNumericType(logger as Logger) as Boolean {
    var goals = Goals.parse({
        "energyUnit" => "kJ",
        "day" => "2026-11-19",
        "consumed" => 1450,
        "burned" => 320l,
        "remaining" => -254.0,
        "progress" => 0.75d,
        "nutrients" => []
    } as Dictionary<String, Object>);
    Test.assert(goals != null);
    if (goals == null) {
        return false;
    }
    Test.assert(goals.kilojoules);
    Test.assertEqual("2026-11-19", goals.day);
    Test.assertEqual(1450.0d, goals.consumed);
    Test.assertEqual(320.0d, goals.burned);
    Test.assertEqual(-254.0d, goals.remaining);
    Test.assertEqual(0.75d, goals.progress);
    Test.assertEqual(0, goals.nutrients.size());
    Test.assert(goals.isFor("2026-11-19"));
    Test.assert(!goals.isFor("2026-11-20"));
    return true;
}

// No day means the phone could not vouch for today: nothing is shown, even
// with figures present.
(:test)
function goalsParseWithoutDayIsNotSynced(logger as Logger) as Boolean {
    var goals = Goals.parse({"energyUnit" => "kcal", "consumed" => 10, "burned" => 0, "remaining" => 1990} as Dictionary<String, Object>);
    Test.assert(goals != null);
    if (goals == null) {
        return false;
    }
    Test.assert(!goals.kilojoules);
    Test.assert(goals.day == null);
    Test.assert(!goals.isFor("2026-11-19"));
    return true;
}

// A partial day would show as a confident zero; it reads as not synced.
(:test)
function goalsParseWithAMissingOrWrongFigureIsNotSynced(logger as Logger) as Boolean {
    var missing = Goals.parse({"energyUnit" => "kcal", "day" => "2026-11-19", "consumed" => 10, "remaining" => 1990} as Dictionary<String, Object>);
    var wrongType = Goals.parse({"energyUnit" => "kcal", "day" => "2026-11-19", "consumed" => "10", "burned" => 0, "remaining" => 1990} as Dictionary<String, Object>);
    Test.assert(missing != null && missing.day == null);
    Test.assert(wrongType != null && wrongType.day == null);
    return true;
}

(:test)
function goalsParseDefaultsToKcalAndClampsProgress(logger as Logger) as Boolean {
    var base = {"day" => "2026-11-19", "consumed" => 1, "burned" => 2, "remaining" => 3} as Dictionary<String, Object>;
    var noUnit = Goals.parse(base);
    Test.assert(noUnit != null && !noUnit.kilojoules);
    Test.assert(noUnit != null && noUnit.progress == 0.0d);

    base.put("energyUnit", "KJ");
    base.put("progress", 1.5);
    var high = Goals.parse(base);
    Test.assert(high != null && !high.kilojoules);
    Test.assert(high != null && high.progress == 1.0d);

    base.put("progress", -0.2d);
    var low = Goals.parse(base);
    Test.assert(low != null && low.progress == 0.0d);
    return true;
}

(:test)
function goalsParseKeepsNutrientOrderAndSkipsBrokenRows(logger as Logger) as Boolean {
    var goals = Goals.parse({
        "energyUnit" => "kcal",
        "day" => "2026-11-19",
        "consumed" => 0,
        "burned" => 0,
        "remaining" => 2000,
        "progress" => 0,
        "nutrients" => [
            {"key" => "protein", "label" => "Protein", "unit" => "g", "consumed" => 62, "goal" => 150, "progress" => 0.41},
            {"key" => "fiber", "label" => "Fiber", "consumed" => 12l},
            {"key" => "sodium", "label" => "Sodium", "unit" => "mg", "consumed" => 900.0d, "goal" => 0, "progress" => 0},
            {"label" => "No key", "consumed" => 1},
            {"key" => "nolabel", "consumed" => 1},
            {"key" => "noamount", "label" => "No amount"},
            "not a row"
        ]
    } as Dictionary<String, Object>);
    Test.assert(goals != null);
    if (goals == null) {
        return false;
    }
    var rows = goals.nutrients;
    Test.assertEqual(3, rows.size());
    Test.assertEqual("protein", rows[0].key);
    Test.assertEqual("Protein", rows[0].label);
    Test.assertEqual("g", rows[0].unit);
    Test.assertEqual(62.0d, rows[0].consumed);
    Test.assertEqual(150.0d, rows[0].goal);
    Test.assert(rows[0].progress > 0.4d && rows[0].progress < 0.42d);
    // No unit and no goal: an empty unit and no bar.
    Test.assertEqual("fiber", rows[1].key);
    Test.assertEqual("", rows[1].unit);
    Test.assert(rows[1].goal == null);
    Test.assertEqual(0.0d, rows[1].progress);
    // A zero goal is no goal.
    Test.assert(rows[2].goal == null);
    return true;
}

(:test)
function goalsParseToleratesNutrientsThatAreNotAList(logger as Logger) as Boolean {
    var goals = Goals.parse({"day" => "2026-11-19", "consumed" => 0, "burned" => 0, "remaining" => 0, "nutrients" => "none"} as Dictionary<String, Object>);
    Test.assert(goals != null && goals.nutrients.size() == 0);
    return true;
}
