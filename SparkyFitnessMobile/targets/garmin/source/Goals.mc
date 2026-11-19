import Toybox.Lang;

// One row of the Goals page: a nutrient's amount against its goal.
(:glance)
class NutrientRow {
    // The phone's nutrient key; it picks the colour, so it is never the
    // translated label.
    public var key as String;
    public var label as String;
    public var unit as String;
    public var consumed as Double;
    // Null when the nutrient has no goal: the row shows the amount alone.
    public var goal as Double?;
    // consumed / goal, 0...1, already clamped by the phone; 0 without a goal.
    public var progress as Double;

    function initialize(key as String, label as String, unit as String, consumed as Double, goal as Double?, progress as Double) {
        self.key = key;
        self.label = label;
        self.unit = unit;
        self.consumed = consumed;
        self.goal = goal;
        self.progress = progress;
    }
}

// The `goals` topic as the phone sent it. Figures are kcal; `Format.energy`
// converts for display.
(:glance)
class GoalsData {
    public var kilojoules as Boolean;
    // The day the figures belong to. Null when the phone could not vouch for
    // today, and then the figures below are zeros that must not be shown.
    public var day as String?;
    public var consumed as Double;
    public var burned as Double;
    // Negative when over the goal.
    public var remaining as Double;
    public var progress as Double;
    public var nutrients as Array<NutrientRow>;

    function initialize(kilojoules as Boolean) {
        self.kilojoules = kilojoules;
        day = null;
        consumed = 0.0d;
        burned = 0.0d;
        remaining = 0.0d;
        progress = 0.0d;
        nutrients = [] as Array<NutrientRow>;
    }

    // Yesterday's totals are worse than none (the watch can easily be opened
    // before the phone has pushed a new day), so figures for any other day
    // are not shown.
    function isFor(today as String) as Boolean {
        var figuresDay = day;
        return figuresDay != null && figuresDay.equals(today);
    }
}

(:glance)
module Goals {
    // Parses a stored `goals` topic. Null only when there is no topic at all.
    // Tolerant by design: unknown keys are ignored, any numeric type is read,
    // and a figure that is missing or of the wrong type drops the day rather
    // than showing a confident zero.
    function parse(raw as Object?) as GoalsData? {
        var topic = Wire.dictionary(raw);
        if (topic == null) {
            return null;
        }

        var unit = Wire.string(topic.get("energyUnit"));
        var data = new GoalsData(unit != null && unit.equals("kJ"));

        var day = Wire.string(topic.get("day"));
        var consumed = Wire.number(topic.get("consumed"));
        var burned = Wire.number(topic.get("burned"));
        var remaining = Wire.number(topic.get("remaining"));
        if (day == null || consumed == null || burned == null || remaining == null) {
            return data;
        }

        data.day = day;
        data.consumed = consumed;
        data.burned = burned;
        data.remaining = remaining;
        data.progress = clampUnit(Wire.number(topic.get("progress")));
        data.nutrients = parseNutrients(topic.get("nutrients"));
        return data;
    }

    // A row missing its key, label or amount is skipped rather than drawn as
    // a zero, as on the Apple Watch.
    function parseNutrients(raw as Object?) as Array<NutrientRow> {
        var rows = [] as Array<NutrientRow>;
        var items = Wire.array(raw);
        if (items == null) {
            return rows;
        }
        for (var i = 0; i < items.size(); i++) {
            var item = Wire.dictionary(items[i]);
            if (item == null) {
                continue;
            }
            var key = Wire.string(item.get("key"));
            var label = Wire.string(item.get("label"));
            var consumed = Wire.number(item.get("consumed"));
            if (key == null || label == null || consumed == null) {
                continue;
            }
            var unit = Wire.string(item.get("unit"));
            var goal = Wire.number(item.get("goal"));
            if (goal != null && goal <= 0) {
                goal = null;
            }
            rows.add(new NutrientRow(key, label, unit != null ? unit : "", consumed, goal, clampUnit(Wire.number(item.get("progress")))));
        }
        return rows;
    }

    // The phone already clamps; clamping again keeps a bad value from drawing
    // a ring past full or backwards. Written so NaN, which fails every
    // comparison, falls through to 0.
    function clampUnit(value as Double?) as Double {
        if (value == null) {
            return 0.0d;
        }
        if (value >= 0 && value <= 1) {
            return value;
        }
        if (value > 1) {
            return 1.0d;
        }
        return 0.0d;
    }
}
