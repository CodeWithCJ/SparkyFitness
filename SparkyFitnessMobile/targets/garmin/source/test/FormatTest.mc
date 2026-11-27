import Toybox.Lang;
import Toybox.Test;

(:test)
function formatRoundsHalfAwayFromZero(logger as Logger) as Boolean {
    Test.assertEqual(3, Format.roundHalfAway(2.5d));
    Test.assertEqual(-3, Format.roundHalfAway(-2.5d));
    Test.assertEqual(2, Format.roundHalfAway(2.49d));
    Test.assertEqual(-2, Format.roundHalfAway(-2.49d));
    Test.assertEqual(0, Format.roundHalfAway(-0.4d));
    Test.assertEqual("62", Format.whole(62.4d));
    Test.assertEqual("-254", Format.whole(-254.0d));
    return true;
}

(:test)
function formatConvertsKcalToKilojoules(logger as Logger) as Boolean {
    Test.assertEqual(500, Format.energy(500.0d, false));
    Test.assertEqual(2092, Format.energy(500.0d, true));
    Test.assertEqual(4, Format.energy(1.0d, true));
    // 254 x 4.184 = 1062.7: over the goal stays negative and rounds away from zero.
    Test.assertEqual(-1063, Format.energy(-254.0d, true));
    Test.assertEqual(0, Format.energy(0.0d, true));
    return true;
}

(:test)
function formatGoalTextShowsGoalOrUnit(logger as Logger) as Boolean {
    Test.assertEqual("/ 150g", Format.goalText(150.0d, "g"));
    Test.assertEqual("/ 2300mg", Format.goalText(2300.4d, "mg"));
    Test.assertEqual("mg", Format.goalText(null, "mg"));
    Test.assertEqual("62 / 150g", Format.amountLine(62.0d, 150.0d, "g"));
    Test.assertEqual("62 mg", Format.amountLine(62.0d, null, "mg"));
    Test.assertEqual("5", Format.amountLine(5.0d, null, ""));
    return true;
}
