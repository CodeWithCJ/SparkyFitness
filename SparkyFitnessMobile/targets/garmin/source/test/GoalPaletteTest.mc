import Toybox.Lang;
import Toybox.Test;

(:test)
function paletteKeepsMacroColoursAnywhere(logger as Logger) as Boolean {
    Test.assertEqual(0x8992DC, GoalPalette.CALORIES);
    Test.assertEqual(0xDBB06F, GoalPalette.colorFor("protein", 0));
    Test.assertEqual(0x97C692, GoalPalette.colorFor("carbs", 4));
    Test.assertEqual(0x8AC2DA, GoalPalette.colorFor("fat", 9));
    return true;
}

(:test)
function paletteGivesOtherNutrientsAColourByRowIndex(logger as Logger) as Boolean {
    Test.assertEqual(0xEA96B0, GoalPalette.colorFor("fiber", 0));
    Test.assertEqual(0xCDAEF6, GoalPalette.colorFor("sodium", 1));
    Test.assertEqual(0xF6D375, GoalPalette.colorFor("sugars", 2));
    Test.assertEqual(0x89D7C6, GoalPalette.colorFor("Vitamin C", 3));
    Test.assertEqual(0xF4A284, GoalPalette.colorFor("iron", 4));
    // The index counts every row, macros included, and wraps after five.
    Test.assertEqual(0xEA96B0, GoalPalette.colorFor("fiber", 5));
    Test.assertEqual(0xF6D375, GoalPalette.colorFor("fiber", 7));
    // Keys are case-sensitive, as the phone sends them: a label never picks a macro colour.
    Test.assertEqual(0xCDAEF6, GoalPalette.colorFor("Protein", 1));
    return true;
}
