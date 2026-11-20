import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

// Today's nutrition against the phone's goals.
//
// Read-only by design, as on the Apple Watch: everything here is logged on the
// phone. Nothing is computed locally either; the fill fractions come from the
// phone already clamped, so this page and the phone never disagree by a
// percent at the edges.
//
// Laid out for the 416 x 416 round screen of the fenix 8 43 mm; every size is
// scaled from the screen width so other round screens keep the proportions.
class GoalsView extends WatchUi.View {
    // Rows shown on the page; the rest are in the list Select opens.
    static const VISIBLE_ROWS = 3;

    // Below this much room for its name (design units, about six letters of
    // the smallest font), a row gives up its "/ goal" before the name is cut:
    // the bar under it already shows how far along the goal is.
    private const MIN_LABEL_WIDTH = 90;

    // The design grid is the fenix 8 43 mm screen.
    private const DESIGN_WIDTH = 416.0;

    // The longest the stale timer waits at once. A phone clock far ahead of
    // the watch's can put staleAt weeks away, past what a timer's
    // milliseconds (a 32-bit Number) hold; a capped wait sets itself again.
    private const MAX_TIMER_SECONDS = 60 * 60;

    private var _scale as Float;
    // Nothing redraws a page left open, so "as of" would only appear with the
    // next snapshot, which makes the figures fresh again. This one-shot timer
    // wakes the page the second the figures on it turn old.
    private var _staleTimer as Timer.Timer;
    // Redraws when the wait for the first answer ends (SyncRequest).
    private var _waitTimer as Timer.Timer;
    // The ring's number font for the last value drawn (scaledNumberFont).
    private var _numberFontText as String? = null;
    private var _numberFont as Graphics.VectorFont? = null;
    // SyncTime.staleAt of the snapshot the timer was set for, null for none.
    private var _timedStaleAt as Number?;
    private var _shown as Boolean;

    function initialize() {
        View.initialize();
        _scale = 1.0;
        _staleTimer = new Timer.Timer();
        _waitTimer = new Timer.Timer();
        _timedStaleAt = null;
        _shown = false;
    }

    function onLayout(dc as Dc) as Void {
        _scale = dc.getWidth() / DESIGN_WIDTH;
    }

    function onShow() as Void {
        _shown = true;
        setStaleTimer();
    }

    function onWaitTimer() as Void {
        WatchUi.requestUpdate();
    }

    function onHide() as Void {
        _waitTimer.stop();
        _shown = false;
        _staleTimer.stop();
    }

    // SyncTime.staleAt of the snapshot in Storage, null for none.
    private function storedStaleAt() as Number? {
        var pushedAt = SnapshotStore.pushedAt();
        return pushedAt != null ? SyncTime.staleAt(pushedAt) : null;
    }

    // Sets the timer for the snapshot in Storage: stopped when there is none
    // or it is already old, else due when it turns old.
    private function setStaleTimer() as Void {
        _staleTimer.stop();
        var staleAt = storedStaleAt();
        _timedStaleAt = staleAt;
        if (staleAt == null) {
            return;
        }
        var wait = staleAt - Time.now().value();
        if (wait <= 0) {
            return;
        }
        if (wait > MAX_TIMER_SECONDS) {
            wait = MAX_TIMER_SECONDS;
        }
        _staleTimer.start(method(:onStaleTimer), wait * 1000, false);
    }

    // Set again first: a wait cut to MAX_TIMER_SECONDS ends before the
    // figures are old, and then this only redraws the same page.
    function onStaleTimer() as Void {
        setStaleTimer();
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        // A snapshot that arrived (or an account cleared) while the page is
        // shown moves the time the figures turn old.
        if (_shown && storedStaleAt() != _timedStaleAt) {
            setStaleTimer();
        }

        dc.setColor(GoalPalette.TEXT, GoalPalette.BACKGROUND);
        dc.clear();
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }

        var goals = SnapshotStore.readGoals();
        var today = goals != null && goals.isFor(SnapshotStore.today()) ? goals : null;
        var kilojoules = goals != null && goals.kilojoules;

        var ringBottom = drawRing(dc, today, kilojoules);
        var lineBottom = drawEatenBurned(dc, today, kilojoules, ringBottom);
        if (today == null) {
            drawNotSynced(dc, lineBottom);
        } else {
            var rowsBottom = drawRows(dc, today.nutrients, lineBottom);
            drawFooter(dc, today.nutrients.size(), rowsBottom);
        }
    }

    // Design units to pixels.
    private function s(units as Numeric) as Number {
        return Math.round(units * _scale).toNumber();
    }

    // Half the width of the round screen at a given height.
    private function halfChord(dc as Dc, y as Numeric) as Number {
        return GoalsLayout.halfChord(dc.getWidth(), dc.getHeight(), y);
    }

    // The calorie ring with calories left inside. Returns its bottom edge.
    private function drawRing(dc as Dc, today as GoalsData?, kilojoules as Boolean) as Number {
        var cx = dc.getWidth() / 2;
        var cy = s(94);
        var radius = s(74);
        var pen = s(12);

        dc.setPenWidth(pen);
        dc.setColor(GoalPalette.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, radius);
        drawProgressArc(dc, cx, cy, radius, pen, today != null ? today.progress : 0.0d, GoalPalette.CALORIES);
        dc.setPenWidth(1);

        // Signed: going over shows a minus as well as flipping the caption.
        // The number is read in a glance too short to take in the caption
        // under it, so the sign does the work the word cannot.
        var value = today != null ? Format.energy(today.remaining, kilojoules).toString() : Format.NUMBER_DASH;
        var over = today != null && today.remaining < 0;
        var caption = WatchUi.loadResource(captionId(kilojoules, over)) as String;

        var inner = 2 * (radius - pen / 2);
        var maxWidth = (inner * 0.84).toNumber();
        var maxHeight = (inner * 0.5).toNumber();
        var valueFont = fitFont(dc, value, maxWidth, maxHeight, [
            Graphics.FONT_NUMBER_MEDIUM,
            Graphics.FONT_NUMBER_MILD,
            Graphics.FONT_LARGE,
            Graphics.FONT_MEDIUM,
            Graphics.FONT_SMALL,
            Graphics.FONT_TINY
        ] as Array<FontDefinition>) as FontType;
        var numberFont = scaledNumberFont(dc, value, maxWidth, maxHeight);
        if (numberFont != null) {
            valueFont = numberFont;
        }
        var captionFont = Graphics.FONT_XTINY;
        var valueHeight = dc.getFontHeight(valueFont);
        var captionHeight = dc.getFontHeight(captionFont);
        // Number fonts carry tall empty space above and below the digits, so
        // the caption tucks up into the value's descent.
        var blockHeight = valueHeight + captionHeight - Graphics.getFontDescent(valueFont);
        var top = cy - blockHeight / 2;

        dc.setColor(GoalPalette.TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top, valueFont, value, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top + valueHeight - Graphics.getFontDescent(valueFont), captionFont,
            Graphics.fitTextToArea(caption, captionFont, inner, captionHeight, true), Graphics.TEXT_JUSTIFY_CENTER);

        return cy + radius + pen / 2;
    }

    // Clockwise from 12 o'clock. drawArc draws a full circle when start and
    // end land on the same degree, so an empty ring draws nothing and a full
    // one draws the circle.
    private function drawProgressArc(dc as Dc, cx as Number, cy as Number, radius as Number, pen as Number, progress as Double, color as Number) as Void {
        var sweep = (progress * 360).toNumber();
        if (sweep < 1) {
            return;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        if (sweep >= 360) {
            dc.drawCircle(cx, cy, radius);
            return;
        }
        var end = 90 - sweep;
        if (end < 0) {
            end += 360;
        }
        dc.drawArc(cx, cy, radius, Graphics.ARC_CLOCKWISE, 90, end);
        // Round caps, as on the Apple Watch ring.
        var capRadius = pen / 2;
        dc.fillCircle(cx, cy - radius, capRadius);
        var angle = Math.toRadians(end);
        dc.fillCircle(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle), capRadius);
    }

    private function captionId(kilojoules as Boolean, over as Boolean) as ResourceId {
        if (kilojoules) {
            return over ? Rez.Strings.GoalsKjOver : Rez.Strings.GoalsKjLeft;
        }
        return over ? Rez.Strings.GoalsKcalOver : Rez.Strings.GoalsKcalLeft;
    }

    // Eaten and burned as one quiet line under the ring. Returns its bottom.
    private function drawEatenBurned(dc as Dc, today as GoalsData?, kilojoules as Boolean, top as Number) as Number {
        var eaten = today != null ? Format.energy(today.consumed, kilojoules).toString() : Format.DASH;
        var burned = today != null ? Format.energy(today.burned, kilojoules).toString() : Format.DASH;
        var text = Lang.format(WatchUi.loadResource(Rez.Strings.GoalsEatenBurned) as String, [eaten, burned]);
        var font = Graphics.FONT_XTINY;
        var height = dc.getFontHeight(font);
        var y = top + s(4);
        var width = 2 * halfChord(dc, y) - s(40);
        dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, Graphics.fitTextToArea(text, font, width, height, true), Graphics.TEXT_JUSTIFY_CENTER);
        return y + height;
    }

    // Says the phone was asked for today's numbers while the answer can still
    // come (SyncRequest), then how to get them.
    private function drawNotSynced(dc as Dc, top as Number) as Void {
        var waitLeft = SyncRequest.waitLeftMs();
        _waitTimer.stop();
        if (waitLeft > 0) {
            _waitTimer.start(method(:onWaitTimer), waitLeft + 100, false);
        }
        var text = WatchUi.loadResource(waitLeft > 0 ? Rez.Strings.GoalsSyncing : Rez.Strings.GoalsOpenPhoneToSync) as String;
        var font = Graphics.FONT_XTINY;
        var y = top + s(12);
        var height = dc.getHeight() - y - s(40);
        // Wrapped to the width three quarters of the way down: the lines it
        // takes end well above that, where the screen is wider.
        var width = 2 * halfChord(dc, y + height * 3 / 4) - s(32);
        dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, Graphics.fitTextToArea(text, font, width, height, true), Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Up to three nutrient rows. Returns where the next line can start.
    //
    // The bars all take the width the screen allows at the bottom of the last
    // one, so they stay comparable at a glance. The text lines share one left
    // and one right edge too, so names and figures line up down the rows: the
    // narrowest text line's own chord, which is wider than the bars because
    // that line sits above the last bar's bottom edge.
    private function drawRows(dc as Dc, rows as Array<NutrientRow>, top as Number) as Number {
        var count = rows.size() < VISIBLE_ROWS ? rows.size() : VISIBLE_ROWS;
        var y = top + s(4);
        if (count == 0) {
            return y;
        }
        var font = Graphics.FONT_XTINY;
        var textHeight = dc.getFontHeight(font);
        var barGap = s(2);
        var barHeight = s(7);
        var rowHeight = textHeight + barGap + barHeight + s(6);
        var margin = s(12);

        var barHalf = halfChord(dc, y + rowHeight * count) - margin;
        var textHalf = GoalsLayout.rowsTextHalfChord(dc.getWidth(), dc.getHeight(), y, rowHeight, textHeight, count) - margin;
        if (barHalf <= 0 || textHalf <= 0) {
            return y;
        }
        for (var i = 0; i < count; i++) {
            drawRow(dc, rows[i], i, textHalf, barHalf, y, textHeight, barGap, barHeight);
            y += rowHeight;
        }
        return y;
    }

    // Name on the left; the amount in the row's colour and "/ goal" in grey
    // on the right (just the unit when the goal would cut the name short); a
    // bar under it when there is a goal to fill towards.
    private function drawRow(dc as Dc, row as NutrientRow, index as Number, textHalf as Number, barHalf as Number, top as Number, textHeight as Number, barGap as Number, barHeight as Number) as Void {
        var color = GoalPalette.colorFor(row.key, index);
        // The smallest system font: the 416 px screen's fonts are large, and
        // the bottom row only has the width the bezel leaves it.
        var font = Graphics.FONT_XTINY;
        var cx = dc.getWidth() / 2;
        var left = cx - textHalf;
        var right = cx + textHalf;
        var gap = s(5);

        var amount = Format.whole(row.consumed);
        var amountWidth = dc.getTextWidthInPixels(amount, font);
        var labelWidth = dc.getTextWidthInPixels(row.label, font);
        var detail = Format.goalText(row.goal, row.unit);
        var detailWidth = dc.getTextWidthInPixels(detail, font);
        // Label, amount and detail with a gap after each of the first two,
        // and one more so the name never touches the figures.
        var room = 2 * textHalf - detailWidth - amountWidth - 3 * gap;
        if (row.goal != null && GoalsLayout.dropsGoal(labelWidth, room, s(MIN_LABEL_WIDTH))) {
            // The unit stays, as on a row without a goal: "1850 mg".
            detail = Format.goalText(null, row.unit);
            var shortWidth = dc.getTextWidthInPixels(detail, font);
            room += detailWidth - shortWidth;
            detailWidth = shortWidth;
        }

        dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(right, top, font, detail, Graphics.TEXT_JUSTIFY_RIGHT);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(right - detailWidth - gap, top, font, amount, Graphics.TEXT_JUSTIFY_RIGHT);

        if (room > 0) {
            dc.setColor(GoalPalette.TEXT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(left, top, font, Graphics.fitTextToArea(row.label, font, room, textHeight, true), Graphics.TEXT_JUSTIFY_LEFT);
        }

        // No goal, nothing to fill towards: the amount stands alone.
        if (row.goal != null) {
            drawBar(dc, cx - barHalf, top + textHeight + barGap, 2 * barHalf, barHeight, row.progress, color);
        }
    }

    // One quiet line under the rows. Once the figures are older than
    // SyncTime.STALE_AFTER_SECONDS it says when they are from: they are only
    // refreshed while the phone app is reachable, and a page left open, or
    // opened with the phone away, would pass old figures off as live.
    // Otherwise it says how many more nutrients Select lists. Only one line
    // fits under a third row, and when both apply the time matters more than
    // a hint Select answers anyway. When "as of 12:45 PM" does not fit that
    // low on the screen, AM or PM goes ("as of 12:45"); "as of" never does,
    // as a bare time reads like the clock. The font is already the smallest.
    private function drawFooter(dc as Dc, rowCount as Number, top as Number) as Void {
        var font = Graphics.FONT_XTINY;
        var width = 2 * halfChord(dc, top + dc.getFontHeight(font) * 3 / 4) - s(12);
        var candidates = [] as Array<String>;
        var pushedAt = SnapshotStore.pushedAt();
        if (pushedAt != null && SyncTime.isStale(pushedAt, Time.now().value())) {
            var pattern = WatchUi.loadResource(Rez.Strings.AsOf) as String;
            candidates.add(Lang.format(pattern, [SyncTime.text(pushedAt, true)]));
            candidates.add(Lang.format(pattern, [SyncTime.text(pushedAt, false)]));
        } else if (rowCount > VISIBLE_ROWS) {
            candidates.add(Lang.format(WatchUi.loadResource(Rez.Strings.GoalsMoreNutrients) as String, [rowCount - VISIBLE_ROWS]));
        }
        for (var i = 0; i < candidates.size(); i++) {
            if (dc.getTextWidthInPixels(candidates[i], font) <= width) {
                dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
                dc.drawText(dc.getWidth() / 2, top, font, candidates[i], Graphics.TEXT_JUSTIFY_CENTER);
                return;
            }
        }
    }

    private function drawBar(dc as Dc, x as Number, y as Number, width as Number, height as Number, progress as Double, color as Number) as Void {
        var radius = height / 2;
        dc.setColor(GoalPalette.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, width, height, radius);
        var filled = (width * progress).toNumber();
        if (filled <= 0) {
            return;
        }
        // Never narrower than the bar is tall, so a sliver still reads as the
        // row's colour rather than a stray pixel.
        if (filled < height) {
            filled = height;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, filled, height, radius);
    }

    // Garmin's number face, sized to fit the ring, where the watch has
    // scalable fonts: the system number fonts are far taller than the ring on
    // the fēnix 8, so fitFont ends up on a text font. Null where there is no
    // such face, so fitFont's choice stays. Kept for the last value drawn.
    private function scaledNumberFont(dc as Dc, text as String, maxWidth as Number, maxHeight as Number) as Graphics.VectorFont? {
        if (!(Graphics has :getVectorFont)) {
            return null;
        }
        if (_numberFontText != null && text.equals(_numberFontText)) {
            return _numberFont;
        }
        var found = null;
        try {
            var size = (maxHeight * 1.4).toNumber();
            var smallest = (maxHeight * 0.7).toNumber();
            while (size >= smallest && found == null) {
                var font = Graphics.getVectorFont({:face => ["BionicMedium", "BionicBold"], :size => size});
                if (font == null) {
                    break;
                }
                if (dc.getTextWidthInPixels(text, font) <= maxWidth && dc.getFontHeight(font) - Graphics.getFontDescent(font) <= maxHeight) {
                    found = font;
                }
                size -= 4;
            }
        } catch (e instanceof Lang.Exception) {
            found = null;
        }
        _numberFontText = text;
        _numberFont = found;
        return found;
    }

    // The largest candidate font the text fits in.
    private function fitFont(dc as Dc, text as String, maxWidth as Number, maxHeight as Number, candidates as Array<FontDefinition>) as FontDefinition {
        for (var i = 0; i < candidates.size(); i++) {
            var font = candidates[i];
            if (dc.getTextWidthInPixels(text, font) <= maxWidth && dc.getFontHeight(font) - Graphics.getFontDescent(font) <= maxHeight) {
                return font;
            }
        }
        return candidates[candidates.size() - 1];
    }
}

// The page's geometry rules, apart from the drawing so tests can check them.
module GoalsLayout {
    // Half the width of a round screen at height `y`.
    function halfChord(width as Number, height as Number, y as Numeric) as Number {
        var radius = width / 2.0;
        var offset = y - height / 2.0;
        var squared = radius * radius - offset * offset;
        if (squared <= 0) {
            return 0;
        }
        return Math.sqrt(squared).toNumber();
    }

    // Half the width a line of text between `top` and `bottom` can take: the
    // chord at whichever edge is further from the middle, where the screen
    // is narrower (the bottom edge below the middle, the top edge above it).
    function bandHalfChord(width as Number, height as Number, top as Numeric, bottom as Numeric) as Number {
        var atTop = halfChord(width, height, top);
        var atBottom = halfChord(width, height, bottom);
        return atTop < atBottom ? atTop : atBottom;
    }

    // Half the width every row's text line takes, so they share their edges:
    // the narrowest of `count` lines `textHeight` tall, the first at `top`
    // and one every `rowHeight` after it.
    function rowsTextHalfChord(width as Number, height as Number, top as Numeric, rowHeight as Numeric, textHeight as Numeric, count as Number) as Number {
        var narrowest = 0;
        for (var i = 0; i < count; i++) {
            var lineTop = top + i * rowHeight;
            var half = bandHalfChord(width, height, lineTop, lineTop + textHeight);
            if (i == 0 || half < narrowest) {
                narrowest = half;
            }
        }
        return narrowest;
    }

    // Whether a row drops its "/ goal" for its name: only when the name would
    // be cut and the room left for it is under `minimum`. A name that fits,
    // or one cut but still long enough to read, keeps the goal on the line.
    function dropsGoal(labelWidth as Number, room as Number, minimum as Number) as Boolean {
        return labelWidth > room && room < minimum;
    }
}

// Select (the enter button, or a tap) opens every nutrient when the page has
// more than it can show.
class GoalsDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onSelect() as Boolean {
        return NutrientList.open();
    }

    // Behaviours come first, so on the fenix 8 a tap reaches onSelect and
    // this only runs on a screen that does not map a tap to Select. Returning
    // true from either stops the other, so the list never opens twice.
    function onTap(clickEvent as WatchUi.ClickEvent) as Boolean {
        return NutrientList.open();
    }
}
