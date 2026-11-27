import Toybox.Lang;

// Typed reads of what the phone sent. The Connect IQ Mobile SDK turns a Kotlin
// Int into a Number, a Long into a Long and a Float or Double into either, and
// a newer phone may add keys or change a value's type, so every read checks
// the type instead of trusting a cast; a wrong type reads as absent. The
// background service reads its messages through here too.
(:background :glance)
module Wire {
    function dictionary(value as Object?) as Dictionary<String, Object?>? {
        if (value instanceof Lang.Dictionary) {
            return value as Dictionary<String, Object?>;
        }
        return null;
    }

    function array(value as Object?) as Array<Object?>? {
        if (value instanceof Lang.Array) {
            return value as Array<Object?>;
        }
        return null;
    }

    function string(value as Object?) as String? {
        if (value instanceof Lang.String) {
            return value;
        }
        return null;
    }

    function number(value as Object?) as Double? {
        if (value instanceof Lang.Number || value instanceof Lang.Long || value instanceof Lang.Float || value instanceof Lang.Double) {
            return value.toDouble();
        }
        return null;
    }
}
