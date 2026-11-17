# Custom Food Form

This page will explain how to use the Custom Food Form in SparkyFitness.
When you add a food, you'll have the option to add a custom food like here:
<img width="1101" height="538" alt="grafik" src="https://github.com/user-attachments/assets/fad48cce-b235-4a92-ad55-b69ca618b49c" />

Choosing Custom Food will open a window where you can input a name, brand and both macronutrients and micronutrients
<img width="1079" height="827" alt="grafik" src="https://github.com/user-attachments/assets/2683d48a-c9eb-4bea-bc1f-e97a4c51a42c" />


## Named portions

On web and mobile, keep the label's reference serving (for example, **100 g**)
and enter its nutrients as usual. In **Named portions**, choose **Add portion**,
enter a name such as **packet**, and enter the weight of one packet, for example
**150 g**. Save the food to keep both choices in the same library entry.

The portion's nutrients are calculated from the reference serving. If 100 g has
120 kcal, one 150 g packet has 180 kcal. When logging the food, select grams for
an arbitrary weight or select **packet (150 g)** and enter the number of packets.
Half a packet has 90 kcal; two packets have 360 kcal.

For a reference serving measured in volume, define portions in millilitres,
for example **bottle (500 ml)**. A weight reference needs a weight portion and a
volume reference needs a volume portion. The app cannot convert between grams
and millilitres without a known density.

Named portions and gram or millilitre quantities belong to one food; you do not
need to create another food for each package size. **Equivalent sizes** remain
available for alternate descriptions of the same nutrient amount, such as
**1 packet = 2 pieces**.

## Notes

Foods and meals have an optional **Notes** field for the details you want to
remember every time you log them — how you order a particular dish, a
preparation tweak, or a full recipe.

Notes support Markdown. The editor has **Write** and **Preview** modes, plus
buttons for bold, italic, links, code, and lists. A note can be up to 4,000
characters.

Where a note shows up:

* On the food or meal itself, whenever you edit it.
* Read-only while you are logging that food or meal, so the details are in
  front of you at the moment you need them.
* To anyone you share your food library with — they can read your notes but
  only you can change them.

Diary entries have their own separate note, for something specific to one
occasion. It is never copied from the food's note, and editing one never
changes the other. A note follows its entry when you copy entries to another
day.

## Health score

Every food with a serving measured in a weight or volume unit (g, oz, ml, cup,
…) shows a **Nutri-Score** grade from A to E, calculated per 100 g or 100 ml
with the 2023 algorithm (general foods and beverages). Foods imported from Open
Food Facts use the grade Open Food Facts publishes when it has one. Servings in
units like "piece" or "serving" have no per-100 basis, so they get no grade.

Two optional fields on the form feed the score:

* **Added sugars (g per 100 g/ml)** — as printed on the label. Leave it empty
  when the label does not state it; an empty value never counts as "no added
  sugar".
* **Fruit, vegetables & legumes (%)** — the share of the food made of them. An
  empty value scores as 0, as the Nutri-Score rules do.

The food CSV import accepts both as optional `added_sugars` and
`fruit_veg_legume_percent` columns; a missing column or a blank cell is stored
as unknown, and an overwrite import keeps the stored value in that case.

Under **Settings → Preferences → Front-of-pack warnings** you can also show a
country's "high in" warnings next to the grade: Brazil (ANVISA), Chile or
Mexico. They report whether a food crosses that country's thresholds; they do
not know whether a product is packaged or which ingredients were added, which
the regulations also take into account. The added-sugar warnings only appear
when the food has an added sugars value.
