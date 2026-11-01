# SparkyFitness Mobile — DESIGN.md

This file is the design contract for the SparkyFitness mobile app (React Native 0.86, Expo SDK 57, styled with Uniwind, which is TailwindCSS v4 for React Native). It describes the design system as it exists in code today. It is not a redesign proposal.

`SparkyFitnessMobile/global.css` is the source of truth for every token value. Update this file in the same change whenever a token is added, renamed or re-valued there. One group has a hand-copied mirror: the eight dark `--color-cat-*` values, in the order of `SUPERSET_PALETTE_VARS` (`src/utils/workoutSupersets.ts`), are copied into `SupersetPalette` in `targets/watch/Presentation/WorkoutView.swift`. Change both in the same commit.

How to use:

- Generate a screen: give sections 1–5 to a UI design or mockup tool together with a screenshot of the closest existing screen.
- Implement a design: sections 6–7 explain how an HTML + web Tailwind mockup becomes React Native + Uniwind code in this repo.
- Plan cleanup: section 8 lists known inconsistencies. They describe the current state, not rules to copy.
- Design or change a watch surface (Apple Watch app, watch complications, Wear OS app): section 10. Sections 1–9 describe the phone app only and do not apply to the watches.
- Build or extend a screen in code: section 9 picks the screen type and walks route wiring, header, layout, states, data, copy, theming, accessibility and tests, with templates and a pre-PR checklist.

## 1. Visual Theme & Atmosphere

SparkyFitness is a calm, data-forward nutrition and fitness tracker. Screens are stacks of soft, rounded cards on a cool blue-gray canvas. Most color on screen carries data meaning: the calorie ring is indigo, macros are apricot, leaf green and sky cyan, hydration is steel blue. Chrome stays neutral. A single blue accent ("Sparky Blue", #5087F7 light / #427CF0 dark) marks the primary action, the selected state and the focused field. It is also the default color for action glyphs and text-style actions: AddSheet and dropdown-menu icons, diary meal-header icons, stepper − and +, card "Details" links, and the labels of secondary, outline and ghost buttons. Navigation chrome stays neutral: header actions other than Save are Ink Navy, unselected tabs are slate, row chevrons and body text are slate. The feel is quiet and utilitarian, closer to a native iOS settings or health app than to a fitness brand with gradients and hero photography.

Density is medium-high. A dashboard card holds a ring, two side stats and a caption, and a diary meal card lists several food rows with tight 6px vertical padding. Whitespace comes mainly from the 16px screen gutter, 16px card padding and 12–16px gaps between cards, not from large empty areas. Numbers are the heroes: bold 20–48px values with small muted captions and units.

There are three themes plus System. Light is near-white cards on a pale cool-gray canvas with a small soft shadow under each card. Dark is charcoal blue-gray, and depth comes from surfaces getting lighter as they stack, not from shadows. AMOLED is Dark with a pure black canvas, near-black cards and darker borders. System follows the OS light/dark setting only, so AMOLED must be picked explicitly.

- Platform-native first. Icons are SF Symbols on every iOS version and Ionicons on Android. Neither set is purely outline: 80 of the 134 Android glyphs are `-outline`, and the tab, meal-type, exercise (filled flame), water, warning and star glyphs are filled; the `flame` icon itself is an outline (`flame` / `flame-outline`). On iOS 26+ an opt-in Liquid Glass setting turns on the native tab bar, native large-title headers on tab roots and frosted floating pills. Without it (Android, iOS below 26, or the setting off) the app draws its own tab bar, and tab roots draw their own title. Pushed screens use native iOS headers below iOS 26 and on 26+ with the setting on, and the app's own header bar on Android and on iOS 26+ with the setting off. Android runs edge-to-edge under translucent system bars.
- Portrait only, phone only.
- Shapes: 16px-radius cards and buttons, 12px-radius inputs and controls, pill-shaped badges, the date pill and the center Add button. Selectable chips are usually pills.
- Motion is short and functional: 150–200ms fades, 300ms list reflows, 500–800ms ease-out fills for rings and bars. Bouncy springs and confetti are reserved for workout completion; drag-to-reorder lists slide rows with a stiff spring that does not visibly bounce.
- The app icon is a red gradient (about #D0423E), but red is not a UI accent in the app. Red means danger, heart rate or menstrual phase.

## 2. Color Palette & Roles

Token classes follow Tailwind v4 naming: the utility prefix plus the token name. Text, border and status tokens therefore often repeat a word (`text-text-primary`, `border-border-subtle`, `bg-bg-success`), and status glyph colors read `text-icon-danger`. Tokens marked "JS only" have no utility class in use; they color icons, chart strokes and fills, switch tracks and sheet backgrounds. In a mockup, apply their hex directly (code reads them as CSS variables; see section 6).

### Surfaces and chrome

| Role                | Token class     | Light hex | Dark hex | Usage                                                                                                                                       |
| ------------------- | --------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cool Mist Canvas    | `bg-background` | #F2F4F7   | #0C0E12  | Screen background (`flex-1 bg-background` on almost every screen), navigation card color, sticky section headers, footer bars               |
| Porcelain Card      | `bg-surface`    | #F9FAFB   | #13161B  | Cards, grouped settings rows, bottom sheets, popover menus, swipeable rows                                                                  |
| Bright Control Fill | `bg-raised`     | #FFFFFF   | #1C1F26  | Controls, on a card or directly on the canvas: text inputs, search bars, segmented-control track, picker triggers, secondary buttons, chips |
| Chrome Bar          | `bg-chrome`     | #FFFFFF   | #0E1116  | Persistent bars only: custom tab bar, docked active-workout bar, What's New banner, non-glass fallback for Liquid Glass pills               |

In Light, the canvas is the darkest surface and controls are white. In Dark, raised is the lightest surface, so a control on a card always looks lifted.

### Borders and dividers

| Role             | Token class                                | Light hex | Dark hex | Usage                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------ | --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hairline Divider | `border-border-subtle`, `bg-border-subtle` | #E1E5EA   | #1E2229  | Default border: row dividers (`border-b`, `h-px`), input resting border, sheet title underline, menu outline                                                                                                                                                                                                          |
| Standard Border  | `border-border`, `bg-border`               | #E1E5EA   | #272C35  | Stronger outlines, mostly in symptom screens (57 of 85 uses), plus mood, meal-type and live-workout cards. Full strength in 60 uses, softened `/30`, `/40` or `/50` in 21. `bg-border` draws 2 inactive page dots, the `ShoesScreen` wear track and the diary `NutrientPill` tile fill. Same value as subtle in Light |
| Strong Outline   | `--color-border-strong` (JS only)          | #CCD3DB   | #303541  | Illustration and figure outlines (hydration bottle, muscle figure, injection body map, empty-day art); also the selected unit-option border in `FoodUnitSelectorSheet` (Light only) and the secondary line of the GLP-1 serum chart                                                                                   |
| Chrome Edge      | `border-chrome-border`, `bg-chrome-border` | #DADEE7   | #212630  | Top edge of the tab bar and docked bars, Liquid Glass pill border (45% alpha), navigation theme border. Also misused as in-card row dividers in 4 files (section 8)                                                                                                                                                   |

### Text and icons

| Role             | Token class                         | Light hex | Dark hex | Usage                                                                                                                                                                                    |
| ---------------- | ----------------------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ink Navy         | `text-text-primary`                 | #0F1729   | #E8EAEE  | Titles, row titles, values, input text, default header actions                                                                                                                           |
| Slate Secondary  | `text-text-secondary`               | #536379   | #C7CAD1  | Body copy, subtitles, card titles, settings-group overlines, disclosure chevrons                                                                                                         |
| Muted Slate      | `text-text-muted`, `bg-text-muted`  | #94A3B8   | #737B8C  | Captions, units, placeholders, most overlines, chart axis labels and goal lines, sheet grab handle, muted icons; inactive bar and dot fills (running-trend weeks, splits, paused import) |
| Decorative Glyph | `--color-icon-decorative` (JS only) | #536379   | #737B8C  | Placeholder glyphs in empty photo, measurement and medication slots                                                                                                                      |
| Link Blue        | `text-text-link`                    | #558BF6   | #5E8EED  | Link-variant buttons, inline text links, the logged time on diary food rows                                                                                                              |

### Accent and controls

| Role             | Token class                                                         | Light hex | Dark hex | Usage                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sparky Blue      | `bg-accent-primary`, `text-accent-primary`, `border-accent-primary` | #5087F7   | #427CF0  | Primary buttons, selected chips and days, focused input border, action glyphs, card "Details" links, center Add button, primary chart series                            |
| Muted Accent     | `--color-accent-muted` (JS only)                                    | #547AC4   | #7096E1  | Read into `useWellnessTokens().accentMuted` but never drawn (no consumer)                                                                                               |
| Pale Accent Text | `--color-accent-text` (JS only)                                     | #E2EBFD   | #F0F5FF  | On-accent text in the Log screen's active filter chips and the What's New chat mockup (2 reads); elsewhere content on accent uses `text-white`                          |
| Active Tab       | `--color-tab-active` (JS only)                                      | #5087F7   | #427CF0  | Focused tab icon and label (equal to Sparky Blue)                                                                                                                       |
| Inactive Tab     | `--color-tab-inactive` (JS only)                                    | #65718B   | #7B899D  | Unfocused tab icon and label                                                                                                                                            |
| Switch On Track  | `--color-form-enabled` (JS only)                                    | #7384A5   | #8194BB  | Switch track when on: a muted slate blue, deliberately not the accent                                                                                                   |
| Switch Off Track | `--color-form-disabled` (mostly JS)                                 | #CCCFD7   | #3A404A  | Switch track when off on Android; on iOS only the off-state outline (no `ios_backgroundColor` is set). Also the run-split rail and a disabled state in cycle onboarding |

### Nutrition and activity metrics

| Role                 | Token class                       | Light hex | Dark hex | Usage                                                                                         |
| -------------------- | --------------------------------- | --------- | -------- | --------------------------------------------------------------------------------------------- |
| Calorie Indigo       | `--color-calories` (JS only)      | #506CF7   | #8792E3  | Calorie ring, diary calorie bar, "other" calories segment; also reused for the verified badge |
| Protein Apricot      | `--color-macro-protein` (JS only) | #F6B151   | #E3AE63  | Protein bars, ring arcs, chart segments                                                       |
| Carb Leaf Green      | `--color-macro-carbs` (JS only)   | #7AD680   | #89C88D  | Carbohydrate bars, ring arcs, chart segments                                                  |
| Fat Sky Cyan         | `--color-macro-fat` (JS only)     | #6DCAE9   | #78C4DD  | Fat bars, ring arcs, chart segments                                                           |
| Fiber Moss           | `--color-macro-fiber` (JS only)   | #47944F   | #568F5C  | Fiber bar                                                                                     |
| Hydration Steel Blue | `--color-hydration` (JS only)     | #70A7C2   | #4799C2  | Water-bottle gauge fill, hydration settings icon                                              |
| Exercise Mint        | `bg-exercise`                     | #6DE3A0   | #3EB68A  | Training-load and training-consistency bars                                                   |
| PR Gold              | `--color-pr` (JS only)            | #D78509   | #F4C452  | Personal-record cards, rows and confetti; kept distinct from Category Amber                   |
| Heart-Rate Red       | `--color-heart-rate` (JS only)    | #E2363C   | #E96367  | Watch-measured heart rate on workouts and charts; also the finish marker on route maps        |
| Active-Energy Orange | `--color-active-energy` (JS only) | #F36F16   | #E79055  | Watch-measured active energy; separate from dietary Calorie Indigo                            |

### Category palette

Eight balanced hues for things that need a distinct color but no fixed meaning. Seven of them (all but amber) tint Settings row icons, and all eight color workout superset rails and the workout-complete confetti.

| Role            | Token class                    | Light hex | Dark hex | Usage                                                   |
| --------------- | ------------------------------ | --------- | -------- | ------------------------------------------------------- |
| Category Slate  | `--color-cat-slate` (JS only)  | #6B7280   | #6E7687  | Neutral settings icons, superset rail                   |
| Category Pink   | `--color-cat-pink` (JS only)   | #E23670   | #CC6688  | Fat-burning fasting stage, provider badges              |
| Category Violet | `--color-cat-violet` (JS only) | #8D52E0   | #9166CC  | REM sleep stage, ketosis fasting stage, provider badges |
| Category Orange | `--color-cat-orange` (JS only) | #F89054   | #D18A61  | Awake sleep stage, hard RPE, catabolic fasting stage    |
| Category Green  | `--color-cat-green` (JS only)  | #2D9534   | #6AA46F  | Provider badges                                         |
| Category Blue   | `--color-cat-blue` (JS only)   | #236EE7   | #6992D3  | Light sleep stage, provider badges                      |
| Category Teal   | `--color-cat-teal` (JS only)   | #1E868A   | #5AADAF  | Deep sleep stage, provider badges                       |
| Category Amber  | `--color-cat-amber` (JS only)  | #CE8E0D   | #D4A954  | Favorite star, moderate RPE, provider badges            |

### Progress tracks

| Role           | Token class                           | Light hex | Dark hex | Usage                                                                                                                       |
| -------------- | ------------------------------------- | --------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Progress Track | `bg-progress-track`                   | #E5E9F1   | #233453  | Empty part of rings, macro bars, gauges and the docked workout progress line (other bars still use other tokens; section 8) |
| Progress Rail  | `bg-progress-rail`                    | #EFF1F6   | #18243A  | Subtler rail, closer to the card than Progress Track in every theme; 2 uses (`CorrelationCards`, `CycleBarGlyph`)           |
| Overfill       | `--color-progress-overfill` (JS only) | #1F2937   | #E16B71  | Over-goal indicator (read on the Dashboard but not drawn; see section 8)                                                    |

### Status

| Role            | Token class                      | Light hex | Dark hex | Usage                                                                                                                                            |
| --------------- | -------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Success Wash    | `bg-bg-success`                  | #CDF4E8   | #1F4136  | Success toast and success tone backgrounds                                                                                                       |
| Success Ink     | `text-text-success`              | #2B7D69   | #C8F9E9  | Text on Success Wash (near-white in Dark; see Color rules)                                                                                       |
| Success Glyph   | `--color-icon-success` (JS only) | #199A51   | #3ECC7B  | Completion checks, public-share globe, map start marker, easy RPE                                                                                |
| Info Wash       | `--color-bg-info` (JS only)      | #D8E6FD   | #1B2741  | The `FoodForm` unit-conversion banner (the only use)                                                                                             |
| Info Ink        | `--color-text-info` (JS only)    | #1F52A3   | #D1E5FF  | Text and icon on Info Wash (`FoodForm` banner only)                                                                                              |
| Warning Wash    | `bg-bg-warning`                  | #FEF3C8   | #574223  | AI-estimate pill, warning tone backgrounds                                                                                                       |
| Warning Ink     | `text-text-warning`              | #81440E   | #FAE9BD  | Text on Warning Wash (near-white in Dark; see Color rules)                                                                                       |
| Warning Glyph   | `--color-icon-warning` (JS only) | #DA870B   | #F5B13D  | Warning icons                                                                                                                                    |
| Danger Fill     | `bg-bg-danger`                   | #B52C30   | #913639  | Solid red fills: swipe-to-delete action, error toast, destructive fills                                                                          |
| Danger Fill Ink | `text-text-danger`               | #FFF0F0   | #FAE5E6  | Near-white text on Danger Fill                                                                                                                   |
| Danger Wash     | `bg-bg-danger-subtle`            | #FEE2E3   | #441819  | Allergen warning banner and chips, error tone of AI-confidence badges (`FoodForm`, food-photo rows and review), failed chat message box          |
| Danger Ink      | `text-text-danger-subtle`        | #A71B20   | #FBC5C8  | Text on Danger Wash, destructive action-sheet items, some inline errors (`BarcodeField`, fasting sheets, `RecordActivity`)                       |
| Danger Glyph    | `text-icon-danger`               | #E61920   | #ED5E63  | Destructive button label, trash and error icons, max RPE, caffeine threshold, most inline validation errors (plan forms, multi-add, family copy) |

### Wellness and date tints

| Role             | Token class                             | Light hex | Dark hex | Usage                                           |
| ---------------- | --------------------------------------- | --------- | -------- | ----------------------------------------------- |
| Menstrual Red    | `--color-wellness-menstrual` (JS only)  | #E23647   | #E96370  | Period phase in cycle ring, calendar and charts |
| Follicular Green | `--color-wellness-follicular` (JS only) | #34B284   | #4DCB9D  | Follicular phase                                |
| Ovulation Blue   | `--color-wellness-ovulation` (JS only)  | #2A81F4   | #5A9EF6  | Ovulation phase                                 |
| Luteal Violet    | `--color-wellness-luteal` (JS only)     | #8954D4   | #A57CDE  | Luteal phase                                    |
| Pregnancy Rose   | `--color-wellness-pregnant` (JS only)   | #E05299   | #E774AD  | Pregnancy mode                                  |
| Past-Date Orange | `--color-date-past` (JS only)           | #F2590D   | #F07C42  | Date pill tint when viewing a day before today  |
| Future-Date Sky  | `--color-date-future` (JS only)         | #0DA6F2   | #5EBEED  | Date pill tint when viewing a day after today   |

### AMOLED differences

AMOLED uses the Dark values for 48 of the 61 color tokens. Only these 13 change:

| Token                    | AMOLED hex             | Dark hex |
| ------------------------ | ---------------------- | -------- |
| `--color-background`     | #000000 (pure black)   | #0C0E12  |
| `--color-surface`        | #080A0C                | #13161B  |
| `--color-raised`         | #111318                | #1C1F26  |
| `--color-chrome`         | #000000 at 90% opacity | #0E1116  |
| `--color-border`         | #1C1F26                | #272C35  |
| `--color-border-subtle`  | #16181D                | #1E2229  |
| `--color-border-strong`  | #252932                | #303541  |
| `--color-chrome-border`  | #171A21                | #212630  |
| `--color-text-secondary` | #ABB0BA                | #C7CAD1  |
| `--color-form-disabled`  | #282C33                | #3A404A  |
| `--color-progress-track` | #172236                | #233453  |
| `--color-progress-rail`  | #0E1420                | #18243A  |
| `--color-bg-success`     | #153228                | #1F4136  |

### Color rules

- Use semantic tokens only. A new color goes into `SparkyFitnessMobile/global.css` in all three theme blocks (`@variant light`, `dark`, `amoled`) before any component uses it.
- Metric mapping: calories use Calorie Indigo; protein, carbs, fat and fiber use the macro tokens, with ring arcs in the order protein, carbs, fat; hydration uses Hydration Steel Blue; training load uses Exercise Mint; watch heart rate and active energy use their own tokens; personal records use PR Gold. Sleep stages are awake orange, REM violet, light blue and deep teal. RPE runs easy green (Success Glyph), moderate amber, hard orange, max red (Danger Glyph). Fasting stages run accent, orange, pink, violet, indigo. Trend charts (steps, weight trend, VO2 max, caffeine) draw their main series in Sparky Blue.
- Status colors come in pairs: a wash with its ink (`bg-bg-success` + `text-text-success`, warning, info, `bg-bg-danger-subtle` + `text-text-danger-subtle`), or the solid red fill with near-white ink (`bg-bg-danger` + `text-text-danger`). Ink tokens are only legible on their wash: in Dark and AMOLED, Success, Warning, Info and Danger Ink are 86–91% lightness and read near-white (pale pink for danger) on a card. For standalone status text, dots or icons, use the `icon-*` glyph colors. A destructive text button uses `text-icon-danger`, because Danger Ink turns pale pink and Danger Fill maroon in dark themes.
- Opacity modifiers on token, white and black classes are uncommon (95 in total; another 69 sit on Tailwind palette classes, mostly in mindfulness and symptoms, see section 8). Most are accent tints (`bg-accent-primary/5`, `/10`, `/15`, `/20`; 35), softened borders (`border-border/30`, `/40`, `/50`; 21), `border-accent-primary/20` and `/40` (6) and black scrims (`bg-black/40` to `/70`; 19). The rest are one-offs: white overlays on photos and camera (`text-white/70`, `/80`, `bg-white/10`, `/20`, `border-white/20`), muted dots (`bg-text-muted/40`), translucent surfaces (`bg-surface/40`, `/50`, `bg-raised/60`, `bg-background/80`), `border-border-subtle/50`, and `bg-surface-elevated/60`, which renders nothing (section 8). The date pill uses its tint at 12% for the fill and 35% for the 1px border.
- Legitimate fixed colors that do not follow the theme: white text and icons on accent or red fills, and the white switch thumb; white or black controls over camera feeds and photos; black scrims; shadow color `#000`; a white backdrop behind transparent exercise illustrations; the constant pale-mint completion check (#EBFAF1); the eight share-card ink presets; the iOS Live Activity layouts; Google's night style for the Android route map.

## 3. Typography Rules

- Font family: the platform system font only. That is SF Pro on iOS and Roboto on Android. No custom fonts are loaded, and `global.css` defines no font or text-size tokens, so sizes are Tailwind v4 defaults: `text-xs` 12px (608 uses), `text-sm` 14px (974), `text-base` 16px (547), `text-lg` 18px (102), `text-xl` 20px (33), `text-2xl` 24px (30), `text-3xl` 30px (20), `text-4xl` 36px (2: breathwork countdown, an emoji), `text-5xl` 48px (6).
- Monospace has two sources. Chat tool-call payloads set the family inline to Menlo on iOS and `monospace` elsewhere (`chat/ToolCallCard.tsx`). The `font-mono` class (3 uses: the interval-workout clock and rep counter, and the meditation timer) uses Tailwind's default mono stack; `global.css` defines no `--font-mono`, so the resolved family is not pinned in the repo.
- Chart labels drawn with Skia use Helvetica on iOS (PingFang, Hiragino Sans or Apple SD Gothic Neo for Chinese, Japanese and Korean) and `sans-serif` on Android, at 12px (`CHART_LABEL_FONT_SIZE`), except `NutrientBarChart` and `BBTLineChart`, which use 11px.
- Three sizes carry the UI: `text-sm`, `text-xs` and `text-base`. Semibold is the default emphasis (682 uses), ahead of medium (341) and bold (282). Light and thin weight classes are never used; the only light weight is an inline `fontWeight: '300'` on the `DurationWheel` ":" separator.
- Three text colors carry nearly everything: Ink Navy (873 uses), Slate Secondary (836) and Muted Slate (469).

| Role                      | Size (px)                                                                                     | Weight                                                | Color token                                                                                          | Example component                                 |
| ------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| iOS native large title    | system large title                                                                            | 700                                                   | text-primary                                                                                         | Tab roots with Liquid Glass tabs on               |
| Screen title (custom bar) | `text-lg` (18), centered, 1 line                                                              | semibold                                              | `text-text-primary`                                                                                  | `useScreenHeader` custom bar                      |
| Tab-root hero title       | `text-2xl` (24)                                                                               | bold                                                  | `text-text-primary`                                                                                  | `DateNavigator` title, Library and Settings title |
| Detail hero title         | `text-3xl` (30) or `text-2xl` (24)                                                            | bold                                                  | `text-text-primary`                                                                                  | Food and exercise detail name                     |
| Sheet title               | `text-lg` (18), centered                                                                      | semibold                                              | `text-text-primary`                                                                                  | `BottomSheetPicker`, `ActionSheet`                |
| In-screen section heading | `text-lg` (18)                                                                                | semibold                                              | `text-text-primary`                                                                                  | Library "Create" heading                          |
| Chart card title          | `text-lg` (18), `mb-2`                                                                        | semibold                                              | `text-text-primary`                                                                                  | `WeightLineChart`, `TrendBarChart`                |
| Dashboard card title      | 14 (`text-md`, undefined, or no size class; both fall back to RN's 14)                        | bold                                                  | `text-text-secondary` (text-primary in `ProgressPhotosCard`)                                         | `FastingCard`, `MedicationsCard`                  |
| Diary card title          | `text-base` (16)                                                                              | bold                                                  | `text-text-secondary`                                                                                | `FoodSummary`, `ExerciseSummary`                  |
| Overline / small caps     | `text-xs` (12), uppercase, tracking optional                                                  | semibold                                              | `text-text-muted`                                                                                    | `BottomSheetPicker` section header                |
| Settings group overline   | `text-xs` (12), uppercase, `tracking-wider`                                                   | bold                                                  | `text-text-secondary`                                                                                | `SettingsRowGroup` title only                     |
| Row title                 | `text-base` (16), 1 line                                                                      | semibold (medium in food rows)                        | `text-text-primary`                                                                                  | `SettingsRow`, `FoodLibraryRow`                   |
| Row subtitle              | `text-sm` (14), `mt-0.5`, 1 line, middle ellipsis                                             | regular                                               | `text-text-secondary`                                                                                | `SettingsRow`                                     |
| Body / supporting copy    | `text-sm` (14)                                                                                | regular                                               | `text-text-secondary`                                                                                | `StatusView` subtitle                             |
| Form field label          | `text-sm` (14)                                                                                | medium                                                | `text-text-secondary`                                                                                | `FoodForm`, medication forms                      |
| Input text                | `text-base` (16, line height 20)                                                              | regular                                               | `text-text-primary`                                                                                  | `FormInput`                                       |
| Button label              | `text-base` (16)                                                                              | semibold (medium for destructive)                     | white (primary), accent (secondary, outline, ghost, header), link (link), icon-danger (destructive)  | `Button`                                          |
| Header text action        | 17                                                                                            | 500, or 600 for the primary                           | text-primary or accent-primary                                                                       | Header Save / Edit                                |
| Segmented label           | `text-sm` (14)                                                                                | medium                                                | primary when selected, else muted                                                                    | `SegmentedControl`                                |
| Tab label                 | `text-xs` (12), 1 line                                                                        | semibold focused, else medium                         | tab-active / tab-inactive                                                                            | `CustomTabBar`                                    |
| Caption / footnote        | `text-xs` (12)                                                                                | regular                                               | `text-text-muted` or secondary                                                                       | Nutrient source captions                          |
| Micro caption             | 10–11px                                                                                       | regular or semibold                                   | `text-text-muted`                                                                                    | Macro bar caption, quick-add header               |
| Ring / gauge center value | `text-2xl` (24)                                                                               | bold                                                  | `text-text-primary`                                                                                  | `CalorieRingCard`                                 |
| Stat tile value           | `text-xl` (20)                                                                                | semibold or bold                                      | `text-text-primary`                                                                                  | `charts/StatTile`                                 |
| Stat tile label           | `text-xs` (12), sentence case (uppercase in `charts/StatTile` and `WorkoutCompleteStatTiles`) | regular (semibold only in `WorkoutCompleteStatTiles`) | `text-text-secondary` (muted in `charts/StatTile`, `WorkoutCompleteStatTiles` and `SplitRow` `Stat`) | `ReportHighlights`, `charts/StatTile`             |
| Timer                     | `text-3xl` (30) to `text-5xl` (48)                                                            | extrabold or bold (black on the interval clock)       | `text-text-primary`; the rest-bar countdown is Sparky Blue while running and Muted Slate when paused | Fasting card, rest bar, live run, interval HUD    |
| Chart axis label          | 12 (11 in two charts)                                                                         | regular                                               | text-muted                                                                                           | All trend charts                                  |
| Toast title / body        | 14 / 13                                                                                       | 600 / regular at 85%                                  | toast ink color                                                                                      | `toastConfig`                                     |

Numbers and units:

- Numbers and dates follow the user's locale: format with `formatLocalizedNumber` (196 call sites in 78 files) and the locale-aware date helpers. Never build display numbers with `toFixed` and string concatenation.
- Ticking values (rest countdown, fasting timer, workout header, set rows, workout-complete stat tiles) use fixed-width digits (CSS `font-variant-numeric: tabular-nums`; in code the inline style `fontVariant: ['tabular-nums']`).
- Units sit next to or under a big number in a smaller, lighter style, but there is no shared pattern: a baseline sibling `text-sm text-text-muted ml-0.5` (`FastingSharedComponents`), a nested `text-sm font-semibold text-text-secondary` span (`WorkoutCompleteStatTiles`), a stacked `text-xs text-text-muted` line (`SplitRow`), a nested `text-xs text-text-secondary font-normal` span (`ExerciseStatisticsScreen`).

Truncation and scaling:

- Single-line clamping with an ellipsis is the norm: 112 of 143 `numberOfLines` props are `{1}`. Row titles cut at the end. `SettingsRow` string subtitles are one line and cut in the middle by default (60 of 116 rows pass a subtitle); server, URL and passkey screens also cut names in the middle.
- Text shrinks to fit (`adjustsFontSizeToFit`) in 4 places only: AddSheet exercise-tile labels (down to 80%), an active set-row value (75%), and the `ReportHighlights` value and `CycleRing` center label (no minimum).
- Text grows with the OS text-size setting with no cap (no `maxFontSizeMultiplier`). Only chart axis labels opt out (`allowFontScaling={false}`), so they stay aligned with the plot.

## 4. Component Stylings

Radius classes in sections 1–5 use the app's remapped scale, not web Tailwind's: `rounded-md` = 8px, `rounded-lg` = 12px, `rounded-xl` = 16px (web equivalents: `rounded-lg`, `rounded-xl`, `rounded-2xl`). In mockups, use the px values: 16px for cards, grouped rows, buttons, menus and AddSheet tiles; 12px for inputs, search fields, pickers, steppers, the segmented track and icon tiles; 8px for the selected segment, small rectangular tag badges, thumbnails, toasts and wheel bands; fully round for chips, pill badges, the date pill and the Add button.

### Buttons

`Button` (`SparkyFitnessMobile/src/components/ui/Button.tsx`, 275 uses in app code) has 7 variants. All except `header` have 14px vertical and 16px horizontal padding (`py-3.5 px-4`) and centered content; all except `header` and `link` also have a 16px radius (`rounded-xl`), which makes a single-line button about 52pt tall. String children render as a 16px label.

| Variant       | Look                                                              | Uses (explicit)  |
| ------------- | ----------------------------------------------------------------- | ---------------- |
| `primary`     | Solid Sparky Blue fill, white semibold label. The default variant | 68 (+19 default) |
| `secondary`   | Bright Control Fill, no border, Sparky Blue semibold label        | 41               |
| `outline`     | Transparent with a 1px Sparky Blue border and label               | 33               |
| `ghost`       | Transparent, Sparky Blue label; also the inline-link idiom        | 79               |
| `header`      | Transparent, no padding, 10pt invisible touch margin              | 5                |
| `link`        | Transparent, Link Blue semibold label, no radius                  | 8                |
| `destructive` | Transparent, Danger Glyph medium label (no red fill)              | 19               |

3 more pick the variant at runtime (`StatusView` action, `RunProgramCard`, `RunProgramSelect`).

- States: pressed lowers opacity to 0.8; disabled and loading set 50% opacity; loading replaces the label with a small white spinner.
- Icon + label: the button is not a row by default, so add `flex-row` (or wrap content in `flex-row items-center gap-2`). On the two primary buttons with an icon, it leads in white at 18–20px (`ImportHistoryScreen` 18, `PasskeySettingsScreen` 20).
- Inline text link: `variant="ghost"` with `className="self-start py-0 px-0"` and a 10pt touch margin.
- Footer save button: primary with `py-3` and a 14px label.
- Custom tappable rows and tiles dim to 70% while pressed: `TouchableOpacity activeOpacity={0.7}` (134 uses), a Pressable whose `pressed` style sets opacity 0.7, or `active:opacity-70` (11). There is no scale, ripple (no `android_ripple`) or hover effect; one control scales (`active:scale-[0.99]` in `ActiveWorkoutIntervalHud`). Today this is inconsistent: 140 of 298 `TouchableOpacity` omit `activeOpacity` and fall back to RN's 0.2, 21 use 0.6, and 193 of 247 Pressables have no pressed feedback, including `ActionSheet` items, `AnchoredMenu` rows and the diary meal-card header.

### Cards and surfaces

- Standard card: Porcelain Card fill, 16px rounded corners, 16px padding, small soft shadow, no border: `bg-surface rounded-xl p-4 shadow-sm`. Dashboard cards add `mb-3` (35 exact uses), settings-style cards add `mb-4` (25).
- Dashboard card header: a bold title on the left in Slate Secondary, and an optional "Details" or "View all" link on the right in Sparky Blue with a 14px forward chevron (`flex-row justify-between items-center mb-2`). Tapping the header row usually navigates.
- Chart card: same shell with `my-2` and an 18px semibold Ink Navy title (`text-text-primary`, #0F1729 / #E8EAEE) with 8px below it.
- Grid card: the Nutrients card uses `p-3` and a wrapping two-column grid of `w-[48%] p-1` tiles.
- Launcher row: Ask Sparky is a slim `bg-surface rounded-lg px-4 py-3 shadow-sm` row with an 18px sparkles icon in accent and muted placeholder text.
- Inset note inside a section (one instance, the Diary summary's projected TDEE note): `rounded-lg bg-surface px-3 py-2`.
- Stat mini-card (workout complete): `flex-1 bg-surface rounded-xl shadow-sm px-3.5 py-3`, in pairs with `gap-2`.
- Popover surface: `bg-surface rounded-xl border border-border-subtle shadow-lg`.
- Drift to avoid copying: recording and run-program surfaces (`components/recording/*`, `RecordActivityScreen`, `RunProgram*Screen`, `RunSummaryScreen`, `WorkoutDetailScreen`, `RouteDetailScreen`, `PersonalRecordsScreen`) use shadowless `bg-surface rounded-xl p-4` stacked with `mt-4` (23) or `mb-4` (12). Mood and symptom forms use `bg-surface border border-border p-3.5 rounded-2xl space-y-2` (7). New cards use the standard shell.

### List rows and grouped settings rows

- `SettingsRow`: `p-4 flex-row items-center`. Leading 40x40 icon tile (`w-10 h-10 rounded-lg mr-3`) with a transparent background and a 22px semibold glyph in a category color (Slate Secondary by default). Title `text-base font-semibold text-text-primary`, subtitle `text-sm text-text-secondary mt-0.5`. The trailing slot holds a switch, a value or a picker, or a 20px forward chevron in Slate Secondary when the row navigates. Pressed opacity 0.7, disabled 0.5. On its own it is a card (`bg-surface rounded-xl p-4 mb-4 shadow-sm`).
- `SettingsRowGroup`: one card (`bg-surface rounded-xl mb-4 shadow-sm`) with full-width 1px dividers (`h-px bg-border-subtle`) between rows and no inset. Optional header `px-4 pt-3 pb-1` with an uppercase `text-xs font-bold text-text-secondary tracking-wider` overline.
- Library rows (foods, meals, search results): a 40px thumbnail with 8px corners in `pl-4 py-3` (`py-2` in food search results), then the name (`text-base font-medium`, 1 line) with small badges at `gap-1.5` (`gap-1` in search results), the brand under it in `text-sm text-text-secondary`, and on the right the calories (`text-base font-semibold`) over the serving (`text-xs text-text-secondary`). Rows are separated by `border-b border-border-subtle`.
- Diary food rows are dense: `py-1.5`, no dividers, an optional 56px photo with 8px corners. The name is 14px regular Ink Navy, followed by " · quantity unit" in 14px Slate Secondary and an optional logged time in 12px Link Blue. On the right is a plain "N Cal ▾" text button in 14px medium Slate Secondary (not Sparky Blue).
- Swipe to delete: swiping left reveals an 80px-wide Danger Fill panel with a near-white `text-sm font-semibold` "Delete" label. A confirmation alert follows, and long-press offers the same actions.
- Collapsible section header: `py-3` with a hairline bottom border, a 20px chevron that rotates from down to right over 200ms, a `text-base font-semibold` title and a muted `(count)`.
- Reorderable lists come in two forms. Settings lists (`ReorderSwitchList`/`ReorderSwitchRow`; Dashboard, Health Trends, Reports, Watch and Meal Type settings): fixed 64pt rows (`REORDER_ROW_HEIGHT`), `bg-surface border-b border-border/40`, a leading 22px Muted Slate `reorder-handle`; the dragged row scales to 1.02 with a soft shadow (opacity 0.16, elevation 8). The exercise reorder overlay (`WorkoutReorderList`; workout forms, ActiveWorkout): separate `bg-surface rounded-xl` cards 8pt apart (`REORDER_ITEM_GAP`), one 64pt row per exercise with a 40px thumbnail, a trailing 24px Muted Slate handle, a 3px category-color rail on the left of superset runs; the dragged card scales to 1.03 with a black shadow (opacity 0.18, elevation 8).
- Workout set rows (`ActiveWorkoutSetRow`): `flex-row items-center py-2 px-1` straight on the canvas. An upcoming set shows a 28px empty ring (`h-7 w-7 rounded-full border-2`, Muted Slate). The current set is a `rounded-xl` row tinted with Sparky Blue at 12%. A done set dims its content to 0.62 opacity while its `CompletionCheck` (Success Glyph circle, #EBFAF1 check) stays vivid.
- Lists come in two forms: full-bleed rows with bottom dividers, or rows inside a grouped card with `overflow-hidden`.

### Inputs

- Text field (`FormInput`, 156 uses): Bright Control Fill, 1px Hairline Divider border that turns Sparky Blue on focus, 12px corners (`rounded-lg`), 10px vertical and 12px horizontal padding, 16px text, placeholder in Muted Slate. About 42pt tall. Labels sit above as `text-sm font-medium text-text-secondary`. Focus is the only styled state: there is no red error border, and `editable={false}` is not dimmed. Show field errors as a `text-sm` line under the field (section 8 notes the color split) and submit failures as an error toast; map a mockup's red error border to that line.
- Search field: `flex-row items-center bg-raised rounded-lg px-3 py-2.5` with a 1px border, an 18px Muted Slate search glyph and a 16px input. `LibrarySearchBar` (the 4 library lists) sits in a `px-4 pb-3` strip, has a transparent border at rest that turns Sparky Blue on focus, and shows a trailing accent spinner while searching (no clear button). Exercise and preset search use a `px-4 py-2` strip, a Hairline Divider border at rest and a trailing 16px clear button. Food search has a transparent border at rest (Sparky Blue on focus), swaps the leading glyph for a muted spinner while searching, and shows one trailing 20px button: clear while there is text, scan (header action color) when the field is empty.
- Stepper (`StepperInput`): a joined [−][value][+] control, `bg-raised rounded-lg` with a 1px border and inner dividers in the same color (Sparky Blue when focused). Default cells are 40x40 with a 56px value field and 20px icons and text; the compact set-row size is 32x32, 48px, 18px icons and 16px text.
- Segmented control: track `flex-row bg-raised p-1 rounded-lg`, segments `flex-1 py-2 rounded-md`. The selected segment is filled with Porcelain Card, one step darker than the track (#F9FAFB on #FFFFFF in Light, #13161B on #1C1F26 in Dark), so it reads as a faint inset and selection shows mainly through the label: `text-sm font-medium`, Ink Navy when selected and Muted Slate otherwise. An optional 8px color dot leads the label, and the selected segment then gets a 1.5px border in that color.
- Switch: the native platform switch with a white thumb. On Android the track is Switch On / Switch Off; on iOS the off color only tints the outline. About half of the 74 switches (34) sit in a `SettingsRow` trailing slot; the rest are in hand-built `flex-row justify-between items-center` rows. New toggles should prefer `SettingsRow`.
- Picker trigger: `flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11`, with the value in `text-base text-text-primary` and a 16px muted down-chevron. It opens a picker sheet (see below).
- Wheels: duration wheels show 5 rows of 44pt, a 22px medium value, a selection band in Hairline Divider color with 8px corners, and uppercase `text-xs` column labels. Time wheels use 24–28px values.
- Calendar: a month grid in a bottom sheet. Its header has 18px chevrons and a 16px semibold month and year that open month and year grids. The selected day is a Sparky Blue fill with a white label, and today has a 1px Sparky Blue ring.
- There is no shared slider. The meal-distribution percent slider (24px thumb, 6px track) and the symptom severity slider are feature-local.

### Sheets and menus

- Bottom sheets (19 of them): Porcelain Card background with the library's default top corners (no sheet overrides them), a grab handle in Muted Slate, and a black backdrop at 50% (Light) or 70% (Dark and AMOLED) that dismisses on tap. Most size to their content. Bottom padding is the home-indicator inset or 20px, whichever is larger, for menus and pickers (`pb-safe-or-5`), and the inset or 32px for form sheets (`pb-safe-or-8`).
- Sheet titles: picker and menu sheets (`BottomSheetPicker`, `ActionSheet`, `WeekdaySheet`, `FoodUnitSelectorSheet`) have a `px-4 py-4 border-b border-border-subtle` title row with a centered `text-lg font-semibold` title; `ActionSheet` adds an optional 20px Sparky Blue back chevron. Form sheets put a borderless centered `text-lg font-semibold text-text-primary` title (`mb-1` to `mb-4`) at the top of their content. `CalendarSheet`, `TimeSheet` and AddSheet have no title; `DateRangeSheet` has a borderless centered `text-base font-semibold text-text-primary` title (`mt-2 mb-1`) above the calendar, defaulting to "Select a date range to remove" (override it with `title`).
- Picker sheet (`BottomSheetPicker`): option rows `px-4 py-3.5` with hairline dividers. The selected option is semibold with a 20px Sparky Blue checkmark. Section headers are `px-4 py-2 bg-surface` with uppercase muted `text-xs font-semibold`. Up to 8 options size to fit; longer lists scroll in a 500pt sheet.
- Action sheet (`ActionSheet`, overflow and context menus): rows `px-4 py-3.5 border-b border-border-subtle` with a `text-base font-medium` label and an optional muted description. Destructive items use Danger Ink. Groups are separated by a 12px band of canvas color (`h-3 bg-background`). Maximum height is 80% of the screen.
- AddSheet (center Add): a 2x2 grid of large tiles (Food, Exercise, Measurements, Scan Food), each a Bright Control Fill block with 16px corners, `py-5`, a 32px Sparky Blue glyph and a 14px medium Ink Navy label. Below it is a stack of full-width Bright Control Fill buttons, each with 16px corners, 12px apart and `py-3`, holding a centered 20px Sparky Blue glyph and a 14px medium Ink Navy label: Check-In, Progress Photos, Wellness (only while cycle tracking is on), Symptoms, Mood, Mindfulness, Ask Sparky and Sync Health Data. The Exercise submenu has a Sparky Blue "Back" link, a row of 3 tiles with `text-xs` subtitles and, when GPS recording is available, a full-width Record Activity tile below them.
- Anchored menu (dropdown under a header button on the custom path): popover `bg-surface rounded-xl border border-border-subtle shadow-lg py-1`, at least 200pt wide, 6pt below its trigger and at least 8pt from the screen edge. It fades in over 120ms and zooms from 95% over 160ms, and closes instantly. Rows are `flex-row items-center gap-3 px-4 py-3`, separated by `border-t border-border-subtle`, with a 20px Sparky Blue icon, a `text-base font-medium` Ink Navy label and an 18px Sparky Blue check when selected. Group labels are `px-4 pt-2.5 pb-1` uppercase Muted Slate `text-xs font-bold tracking-wider` (with a top divider after the first).
- Plain RN modal overlays use a 50% black scrim (outliers: 55% in `MedicationFormScreen`, 65% in `AnnouncementModal`). Full-screen modals pad their content with the status-bar inset plus 16 on top and the bottom inset (at least 16) below.

### Navigation chrome

- Custom tab bar (Android, and iOS without Liquid Glass tabs): Chrome Bar fill with a hairline Chrome Edge top border, five slots (Dashboard, Diary, Add, Library, Settings), and bottom padding equal to the home-indicator inset (at least 4). Each tab is a 24px icon over a one-line `text-xs` label at `pt-2 pb-1`. The focused tab is Active Tab color with a semibold label (and a bold glyph on iOS); the others are Inactive Tab color with a medium label. On Android the filled Ionicons glyph changes color only.
- Center Add button: a 56pt Sparky Blue circle with a 28pt bold white plus, bottom-aligned in the bar. Its top edge sits about 6pt above the bar's top hairline, so most of the circle lies inside the ~54pt bar. It has a shadow (black, offset 2/4, 25% opacity, blur 6; elevation 4 on Android) and opens the AddSheet instead of navigating.
- iOS 26+ Liquid Glass tabs: the native system tab bar with SF Symbols (square.grid.2x2.fill, book.fill, books.vertical.fill, gearshape.fill), and Add shown as the detached trailing plus button. Do not redraw it.
- Native iOS headers (pushed screens below iOS 26, and on 26+ with Liquid Glass on): title weight 600, no custom background, inheriting the canvas color. Native large titles on tab roots (weight 700) appear only with Liquid Glass tabs on.
- Custom header bar (pushed screens on Android and on iOS 26+ with Liquid Glass off): a transparent bar `px-4 py-3` with a `border-b border-border-subtle` hairline, a centered one-line `text-lg font-semibold` title, a 22px back chevron or close glyph, 24px icon actions and 17px text actions. Touch margins are 10pt and disabled actions sit at 40% opacity.
- Tab roots without Liquid Glass tabs draw no bar: Dashboard and Diary show the date navigator; Library and Settings show a `text-2xl font-bold` Ink Navy title (`mb-6`) as the first scroll child, with the status-bar inset as top padding. `ActiveWorkout` hides the navigator header and draws its own `ActiveWorkoutHeader`.
- One-primary-action rule: each screen has at most one accent (primary) header action, usually Save. Every other header action is Ink Navy. On the Liquid Glass path all actions, Save included, are Ink Navy. The rule and its `__DEV__` enforcement are defined in `AGENTS.md` (App Shell And Navigation); if the two disagree, `AGENTS.md` wins.
- Date navigator (Dashboard and Diary without Liquid Glass tabs): a `text-2xl font-bold` title, 44x44 back and forward chevrons (18px, Slate Secondary) and a center pill `rounded-full px-2.5 py-1` with a `text-lg font-medium` date and a 14px down-chevron. When the date is not today, the pill takes Past-Date Orange (#F2590D / #F07C42) or Future-Date Sky (#0DA6F2 / #5EBEED): a 12% fill, a 1px border at 35%, and the date label and chevron in the full color. On today the label is Ink Navy and the pill keeps a transparent 1px border, so its size never changes. With native tabs the same controls move into the native header.

### Footer action bars

- List action bar (`FooterActionBar`): `px-4 bg-background` with bottom padding equal to the home-indicator inset (at least 16), no top divider, holding one full-width primary Button. Used under plan and container lists.
- Form save bar (`FooterSaveBar`, 17 screens): `px-4 py-3 border-t border-border-subtle`, bottom padding equal to the inset (at least 12), holding a primary Button (`py-3`, 14px label) with duplicate-tap protection. On 11 screens it is the custom-header twin of a header Save marked native-only, shown only when native headers are off (`MeasurementsAddScreen`). On 4 screens (food entry add and multi-add, the two food-photo screens) it is the screen's only primary action on every platform, often with a custom label such as "Add Food". Symptom log and symptom definition editor also keep a header Save that is not marked native-only, so they show Save twice (section 8).
- Keyboard accessory bar (set entry Done / Next / Log, 52pt): hidden behind the keyboard and rising with it.
- Floating summary bar (food search basket): `absolute left-4 right-4 rounded-xl bg-raised border border-border-subtle px-4 py-3`, 12pt above the bottom inset.
- Active workout bar: docked above the custom tab bar as a Chrome Bar strip (at least 66pt tall) with a 3px progress line in Sparky Blue on Progress Track. On Liquid Glass it becomes a frosted pill (fully rounded, 20pt side margins, 6pt above the tab bar, hairline border, soft shadow).
- Rest bar (`ActiveWorkoutRestBar`): docked `bg-surface border-t border-border-subtle px-4 pt-2` with a 4px (`h-1`) progress track, a `text-3xl font-bold` countdown and round `bg-raised` controls.

### Badges, pills and chips

- AI-estimate pill: `px-1.5 py-0.5 rounded-full bg-bg-warning` with a `text-[10px] font-semibold text-text-warning` label.
- Allergen chips: `bg-bg-danger-subtle rounded-full px-2 py-0.5` with `text-xs font-semibold text-text-danger-subtle`, prefixed with a warning sign. Trace chips use regular weight.
- Verified badge: a filled check circle, 18px in rows and 22px on detail screens, in Calorie Indigo. Share status: a 16px green globe (public) or Sparky Blue people glyph (family). Favorite: a 16px Category Amber star.
- Meal calorie chip: `bg-accent-primary/5 rounded-full px-2.5 py-0.5` with `text-xs font-semibold text-accent-primary` ("eaten / target Cal").
- Selectable chips (no shared component; canonical: `HydrationGauge` container chips): a pill (`rounded-full`) with a 1px border, 12–16px horizontal and 4–8px vertical padding (`px-3 py-1` to `px-4 py-2`) and a 12–14px medium label. Selected: `bg-accent-primary border-accent-primary` with a white label (15 lines), or the tinted `bg-accent-primary/10 border-accent-primary` with a Sparky Blue label (6). Unselected: `bg-raised border-border-subtle` with an Ink Navy label. Symptom and mood chips differ mainly in their unselected fill, `bg-surface border-border` (13 uses): 7 are pills (`rounded-full px-3 py-1.5` to `px-4 py-1.5`; the mood tag chip `rounded-full px-3 py-2`), 3 symptom chips use `rounded-xl px-3 py-2` (plus one `rounded-xl p-3` row), and the severity buttons use `rounded-lg` and `rounded-md`; the cycle view uses `bg-raised border-transparent`; new chips follow the canonical form.
- Fasting stage pill: `px-2.5 py-1 rounded-full shadow-xs` filled with the stage color, a 12px white flame and a white `text-xs font-bold uppercase tracking-wider` label.
- Notification dot on a header menu button: 8px Sparky Blue circle at the top-right corner.

### Feedback

- Toasts: appear at the top, 8pt below the status bar, with 16pt side margins, 8px corners, 14x10 padding and a soft shadow. Success uses Success Wash with Success Ink, error uses the solid Danger Fill with near-white ink, and info uses Porcelain Card with Ink Navy. Title 14px semibold, body 13px at 85% opacity. Error toasts are the most common (281 of 389 `Toast.show` calls).
- Loading, empty and error states (`StatusView`, 140 uses): full-screen content is centered with `px-6`. It shows a large Sparky Blue spinner, or an icon (48px default, 64px common) in accent, Muted Slate or Danger Glyph. Title `text-base text-text-secondary mt-4`, subtitle `text-sm text-text-secondary mt-2`, and an optional Button (secondary by default) with `mt-4 px-6`. The inline variant is `px-6 py-10 items-center` with an Ink Navy `text-base font-medium` title (`mt-4` only under a spinner or icon). Canonical error: alert circle in danger plus a Retry button. Canonical offline: a 64px muted cloud-offline icon plus an action.
- Card-level loading: dashboard cards keep their shell and title and show a small Sparky Blue spinner at the right of the title row (`FastingCard`), not a `StatusView`.
- Pull to refresh: tab roots and lists use the native refresh control tinted Sparky Blue (12 of 14 files; `ExercisesLibraryScreen` tints it Ink Navy and `CustomNutrientsScreen` leaves the system default). The tint applies on iOS only; Android shows the default Material spinner (section 8).
- Empty day: a muted abstract illustration (circles and rounded rectangles in Progress Track and border colors) in a standard card with a `text-sm text-text-secondary` caption.
- Chart placeholders: centered `text-sm text-text-muted` text in a 200pt-tall box for loading, error and empty.
- Banners: allergen warning `bg-bg-danger-subtle rounded-xl p-3 flex-row gap-2` with a 20px warning icon and Danger Ink text; the What's New banner is a Chrome Bar strip with a 36px `bg-accent-primary/15` circle holding a 20px accent icon (on Liquid Glass, a frosted pill with a 32px circle and 18px icon).
- Shimmer placeholder for values still arriving: `bg-raised rounded-md` pulsing between 45% and 100% opacity (650ms each way, a 1.3s cycle; static when reduce motion is on). Used only by the workout-complete calories tile.

### Data visualization

- Progress ring: drawn with Skia. Starts at 12 o'clock and runs clockwise with a round cap over a full Progress Track circle. It fills from 0 over 500ms (ease-out cubic) each time the screen gains focus. The calorie ring is 160pt with a 12pt stroke in Calorie Indigo, with "remaining" in `text-2xl font-bold` at the center and `text-xl font-bold` side stats for consumed and burned.
- Macro composition ring: three flat-capped arcs (protein, carbs, fat) sized by calorie share, animating over 600ms. In `NutritionMacroCard` (its only consumer) it is 130pt with a 12pt stroke in the no-goal layout, with a 10px color-dot legend; in the goal-progress layout it shrinks to 100pt with an 8pt stroke and appears only when there is no calorie goal (otherwise that slot is a 100pt accent `ProgressRing`).
- Macro bars: 8px-tall rounded bars (6px compact) on Progress Track. In the Dashboard Nutrients grid (`MacroCard`) the caption is `text-[10px] text-text-muted` ("N% · Xg left"), and over goal the solid fill stops at the goal mark, then a 2px gap, then the same color at 65% opacity. `NutritionMacroCard` bars clamp at 100% and caption in `text-xs text-text-muted`.
- Hydration gauge: a 70x130 water-bottle shape with a 2px Strong Outline. The Hydration Steel Blue fill rises over 800ms. The minus and plus controls are 28px circle icons in the hydration color.
- Fasting: a five-segment zone bar (`h-3.5 rounded-full` rail, future zones at 22% opacity, the active zone outlined in white) and, on the detail screen, a 240pt gradient ring with milestone ticks at 16, 24 and 72 hours.
- Trend charts (Victory Native on Skia): bars in Sparky Blue with 6px rounded tops and a 175pt plot. Lines: the weight trend is a 2.5px smooth Sparky Blue line over a 1px muted raw line; single points become dots with a 5pt radius (10pt across). Calories and sleep use square stacked blocks on a 150pt plot. Axis labels are 12px Muted Slate on a "nice" scale with at least 3 ticks. No grid lines are styled.
- Goal line: dashed (6 on, 4 off), 1.5px, Muted Slate, stepping between days.
- Scrubbing: press and hold for 100ms, then drag. The readout is a fixed one-line `text-sm text-text-secondary` caption above the plot ("value · Weekday, Mon d") that clears on release. There is no floating tooltip.
- Chart headline tiles: an uppercase `text-xs text-text-muted` label over a `text-xl font-semibold` value. The legend uses 8px dots with `text-xs text-text-muted` labels.
- Health Trends: a `text-xl font-bold` section heading, a 7d/30d/90d segmented control, and a 350pt horizontal pager of chart cards with 8px page dots (Sparky Blue active, Standard Border inactive).

## 5. Layout Principles

- Target viewport: portrait phone, about 390pt wide as the reference (358pt of content inside 16pt gutters). Small phones at 360–375pt leave 328–343pt of content. Two-column grids use percentage widths (`w-[48%]`, nutrient pills `w-[23%]`) so they shrink rather than wrap.
- Screen gutter: 16pt on both sides (`px-4`, or `padding: 16` in scroll content); `ActiveWorkoutScreen` is the exception at 12pt (`px-3 pt-2`). Sheets do not use the screen gutter: list sheets (`BottomSheetPicker`, `ActionSheet`, unit and weekday pickers) are full-bleed with 16px row padding; date and time sheets use 8px (`px-2`); AddSheet uses 10px (`px-2.5`) with `mx-1.5` tiles; form sheets use a wider 20–24px (`px-5`/`px-6`). Centered empty states go through `StatusView` (`px-6`).
- Vertical rhythm: margins, not `space-y`. Cards are 12pt apart on the Dashboard (`mb-3`) and 16pt in Settings (`mb-4`); diary meal cards are 8pt apart (`gap-2`). `FormScreenChrome` forms use `px-4 pt-4 pb-20 gap-4` (also `FoodForm` and `CustomNutrientFormScreen`; 3 files); other forms use `padding: 16` with `rowGap` 16–24 and a bottom of inset + 80 + the active-workout padding (`Glp1PenFormScreen`), or `px-4` bodies above a `FooterSaveBar` (`MeasurementsAddScreen`). Inside rows and cards, gaps are 6–12pt (`gap-1.5`, `gap-2`, `gap-3`).
- Spacing scale: Tailwind's 4pt base. `global.css` defines four spacing tokens, `--spacing-1` to `--spacing-4` = 4, 8, 12 and 16px, which equal Tailwind's defaults. Half steps (`1.5`, `2.5`, `3.5` = 6, 10, 14pt) are common in controls. It also overrides the radius tokens `--radius-sm` 4, `--radius-md` 8, `--radius-lg` 12 and `--radius-xl` 16px (web Tailwind: 4, 6, 8, 12), which is why web radii must be translated by pixel value (section 4 intro).

| Radius class   | Value | Meaning                                                                                                                                                                                                                              |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rounded`      | 4px   | Tailwind default; a few small inline badges                                                                                                                                                                                          |
| `rounded-sm`   | 4px   | Tiny marks                                                                                                                                                                                                                           |
| `rounded-md`   | 8px   | Small rectangular tag badges (`px-2 py-0.5 rounded-md`, e.g. WOD and guided-interval badges; 15 of 27 uses), selected segment and segment-like rating buttons (8), the shimmer block; also inline 8px for thumbnails, toasts, wheels |
| `rounded-lg`   | 12px  | Inputs, search fields, pickers, steppers, segmented track, icon tiles                                                                                                                                                                |
| `rounded-xl`   | 16px  | Cards, grouped rows, buttons, menus, AddSheet tiles (379 uses)                                                                                                                                                                       |
| `rounded-2xl`  | 16px  | Same as `rounded-xl` (Tailwind default, not overridden); 63 uses                                                                                                                                                                     |
| `rounded-3xl`  | 24px  | Tailwind default; 1 use (What's New action strip)                                                                                                                                                                                    |
| `rounded-full` | pill  | Chips, badges, date pill, dots, avatars, the Add button, glass pills                                                                                                                                                                 |

Prefer the four overridden radius tokens for new work.

- Elevation: one level for content. Cards use `shadow-sm` (214 uses) and normally no border. The popover (`AnchoredMenu`) uses `shadow-lg` plus a border, What's New cards use `shadow-md`, and `shadow-xs` appears on the fasting stage pills and some mindfulness and fasting cards (7 uses). The Add button, toasts, Liquid Glass pills and the drag-lift preview set their shadow inline (black, 8–25% opacity). In Dark and AMOLED, depth comes from the surface steps (canvas, card, raised control).
- Safe areas: read the device safe-area insets. The status bar is translucent over the canvas. Pushed screens add the top inset only when they draw their own header (`usesNativeHeader ? undefined : { paddingTop: insets.top }`). Modal screens add it on Android only (`Platform.OS === 'android'`, as `FormScreenChrome` does), because an iOS modal already starts below the status bar; `ProgressPhotos` is pushed except in the guided check-in, where it is a sheet and pads like a modal; 9 of the 24 modal routes (medication, GLP-1, symptom and mood forms, `MoodDay`, `CycleOnboarding`) gate it on `usesNativeHeader` instead (section 8). Bottom bars pad to the home indicator or Android navigation bar with a 12–16pt minimum. The Android navigation bar style follows the theme.
- Bottom clearance: the most common scroll-end padding on stack screens (38 of 95) is safe-area inset + 80pt + the active-workout padding; screens without a trailing action use inset + 16 to 24pt. The active-workout padding is 66pt on stack screens and 72pt on tab roots while a workout, recording or watch run is live, and 0 otherwise. The custom tab bar sizes to its content, about 54pt (`TAB_BAR_HEIGHT = 56` is the estimate used for offsets), plus `Math.max(insets.bottom, 4)`. The Add button pokes about 6pt above it (the docked workout bar reserves a 6pt strip for it), so floating content over the tab bar must clear that bump.
- Keyboard: forms scroll inside a keyboard-aware scroll view that keeps the focused field 20–80pt above the keyboard. Bars that only make sense with a keyboard ride on top of it. Layout properties (height, padding, margins) are never animated from keyboard progress.
- One-handed reach: the most common action, Add, is the center bottom tab. On the custom-header path (Android, and iOS 26+ with Liquid Glass off) most forms move Save into a bottom footer; `FormScreenChrome` forms keep Save in the top bar. List actions sit in a bottom footer bar. Headers keep at most one emphasized action.
- Touch targets: 44pt minimum where it matters (date chevrons and pill, picker triggers `min-h-11`). Small glyph buttons get an invisible 8–10pt touch margin.
- Density: medium-high. Picker and action-sheet rows are about 52pt (`py-3.5`), anchored-menu rows about 48pt (`py-3`), library rows about 64pt (40pt thumbnail plus `py-3`), settings rows 56–78pt (`p-4`), diary food rows compact (`py-1.5`), and buttons about 52pt.

## 6. Implementation Mapping (HTML/Tailwind mockup → React Native + Uniwind)

| Mockup / web construct                                                        | In this codebase                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `div`, `section`, `header`, `main`                                            | `View` with `className`                                                                                                                                                                                                                                                                                                                                                                 |
| `p`, `span`, `h1`–`h6`, `label`                                               | `Text` from `react-native` with the role classes in section 3; there is no Text wrapper                                                                                                                                                                                                                                                                                                 |
| `img`                                                                         | Server images: `SafeImage` (expo-image) with the memoized source from `useAuthedImageSource` / `useFoodImageSource` / `useExerciseImageSource` (`source={getPhotoSource(photo.id)}`), never an inline `{ uri, headers }` literal, which reloads the image every render; food and meal slots: `FoodThumbnail`; bundled assets: RN `Image` with `require(...)`. Corner radius via `style` |
| `button`, clickable `a`                                                       | `Button` with a variant; custom rows and tiles use `Pressable` with a `pressed` opacity 0.7 style (as in `SettingsRow`) or `TouchableOpacity` with an explicit `activeOpacity={0.7}` (a bare one drops to 0.2)                                                                                                                                                                          |
| `input`, `textarea`                                                           | `FormInput`; numeric plus/minus uses `StepperInput`; library search uses `LibrarySearchBar`                                                                                                                                                                                                                                                                                             |
| `select`, dropdown                                                            | `PickerTrigger` + `BottomSheetPicker`                                                                                                                                                                                                                                                                                                                                                   |
| Overflow or kebab menu                                                        | A `menu` item in `useScreenHeader` (native menu on iOS, `AnchoredMenu` on the custom path) or `ActionSheet`                                                                                                                                                                                                                                                                             |
| Toggle (setting on/off)                                                       | `Switch` from `components/ui/Switch`, usually in a `SettingsRow` trailing slot                                                                                                                                                                                                                                                                                                          |
| Checkbox in a list                                                            | The row itself with `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}` and a leading `checkmark-circle` / `checkmark-circle-filled` `Icon` (`foodSearch/FoodResultRow`)                                                                                                                                                                                                 |
| Radio group, tab pills, range toggle                                          | `SegmentedControl`                                                                                                                                                                                                                                                                                                                                                                      |
| `input type="date"`, time, duration                                           | `CalendarSheet`, `DateRangeSheet`, `TimeSheet`, `DurationWheel`                                                                                                                                                                                                                                                                                                                         |
| Confirm or destructive dialog                                                 | Native `Alert.alert(title, message, [{ text, style: 'cancel' }, { text, style: 'destructive', onPress }])` with translated strings (149 calls in 76 files; `SwipeableDeleteRow`). `destructive` is red on iOS only. Never a custom modal                                                                                                                                                |
| Drawer, option or form dialog                                                 | `BottomSheetModal` with `containerComponent={sheetContainer}`, `backdropComponent={useSheetBackdrop()}` and `useSheetHardwareBack(isOpen, onBack)` from `components/ui/sheetChrome.tsx` (set `isOpen` from `onAnimate` and `onChange`, clear it in `onDismiss`; without it Android Back pops the screen under the sheet)                                                                |
| Full-screen flow or overlay                                                   | A root-stack screen with `presentation: 'modal'`; an overlay on the current screen is RN `Modal` with its content in `FullScreenModalBody`                                                                                                                                                                                                                                              |
| Snackbar, toast                                                               | `Toast.show({ type: 'success' \| 'error' \| 'info' })`                                                                                                                                                                                                                                                                                                                                  |
| `:hover`                                                                      | None. Use the pressed state: opacity 0.7 set explicitly (`activeOpacity={0.7}` or a Pressable `pressed` style); `Button` presses to 0.8                                                                                                                                                                                                                                                 |
| `:focus` ring                                                                 | A 1px border that switches from Hairline Divider to Sparky Blue                                                                                                                                                                                                                                                                                                                         |
| CSS grid                                                                      | `flex-row flex-wrap justify-between` with `w-[48%]` (2 columns) or `w-[23%]` (4 columns)                                                                                                                                                                                                                                                                                                |
| `box-shadow`                                                                  | `shadow-sm` on cards, `shadow-lg` on popovers; an inline black `shadow*` + `elevation` only on floating chrome (the center Add button, toasts, Liquid Glass pills, the drag-lift preview)                                                                                                                                                                                               |
| `position: fixed` or `sticky` bottom bar                                      | `FooterActionBar` (action under a list) or `FooterSaveBar` (form save). A bar that only makes sense with the keyboard up goes in `KeyboardStickyView` with `offset={{ closed: <its height>, opened: 0 }}`. Floating pills use `LiquidGlassSurface`                                                                                                                                      |
| Top app bar                                                                   | Stack screens: a `useScreenHeader({...})` descriptor; never a hand-built bar. Tab roots and `ActiveWorkout` are the designed exceptions (section 4, Navigation chrome). `FoodSearchScreen` is the one documented off-hook screen (it mirrors its actions with `unstable_header{Left,Right}Items` behind `useNativeIOSHeadersActive()`). Other hand-built bars are drift (section 8)     |
| Bottom navigation bar                                                         | The existing tab navigator; screens never draw one                                                                                                                                                                                                                                                                                                                                      |
| Material Symbols, Font Awesome, inline SVG icons                              | `Icon` with a semantic name from `ICON_MAP` (134 names; SF Symbols on iOS, Ionicons on Android) and an explicit token `color` (457 of 460 uses pass one). It takes no `className`, defaults to `#000000` at 24px, and `weight` affects iOS only. A missing glyph needs a new entry with verified `sf` and `ion` names                                                                   |
| Hex colors, `bg-white`, `text-slate-900`, `text-gray-500`, `bg-blue-600`      | Semantic tokens: `bg-background` (canvas), `bg-surface` (cards), `bg-raised` (controls), `text-text-primary` (titles, values), `text-text-secondary` (body, subtitles; gray-500/600-type text), `text-text-muted` (captions, units; gray-400-type text), `border-border-subtle`, `bg-accent-primary`                                                                                    |
| `dark:` variants                                                              | None. Tokens switch per theme automatically                                                                                                                                                                                                                                                                                                                                             |
| `vh`, `vw`, `min-h-screen`                                                    | `flex-1`, or `useWindowDimensions()`                                                                                                                                                                                                                                                                                                                                                    |
| Web fonts (Inter, Lexend, Google Fonts links)                                 | Remove; the system font is used                                                                                                                                                                                                                                                                                                                                                         |
| Web Tailwind radius (`rounded-lg` 8px, `rounded-xl` 12px, `rounded-2xl` 16px) | Translate by the rendered pixel value: 8px → `rounded-md`, 12px → `rounded-lg`, 16px → `rounded-xl`. A class copied verbatim from sections 1–5 is already in the app scale; keep it                                                                                                                                                                                                     |
| Chart.js, SVG charts, `<progress>`                                            | Victory Native / Skia chart components, `ProgressRing`, the macro-bar pattern                                                                                                                                                                                                                                                                                                           |
| Horizontal carousel                                                           | Horizontal `ScrollView` or `PagerView`                                                                                                                                                                                                                                                                                                                                                  |
| Placeholder copy                                                              | `t('semantic.key', { defaultValue: 'English text' })` with the key added to the English catalog                                                                                                                                                                                                                                                                                         |

Shared primitives to reuse (from the Styling And UI guide in `SparkyFitnessMobile/AGENTS.md`):

- `FormInput` (`SparkyFitnessMobile/src/components/FormInput.tsx`): themed text field with focus border and placeholder color.
- `Button` (`SparkyFitnessMobile/src/components/ui/Button.tsx`): the 7 button variants above.
- `SettingsRow` and `SettingsRowGroup` (`SparkyFitnessMobile/src/components/SettingsRow.tsx`): icon, title, subtitle and trailing-slot rows, alone or grouped in one card.
- `SegmentedControl` (`SparkyFitnessMobile/src/components/SegmentedControl.tsx`): `rounded-md` segments on a `bg-raised p-1 rounded-lg` track, the selected one filled with `bg-surface`.
- `StepperInput` (`SparkyFitnessMobile/src/components/StepperInput.tsx`): minus / value / plus numeric entry.
- `BottomSheetPicker` (`SparkyFitnessMobile/src/components/BottomSheetPicker.tsx`): single-select sheet plus its `PickerTrigger` field.
- `CalendarSheet` (`SparkyFitnessMobile/src/components/CalendarSheet.tsx`): single-date picker sheet.
- `DateRangeSheet` (`SparkyFitnessMobile/src/components/DateRangeSheet.tsx`): date-range picker sheet; pass your own `title` and `confirmLabel`.
- `AnchoredMenu` (`SparkyFitnessMobile/src/components/AnchoredMenu.tsx`): popover dropdown anchored to a trigger.
- `FooterActionBar` (`SparkyFitnessMobile/src/components/FooterActionBar.tsx`): inset-safe action pinned under a list.
- `FullScreenModalBody` (`SparkyFitnessMobile/src/components/FullScreenModalBody.tsx`): inset-safe body for full-screen RN modals.
- `FormScreenChrome` (`SparkyFitnessMobile/src/components/FormScreenChrome.tsx`, 4 screens, e.g. the modal `ExerciseFormScreen`): a form shell for `presentation: 'modal'` routes, with a dismiss (X) and a primary Save declared through `useScreenHeader` on every path (top bar on Android too), wrapping a `KeyboardAwareScrollView` (`px-4 pt-4 pb-20 gap-4`) and an optional `keyboardAccessory`. It has no footer; never put a `FooterSaveBar` inside it. The pushed `GoalsScreen` and `WeeklyGoalPlanEditScreen` also use it, which is drift (section 9.1).
- `FooterSaveBar` (same file, 17 screens): a sticky primary CTA with the duplicate-press guard. Either mirror a header Save (mark the header item `placement: 'native-only'` and render `{!usesNativeHeader && <FooterSaveBar/>}`, as in `MeasurementsAddScreen`), or make it the screen's only primary action on every platform (`FoodEntryAddScreen`).

Also reuse `Icon`, `StatusView`, `ActionSheet`, `SafeImage`, `FoodThumbnail`, `LiquidGlassSurface`, `FadeView`, `ProgressRing`, `charts/StatTile` and the sheet helpers in `components/ui/sheetChrome.tsx` (all under `SparkyFitnessMobile/src/components/`).

Hard rules:

- All user-facing text goes through `t()` with a semantic key and an English `defaultValue` that matches the English catalog; accessibility labels too. Mockup placeholder copy is never shipped verbatim.
- Native iOS headers and native tabs are configured, not redrawn. Declare headers with `const header = useScreenHeader({...})` and render `{header}` at the top of the screen. Pad that container by `insets.top` only on the custom path: `style={usesNativeHeader ? undefined : { paddingTop: insets.top }}` on pushed screens (`AboutScreen`), `style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}` on modal screens (`FormScreenChrome`). When `useNativeIOSHeadersActive()` is true (iOS below 26, or 26+ with Liquid Glass on) the hook mirrors the items into the native header and returns `null`. Otherwise (Android, iOS 26+ with Liquid Glass off) it returns the custom bar; if the screen drops it, nothing draws a header, because `createStackScreenOptions` sets `headerShown: false` there. The header contract (descriptor kinds, native-versus-custom path selection, the duplicate-press guard, route registration) is owned by `AGENTS.md` (App Shell And Navigation); this bullet only shows the layout wiring, so change `AGENTS.md` first if the contract changes.
- Use the className form whenever the prop accepts className. Use `useCSSVariable('--color-…')` only for props that cannot take one (Skia paints, SVG, icon tints, switch tracks, sheet backgrounds), and keep data colors as lists of CSS variable names (for example `colorVar: '--color-cat-orange'`), never hex.
- In JS, apply alpha with the `withAlpha` helper (`utils/colors.ts`, handles hsl and hex). Do not append a hex alpha suffix to a token (`${color}20`); it assumes a 6-digit hex value.
- When JS needs the theme, read `const { theme } = useUniwind()` and test `theme === 'dark' || theme === 'amoled'` (as `useSheetBackdrop` and `App.tsx` do). Never use React Native's `useColorScheme()`: it ignores the in-app theme and AMOLED.
- Never import `SafeAreaView` from `react-native`. Use `useSafeAreaInsets()` or `FullScreenModalBody`.
- A new color goes into `SparkyFitnessMobile/global.css` in Light, Dark and AMOLED first, then into components as a token. No hex, no Tailwind palette classes.
- Respect the one-primary-action rule in headers.

## 7. Do's and Don'ts

Do:

- Start every screen with `flex-1 bg-background` and a 16pt gutter (`ActiveWorkoutScreen` alone uses 12pt).
- Build cards as `bg-surface rounded-xl p-4 shadow-sm`, and put controls in `bg-raised`.
- Use `border-border-subtle` for dividers and resting borders, and Sparky Blue for focus and selection.
- Pair status washes with their ink (`bg-bg-warning` + `text-text-warning`); use `icon-*` tokens for standalone status text and glyphs.
- Draw data in its metric token (calories, macros, hydration, exercise): the class form on Views (`bg-exercise`), and `useCSSVariable` only for Skia, SVG and icon color props.
- Give every `Icon` an explicit token color.
- Keep labels to one line with `numberOfLines={1}` in rows, tiles and buttons, and keep fixed-size controls stable when labels change.
- Use tabular figures for any number that ticks.
- Give icon-only buttons an `accessibilityLabel` and an 8–10pt `hitSlop`.
- Wire every new bottom sheet to `useSheetHardwareBack(isOpen, onBack)`: set `isOpen` to true from both `onAnimate` and `onChange` (index >= 0), and clear it only in `onDismiss`, not when the close starts, as `ActionSheet` does. Why Android Back needs this is explained in `AGENTS.md` (Styling And UI).
- Animate with Reanimated: `FadeView` / `FadeIn.duration(200)` / `FadeOut.duration(150)` for fades, `LinearTransition.duration(300)` for list reflow, and `useSharedValue` / `useDerivedValue` (never Skia's deprecated animation API) for Skia paths. Check `useReducedMotion` for loops and celebrations.
- Fire haptics through `services/haptics.ts` so the user's preference applies.

Don't:

- Don't use hex literals or Tailwind palette classes like `text-purple-600` or `bg-emerald-500/10`. The only exceptions are the fixed colors listed under Color rules in section 2 (white on accent and red fills, the switch thumb, photo and camera overlays, scrims, the `#000` shadow color, the white backdrop behind transparent exercise illustrations, the completion check, share-card presets, Live Activity layouts, the Android night map style).
- Don't add `dark:` variants; they do not cover AMOLED, and tokens already switch.
- Don't invent token names (`bg-surface-elevated`, `text-md`); unknown classes render nothing and pass validation silently.
- Don't hand-roll a bottom bar with flat padding; use `FooterActionBar` or `FooterSaveBar`.
- Don't put more than one accent action in a header, or redraw iOS native tabs and headers.
- Don't use a raw `TextInput`, a raw RN `Switch` or a bare `ActivityIndicator` where `FormInput`, `ui/Switch` or `StatusView` fit.
- Don't use `Button variant="primary"` and then override its fill; pick the variant whose look you want.
- Don't leave a `TouchableOpacity` without `activeOpacity={0.7}`.
- Don't animate layout from keyboard progress.
- Don't format numbers or dates without the app locale.

## 8. Known Gaps (current state, not rules)

This is the backlog for the redesign phases. Counts are exact at the time of writing.

- Hardcoded hex: 254 quoted hex literals in 101 `.tsx` files. Top files: `LibraryScreen.tsx` 14, `LogScreen.tsx` 10, `CycleIcon.tsx` 9, `FastingTimerRing.tsx` 9, `FoodScanScreen.tsx` 8, `AnnouncementModal.tsx` 7. Most common values: `#FFFFFF` 55 (plus one inside a gradient string in `WhatsNewScreen.tsx`), `#999` 24, `#FFF` 20, `#3B82F6` 17. More hex lives in `.ts` files: `darkMapStyle.ts` (18), `shareColor.ts` (8 presets), `moodColors.ts` (6), `nutrientDirectionGuides.ts` (3) and `useHeaderActionColors.ts` (2 fallbacks). 35 hex alpha suffixes on tokens remain in 8 files: 26 template literals (`${color}20`) in 7 files (17 in `WhatsNewScreen.tsx`, one inside a `linear-gradient` string) and 9 string concatenations (`pColor + '26'`) in `wellness/CycleCalendarGrid.tsx`.
- Tailwind palette classes: 181 uses in 22 files, 140 of them in mindfulness (83) and symptoms (57). There are 27 `dark:` variants: 25 in mindfulness and symptoms, 2 in `FastingDetailScreen.tsx` (its timer is `text-emerald-600 dark:text-emerald-400`). There are no `amoled:` variants, so those shades probably miss AMOLED.
- Undefined class names that render nothing: `text-md` 21 uses in 11 files (15 card titles, 14 on the Dashboard and 1 in the Diary summary; 5 accent "Details" links, and the diary food-row name in `SwipeableFoodRow`, which therefore renders at RN's default 14px regular), `bg-surface-elevated` 11, `bg-surface-raised` 3, `bg-surface-secondary` 1, `bg-success-soft` 2, `text-success` 2. `MealPlanFormScreen.tsx` reads the undefined `--color-cat-purple` and uses category colors instead of macro tokens.
- No typography tokens: `global.css` has no `--text-*` or `--font-*`. There are 73 arbitrary `text-[Npx]` sizes (28 `text-[11px]`, 26 `text-[10px]`, 12 `text-[13px]`, 7 others) plus 64 inline numeric `fontSize` values in 34 `.tsx` files. There are at least five card-title variants and 51 distinct className strings among 101 uppercase overlines. At least eight stat-tile implementations exist (`charts/StatTile`, `WorkoutCompleteStatTiles`, `ReportHighlights`, `recording/SplitRow` `Stat`, `CalorieRingCard` `SideStat`, `TrainingConsistencyCard` `Stat`, and local `StatTile`s in `ExerciseStatisticsScreen` and `ExerciseDetailScreen`). Tabular figures exist only as an inline style (39 uses in 15 files) and are missing on the two `text-5xl` live run clocks, the interval countdown (`recording/IntervalCard.tsx`), the live distance and pace tiles on `RecordActivityScreen`, and the breathwork phase countdown.
- Few spacing tokens: four, all equal to Tailwind defaults. Bottom-bar inset minimums take five values: 4 (`CustomTabBar`, the `ActiveWorkoutBar` offset), 8 (`ActiveWorkoutRestBar`), 12 (`FooterSaveBar`), 24 (`OnboardingScreen`, and `FoodScanScreen` as `Math.max(insets.bottom + 8, 24)`) and 16 (`FooterActionBar`, `FullScreenModalBody` and 7 other call sites). Sheet gutters vary from `px-2` to `px-6`.
- Radius: `rounded-xl` (379) and `rounded-2xl` (63) both render 16px. 71 numeric inline `borderRadius` values in 44 files bypass the radius classes (most commonly 8, 24 times); toasts and `DurationWheel` use 8, `MealTypeTimeWheel` 10.
- Shadows: no shadow tokens. `shadow-sm` appears 214 times. The Add button, toasts, Liquid Glass pills and the reorder drag preview set a black `shadowColor` and opacity inline, and `BreathworkModal` uses a hardcoded blue `#60A5FA` glow.
- On-accent color: `--color-accent-text` has 2 JS reads, while content on accent uses `text-white` (89 uses in 55 files) and white hex literals (75). The `Button` loading spinner is always white, including on transparent variants. `--color-accent-muted` is read but never drawn.
- Status and destructive colors are split. `Button` uses Danger Glyph, `ActionSheet` uses Danger Ink, and `#dc2626` appears 7 times in 6 screens, plus `#EF4444` on error and trash icons. Inline error text uses `text-icon-danger` in 5 screens (11 texts) and `text-text-danger-subtle` in about 5 places. Ink tokens are used standalone on cards, where they read near-white in Dark: `TrainingLoadCard`, `TrainingLoadDashboardCard`, `ReportHighlights`, `RunProgramWorkoutScreen`, `RunProgramCalendarScreen`, `Glp1InventoryCard`, and `bg-text-success` dots in `ProgramMonthGrid` and `RunProgramCalendarScreen`.
- Borders and tracks: `bg-chrome-border` is used as an in-card row divider (`h-px bg-chrome-border my-2`) in `Glp1InventoryCard`, `Glp1RecentInjectionsCard`, `Glp1TitrationCard` and `MedicationDetailScreen`; dividers should be `bg-border-subtle`. Bar tracks outside Progress Track use `bg-raised` (`RunProgramCard`, `IntervalCard`, `ActiveWorkoutIntervalHud`), `bg-background` (`NutrientTopSourcesCard`), `bg-border-subtle` (fasting and eating-window zone bars), `bg-form-disabled` (`SplitRow`) and `bg-border` (`ShoesScreen`).
- Disclosure chevrons are `#999` in 23 places across 9 files (13 in `LibraryScreen.tsx`), and `ReportsScreen.tsx` also uses `#999` for its leading row icons. Chevron sizes range from 10 to 24.
- Icons without a color render black, near-invisible in Dark: `RangeStepperRow` (2) and `MarkdownNotesField` (1).
- Data viz: `--color-progress-overfill` is read but never drawn. Fasting stages have three palettes (tokens, `FastingZoneBar.tsx` hex, `FastingTimerRing.tsx` gradient). The calorie-goal ring is indigo on the Dashboard but accent in `NutritionMacroCard.tsx`. The hydration trend uses accent, and `ExerciseProgressCard.tsx` uses calories instead of exercise. Grid lines are unthemed, and the 200pt chart placeholders do not match the 175pt and 150pt plots.
- Primitive bypass: 27 raw JSX `<TextInput>` elements in 22 files, 25 of them in 20 files outside the `FormInput` and `LibrarySearchBar` primitives (most in `RunProgramEditScreen.tsx` with 3, then 2 each in `SymptomLogScreen.tsx`, `OnboardingScreen.tsx` and `CycleHistoryList.tsx`). There are also 2 raw RN `Switch`, 78 bare `<ActivityIndicator>` in 64 files (76 in 62 outside `StatusView` and `Button`; some are legitimate inline spinners), and 8 files on React Native's `KeyboardAvoidingView` (`ReauthModal`, `FoodForm`, `ServerConfigModal`, `FoodEntryMultiAddScreen`, `PasskeySettingsScreen`, `RouteDrawScreen`, `FoodScanScreen`, and `ChatScreen` on iOS). Search fields exist in 4 copies (`LibrarySearchBar`, food, exercise and preset search). `AddSheet.tsx` overrides `Button variant="primary"` with a raised fill.
- Card drift: shadowless recording cards (`mt-4` 23, `mb-4` 12) and bordered `rounded-2xl` mood and symptom cards (7); see section 4.
- Pressed feedback: 140 of 298 `TouchableOpacity` have no `activeOpacity` (RN's 0.2), 21 use 0.6, and 193 of 247 Pressables give no pressed feedback.
- Sheets and Android Back: `BottomSheetModal` does not handle hardware Back. Only `ActionSheet` and `AddSheet` call `useSheetHardwareBack` (2 of 19 sheet files); `BottomSheetPicker`, `CalendarSheet`, `DateRangeSheet`, `TimeSheet` and the rest let Back pop the screen underneath. 3 sheets (`AddSheet`, `WorkoutDurationSheet`, `ServingAdjustSheet`) skip `sheetContainer`.
- Headers: `RecordActivityScreen` calls `useScreenHeader` without rendering its return value (114 other calls assign it), so it has no header or back button on the custom path. `FastingDetailScreen` and `MindfulnessDetailScreen` (`headerShown: false` on every platform, iOS included), `FoodPhotoIntroScreen` and `FoodPhotoLogEntryScreen` hand-build `px-4` back bars instead of using the hook. `SymptomLogScreen` and `SymptomDefinitionEditorScreen` show Save twice (a header primary not marked `native-only` plus an unguarded `FooterSaveBar`). 9 modal routes pad the top inset on `usesNativeHeader` rather than Android only, adding a status-bar gap inside iOS 26+ modals with Liquid Glass off.
- Platform gaps: pull-to-refresh sets only `tintColor` (iOS) in 13 of the 14 files, and `CustomNutrientsScreen` sets no color at all, so its spinner is unthemed on iOS too; on Android every spinner is unthemed, because no call site passes `colors` or `progressBackgroundColor`. `ui/Switch` sets no `ios_backgroundColor`, so the iOS off track is not Switch Off Track.
- Button internals: the per-variant pressed classes are unused (all variants press to 0.8), the `tone` prop has no callers, and `Button` sets no `accessibilityRole`.
- The splash backgrounds (`#e2e2e2` light, `#232323` dark) do not match the canvas (#F2F4F7 / #0C0E12), so the color jumps when the splash hides.
- Accessibility and motion: one `accessibilityRole="header"` in the app, reduce-motion handled in 5 files, and the two mindfulness modals call expo-haptics directly, bypassing the haptics preference. React Native's `LayoutAnimation` is still used in 7 files.
- RTL: 293 physical-direction spacing classes and 0 logical ones; directional chevrons are not mirrored.

## 9. Building a New Screen

Sections 1–7 define the look; this section is the wiring. Start from the closest file named below instead of a blank file, and finish with 9.5. Paths are relative to `SparkyFitnessMobile/`. `__tests__/navigation/nativeHeaderContract.test.ts` enforces most of the route and header rules: when it fails, fix the route, type or registration, never the test.

### 9.1 Pick the screen type

| Type                      | Use when                                                                                | Copy this file                                                                                                                                                         | Header                                                                                                                                                      | Container                                                                                                                                                                                  | Primary action                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tab root                  | Only for an agreed new tab; otherwise extend a tab (9.4)                                | `src/screens/SettingsScreen.tsx`                                                                                                                                       | Custom path: a `text-2xl font-bold` title as the first scroll child. Native tabs: large title from `createIOSNativeHeaderOptions` in `TabsLayout.tsx`       | `ScrollView className="flex-1 bg-background"`, top inset only when `!useNativeIOSTabsActive()`, bottom `80 + useActiveWorkoutBarPadding()`                                                 | None in the header; Add is the center tab                                                                                                 |
| Pushed detail             | One record or a hub of rows, opened from a row or card                                  | `src/screens/DiarySettingsScreen.tsx` (minimal), `src/screens/SleepDetailScreen.tsx` (loading, error, not found), `src/screens/MealsLibraryScreen.tsx` (offline first) | `left: { kind: 'back' }` plus `headerBackTitle` in `App.tsx`; view/edit swap as in `WorkoutDetailScreen.tsx`                                                | `View className="flex-1 bg-background"`, `paddingTop: insets.top` only when `!usesNativeHeader`; `ScrollView` with `padding: 16` and bottom `insets.bottom + 80 + activeWorkoutBarPadding` | Usually none; at most one right `kind: 'primary'`                                                                                         |
| List                      | A server collection, library or search result                                           | `src/screens/MealsLibraryScreen.tsx`; `src/screens/MealPlansScreen.tsx` (footer action)                                                                                | `back` plus an optional `kind: 'menu'` filter (`ownershipFilterHeaderMenu` in `src/utils/shareStatus.ts`) or a right `kind: 'primary'` Add                  | Pushed root; `FlatList` with `contentContainerStyle={{ paddingBottom: insets.bottom + activeWorkoutBarPadding + 16, flexGrow: 1 }}`                                                        | One create action: a right `kind: 'primary'` Add (`ShoesScreen.tsx`) or one `Button` in `FooterActionBar` (route in `HIDDEN_ROUTES`)      |
| Form (modal)              | Create, edit or log one record; AddSheet targets                                        | The 9.3 template or `src/screens/MindfulnessLogScreen.tsx` (footer Save, wiring only); `src/screens/ExerciseFormScreen.tsx` (`FormScreenChrome`)                       | `left: { kind: 'dismiss', onPress }`, one right `kind: 'primary'` Save; route options `presentation: 'modal'`                                               | Root pads `insets.top` on Android only; `KeyboardAwareScrollView` with `contentContainerClassName="px-4 pt-4 pb-20 gap-4"`                                                                 | Header Save `placement: 'native-only'` plus `{!usesNativeHeader && <FooterSaveBar />}`, or `FormScreenChrome` (header Save on every path) |
| Bottom sheet / picker     | Choose an option, an overflow menu or a short form over the current screen; not a route | Reuse `BottomSheetPicker`, `ActionSheet`, `CalendarSheet`; a new sheet copies `src/components/ActionSheet.tsx` (`src/components/RestPeriodSheet.tsx` for number entry) | Picker and menu sheets: `px-4 py-4 border-b border-border-subtle` row with a centered `text-lg font-semibold` title. Form sheets: borderless centered title | `BottomSheetModal` wired as in "New bottom sheet" below; content `pb-safe-or-5` (`pb-safe-or-8` for forms)                                                                                 | Tapping an option; a form sheet has one primary `Button`                                                                                  |
| Full-screen modal overlay | Immersive timer, player or viewer on top of the current screen, with no route           | `src/components/mindfulness/MeditationTimerModal.tsx` (shell only)                                                                                                     | No navigator header: a title row inside the body with a labelled close button                                                                               | RN `Modal` (`animationType="slide"`, `transparent`, `onRequestClose`) wrapping `FullScreenModalBody` (`className` sets the layout)                                                         | One `<Button variant="primary">` in the body                                                                                              |

A new tab also needs `TabParamList` in `src/types/navigation.ts`; in `src/components/TabsLayout.tsx`, a `NativeTab.Screen` with a `tabBarIcon` SF Symbol, a `FallbackTab.Screen`, the tab name in `NON_ADD_TABS`, and a `function <Tab>StackScreen()` built with `createIOSNativeHeaderOptions` whose `<Tab>Stack.Navigator` holds a `<Tab>Stack.Screen` with `title: t('navigation.<tab>', { defaultValue: '<Tab>' })`, the `defaultValue` exactly the tab name; and an entry in `TAB_ICONS` in `src/components/CustomTabBar.tsx`. `NON_ADD_TABS` is the list `rememberActiveTab` (`src/hooks/useAddSheetActions.ts`) records, so it decides where dismissing the AddSheet returns and which tab `initialRouteName={getLastActiveTab()}` remounts on when the Liquid Glass toggle swaps paths; the contract test's tab-local stack check also reads its tab list from it, so a tab left out compiles, is never returned to and is not checked. `TAB_ICONS` is a `Record<string, IconName>`, so a missing entry compiles and the custom tab bar draws the tab with no icon. Detail and form screens never go in those tab-local stacks.

New bottom sheet (copy `src/components/ActionSheet.tsx`):

- Props: `ref`, `enableDynamicSizing`, `containerComponent={sheetContainer}`, `backdropComponent={renderBackdrop}` with `const renderBackdrop = useSheetBackdrop();`, `backgroundStyle={{ backgroundColor: surfaceBg }}` and `handleIndicatorStyle={{ backgroundColor: textMuted }}` with `const [surfaceBg, textMuted] = useCSSVariable(['--color-surface', '--color-text-muted']) as [string, string];`. Without the last two the library draws a white sheet and a dark handle in every theme. `sheetContainer`, `useSheetBackdrop` and `useSheetHardwareBack` come from `src/components/ui/sheetChrome.tsx`.
- Android Back: `useSheetHardwareBack(isOpen, dismiss)` with a stable `dismiss`. Set `isOpen` from `onAnimate` and `onChange` when the index is >= 0 and clear it only in `onDismiss` (`markOpen` and `handleDismiss` in `ActionSheet.tsx`). The rule itself lives in `AGENTS.md` (Styling And UI); keep this bullet to the wiring.
- Number entry: add `keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustPan"` and pass `InputComponent={BottomSheetTextInput}` (from `@gorhom/bottom-sheet`) to `StepperInput`, as `RestPeriodSheet.tsx` does. `FormInput` renders a plain `TextInput` with no input override, and the sheet's keyboard handling only tracks `BottomSheetTextInput`, so a free-text form is a screen, not a sheet.

Drift in the files to copy (section 8; copy the wiring, not these):

- `MindfulnessLogScreen.tsx`: take the header, the Android-only inset, the `FooterSaveBar` and its `HIDDEN_ROUTES` entry. Its practice tiles and chips use palette classes (`bg-blue-500/10`, `border-purple-500/25`), `dark:` variants (`text-blue-600 dark:text-blue-400`), `bg-surface-elevated` (renders nothing), `text-[10px]` and `TouchableOpacity` without `activeOpacity`, and its scroll container is `px-4 pt-4` plus a style `paddingBottom` rather than the row's `px-4 pt-4 pb-20 gap-4`.
- `MeditationTimerModal.tsx`: take only the shell, `<Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>` around `<FullScreenModalBody className="justify-between px-6">`, and the title row whose close button has `accessibilityRole="button"` and `accessibilityLabel={t('common.close', { defaultValue: 'Close' })}`. Its purple, amber and emerald palette classes, `dark:` variants, `text-white` on palette fills and hand-styled `TouchableOpacity` actions are drift: build the body from tokens, with one `<Button variant="primary">` for the main action and `activeOpacity={0.7}` on any `TouchableOpacity`.
- `MealPlansScreen.tsx`: its header `+` (`kind: 'icon'`) duplicates the footer Create; a new list keeps one create action. `WorkoutPlansScreen.tsx` has the same layout but is missing from `HIDDEN_ROUTES` and reserves no `activeWorkoutBarPadding`, so the workout bar covers its footer.
- `MealPlansScreen.tsx`, `WorkoutPlansScreen.tsx` and `CustomNutrientFormScreen.tsx` tint trash glyphs `#dc2626`; use `useCSSVariable('--color-icon-danger')`. `ShoesScreen.tsx` is a header example only: its retire badges use `text-red-500`, `bg-red-500` and `bg-red-500/10`.
- `GoalsScreen.tsx` and `WeeklyGoalPlanEditScreen.tsx` are pushed routes on `FormScreenChrome`, a modal shell: they show an X instead of back and get no top inset on iOS 26+ with Liquid Glass off. Do not copy them for a pushed form (9.3 Variants).

### 9.2 Step-by-step checklist

1. **Route and params.** Add `NewRoute: <params>;` to `RootStackParamList` in `src/types/navigation.ts`: `undefined` for none, `{ date?: string } | undefined` when every param is optional, a `mode` union for create and edit (`ExerciseForm`). Default-export the screen from `src/screens/NewRouteScreen.tsx`, typed `RootStackScreenProps<'NewRoute'>`.
2. **Registration and error boundary.** In `src/navigation/safeScreens.tsx` add `import NewRouteScreen from '../screens/NewRouteScreen';` next to the other screen imports and `export const SafeNewRoute = withErrorBoundary(NewRouteScreen, 'NewRoute', { canGoBack: true });` on one line. In `App.tsx`, import `SafeNewRoute` and add a `<Stack.Screen>` at the 10-space indent with `name`, `component`, then `options={createStackScreenOptions(t('screens.newRoute', { defaultValue: '…' }), { … })}`. Both files are excluded from Prettier because the contract test parses their text: copy a neighbouring block exactly. Add a `linking` entry only if a widget or URL must open the screen.
   - Keep the screen import in exactly that form: the test matches `import X from '../screens/X';`, and an `@/` path or a named import fails with "its screen import was not found".
3. **Header.** `const header = useScreenHeader({...})` from `src/hooks/useScreenHeader.tsx`, called in the routed screen file itself (or `<FormScreenChrome>` rendered there): the contract test only reads that file, so a header declared in a child component fails it. Pushed: `left: { kind: 'back' }`, with `headerBackTitle` or `headerBackButtonDisplayMode: 'minimal'` in the route options. Modal: `left: { kind: 'dismiss', onPress }`, with `presentation: 'modal', ...(Platform.OS === 'android' ? androidModalAnimation : {})`.
   - `headerBackTitle` names the screen the user returns to: `t('navigation.settings', { defaultValue: 'Settings' })` (or `navigation.library`, `navigation.diary`, `navigation.dashboard`) for a tab root, otherwise the parent route's own title key (`screens.foodSettings`; `goals.title` for `WeeklyGoalPlanEdit`; `equipmentHub.title` for `Shoes`). The `navigation.*` group is for tab and library labels; do not invent a `navigation.<parent>` key.
   - The native iOS title is the `createStackScreenOptions` title; the hook's `title` only draws the custom bar, so a title that changes at runtime also sets `nativeTitle`. A `back` item's `onPress` runs on the custom path only.
   - At most one `kind: 'primary'` or `role: 'primary'` item (a second throws in `__DEV__`). Never set `headerShown: false` for a hook screen. Never add `unstable_header*Items`, a `renderHeader` or `renderHeaderBar` function (`ListHeaderComponent` included), a `{/* Header */}` comment or a `// --- Header ---` comment to it: the test reads each as a hand-rolled header.
4. **Container and bottom clearance.** Root `<View className="flex-1 bg-background">` with `{header}` as its first child. Top inset: pushed `style={usesNativeHeader ? undefined : { paddingTop: insets.top }}` (`useNativeIOSHeadersActive()`, `useSafeAreaInsets()`), modal `style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}`; pushed scroll views set `contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}`.
   - Bottom: add `useActiveWorkoutBarPadding('stack')` (`src/components/ActiveWorkoutBar.tsx`) to `insets.bottom + 80` for content or `insets.bottom + 16` for lists. A route with a sticky `FooterSaveBar` or `FooterActionBar` joins `HIDDEN_ROUTES` in the same file so the docked workout bar does not cover it. Do not infer membership from existing screens: `CustomNutrientForm` and `WorkoutPlans` are missing from it today.
5. **Content from primitives.** Build from sections 4–6: `bg-surface rounded-xl p-4 shadow-sm` cards, `SettingsRow` / `SettingsRowGroup`, `FormInput` under a `text-sm font-medium text-text-secondary mb-1` label with errors in `text-sm text-icon-danger mt-1`, `StepperInput`, `SegmentedControl`, `BottomSheetPicker`, `Switch` from `components/ui/Switch`, `Button`, and `Icon` with a token `color`. Destructive confirms use `Alert.alert`. Lists use `keyExtractor={(item) => item.id}` and rows that draw their own divider from a `showDivider={index < data.length - 1}` prop, never `ItemSeparatorComponent`.
   - `BottomSheetPicker`, `CalendarSheet`, `DateRangeSheet` and `TimeSheet` do not take Android Back yet (section 8): Back pops the screen under the open sheet and drops a form's edits. If the screen uses one, fix the primitive, not the screen (no screen `BackHandler`): track `isOpen` and call `useSheetHardwareBack(isOpen, dismiss)` as `ActionSheet.tsx` does, then press Back on Android with the sheet open.
6. **States.** Branch in this order: offline, loading, error, not found or empty, content (`MealsLibraryScreen.tsx` `renderContent`).
   - Offline: `const { isConnected, isLoading: isConnectionLoading } = useServerConnection();` (`src/hooks/useServerConnection.ts`; the hook returns `isLoading`, renamed here). When `!isConnectionLoading && !isConnected`, show `StatusView` with `icon="cloud-offline" iconTone="muted" iconSize={64}` and a `common.goToSettings` action that calls `navigation.navigate('Tabs', { screen: 'Settings' })`. Loading: `<StatusView loading />` while `isLoading || isConnectionLoading`.
   - Error (`isError`): `icon="alert-circle" iconTone="danger"` with `action={{ label: t('common.retry', …), onPress: () => void refetch(), variant: 'primary' }}`; the action defaults to secondary. Not found (a detail whose record is gone): a muted icon and title with no Retry, kept apart from `isError` (`sleep.notFound` in `SleepDetailScreen.tsx`). Empty: a muted icon, title and subtitle, plus a primary create action when it helps.
   - Inside a list or card use `<StatusView inline … />` (in `ListEmptyComponent`, with `flexGrow: 1` on the list); dashboard cards keep their shell and show a small accent `ActivityIndicator` in the title row.
   - Pull to refresh: `<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} progressBackgroundColor={surface} />` with `const [accent, surface] = useCSSVariable(['--color-accent-primary', '--color-surface']) as [string, string];` and a `try`/`finally` `onRefresh`. `tintColor` themes iOS; `colors` and `progressBackgroundColor` theme the Android spinner, which no existing screen does yet.
   - Failed actions: `import Toast from 'react-native-toast-message';`, then `Toast.show({ type: 'error', text1: t('thing.saveFailed', { defaultValue: 'Could not save' }), text2: getApiErrorMessage(err) ?? t('common.tryAgain', { defaultValue: 'Please try again.' }) })`. `getApiErrorMessage` (`src/services/api/errors.ts`) returns `string | null` and `text2` takes `string | undefined`, so keep the `??`.
7. **Data hooks and cache invalidation.** API calls live in `src/services/api/<feature>Api.ts` as `apiFetch<T>({ endpoint, method, body, serviceName, operation })` with types from `@workspace/shared`; keys are `as const` tuples in `src/hooks/queryKeys.ts`; the hook in `src/hooks/use<Feature>.ts` pairs `useQuery` with `useRefetchOnFocus(query.refetch, enabled)`. It takes an `enabled` option that the screen sets to `isConnected` (`useMeals({ enabled: isConnected })`) and returns `isError` with the data, so the screen can tell a failed load from a missing record.
   - `staleTime` is `Infinity`, so every `useMutation` invalidates each affected key family in `onSuccess`: `dailySummaryRootQueryKey` when day totals change, and `invalidateFoodCache`, `invalidateExerciseCache` or `invalidateMedicationEntryCaches` where they apply. Buttons that push a form go through `useNavigationActionGuard(navigation).runNavigationAction(() => …)`.
8. **Copy.** Every visible string, accessibility label, alert and toast is `t('feature.key', { defaultValue: 'English' })` from `useTranslation()`, with the identical text added to `src/localization/locales/en/translation.json` (the only locale edited by hand). Numbers use `formatLocalizedNumber`, days `formatDayLabel` (`src/utils/dayLabel.ts`) or `formatDateLabel(day, t, locale)` (`src/utils/dateUtils.ts`) with `locale = useAppLocale()`; `import { formatLocalizedNumber, useAppLocale } from '../localization';`.
   - Plurals: `t('sleepGoals.nights', { count, formattedCount: formatLocalizedNumber(count), defaultValue: '{{formattedCount}} nights', defaultValue_one: '{{formattedCount}} night' })` with EN `nights_one` and `nights_other`. The plain `defaultValue` must equal the `_other` text and `defaultValue_one` the `_one` text, or the i18n audit fails with `default-value-mismatch`. Never branch on `count === 1` (blocking `manual-pluralization`).
   - Reuse `common.save`, `common.saving` (`Saving…`), `common.cancel`, `common.close`, `common.retry` (`Retry`, the button label), `common.delete`, `common.edit`, `common.goToSettings` and `common.tryAgain` (`Please try again.`, a toast `text2` or subtitle, never a button).
9. **Theming.** Token classes from section 2 only; `useCSSVariable('--color-…')` only for props that take no `className` (`Icon` `color`, Skia, `RefreshControl`), `withAlpha` for alpha, `useUniwind().theme` for theme branches; `import { useCSSVariable, useUniwind } from 'uniwind';`. No hex, palette classes or `dark:`. Check Light, Dark and AMOLED (Settings › App Settings › Theme) on both header paths: Android, and iOS 26+ with Liquid Glass navigation on and off.
10. **Accessibility.** Custom tappables get `accessibilityRole="button"`, a translated `accessibilityLabel` and `activeOpacity={0.7}`; icon-only buttons add `hitSlop={8}` or more; selection controls set `accessibilityState` (`selected`, `checked`, `disabled`). Text scales without a cap, so use `numberOfLines` and flexible rows rather than fixed heights. Gate loops on `useReducedMotion` and fire haptics through `src/services/haptics.ts`.
11. **Tests and validation.** Add `__tests__/screens/<Name>Screen.test.tsx` with `await initializeI18n('en')` (`src/localization/i18n`) in `beforeAll`. Pick the setup by header shape:
    - Only a `back` item: copy `__tests__/screens/EquipmentScreen.test.tsx`, which mocks `useScreenHeader: () => null`, `nativeTabBarPreference`, `react-native-safe-area-context` and `ActiveWorkoutBar`. With the hook mocked there are no header items to press.
    - A header Save, Add, menu or other action: keep `useScreenHeader` real (it reads `useNavigation()`, not the prop). Define `const mockNavigation = { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), dispatch: jest.fn() }`, add `jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => mockNavigation }))` and pass the same object as the `navigation` prop. Declare `let mockNativeHeadersActive = true;` with `jest.mock('../../src/services/nativeTabBarPreference', () => ({ useNativeIOSHeadersActive: () => mockNativeHeadersActive, useNativeIOSTabsActive: () => false }))` and set it to `false` in a test to cover the custom bar. Mock `ActiveWorkoutBar` as above and render inside `<SafeAreaProvider initialMetrics={{ insets, frame }}>`. Then `pressAction(screen, mockNavigation, 'Save')` and `expectActionPresent(...)` from `__tests__/screens/helpers/nativeHeaderTestUtils.ts`, with `skipDuplicatePressWindow()` between two presses of the same primary action. Jest runs as iOS (`jest-expo`), so native-path items arrive through `mockNavigation.setOptions`; on the custom path `pressAction` finds the inline text. Canonical: `__tests__/screens/FoodsLibraryScreen.test.tsx`, `__tests__/screens/MeasurementsAddScreen.test.tsx`.
    - Either setup: also mock every data hook the screen calls (`EquipmentScreen` has none). Unmocked, `useQuery` throws "No QueryClient set" and `useRefetchOnFocus`'s `useFocusEffect` needs a navigator. For the 9.3 templates, `jest.mock('../../src/hooks/useServerConnection', () => ({ useServerConnection: jest.fn() }))` and `jest.mock('../../src/hooks/useThing', () => ({ useThing: jest.fn(), useSaveThing: jest.fn() }))`, then per test `mockReturnValue` with `{ isConnected: true, isLoading: false, isError: false, refetch: jest.fn() }`, `{ thing, isLoading: false, isError: false, refetch }` and `{ mutate, isPending: false }`. Mock by the hook's own file: that also covers a screen importing from the `../hooks` barrel (`__tests__/screens/MealPlansScreen.test.tsx`), while a barrel mock (`jest.mock('../../src/hooks', …)`) misses per-file imports. Back-only screen with a data hook: `__tests__/screens/SleepDetailScreen.test.tsx` (`useSleepDetail`).
    - Hook tests use `createTestQueryClient` and `createQueryWrapper` from `__tests__/hooks/queryTestUtils.ts` and mock the API module (`jest.mock('../../src/services/api/<feature>Api', …)`). `useRefetchOnFocus` calls `useFocusEffect`, which throws outside a navigator, so also add `jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }))` (`__tests__/hooks/useSleepDetail.test.ts`) or `jest.mock('../../src/hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }))` (`__tests__/hooks/useActiveWorkoutPlan.test.ts`).
    - Export only what a screen, hook or test imports: Knip (`knip.jsonc`, `exports: error`) fails `validate` on an unused export, such as an API function or query key added ahead of its caller. Then run the commands in 9.5.

### 9.3 Templates

Names marked NEW (`ThingDetail`, `ThingLog`, `useThing`, `useSaveThing`, the `thing.*` keys) are yours to create; every other import is real. Both files type-check against the package `tsconfig.json` once those exist.

Pushed detail screen:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import StatusView from '../components/StatusView';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConnection } from '../hooks/useServerConnection';
import { useThing } from '../hooks/useThing'; // NEW: useQuery + useRefetchOnFocus
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ThingDetail'>; // NEW route

const ThingDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { thing, isLoading, isError, refetch } = useThing(
    route.params.thingId,
    {
      enabled: isConnected,
    }
  );
  const header = useScreenHeader({
    title: t('thing.title', { defaultValue: 'Thing' }),
    left: { kind: 'back' }, // the Stack.Screen options need headerBackTitle
  });

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          iconSize={64}
          title={t('thing.offline', { defaultValue: 'No server connection' })}
          action={{
            label: t('common.goToSettings', { defaultValue: 'Go to Settings' }),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }
    if (isLoading || isConnectionLoading) return <StatusView loading />;
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('thing.loadFailed', { defaultValue: 'Could not load' })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }
    if (!thing) {
      return (
        <StatusView
          icon="help-circle"
          iconTone="muted"
          iconSize={64}
          title={t('thing.notFound', { defaultValue: 'Not found' })}
        />
      );
    }
    return (
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {/* cards: bg-surface rounded-xl p-4 mb-3 shadow-sm (section 4) */}
      </ScrollView>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {renderContent()}
    </View>
  );
};

export default ThingDetailScreen;
```

Modal form with a footer Save (register with `presentation: 'modal'`, and add the route to `HIDDEN_ROUTES`):

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSaveThing } from '../hooks/useThing'; // NEW: useMutation that invalidates
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ThingLog'>; // NEW route, presentation: 'modal'

const ThingLogScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { mutate, isPending } = useSaveThing();
  const [name, setName] = useState('');
  const save = () => mutate({ name }, { onSuccess: () => navigation.goBack() });
  const header = useScreenHeader({
    title: t('thing.logTitle', { defaultValue: 'Log thing' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isPending,
    },
    // The one primary; native-only because FooterSaveBar is the custom-path Save
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isPending,
      onPress: save,
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      // Modal: Android only, an iOS modal already starts below the status bar
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <View>
          <Text className="text-sm font-medium text-text-secondary mb-1">
            {t('thing.name', { defaultValue: 'Name' })}
          </Text>
          <FormInput value={name} onChangeText={setName} />
        </View>
      </KeyboardAwareScrollView>
      {!usesNativeHeader && <FooterSaveBar onPress={save} busy={isPending} />}
    </View>
  );
};

export default ThingLogScreen;
```

Variants:

- Save in the top bar on every path: wrap the fields in `FormScreenChrome` (`src/components/FormScreenChrome.tsx`; props `title`, `saveLabel`, `savingLabel`, `isSaving`, `onSave`, `onCancel`, optional `headerAction` and `keyboardAccessory`). It supplies the header, the Android-only inset and the scroll view; never put a `FooterSaveBar` inside it. Use it only for `presentation: 'modal'` routes, because its left item is a dismiss X and it pads the top inset on Android only: copy `ExerciseFormScreen` or `WorkoutPresetFormScreen`, not the pushed `GoalsScreen` or `WeeklyGoalPlanEditScreen` (9.1 drift).
- Pushed form (edit from a detail screen, or a goals or settings form): `left: { kind: 'back', disabled: isSaving }`, `right: { kind: 'primary', placement: 'native-only', busy: isSaving, onPress: save }`, the pushed top-inset rule, `{!usesNativeHeader && <FooterSaveBar onPress={save} busy={isSaving} />}`, `headerBackTitle` in the route options and the route in `HIDDEN_ROUTES`, as in `src/screens/CustomNutrientFormScreen.tsx` (which is itself missing from `HIDDEN_ROUTES`).
- List: replace the `ScrollView` with a `FlatList` and move the empty state into `ListEmptyComponent` (`src/screens/MealsLibraryScreen.tsx`).

### 9.4 Extending instead of creating

- **Dashboard card.** Add the key to `DASHBOARD_CARD_KEYS` and entries to `DASHBOARD_CARD_TITLES` and `DASHBOARD_CARD_SUBTITLES` in `src/constants/dashboardCards.ts` (keys `dashboardSettings.<key>` and `dashboardSettings.<key>Subtitle`). Add a `<key>CardVisible` flag to `src/stores/appPreferencesStore.ts` in five places: `PREFERENCE_DEFAULTS`, `AppPreferencesData`, the setter type in `AppPreferencesState`, the setter inside `persist`, and `partialize` (forgetting `partialize` compiles but resets the toggle every launch).
  - Wire it in `DashboardSettingsScreen.tsx` (selectors, `cardVisibilityMap`, a `case` in `setCardVisibility`) and `DashboardScreen.tsx` (a `case` in the `orderedDashboardCards` switch returning `<NewCard key="newCard" … />` when visible, and its root query key in `onRefresh`). Neither switch is exhaustive, so a missing `case` compiles and silently does nothing.
  - The card: `bg-surface rounded-xl p-4 mb-3 shadow-sm`, a `font-bold text-text-secondary` title with no size class, an optional `text-accent-primary font-medium` "Details" link with a 14px `chevron-forward`, and its query gated on the visibility flag through `enabled`. Copy the shell, title row, `enabled` gating and hook from `src/components/TrainingLoadDashboardCard.tsx` and `src/hooks/useTrainingLoad.ts`, but not its `STATUS_COLOR`: it puts the ink tokens `text-text-success`, `text-text-warning` and `text-text-danger-subtle` on a card with no wash, where they read near-white in Dark and AMOLED. Standalone status text uses `text-icon-success`, `text-icon-warning` and `text-icon-danger`. A trend graph usually belongs in Health Trends instead (`HEALTH_TREND_KEYS` in `src/constants/healthTrends.ts`).
- **Diary section.** There is no registry: insert the component at its place in the non-empty branch of `src/screens/DiaryScreen.tsx`, keep its query in `DiaryScreen` keyed on `selectedDate` and pass data as props, add its refetch to `onRefresh`, and add it to `isDayEmpty` (gated on its loading flag) when it holds something the user recorded. Layout: an `mb-2` wrapper, a `flex-row items-center gap-2 mb-2 px-1` title row with `text-base font-bold text-text-secondary flex-1`, then the card; with no data, return null or show the "Tap to add" prompt (`src/components/CheckInPhotosSummary.tsx`).
- **Settings row or subscreen.** A row is a `SettingsRow` inside an existing `SettingsRowGroup` in `src/screens/SettingsScreen.tsx` (inside `SectionErrorBoundary`; server-backed rows inside `{isConnected && (...)}`), with `iconColor` from the screen's category-color variables and `onPress={() => navigation.navigate('NewSettings')}`. A toggle is `rightAccessory={<Switch value={…} onValueChange={…} accessibilityLabel={…} />}`. A subscreen copies `src/screens/DiarySettingsScreen.tsx` and is wired as a pushed screen (9.2 steps 1–3) with `headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' })`.
- **AddSheet entry.** Add `onAddX?: () => void` to `AddSheetProps` in `src/components/AddSheet.tsx` and render it as `{onAddX ? renderSecondaryRow(t('addSheet.x', { defaultValue: '…' }), 'icon-name', onAddX) : null}` before the Ask Sparky row, as the Mood and Mindfulness rows do (`renderSecondaryRow` takes a required `() => void`, so an unguarded optional prop fails typecheck). The row goes through `handleAction`, which closes the sheet first, so never call the handler directly. The 2x2 grid is fixed at four tiles. Add `handleAddX` to `src/hooks/useAddSheetActions.ts` (`navigateFromSheet('XLog', { date: getActiveDiaryDate() })`), pass it from `App.tsx`, and test it like the Mood row in `__tests__/components/AddSheet.test.tsx`.
- **Icon.** Add `name: { sf: '…', ion: '…-outline' }` to `ICON_MAP` in `src/components/Icon.tsx` under its comment group, with `useIoniconOnIOS: true` when no SF Symbol fits. `sf` is type-checked; `ion` is not, so confirm the name exists in `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json` (a wrong one renders "?" on Android). Update the icon counts in sections 1 and 6.
- **Color token.** Add `--color-<name>: hsl(…);` to all three blocks in `global.css` (`@variant light`, `dark`, `amoled`; AMOLED does not inherit Dark). Use the generated class (`bg-<name>`, `text-<name>`, `border-<name>`) where `className` works, `useCSSVariable('--color-<name>')` elsewhere and `withAlpha` (`src/utils/colors.ts`) for alpha. In the same change, add a row to the matching section 2 table, bump the token count in the AMOLED differences line, and add an AMOLED row if that value differs from Dark.

### 9.5 Pre-PR checklist

- [ ] Light, Dark and AMOLED all read correctly, on Android and on iOS (on iOS 26+, with Liquid Glass navigation on and off).
- [ ] Nothing clips or scrolls sideways at 360pt width or with a large OS text size; labels in rows, tiles and buttons stay on one line.
- [ ] Content clears the home indicator, the keyboard and a live active-workout bar.
- [ ] Offline, loading, error, not-found and empty states render, and pull to refresh works where offered.
- [ ] On Android, hardware Back with any sheet open closes the sheet, not the screen.
- [ ] At most one primary action, and Save appears once on each header path.
- [ ] No hex, palette classes, `dark:`, `text-md` or other undefined classes; every `Icon` has a token color.
- [ ] Every string goes through `t()` with a matching English entry; icon-only buttons have labels.
- [ ] Mutations invalidate every affected query key.
- [ ] From `SparkyFitnessMobile/`: `pnpm run format`, then `pnpm exec jest --watchman=false --runInBand __tests__/navigation/nativeHeaderContract.test.ts <your test files>`, then `pnpm run validate` (typecheck, lint, i18n audit, Knip, Prettier check), then the full `pnpm exec jest --watchman=false --runInBand`.
- [ ] DESIGN.md is updated in the same change when a token, primitive or shared pattern changes; `AGENTS.md` when a route family or convention is added.

## 10. Watch Apps (Apple Watch, watch complications, Wear OS)

The watches are native, not React Native, so sections 2–9 (Uniwind tokens, `global.css`, Tailwind classes) do not apply to them. They are always dark, have no Light or AMOLED variants, and share only data and the phone-owned settings. This section describes the code as it exists today.

### 10.1 Targets

| Surface                              | Code                                                                                                                                 | UI toolkit                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Apple Watch app                      | `targets/watch` (`Presentation/`, `Domain/`, `Application/`, `Infrastructure/`, `Adapters/`)                                         | SwiftUI                                            |
| Apple Watch complications            | `targets/watch-widget` (`index.swift` lists them: Energy, Water, Protein, Carbs, Fat, Fasting, Steps)                                | WidgetKit                                          |
| Wear OS app, complications and tiles | `targets/wearos/src/main/java/com/sparkyapps/sparkyfitness/wear` (`Screens.kt`, `WorkoutScreens.kt`, `Complications.kt`, `Tiles.kt`) | Compose for Wear OS (`MaterialTheme`), ProtoLayout |

Android home-screen widgets (`targets/android-widget`) and the iOS phone widget (`targets/widget`) are separate from these.

### 10.2 Principles

- Glanceable: one job per screen, a big number, one control. The Workout screens show one set at a time, because the wearer is mid-lift looking at a small screen.
- Pure black canvas with flat dark cards. Color carries meaning only (a metric, a state), never decoration.
- Swipe is the navigation on Apple Watch; there is no button to change page. Wear OS scrolls with rotary input (`wearRotaryScroll`).
- Every tap that logs something gives a haptic. Apple Watch haptics go through `Haptics` (`Presentation/Haptics.swift`), which follows the phone's Settings → Haptics switch (`WatchContext.effectiveHapticsEnabled`); do not call `WKInterfaceDevice.current().play` directly. The one exception is the rest-finished buzz in `WatchAppDelegate`, which uses `effectiveRestBuzzEnabled` (the haptics switch plus the phone's rest-alerts setting).
- Works with the phone away: pages draw from the last persisted context, and writes (water taps, medication taps, check-ins) queue and resend.
- Copy: Apple Watch copy uses `String(localized:defaultValue:)` keys (`watch.<page>.<name>`), with the strings in `targets/watch/en.lproj`; `pnpm run i18n:audit:watch` checks it. Never build a key or a color from translated text (the Goals rows pick their color from the nutrient key, not the title). The Wear OS screens use literal strings (see 10.6).

### 10.3 Apple Watch app

**Pages.** `WatchPage` order is the factory swipe order: Goals, Water, Medications, Entry (weight check-in), Trend, Workout, Fasting, Steps. Now Playing is inserted right after Workout, only while a workout, wrist run or phone GPS recording is live. The wearer orders and hides pages from the phone (Settings → Apple Watch). The raw values are wire strings shared with `src/constants/watchPages.ts` (`WATCH_PAGE_KEYS`); rename a page in both places in the same change. A hidden Workout page still shows while a workout is running, and an order that hides everything shows everything. A first-run gate asks for weight and body fat before the pages appear.

**Scaling.** Sizes are drawn for the 44 mm watch (224pt screen height) and passed through `WatchStyle.s(_)`, which scales by screen height between 0.82 and 1.1 and rounds. Use `WatchStyle.s` for any fixed size, so a 40 mm screen does not push content under the clock.

**Surfaces.**

- Canvas: system black. Card and control fill: `WatchStyle.fill` (`Color(white: 0.14)`), corner `WatchStyle.s(20)`, continuous (squircle) corners via `WatchStyle.shape`.
- Control: `SquircleButton`, a flat dark squircle with a glyph, 44pt tall in a row and a 28pt round button in a header, glyph 20pt semibold at 60% white. `prominent` is the one main action on a screen (white fill, black glyph); `tint` colors the glyph for a control that must be told apart (a red finish). Disabled controls drop to 35% opacity. The whole box takes the tap.
- List rows use `WatchStyle.shape.fill(WatchStyle.fill)` as the row background. A 3pt category-color rail marks superset runs.
- Destructive actions use `Button(role: .destructive)` and are confirmed; finishing a workout lives in the overview list, not on the set screen, so it is never one tap from the set tick.

**Typography.** System fonts only (SF), Dynamic Type styles first: `.footnote` (labels, rows), `.body`, `.headline`, `.title2`/`.title3`, with `.semibold` or `.medium` for emphasis. Big numbers and compact layouts use `.system(size: WatchStyle.s(n), weight:)` (sizes in use: 11–16 for labels and values, 22–30 for hero numbers). Use monospaced digits for anything that ticks (timers, pace, heart rate).

**Color.** The watch has its own palette, not the phone tokens.

| Role            | Value                                                                                                                                          | Where                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Calories        | `GoalPalette.calories` (0.537, 0.573, 0.863)                                                                                                   | Goals, Energy complication         |
| Protein         | `GoalPalette.protein` (0.859, 0.690, 0.435)                                                                                                    | Goals                              |
| Carbs           | `GoalPalette.carbs` (0.592, 0.776, 0.573)                                                                                                      | Goals                              |
| Fat             | `GoalPalette.fat` (0.541, 0.761, 0.855)                                                                                                        | Goals                              |
| Water           | `Color.cyan`                                                                                                                                   | Water, Water complication          |
| Medication      | `Color.mint`                                                                                                                                   | Medications                        |
| Extra nutrients | five fixed colors in `GoalPalette.extra`, by list position                                                                                     | rows past the three macros         |
| Steps           | `.mint`                                                                                                                                        | Steps page, Steps complication     |
| Fasting         | `.orange`                                                                                                                                      | Fasting page, Fasting complication |
| Superset runs   | `SupersetPalette` in `WorkoutView.swift`: eight colors copied from the dark `--color-cat-*` values (see the sync note at the top of this file) | Workout                            |

Take macro and nutrient colors from `GoalPalette` (`GoalPalette.color(forNutrient:index:)`); do not add new literals in views.

**Workout and run screens.** `WorkoutView` (strength), `WatchRunView` and `CardioLiveLayout` (wrist runs), `WatchRouteView` (route following) and `RecordingView` (phone GPS) are the live screens. Live screens keep the value cards flat and large, put the single main action in a `prominent` squircle, and use haptic cues (`Haptics.pace`, `heartRate`, `routeCue`, `offRoute`, `onRoute`) for alerts so the wearer does not have to look. Heart rate zones come from `shared/src/utils/heartRateZones.ts` through the context the phone sends; never re-derive them on the watch.

### 10.4 Apple Watch complications

- Families: circular, corner, rectangular and inline (`accessoryCircular`, `accessoryCorner`, `accessoryRectangular`, `accessoryInline`). Most draw `Gauge` / `ProgressView` tinted per metric; Energy and Water draw custom ring views (`CalorieRing`, `MacroGoalRing`, `WaterGoalRing`). Tracks are `Color.secondary` at 25% opacity.
- Data comes from the app group (`APP_GROUP_IDENTIFIER` in the target's Info.plist), written by `ComplicationPublisher`. The daily metric snapshots (steps, water, energy, macros) carry a date, and one for another day is ignored. The fasting snapshot has no date, because a fast can span midnight. The placeholder shows a plausible mid-day value.
- Refresh differs by complication. Steps, Water, Energy and the macros reload after 15 minutes or at midnight, whichever is first. Fasting reloads hourly when no fast is active; during an active fast it provides a run of 15-minute entries and reloads `.atEnd`.
- Each Apple Watch complication opens the app on its page through the `sparkyfitness-watch` URL scheme (`ComplicationLinks.swift`). The scheme is declared in three copies that must stay in step: `targets/watch/expo-target.config.js`, `WatchDeepLink.scheme` and `ComplicationLink.scheme`. Wear OS complications instead tap through a `PendingIntent` carrying a `target_page` extra (`ComplicationUpdater.tapPendingIntent`); Wear OS also accepts a separate `sparkyfitness://watch` deep link in `MainActivity`.
- Tints: Water cyan (`GoalPalette.water`), Steps mint, Fasting orange. The Energy and macro complications use the `GoalPalette` calorie and macro colors through the `ComplicationPalette` mirror in `EnergyGoalComplication.swift`; if `GoalPalette` changes, change the mirror too.

### 10.5 Wear OS app

- Dark Compose for Wear OS under `MaterialTheme`; there is no light theme. Colors are the fixed `SparkyColors` object in `Screens.kt`.

| Name   | Value   | Use             |
| ------ | ------- | --------------- |
| Cyan   | #38BDF8 | Protein         |
| Amber  | #F59E0B | Carbs           |
| Rose   | #F43F5E | Fat             |
| Green  | #22C55E | Fiber           |
| Purple | #A855F7 | Sugars          |
| Blue   | #3B82F6 | Other nutrients |
| CardBg | #1E293B | Cards and rows  |
| Muted  | #94A3B8 | Secondary text  |

- Cards are `RoundedCornerShape(10.dp)` on `CardBg` with 10dp by 6dp padding; macro rows are a label (11sp medium, white), a value and a progress bar in the nutrient color.
- Complications are `SuspendingComplicationDataSourceService` classes in `Complications.kt` (Energy, Protein, Carbs, Fat, Water, Fasting, Steps), registered in `AndroidManifest.xml`, with monochrome icons in `res/drawable/ic_complication_*.xml`.
- Tiles are ProtoLayout `TileService` subclasses in `Tiles.kt` (`NutritionTileService`, `SleepTileService`, `MedicationsTileService`, `ExerciseTileService`), wrapped in `buildTileShell` (pure black background, a 300° progress arc on a `CardBg` track anchored at `-150°`, and up to three compact pill rows), registered in `AndroidManifest.xml` with preview images in `res/drawable-nodpi/tile_preview_*.png` and icons in `res/drawable/ic_tile_*.xml`. Nutrition tile macro rows use `nutrientColor` (`SparkyColors`) from `Screens.kt`. Tapping a tile launches `MainActivity` with a `target_page` extra (`goals`, `sleep`, `meds`, `workout`).
- The phone finds the watch by the `sparky_wear_companion` capability in `res/values/wear.xml`.
- `WearOsParityTest` covers Wear OS payload parsing and builders against hard-coded JSON. It does not compare them with the Apple Watch definitions, so it cannot catch a one-sided schema change; keep both watches in step by hand.

### 10.6 Known gaps

- The Wear OS palette is a Tailwind-style set unrelated to the Apple Watch `GoalPalette`, so the same macro is a different color on each watch: protein is amber on Apple Watch and cyan on Wear OS, and carbs is green on Apple Watch and amber on Wear OS.
- The Wear OS screens use literal English strings rather than Android string resources, unlike the localized Apple Watch app.
- Neither watch palette is derived from `global.css`; the superset palette is the only hand-copied mirror.

### 10.7 Checklist for a watch change

- [ ] Used `WatchStyle.s` for fixed sizes, `WatchStyle.fill` for cards and `SquircleButton` for controls (Apple Watch).
- [ ] Took colors from `GoalPalette` / `SparkyColors` and updated the table above if a value changed.
- [ ] Fired Apple Watch haptics through `Haptics`, never `WKInterfaceDevice` directly (the one exception is the rest-finished buzz in `WatchAppDelegate`, which uses `effectiveRestBuzzEnabled` to honor the rest-alerts setting as well), and kept pages working with no phone connection.
- [ ] A new page is added to `WatchPage`, `WATCH_PAGE_KEYS` and the phone's Apple Watch settings together.
- [ ] A new complication is added on both Apple Watch (`index.swift`) and Wear OS (service plus manifest entry), with its tap target (URL scheme on Apple Watch, `target_page` on Wear OS).
- [ ] Payload or context changes are made on both watches and the phone by hand, and the Wear OS parity test still passes.
- [ ] New Apple Watch strings are localized with `String(localized:defaultValue:)` and added to `en.lproj/Localizable.strings`.
