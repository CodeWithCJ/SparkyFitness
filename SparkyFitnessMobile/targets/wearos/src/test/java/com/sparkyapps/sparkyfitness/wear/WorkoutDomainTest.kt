package com.sparkyapps.sparkyfitness.wear

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.round

class WorkoutDomainTest {

    private val kgPlates = WatchPlateConfig(
        unit = "kg",
        barWeight = 20.0,
        collarWeight = 0.0,
        plates = listOf(25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25, 0.5).map { WatchPlateConfig.Plate(it, 2) }
    )

    private val kgStepPlates = WatchPlateConfig(
        unit = "kg",
        barWeight = 20.0,
        collarWeight = 0.0,
        plates = listOf(20.0, 10.0, 5.0, 2.5, 1.25).map { WatchPlateConfig.Plate(it, 2) }
    )

    private fun requireExact(result: WatchPlates.Result): WatchPlates.Load {
        assertTrue("Expected Exact, got $result", result is WatchPlates.Result.Exact)
        return (result as WatchPlates.Result.Exact).load
    }

    // ---- WatchPlates ----

    @Test
    fun `owned plates decide the breakdown`() {
        val config = WatchPlateConfig(
            unit = "kg",
            barWeight = 20.0,
            collarWeight = 0.0,
            plates = listOf(20.0, 10.0, 5.0, 2.5, 1.25).map { WatchPlateConfig.Plate(it, 2) }
        )
        val load = requireExact(WatchPlates.calculate(82.5, config))
        assertEquals("20+10+1.25", WatchPlates.summary(load.plates))
    }

    @Test
    fun `fewest plates heaviest first`() {
        val load = requireExact(WatchPlates.calculate(82.5, kgPlates))
        assertEquals(31.25, load.perSide, 1e-6)
        assertEquals(82.5, load.total, 1e-6)
        assertEquals("25+5+1.25", WatchPlates.summary(load.plates))
    }

    @Test
    fun `bar only is exact with no plates`() {
        val load = requireExact(WatchPlates.calculate(20.0, kgPlates))
        assertTrue(load.plates.isEmpty())
    }

    @Test
    fun `limited plates do not go greedy`() {
        val config = WatchPlateConfig(
            unit = "kg",
            barWeight = 20.0,
            collarWeight = 0.0,
            plates = listOf(WatchPlateConfig.Plate(20.0, 1), WatchPlateConfig.Plate(15.0, 2))
        )
        val load = requireExact(WatchPlates.calculate(80.0, config))
        assertEquals("15+15", WatchPlates.summary(load.plates))
    }

    @Test
    fun `unloadable weight names nearest loadable either side`() {
        val res = WatchPlates.calculate(80.25, kgPlates)
        assertTrue(res is WatchPlates.Result.Inexact)
        val inexact = res as WatchPlates.Result.Inexact
        assertEquals(80.0, inexact.below!!.total, 1e-6)
        assertEquals(81.0, inexact.above!!.total, 1e-6)
    }

    @Test
    fun `under the bar has nothing below`() {
        val res = WatchPlates.calculate(15.0, kgPlates)
        assertTrue(res is WatchPlates.Result.Inexact)
        val inexact = res as WatchPlates.Result.Inexact
        assertNull(inexact.below)
        assertEquals(20.0, inexact.above!!.total, 1e-6)
    }

    @Test
    fun `pounds config converts kg weight`() {
        val lbs = WatchPlateConfig(
            unit = "lbs",
            barWeight = 45.0,
            collarWeight = 0.0,
            plates = listOf(45.0, 25.0, 10.0, 5.0, 2.5).map { WatchPlateConfig.Plate(it, 2) }
        )
        val load = requireExact(WatchPlates.calculate(135.0 * WeightRounding.KG_PER_LB, lbs))
        assertEquals("45", WatchPlates.summary(load.plates))
    }

    @Test
    fun `collars count toward the total`() {
        val collars = kgPlates.copy(collarWeight = 2.5)
        val load = requireExact(WatchPlates.calculate(65.0, collars))
        assertEquals(20.0, load.perSide, 1e-6)
    }

    @Test
    fun `plate number formatting strips trailing zeroes`() {
        assertEquals("20", WatchPlates.number(20.0))
        assertEquals("1.25", WatchPlates.number(1.25))
        assertEquals("0.5", WatchPlates.number(0.5))
    }

    @Test
    fun `nextLoadable steps up, down, handles inexact targets, and stops at bounds`() {
        assertEquals(85.0, WatchPlates.nextLoadable(82.5, up = true, config = kgStepPlates)!!, 1e-6)
        assertEquals(80.0, WatchPlates.nextLoadable(82.5, up = false, config = kgStepPlates)!!, 1e-6)
        assertEquals(85.0, WatchPlates.nextLoadable(83.0, up = true, config = kgStepPlates)!!, 1e-6)
        assertEquals(82.5, WatchPlates.nextLoadable(83.0, up = false, config = kgStepPlates)!!, 1e-6)
        assertNull(WatchPlates.nextLoadable(20.0, up = false, config = kgStepPlates))
        assertEquals(175.0, WatchPlates.nextLoadable(172.5, up = true, config = kgStepPlates)!!, 1e-6)
        assertNull(WatchPlates.nextLoadable(175.0, up = true, config = kgStepPlates))

        val lbs = WatchPlateConfig(
            unit = "lbs",
            barWeight = 45.0,
            collarWeight = 0.0,
            plates = listOf(45.0, 25.0, 10.0, 5.0, 2.5).map { WatchPlateConfig.Plate(it, 2) }
        )
        val next = WatchPlates.nextLoadable(135.0 * WeightRounding.KG_PER_LB, up = true, config = lbs)
        assertNotNull(next)
        assertEquals(140.0 * WeightRounding.KG_PER_LB, next!!, 1e-6)
    }

    @Test
    fun `enormous and overflowing plate values return invalid safely`() {
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(1e300, kgStepPlates))
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(Double.MAX_VALUE, kgStepPlates))
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(1e18, kgStepPlates))
        assertNull(WatchPlates.nextLoadable(1e300, up = true, config = kgStepPlates))
        assertNull(WatchPlates.nextLoadable(1e300, up = false, config = kgStepPlates))

        val hugePlate = WatchPlateConfig("kg", 20.0, 0.0, listOf(WatchPlateConfig.Plate(1e300, 2)))
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(100.0, hugePlate))

        val hugeBar = WatchPlateConfig("kg", 1e300, 0.0, listOf(WatchPlateConfig.Plate(20.0, 2)))
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(100.0, hugeBar))

        val heavy = WatchPlateConfig("kg", 20.0, 0.0, listOf(WatchPlateConfig.Plate(10_000.0, 1000)))
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(100.0, heavy))
        assertNull(WatchPlates.nextLoadable(100.0, up = true, config = heavy))

        val many = WatchPlateConfig(
            "kg",
            20.0,
            0.0,
            (1..3).map { WatchPlateConfig.Plate(1000.0 + it, 1000) }
        )
        assertEquals(WatchPlates.Result.Invalid, WatchPlates.calculate(100.0, many))
    }

    @Test
    fun `stored kg round-trip of pounds stays exact and steps cleanly`() {
        val lbs = WatchPlateConfig(
            unit = "lbs",
            barWeight = 45.0,
            collarWeight = 0.0,
            plates = listOf(45.0, 35.0, 25.0, 10.0, 5.0, 2.5).map { WatchPlateConfig.Plate(it, 2) }
        )
        for (kg in listOf(105.0 * WeightRounding.KG_PER_LB, 47.63)) {
            val load = requireExact(WatchPlates.calculate(kg, lbs))
            assertEquals(30.0, load.perSide, 1e-6)
            assertEquals(105.0, load.total, 1e-6)
            assertEquals("25+5", WatchPlates.summary(load.plates))
            assertEquals(105.0, WatchPlates.inUnit(kg, lbs), 1e-6)
        }
        val up = WatchPlates.nextLoadable(47.63, up = true, config = lbs)!!
        assertEquals(110.0, WatchPlates.inUnit(up, lbs), 1e-6)
        val down = WatchPlates.nextLoadable(47.63, up = false, config = lbs)!!
        assertEquals(100.0, WatchPlates.inUnit(down, lbs), 1e-6)
    }

    // ---- WeightRounding ----

    @Test
    fun `weight rounding preserves pounds through 2-decimal kg storage and 2-decimal kilos`() {
        for (pounds in listOf(5.0, 45.0, 90.0, 105.0, 135.0, 225.0, 312.5)) {
            val storedKg = round(pounds * WeightRounding.KG_PER_LB * 100.0) / 100.0
            assertEquals(pounds, WeightRounding.displayed(storedKg, lbs = true), 1e-6)
        }
        assertEquals(105.0, WeightRounding.displayed(47.63, lbs = true), 1e-6)
        assertEquals(105.0, WeightRounding.displayed(47.627, lbs = true), 1e-6)
        assertEquals(82.5, WeightRounding.displayed(82.5, lbs = false), 1e-6)
        assertEquals(20.0, WeightRounding.displayed(20.004, lbs = false), 1e-6)
        assertEquals(1.26, WeightRounding.displayed(1.256, lbs = false), 1e-6)
        assertEquals(102.5, WeightRounding.displayed(102.5 * WeightRounding.KG_PER_LB, lbs = true), 1e-6)
    }

    // ---- RestRule ----

    private fun facts(
        entry: String,
        set: Int,
        own: Int?,
        before: Int = 0,
        run: Int? = null,
        drop: Boolean = false
    ) = RestStepFacts(entry, run, set, drop, own, before)

    @Test
    fun `rest rule covers plain sets, exercise transitions, warmups, supersets, drops, fallback, and nextIndex`() {
        assertEquals(90, RestRule.restAfter(facts("a", 1, 90, 90), facts("a", 2, 120, 90)))
        assertEquals(90, RestRule.restAfter(facts("dips", 3, 90, 90), facts("raise", 1, 60, 60)))
        assertEquals(45, RestRule.restAfter(facts("a", 1, 45, 45), facts("a", 2, 120, 45)))
        assertEquals(0, RestRule.restAfter(facts("a", 1, 120, 120, run = 0), facts("b", 1, 120, 0, run = 0)))
        assertEquals(100, RestRule.restAfter(facts("b", 1, 100, 0, run = 0), facts("a", 2, 120, 100, run = 0)))
        assertEquals(100, RestRule.restAfter(facts("b", 2, 100, 0, run = 0), facts("c", 1, 60, 100)))
        assertEquals(80, RestRule.restAfter(facts("a", 1, 80, run = 0), facts("b", 1, 80, run = 1)))
        assertEquals(0, RestRule.restAfter(facts("a", 1, 90), facts("a", 2, 0, drop = true)))
        assertEquals(60, RestRule.restAfter(facts("a", 1, null), facts("b", 1, null, before = 60)))

        assertEquals(2, RestRule.nextIndex(0, listOf(false, true, false)))
        assertEquals(0, RestRule.nextIndex(2, listOf(false, true, false)))
        assertNull(RestRule.nextIndex(1, listOf(true, false, true)))
        assertNull(RestRule.nextIndex(0, listOf(false)))
    }

    // ---- StaleRest ----

    @Test
    fun `stale rest detects phone rest started before watch skip`() {
        val tick = 1_000_000L
        val skipped = tick + 2_000L
        assertTrue(StaleRest.isStale(tick + 90_000L, 90, skipped))
        val next = tick + 30_000L
        assertFalse(StaleRest.isStale(next + 60_000L, 60, skipped))
        assertFalse(StaleRest.isStale(tick + 90_000L, 90, null))
    }

    // ---- WatchHeartRateZone ----

    @Test
    fun `heart rate zone boundaries and floor validation`() {
        val floors = listOf(95.0, 114.0, 133.0, 152.0, 171.0)
        assertEquals(0, WatchHeartRateZone.zone(94.0, floors))
        assertEquals(1, WatchHeartRateZone.zone(95.0, floors))
        assertEquals(1, WatchHeartRateZone.zone(113.9, floors))
        assertEquals(2, WatchHeartRateZone.zone(114.0, floors))
        assertEquals(3, WatchHeartRateZone.zone(141.0, floors))
        assertEquals(4, WatchHeartRateZone.zone(152.0, floors))
        assertEquals(5, WatchHeartRateZone.zone(171.0, floors))
        assertEquals(5, WatchHeartRateZone.zone(210.0, floors))

        assertNull(WatchHeartRateZone.zone(140.0, null))
        assertNull(WatchHeartRateZone.zone(140.0, emptyList()))
        assertNull(WatchHeartRateZone.zone(140.0, listOf(95.0, 114.0)))

        assertEquals(floors, WatchHeartRateZone.normalized(floors))
        assertNull(WatchHeartRateZone.normalized(null))
        assertNull(WatchHeartRateZone.normalized(listOf(95.0, 114.0, 133.0, 152.0)))
        assertNull(WatchHeartRateZone.normalized(listOf(95.0, 133.0, 114.0, 152.0, 171.0)))
        assertNull(WatchHeartRateZone.normalized(listOf(0.0, 114.0, 133.0, 152.0, 171.0)))
    }

    // ---- LoggedSetOrder ----

    @Test
    fun `logged set order tracks log sequence, drops unlogged sets, and navigates older and newer`() {
        val plan = listOf("a1", "a2", "b1", "b2")
        var order = emptyList<String>()
        for (done in listOf(setOf("a1"), setOf("a1", "b1"), setOf("a1", "b1", "a2"))) {
            order = LoggedSetOrder.synced(order, done, plan)
        }
        assertEquals(listOf("a1", "b1", "a2"), order)

        val plan3 = listOf("a1", "a2", "b1")
        var order2 = LoggedSetOrder.synced(emptyList(), setOf("a1", "a2", "b1"), plan3)
        order2 = LoggedSetOrder.synced(order2, setOf("a2", "b1"), plan3)
        assertEquals(listOf("a2", "b1"), order2)
        order2 = LoggedSetOrder.synced(order2, setOf("a1", "a2", "b1"), plan3)
        assertEquals(listOf("a2", "b1", "a1"), order2)

        assertNull(LoggedSetOrder.older(0))
        assertEquals(1, LoggedSetOrder.older(2))
        assertEquals(LoggedSetOrder.Newer.SetIndex(1), LoggedSetOrder.newer(0, 3))
        assertEquals(LoggedSetOrder.Newer.Current, LoggedSetOrder.newer(2, 3))
    }

    // ---- ExerciseDemoFiles ----

    @Test
    fun `exercise demo file naming and LRU pruning protect active plan keys`() {
        assertEquals("abc-123-0.jpg", ExerciseDemoFiles.fileName("abc-123", 0))
        assertEquals("___x_y-1.jpg", ExerciseDemoFiles.fileName("../x y", 1))
        assertNull(ExerciseDemoFiles.fileName("abc", 2))
        assertNull(ExerciseDemoFiles.fileName("", 0))
        assertNull(ExerciseDemoFiles.fileName("a".repeat(81), 0))

        assertEquals("abc-123", ExerciseDemoFiles.keyOfFileName("abc-123-1.jpg"))
        assertNull(ExerciseDemoFiles.keyOfFileName("junk.txt"))

        val files = (0 until 6).map { "k$it-0.jpg" to (1000L + it * 1000L) }
        assertEquals(listOf("k0-0.jpg", "k1-0.jpg"), ExerciseDemoFiles.filesToDelete(files, emptySet(), 4))
        assertEquals(listOf("k1-0.jpg", "k2-0.jpg"), ExerciseDemoFiles.filesToDelete(files, setOf("k0"), 4))
        assertEquals(emptyList<String>(), ExerciseDemoFiles.filesToDelete(files, emptySet(), 6))
    }

    // ---- Context & Outbound Payload Parity for PR #3557 ----

    @Test
    fun `context and workout plan parse new workout view fields and build new outbound payloads`() {
        val rawCtx = JSONObject().apply {
            put("today", "2026-11-16")
            put("newWorkout", true)
            put("workoutCountdown", 5)
            put("holdCountdown", false)
            put("workoutTopLine", "metrics")
            put("exerciseDoNow", true)
            put("heartRateZoneFloors", JSONArray().apply {
                put(95.0); put(114.0); put(133.0); put(152.0); put(171.0)
            })
        }
        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        assertTrue(ctx.effectiveNewWorkout)
        assertEquals(5, ctx.effectiveWorkoutCountdown)
        assertFalse(ctx.effectiveHoldCountdown)
        assertTrue(ctx.effectiveWorkoutTopLineIsMetrics)
        assertTrue(ctx.effectiveExerciseDoNow)
        assertEquals(listOf(95.0, 114.0, 133.0, 152.0, 171.0), ctx.heartRateZoneFloors)

        // Defaults when newWorkout is enabled without explicit countdown flags
        val defaultOnCtx = ContextPayloadMapper.parseContext(JSONObject().put("newWorkout", true), WatchContext.empty)
        assertTrue(defaultOnCtx.effectiveNewWorkout)
        assertEquals(3, defaultOnCtx.effectiveWorkoutCountdown)
        assertTrue(defaultOnCtx.effectiveHoldCountdown)

        // When newWorkout is off, countdown & holdCountdown are effectively disabled
        val offCtx = ContextPayloadMapper.parseContext(JSONObject().put("newWorkout", false), ctx)
        assertFalse(offCtx.effectiveNewWorkout)
        assertEquals(0, offCtx.effectiveWorkoutCountdown)
        assertFalse(offCtx.effectiveHoldCountdown)

        val planJson = JSONObject().apply {
            put("sessionId", "sess-new")
            put("workoutName", "Upper A")
            put("exercises", JSONArray().apply {
                put(JSONObject().apply {
                    put("exerciseEntryId", "we-barbell")
                    put("name", "Bench Press")
                    put("equipment", "Barbell")
                    put("muscle", "Chest")
                    put("imageKey", "bench-press")
                    put("imageCount", 2)
                    put("plates", JSONObject().apply {
                        put("unit", "kg")
                        put("barWeight", 20.0)
                        put("collarWeight", 2.5)
                        put("plates", JSONArray().apply {
                            put(JSONObject().put("weight", 20.0).put("pairs", 2))
                            put(JSONObject().put("weight", 10.0).put("pairs", 2))
                        })
                    })
                    put("sets", JSONArray().apply {
                        put(JSONObject().apply {
                            put("setId", "s-1")
                            put("targetReps", 8.0)
                            put("targetWeightKg", 85.0)
                            put("restSeconds", 60)
                            put("restAfterSeconds", 90)
                        })
                    })
                })
            })
        }
        val plan = ContextPayloadMapper.parseWorkoutPlan(planJson)!!
        val ex = plan.exercises.first()
        assertEquals("Barbell", ex.equipment)
        assertEquals("Chest", ex.muscle)
        assertEquals("bench-press", ex.imageKey)
        assertEquals(2, ex.imageCount)
        assertNotNull(ex.plates)
        assertEquals("kg", ex.plates!!.unit)
        assertEquals(20.0, ex.plates!!.barWeight, 1e-6)
        assertEquals(2.5, ex.plates!!.collarWeight, 1e-6)
        assertEquals(2, ex.plates!!.plates.size)
        assertEquals(90, ex.sets.first().restAfterSeconds)

        // Outbound payloads: DoExerciseNow, SetValuesEdit, presetUpdateAnswer(waiting=true), workoutEffort
        val doNow = OutboundPayloads.workoutEdit(
            "sess-new",
            "c-1",
            WorkoutEditAction.DoExerciseNow("we-2", "we-barbell")
        )
        assertEquals("doExerciseNow", doNow.getString("action"))
        assertEquals("we-2", doNow.getString("exerciseEntryId"))
        assertEquals("we-barbell", doNow.getString("anchorEntryId"))

        val editVals = OutboundPayloads.workoutEdit(
            "sess-new",
            "c-2",
            WorkoutEditAction.SetValuesEdit(
                setId = "s-1",
                weightKg = 90.0,
                reps = 6.0,
                distanceKm = null,
                atMs = 5_000L,
                armedAtMs = 4_000L
            )
        )
        assertEquals("setValues", editVals.getString("action"))
        assertEquals("s-1", editVals.getString("setId"))
        assertEquals(90.0, editVals.getDouble("weightKg"), 1e-6)
        assertEquals(6.0, editVals.getDouble("reps"), 1e-6)
        assertEquals(5_000.0, editVals.getDouble("at"), 1e-6)
        assertEquals(4_000.0, editVals.getDouble("armedAt"), 1e-6)

        val waitingAns = OutboundPayloads.presetUpdateAnswer("sess-new", update = false, waiting = true)
        assertEquals("presetUpdateAnswer", waitingAns.getString("type"))
        assertFalse(waitingAns.getBoolean("update"))
        assertTrue(waitingAns.getBoolean("waiting"))

        val effort = OutboundPayloads.workoutEffort("sess-new", 8)
        assertEquals("workoutEffort", effort.getString("type"))
        assertEquals("sess-new", effort.getString("sessionId"))
        assertEquals(8, effort.getInt("rating"))
    }

    @Test
    fun `set completion reconciliation preserves a new wrist log when phone acknowledges an earlier undo`() {
        // Set A was confirmed by phone, then undone and re-logged on wrist before phone reports the undo.
        val synced = SetCompletionSync.reconcile(
            phoneDone = emptySet(),
            prevPhoneConfirmed = setOf("set-a", "set-b"),
            prevWristLogged = setOf("set-a"),
            prevPendingUnlogs = emptySet()
        )
        // set-a has an unconfirmed new wrist log so it must stay completed,
        // while set-b (removed by phone with no new wrist log) must be dropped.
        assertTrue(synced.completed.contains("set-a"))
        assertFalse(synced.completed.contains("set-b"))
        assertTrue(synced.wristLogged.contains("set-a"))
        assertFalse(synced.phoneConfirmed.contains("set-a"))
    }

    @Test
    fun `formatNumberClean respects the active locale decimal separator`() {
        assertEquals("12.5", formatNumberClean(12.5, java.util.Locale.US))
        assertEquals("12,5", formatNumberClean(12.5, java.util.Locale.GERMANY))
        assertEquals("185", formatNumberClean(185.0, java.util.Locale.GERMANY))
        assertEquals("–", formatNumberClean(null, java.util.Locale.US))
    }
}
