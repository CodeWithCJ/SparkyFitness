import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// The glance: today's calories left (or over) with a calorie-coloured bar,
// and "as of" the time those figures are from. It runs in its own small
// process and only reads what was stored; it never talks to the phone.
// Storage is filled by the full app and, where the watch delivers phone
// messages to it, by the background service (BackgroundService.mc), which
// is not reliable on every watch: the "as of" time says how old the figures
// are either way, and the app redraws this through onStorageChanged.
(:glance)
class GoalsGlanceView extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Dc) as Void {
        dc.setColor(GoalPalette.TEXT, Graphics.COLOR_TRANSPARENT);
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }

        var goals = SnapshotStore.readGoals();
        var today = goals != null && goals.isFor(SnapshotStore.today()) ? goals : null;

        var width = dc.getWidth();
        var height = dc.getHeight();
        var font = Graphics.FONT_GLANCE;
        var lineHeight = dc.getFontHeight(font);
        var title = WatchUi.loadResource(Rez.Strings.AppName) as String;

        // Opening the app on the watch is the one sure way to fill Storage
        // (it asks the phone; the background service only gets what the
        // phone sends on its own), so that is where the prompt sends the
        // wearer, not to the phone.
        if (today == null) {
            var prompt = WatchUi.loadResource(Rez.Strings.GlanceOpenOnWatch) as String;
            var promptText = Graphics.fitTextToArea(prompt, font, width, lineHeight * 2, true);
            var promptHeight = dc.getTextDimensions(promptText != null ? promptText : "", font)[1];
            var top = (height - lineHeight - promptHeight) / 2;
            dc.drawText(0, top, font, title, Graphics.TEXT_JUSTIFY_LEFT);
            dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, top + lineHeight, font, promptText, Graphics.TEXT_JUSTIFY_LEFT);
            return;
        }

        // Unsigned here, unlike the page's big number: the words beside it
        // already say which side of the goal the day is on, and "-254 kcal
        // over" would read as a double negative.
        var over = today.remaining < 0;
        var amount = Format.energy(today.remaining < 0 ? -today.remaining : today.remaining, today.kilojoules);
        var line = Lang.format(WatchUi.loadResource(lineId(today.kilojoules, over)) as String, [amount]);

        var barHeight = height / 14 > 4 ? height / 14 : 4;
        // The bar shares its line with the smallest font's text, so that line
        // is as tall as the text.
        var barLineHeight = dc.getFontHeight(Graphics.FONT_XTINY);
        if (barLineHeight < barHeight) {
            barLineHeight = barHeight;
        }
        var top = (height - 2 * lineHeight - barLineHeight) / 2;
        dc.drawText(0, top, font, Graphics.fitTextToArea(title, font, width, lineHeight, true), Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(0, top + lineHeight, font, Graphics.fitTextToArea(line, font, width, lineHeight, true), Graphics.TEXT_JUSTIFY_LEFT);
        drawBarLine(dc, today.progress, SnapshotStore.pushedAt(), top + 2 * lineHeight + barLineHeight / 2, barHeight, width);
    }

    // The calorie bar, with the time the figures are from on its right in the
    // smallest font: "as of 9:12 AM". The label is what keeps the time from
    // reading as the clock's. On a 12-hour clock AM or PM goes before the bar
    // shrinks under a third of the line; "as of" always stays.
    private function drawBarLine(dc as Dc, progress as Double, pushedAt as Double?, middle as Number, barHeight as Number, width as Number) as Void {
        var barWidth = width;
        if (pushedAt != null) {
            var font = Graphics.FONT_XTINY;
            var pattern = WatchUi.loadResource(Rez.Strings.AsOf) as String;
            var gap = dc.getFontHeight(font) / 3;
            var label = Lang.format(pattern, [SyncTime.text(pushedAt, true)]);
            barWidth = width - dc.getTextWidthInPixels(label, font) - gap;
            if (barWidth < width / 3) {
                label = Lang.format(pattern, [SyncTime.text(pushedAt, false)]);
                barWidth = width - dc.getTextWidthInPixels(label, font) - gap;
            }
            dc.setColor(GoalPalette.SECONDARY_TEXT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(width, middle, font, label, Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        if (barWidth < barHeight) {
            return;
        }
        var barTop = middle - barHeight / 2;
        var radius = barHeight / 2;
        dc.setColor(GoalPalette.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(0, barTop, barWidth, barHeight, radius);
        var filled = (barWidth * progress).toNumber();
        if (filled > 0) {
            dc.setColor(GoalPalette.CALORIES, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(0, barTop, filled < barHeight ? barHeight : filled, barHeight, radius);
        }
    }

    private function lineId(kilojoules as Boolean, over as Boolean) as ResourceId {
        if (kilojoules) {
            return over ? Rez.Strings.GlanceKjOver : Rez.Strings.GlanceKjLeft;
        }
        return over ? Rez.Strings.GlanceKcalOver : Rez.Strings.GlanceKcalLeft;
    }
}
