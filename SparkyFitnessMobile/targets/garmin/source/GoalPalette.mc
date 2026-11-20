import Toybox.Lang;

// The Apple Watch GoalPalette, so a nutrient has the same colour on every
// watch. Text stays white or grey on black; only the figures and bars are
// coloured.
(:glance)
module GoalPalette {
    const CALORIES = 0x8992DC;
    const PROTEIN = 0xDBB06F;
    const CARBS = 0x97C692;
    const FAT = 0x8AC2DA;

    // Picked to stay apart from the macro colours and from each other on a
    // black face.
    const EXTRA = [0xEA96B0, 0xCDAEF6, 0xF6D375, 0x89D7C6, 0xF4A284] as Array<Number>;

    const TEXT = 0xFFFFFF;
    const SECONDARY_TEXT = 0xAAAAAA;
    const TRACK = 0x3A3A3A;
    const BACKGROUND = 0x000000;

    // The macros keep their own colours wherever they sit in the list;
    // anything else takes an extra colour by its row index (counting every
    // row, macros included). The key is the phone's nutrient key, never the
    // translated label.
    function colorFor(key as String, index as Number) as Number {
        if (key.equals("protein")) {
            return PROTEIN;
        }
        if (key.equals("carbs")) {
            return CARBS;
        }
        if (key.equals("fat")) {
            return FAT;
        }
        var slot = index % EXTRA.size();
        if (slot < 0) {
            slot += EXTRA.size();
        }
        return EXTRA[slot];
    }
}
