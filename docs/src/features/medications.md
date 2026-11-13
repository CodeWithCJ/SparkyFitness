# Medications & Supplements

Track scheduled and as-needed medications and supplements, log each dose as taken or skipped, and see how consistently you take them. The same data is available in the web app (**Medications**) and the mobile app (**Library → Medications**, or the Medications card on the Dashboard).

---

## 1. Logging Doses

* **Scheduled doses** (daily, weekly, every N days, monthly, cyclic, taper) appear in the day's checklist. Take, skip or undo each one.
* **As-needed (PRN) medications** have no fixed time; log one whenever you take it.
* **Supplements** are medications flagged as supplements. Their nutrients count toward the day's nutrition totals, and a **All / Meds / Supplements** filter narrows every view.
* **GLP-1 injections** are logged as injections so pen and vial inventory stays in sync. They appear in the dose history like any other dose.

---

## 2. Adherence Overview

* **Doses today**: scheduled doses logged out of those due.
* **14-day adherence**: the share of due doses taken over the last 14 days. As-needed doses count toward a day, up to the number of scheduled doses due, and a day with only as-needed doses counts as complete. Skipped and snoozed doses never count as taken.
* **Perfect days**: days in that window where everything due was taken.
* **Ring**: the 14-day adherence percentage (green at 90% and above, amber at 70% and above, red below).
* **Last 14 days**: one bar per day (green all taken, amber partial, orange mostly missed, red none taken, grey nothing due) and your **current streak** of perfect days. A day still in progress does not break the streak, but any skipped dose does.

The overview, the checklist and the month calendar all use one shared calculation, so web and mobile always agree.

---

## 3. Month Log Calendar

A month view of your logged doses:

* Each day is coloured by how complete it was: **all doses taken**, **partially taken**, **mostly skipped**, **all doses skipped**, or **snoozed only**.
* A small badge shows the number of doses taken on days with more than one.
* A dot marks days with a **side-effect symptom** (a symptom logged against a medication) or a **general symptom**. Symptom dots only appear when you have access to symptoms, and cycle-hub symptoms are never shown here.
* A filter narrows the month to **all medications** or a single one, and the header shows how many doses were logged that month.
* Tap a day to select it. The checklist, the adherence window and the day log then follow that date.

---

## 4. Day Log

The **Logged today** card (or **Logged on {date}** for another day) lists everything taken or skipped on the selected date, with the time and a **Taken / Skipped** chip.

* **Edit** changes the time, status (taken, skipped, snoozed) and notes of a logged dose. For an injection it also changes the injection site.
* **Delete** removes the entry after a confirmation. Deleting an injection credits the dose back to the pen or vial it was deducted from.

Changing a logged dose refreshes the Dashboard card, the checklist, the adherence numbers and the calendar together.

---

## 5. Using It on Mobile

1. Open **Medications** from the Dashboard card (**View all**) or the Library.
2. Tap **Adherence & log** at the top of the list.
3. The screen shows, top to bottom: the adherence overview, the checklist, today's medications (and supplements), the month calendar with its filter and legend, and the day log.
4. Pull down to refresh. Choosing a day other than today shows a **Back to today** shortcut.

Mobile does not yet include the web page's GLP-1 daily check-in on this screen; the GLP-1 tracker is opened from the medication itself.

---

## 6. Privacy & Family Delegation

* All data stays in your own database.
* Managing another person's medications uses the `medications` permission. Symptom dots on the calendar need the separate `symptoms` permission or **View Reports**, and are simply left off without one of them.
* Reproductive-health data is never delegated and never appears in medication views.

See [Family & Friends Sharing](./family-friends-sharing.md) for how permissions are granted.
