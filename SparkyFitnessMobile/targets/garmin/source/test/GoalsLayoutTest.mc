import Toybox.Lang;
import Toybox.Test;

(:test)
function goalsLayoutMeasuresTheRoundScreen(logger as Logger) as Boolean {
    Test.assertEqual(208, GoalsLayout.halfChord(416, 416, 208));
    Test.assertEqual(0, GoalsLayout.halfChord(416, 416, 0));
    Test.assertEqual(0, GoalsLayout.halfChord(416, 416, 416));
    // √(208² - 42²) = 203.7
    Test.assertEqual(203, GoalsLayout.halfChord(416, 416, 250));
    return true;
}

// A text line is as wide as its narrow edge: the bottom one below the middle
// of the screen, the top one above it.
(:test)
function goalsLayoutSizesEachLineAtItsNarrowEdge(logger as Logger) as Boolean {
    Test.assertEqual(GoalsLayout.halfChord(416, 416, 250), GoalsLayout.bandHalfChord(416, 416, 216, 250));
    Test.assertEqual(GoalsLayout.halfChord(416, 416, 100), GoalsLayout.bandHalfChord(416, 416, 100, 134));
    // The fenix 8 43 mm rows (34 px of text every 49 px from 216): each one
    // is wider than the one under it, and the bars are narrower still.
    var first = GoalsLayout.bandHalfChord(416, 416, 216, 250);
    var second = GoalsLayout.bandHalfChord(416, 416, 265, 299);
    var third = GoalsLayout.bandHalfChord(416, 416, 314, 348);
    Test.assert(first > second);
    Test.assert(second > third);
    Test.assert(third > GoalsLayout.halfChord(416, 416, 363));
    return true;
}

// All rows' text lines share the narrowest one's width, so names and
// figures line up: the bottom row's below the middle, the top row's above.
(:test)
function goalsLayoutSharesTheNarrowestRowsTextWidth(logger as Logger) as Boolean {
    // The fenix 8 43 mm rows: the third line (314 to 348) sets the width,
    // 282 px across once the 12 px margins are off, wider than the bars'
    // 252 px at the third bar's bottom (363).
    var shared = GoalsLayout.rowsTextHalfChord(416, 416, 216, 49, 34, 3);
    Test.assertEqual(GoalsLayout.bandHalfChord(416, 416, 314, 348), shared);
    Test.assertEqual(282, 2 * (shared - 12));
    Test.assert(shared > GoalsLayout.halfChord(416, 416, 363));
    // Two rows: the second line sets it.
    Test.assertEqual(GoalsLayout.bandHalfChord(416, 416, 265, 299), GoalsLayout.rowsTextHalfChord(416, 416, 216, 49, 34, 2));
    // Rows above the middle: the first, top edge, is the narrowest.
    Test.assertEqual(GoalsLayout.halfChord(416, 416, 20), GoalsLayout.rowsTextHalfChord(416, 416, 20, 49, 34, 3));
    // One row is its own width.
    Test.assertEqual(GoalsLayout.bandHalfChord(416, 416, 216, 250), GoalsLayout.rowsTextHalfChord(416, 416, 216, 49, 34, 1));
    return true;
}

(:test)
function goalsLayoutDropsTheGoalOnlyForACutShortName(logger as Logger) as Boolean {
    // Fits: the goal stays.
    Test.assert(!GoalsLayout.dropsGoal(60, 120, 90));
    Test.assert(!GoalsLayout.dropsGoal(60, 60, 90));
    // Cut, but still long enough to read: the goal stays.
    Test.assert(!GoalsLayout.dropsGoal(150, 100, 90));
    // Cut to under the minimum: the goal goes.
    Test.assert(GoalsLayout.dropsGoal(150, 80, 90));
    Test.assert(GoalsLayout.dropsGoal(150, -10, 90));
    return true;
}
