package com.sparkyapps.sparkyfitness.wear

import androidx.compose.ui.graphics.toArgb
import com.SparkyApps.SparkyFitnessMobile.R
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class WearOsParityTest {

    @Test
    fun `water context parsing, food hydration, and tap or delete outbound payloads`() {
        val today = CheckInDate.today()
        val rawCtx = JSONObject().apply {
            put("today", today)
            put("waterConsumedMl", 500.0)
            put("waterFromFoodMl", 120.0)
            put("waterGoalMl", 2500.0)
            put("waterDisplayUnit", "oz")
            put("containers", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", 42)
                    put("name", "Drip Coffee")
                    put("servingVolumeMl", 225.0)
                    put("unit", "oz")
                })
            })
            put("waterLog", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", "srv-1")
                    put("name", "Bottle")
                    put("volumeMl", 500.0)
                    put("time", "08:00")
                })
            })
        }

        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        assertNotNull(ctx.water)
        assertEquals(500.0, ctx.water!!.consumedMl, 0.01)
        assertEquals(120.0, ctx.water!!.fromFoodMl ?: 0.0, 0.01)
        assertEquals(1, ctx.water!!.log.size)
        assertEquals("Bottle", ctx.water!!.log.first().name)

        val dripCoffee = ctx.waterContainers!!.first()
        assertEquals(42, dripCoffee.id)
        assertEquals("Drip Coffee", dripCoffee.name)
        assertEquals(225.0, dripCoffee.servingVolumeMl, 0.01)
        assertEquals("8 oz", dripCoffee.displayVolume)

        // PendingWaterTap and PendingWaterDelete track optimistic hydration, deletions & ownerId
        val pendingTap = PendingWaterTap(
            id = "tap-1",
            volumeMl = dripCoffee.servingVolumeMl,
            containerId = dripCoffee.id,
            containerName = dripCoffee.name,
            createdAtMs = 1000L,
            day = today,
            state = SyncState.QUEUED,
            ownerId = "server-cfg-1"
        )
        assertTrue(pendingTap.isToday)
        assertEquals("Drip Coffee", pendingTap.containerName)
        assertEquals("server-cfg-1", pendingTap.ownerId)

        val tapPayload = OutboundPayloads.waterTap(
            pendingTap.id,
            today,
            dripCoffee.id,
            ownerId = pendingTap.ownerId
        )
        assertEquals("waterIntake", tapPayload.getString("type"))
        assertEquals("tap-1", tapPayload.getString("clientId"))
        assertEquals(42, tapPayload.getInt("containerId"))
        assertEquals("server-cfg-1", tapPayload.getString("ownerId"))

        val pendingDel = PendingWaterDelete(
            id = "del-1",
            entryId = "srv-1",
            volumeMl = 500.0,
            createdAtMs = 2000L,
            day = today,
            state = SyncState.QUEUED,
            ownerId = "server-cfg-1"
        )
        assertTrue(pendingDel.isToday)
        assertEquals(500.0, pendingDel.volumeMl, 0.01)
        assertEquals("server-cfg-1", pendingDel.ownerId)

        val delPayload = OutboundPayloads.waterDelete(
            pendingDel.id,
            pendingDel.entryId,
            ownerId = pendingDel.ownerId
        )
        assertEquals("waterDelete", delPayload.getString("type"))
        assertEquals("del-1", delPayload.getString("clientId"))
        assertEquals("srv-1", delPayload.getString("entryId"))
        assertEquals("server-cfg-1", delPayload.getString("ownerId"))

        val medPayload = OutboundPayloads.medicationTaken(
            clientId = "med-1",
            entryDate = today,
            medicationId = "m-1",
            scheduleId = "s-1",
            taken = true,
            ownerId = "server-cfg-1"
        )
        assertEquals("server-cfg-1", medPayload.getString("ownerId"))

        val fastStartPayload = OutboundPayloads.fastStart("16-8", "fast-1", ownerId = "server-cfg-1")
        assertEquals("server-cfg-1", fastStartPayload.getString("ownerId"))

        val fastEndPayload = OutboundPayloads.fastEnd("fast-2", ownerId = "server-cfg-1")
        assertEquals("server-cfg-1", fastEndPayload.getString("ownerId"))
    }

    @Test
    fun `weight check-in supports body fat percentage and history points`() {
        val rawCtx = JSONObject().apply {
            put("today", "2026-10-19")
            put("weightUnit", "lbs")
            put("lastWeightKg", 81.6466)
            put("lastBodyFatPercentage", 16.5)
            put("workoutServerId", "server-cfg-1")
            put("history", JSONArray().apply {
                for (i in 1..7) {
                    put(JSONObject().apply {
                        put("day", "2026-10-1$i")
                        put("weightKg", 80.0 + i * 0.2)
                        put("bodyFatPercentage", 16.0 + i * 0.1)
                    })
                }
            })
        }

        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        assertEquals(WeightUnit.LBS, ctx.effectiveWeightUnit)
        assertEquals(16.5, ctx.lastBodyFatPercentage ?: 0.0, 0.01)
        assertEquals("server-cfg-1", ctx.workoutServerId)
        assertEquals(7, ctx.history.size)
        assertEquals(16.1, ctx.history.first().bodyFatPercentage ?: 0.0, 0.01)

        val checkIn = CheckIn(
            id = "chk-1",
            entryDate = "2026-10-19",
            weightKg = 81.5,
            bodyFatPercentage = 16.2
        )
        val payload = OutboundPayloads.checkIn(checkIn, ownerId = ctx.workoutServerId)
        assertEquals("checkIn", payload.getString("type"))
        assertEquals(81.5, payload.getDouble("weightKg"), 0.01)
        assertEquals(16.2, payload.getDouble("bodyFatPercentage"), 0.01)
        assertEquals("server-cfg-1", payload.getString("ownerId"))
    }

    @Test
    fun `active workout plan parses PRs, timed sets, carry distance, interval timing, and mid-workout edit payloads`() {
        val planJson = JSONObject().apply {
            put("sessionId", "sess-1")
            put("workoutName", "Push & Carry")
            put("workoutFormat", "amrap")
            put("timeCapSeconds", 600)
            put("startedAt", "2026-10-19T12:00:00.000Z")
            put("armedAt", "2026-10-19T12:00:05.000Z")
            put("capEndsAt", "2026-10-19T12:10:05.000Z")
            put("fromPreset", true)
            put("prSetIds", JSONArray().apply { put("set-1") })
            put("setOrder", JSONArray().apply {
                put("set-1")
                put("set-2")
                put("set-3")
            })
            put("exercises", JSONArray().apply {
                put(JSONObject().apply {
                    put("exerciseEntryId", "we-1")
                    put("name", "Bench Press")
                    put("supersetRun", 1)
                    put("sets", JSONArray().apply {
                        put(JSONObject().apply {
                            put("setId", "set-1")
                            put("targetReps", 8.0)
                            put("targetWeightKg", 85.0)
                            put("setType", "normal")
                        })
                    })
                })
                put(JSONObject().apply {
                    put("exerciseEntryId", "we-2")
                    put("name", "Plank")
                    put("sets", JSONArray().apply {
                        put(JSONObject().apply {
                            put("setId", "set-2")
                            put("timed", true)
                            put("targetDurationSec", 60)
                        })
                    })
                })
                put(JSONObject().apply {
                    put("exerciseEntryId", "we-3")
                    put("name", "Farmer's Walk")
                    put("sets", JSONArray().apply {
                        put(JSONObject().apply {
                            put("setId", "set-3")
                            put("carry", true)
                            put("targetDistanceKm", 0.05)
                            put("targetWeightKg", 32.0)
                        })
                    })
                })
            })
        }

        val plan = ContextPayloadMapper.parseWorkoutPlan(planJson)
        assertNotNull(plan)
        assertTrue(plan!!.prSetIds.contains("set-1"))
        assertEquals("amrap", plan.workoutFormat)
        assertEquals(600, plan.timeCapSeconds)
        assertEquals(true, plan.fromPreset)
        assertEquals(1, plan.exercises[0].supersetRun)
        assertEquals(true, plan.exercises[1].sets[0].timed)
        assertEquals(true, plan.exercises[2].sets[0].carry)
        assertEquals(0.05, plan.exercises[2].sets[0].targetDistanceKm ?: 0.0, 0.001)

        // Verify mid-workout edit payloads
        val addSetPayload = OutboundPayloads.workoutEdit("sess-1", "c-1", WorkoutEditAction.AddSet("we-1"))
        assertEquals("addSet", addSetPayload.getString("action"))
        assertEquals("we-1", addSetPayload.getString("exerciseEntryId"))

        val setTypePayload = OutboundPayloads.workoutEdit("sess-1", "c-2", WorkoutEditAction.SetSetType("set-1", "drop"))
        assertEquals("setSetType", setTypePayload.getString("action"))
        assertEquals("drop", setTypePayload.getString("setType"))

        val addExPayload = OutboundPayloads.workoutEdit("sess-1", "c-3", WorkoutEditAction.AddExercise("ex-99"))
        assertEquals("addExercise", addExPayload.getString("action"))
        assertEquals("ex-99", addExPayload.getString("exerciseId"))

        // Timed set start & stop payloads
        val startTimerPayload = OutboundPayloads.setTimerStarted("sess-1", "set-2", 1000L, 900L)
        assertEquals("setTimerStarted", startTimerPayload.getString("type"))
        assertEquals("set-2", startTimerPayload.getString("setId"))

        val stopTimerPayload = OutboundPayloads.setTimerStopped("sess-1", "set-2", 62, 1000L)
        assertEquals("setTimerStopped", stopTimerPayload.getString("type"))
        assertEquals(62, stopTimerPayload.getInt("seconds"))

        // Preset update answer payload
        val presetAns = OutboundPayloads.presetUpdateAnswer("sess-1", true)
        assertEquals("presetUpdateAnswer", presetAns.getString("type"))
        assertTrue(presetAns.getBoolean("update"))

        // Interval timing update parsing
        val timingJson = JSONObject().apply {
            put("sessionId", "sess-1")
            put("armedAt", "2026-10-19T12:00:05.000Z")
            put("capEndsAt", "2026-10-19T12:10:05.000Z")
            put("excludedPauseSeconds", 15)
        }
        val timing = ContextPayloadMapper.parseIntervalTiming(timingJson)
        assertNotNull(timing)
        assertEquals(15, timing!!.excludedPauseSeconds)
    }

    @Test
    fun `wrist cardio run plan, distance calibration result, and voice cue payloads`() {
        val rawCtx = JSONObject().apply {
            put("runVoiceCues", true)
            put("runAutoPause", true)
            put("runCheckInMinutes", 5)
            put("runPaceMinSecondsPerKm", 270.0)
            put("runPaceMaxSecondsPerKm", 330.0)
            put("runHeartRateMinBpm", 135.0)
            put("runHeartRateMaxBpm", 165.0)
            put("indoorDistanceScale", JSONObject().apply {
                put("walk", 0.95)
                put("run", 1.08)
            })
            put("runPlans", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", "plan-5k")
                    put("name", "5K Intervals")
                    put("activity", "run")
                    put("steps", JSONArray().apply {
                        put(JSONObject().apply {
                            put("label", "Warm Up")
                            put("seconds", 300.0)
                        })
                        put(JSONObject().apply {
                            put("label", "Fast")
                            put("seconds", 120.0)
                            put("paceMin", 240.0)
                            put("paceMax", 270.0)
                        })
                    })
                })
            })
        }

        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        assertEquals(true, ctx.runVoiceCues)
        assertEquals(true, ctx.runAutoPause)
        assertEquals(5, ctx.runCheckInMinutes)
        assertEquals(270.0, ctx.runPaceBand!!.minSecondsPerKm, 0.01)
        assertEquals(135.0, ctx.runHeartRateBand!!.minBpm, 0.01)
        assertEquals(1.08, ctx.indoorDistanceScale!!.run, 0.01)
        assertEquals(1, ctx.runPlans!!.size)
        assertEquals("5K Intervals", ctx.runPlans!!.first().name)

        // Calibrated indoor run result payload
        val runResult = WatchRunResult(
            clientId = "run-1",
            kind = "run",
            place = "indoor",
            startedAtMs = 1000L,
            endedAtMs = 1801000L,
            activeSeconds = 1800,
            distanceMeters = 5000.0,
            activeEnergyKcal = 380.0,
            laps = listOf(600.0, 1200.0),
            lapDistances = listOf(1609.0, 3218.0),
            plan = ctx.runPlans!!.first(),
            planCompleted = true,
            distanceScale = 1.05,
            estimatedDistanceMeters = 4760.0
        )
        val finishedJson = OutboundPayloads.runFinished(runResult)
        assertEquals("runFinished", finishedJson.getString("type"))
        assertEquals(5000.0, finishedJson.getDouble("distanceMeters"), 0.01)
        assertEquals(4760.0, finishedJson.getDouble("estimatedDistanceMeters"), 0.01)
        assertEquals(1.05, finishedJson.getDouble("distanceScale"), 0.01)
        assertEquals(2, finishedJson.getJSONArray("laps").length())

        val cueJson = OutboundPayloads.runCue("cue-1", "Lap 1 complete")
        assertEquals("runCue", cueJson.getString("type"))
        assertEquals("Lap 1 complete", cueJson.getString("text"))
    }

    @Test
    fun `phone GPS recording state parses pace and builds lap and heartRate payloads`() {
        val recJson = JSONObject().apply {
            put("sessionId", "rec-1")
            put("activity", "run")
            put("indoor", false)
            put("status", "recording")
            put("startedAt", 1000.0)
            put("distanceMeters", 1609.34)
            put("paceSeconds", 300.0)
            put("distanceUnit", "mi")
            put("lapCount", 2)
            put("sentAt", 2000.0)
        }
        val state = ContextPayloadMapper.parseRecordingState(recJson)
        assertNotNull(state)
        assertEquals(300.0, state!!.paceSeconds ?: 0.0, 0.01)
        assertTrue(state.usesMiles)
        assertEquals(2, state.lapCount)

        val lapPayload = OutboundPayloads.recordingControl("rec-1", "lap", 3000L)
        assertEquals("recordingControl", lapPayload.getString("type"))
        assertEquals("lap", lapPayload.getString("action"))

        val hrPayload = OutboundPayloads.recordingHeartRate(
            "rec-1",
            "hr-batch-1",
            listOf(HeartRateSample("2026-10-19T12:00:00.000Z", 152.0))
        )
        assertEquals("recordingHeartRate", hrPayload.getString("type"))
        assertEquals(1, hrPayload.getJSONArray("samples").length())
    }

    @Test
    fun `macro goals parse for complications and NOW_PLAYING page inserts automatically when workoutActive is true`() {
        val rawCtx = JSONObject().apply {
            put("today", "2026-10-19")
            put("caloriesConsumed", 1800.0)
            put("caloriesBurned", 400.0)
            put("caloriesRemaining", 600.0)
            put("calorieGoalProgress", 0.75)
            put("proteinConsumed", 140.0)
            put("proteinGoal", 180.0)
            put("proteinGoalProgress", 0.78)
            put("carbsConsumed", 200.0)
            put("carbsGoal", 250.0)
            put("carbsGoalProgress", 0.80)
            put("fatConsumed", 55.0)
            put("fatGoal", 70.0)
            put("fatGoalProgress", 0.79)
            put("pageOrder", JSONArray().apply {
                put("goals")
                put("workout")
                put("water")
            })
        }
        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        assertNotNull(ctx.nutrition)
        assertEquals(140.0, ctx.nutrition!!.protein.consumed, 0.01)
        assertEquals(180.0, ctx.nutrition!!.protein.goal, 0.01)
        assertEquals(200.0, ctx.nutrition!!.carbs.consumed, 0.01)
        assertEquals(55.0, ctx.nutrition!!.fat.consumed, 0.01)

        val idlePages = ctx.visiblePages(workoutActive = false)
        assertFalse(idlePages.contains(WatchPage.NOW_PLAYING))

        val activePages = ctx.visiblePages(workoutActive = true)
        assertTrue(activePages.contains(WatchPage.NOW_PLAYING))
        val workoutIdx = activePages.indexOf(WatchPage.WORKOUT)
        val nowPlayingIdx = activePages.indexOf(WatchPage.NOW_PLAYING)
        assertEquals(workoutIdx + 1, nowPlayingIdx)
    }

    @Test
    fun `tiles models build nutrition, sleep, medications, and exercise summaries`() {
        val today = CheckInDate.today()
        val rawCtx = JSONObject().apply {
            put("today", today)
            put("caloriesConsumed", 1650.0)
            put("caloriesBurned", 380.0)
            put("caloriesRemaining", 550.0)
            put("calorieGoalProgress", 0.75)
            put("proteinConsumed", 130.0)
            put("proteinGoal", 170.0)
            put("proteinGoalProgress", 0.76)
            put("carbsConsumed", 180.0)
            put("carbsGoal", 220.0)
            put("carbsGoalProgress", 0.82)
            put("fatConsumed", 50.0)
            put("fatGoal", 65.0)
            put("fatGoalProgress", 0.77)
            put("goalNutrients", JSONArray().apply {
                put(JSONObject().apply {
                    put("key", "protein")
                    put("label", "Protein")
                    put("unit", "g")
                    put("consumed", 130.0)
                    put("goal", 170.0)
                    put("progress", 0.76)
                })
                put(JSONObject().apply {
                    put("key", "dietary_fiber")
                    put("label", "Fiber")
                    put("unit", "g")
                    put("consumed", 24.0)
                    put("goal", 32.0)
                    put("progress", 0.75)
                })
            })
            put("sleep", JSONObject().apply {
                put("day", today)
                put("totalSeconds", 27900)
                put("timeInBedSeconds", 28800)
                put("sleepScore", 86)
                put("bedtime", "11:00 PM")
                put("wakeTime", "6:45 AM")
                put("deepSeconds", 5400)
                put("remSeconds", 6000)
                put("lightSeconds", 16500)
                put("restingHeartRate", 54)
                put("hrvMs", 64)
            })
            put("medications", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", "m1:s1")
                    put("medicationId", "m1")
                    put("scheduleId", "s1")
                    put("name", "Vitamin D")
                    put("detail", "2000 IU")
                    put("time", "08:00 AM")
                    put("status", "taken")
                })
                put(JSONObject().apply {
                    put("id", "m2:s2")
                    put("medicationId", "m2")
                    put("scheduleId", "s2")
                    put("name", "Magnesium")
                    put("detail", "400 mg")
                    put("time", "09:00 PM")
                    put("status", "pending")
                })
            })
            put("exerciseSummary", JSONObject().apply {
                put("day", today)
                put("minutes", 45)
                put("minutesGoal", 60)
                put("calories", 380)
                put("caloriesGoal", 500)
                put("sessionCount", 1)
                put("sessions", JSONArray().apply {
                    put(JSONObject().apply {
                        put("name", "Upper Body Push")
                        put("durationMinutes", 45)
                        put("calories", 380)
                    })
                })
            })
        }

        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)

        val nutritionTile = TileModels.buildNutritionTileModel(ctx.nutrition)
        assertTrue(nutritionTile.hasData)
        assertEquals(1650, nutritionTile.consumedKcal)
        assertEquals(2200, nutritionTile.goalKcal)
        assertEquals(2, nutritionTile.macros.size)
        assertEquals("Protein", nutritionTile.macros[0].label)
        assertEquals("130/170g", nutritionTile.macros[0].valueText)
        assertEquals(SparkyColors.Cyan.toArgb(), nutritionTile.macros[0].colorArgb)
        assertEquals("Fiber", nutritionTile.macros[1].label)
        assertEquals("24/32g", nutritionTile.macros[1].valueText)
        assertEquals(SparkyColors.Green.toArgb(), nutritionTile.macros[1].colorArgb)

        val resolveString: (Int, Array<out Any>) -> String = { id, args ->
            when (id) {
                R.string.tile_sleep_no_logged -> "No sleep logged today"
                R.string.tile_sleep_in_bed -> "In bed ${args[0]}"
                R.string.tile_meds_not_synced -> "Not synced"
                R.string.tile_meds_taken_count -> "${args[0]} / ${args[1]} Taken"
                R.string.tile_meds_open_app -> "Open app to sync"
                R.string.tile_meds_none_today -> "No doses scheduled today"
                R.string.tile_meds_pending_today -> "${args[0]} pending today"
                R.string.tile_meds_skipped_done -> "${args[0]} skipped \u00B7 All done"
                R.string.tile_meds_all_done -> "All doses completed"
                R.string.tile_exercise_steps_count -> "${args[0]} steps"
                R.string.tile_exercise_goal_minutes -> "Goal ${args[0]}m"
                R.string.tile_exercise_planned_today -> "Workout planned today"
                R.string.tile_exercise_tap_start -> "Tap to start a workout"
                else -> error("Unexpected string resource id: $id")
            }
        }
        val resolvePlural: (Int, Int, Array<out Any>) -> String = { id, qty, args ->
            when (id) {
                R.plurals.tile_sleep_naps -> if (qty == 1) "${args[0]} nap (${args[1]})" else "${args[0]} naps (${args[1]})"
                R.plurals.tile_exercise_workouts -> if (qty == 1) "${args[0]} workout" else "${args[0]} workouts"
                else -> error("Unexpected plural resource id: $id")
            }
        }

        val sleepTile = TileModels.buildSleepTileModel(ctx.sleep)
        assertTrue(sleepTile.hasData)
        assertEquals("7h 45m", TileModels.formatSleepDuration(sleepTile, resolveString))
        assertEquals(86, sleepTile.sleepScore)
        assertEquals(SleepWindow.BedWake("11:00 PM", "6:45 AM"), sleepTile.window)
        assertEquals("11:00 PM \u2013 6:45 AM", TileModels.formatSleepWindow(sleepTile.window, resolveString, resolvePlural))
        assertEquals(3, sleepTile.stages.size)
        assertEquals(R.string.sleep_stage_deep, sleepTile.stages[0].labelRes)
        assertEquals(R.string.sleep_stage_rem, sleepTile.stages[1].labelRes)
        assertEquals(R.string.sleep_stage_light, sleepTile.stages[2].labelRes)
        assertEquals("RHR 54bpm \u00B7 HRV 64ms", sleepTile.biometricsText)

        val medsTile = TileModels.buildMedicationsTileModel(ctx.medications)
        assertTrue(medsTile.hasData)
        assertEquals(1, medsTile.takenCount)
        assertEquals(2, medsTile.totalCount)
        assertEquals(1, medsTile.pendingCount)
        assertEquals("1 / 2 Taken", TileModels.formatMedicationsHeadline(medsTile, resolveString))
        assertEquals("1 pending today", TileModels.formatMedicationsSubtitle(medsTile, resolveString))
        assertEquals("Magnesium", medsTile.doseRows[0].name)

        val exerciseTile = TileModels.buildExerciseTileModel(
            exercise = ctx.exerciseSummary,
            scheduledWorkouts = emptyList(),
            steps = null,
            stepGoal = 10000
        )
        assertTrue(exerciseTile.hasData)
        assertEquals(45, exerciseTile.minutes)
        assertEquals(60, exerciseTile.minutesGoal)
        assertEquals("45m \u00B7 380/500 kcal", TileModels.formatExerciseHeadline(exerciseTile, resolveString))
        assertEquals("Goal 60m \u00B7 1 workout", TileModels.formatExerciseSubtitle(exerciseTile, resolveString, resolvePlural))
        assertEquals("Upper Body Push", exerciseTile.rows[0].title)
    }

    @Test
    fun `a feature turned off in the phone app hides its page and turns its tile off`() {
        fun names(vararg keys: String) = JSONArray().apply { keys.forEach { put(it) } }
        val off = ContextPayloadMapper.parseContext(JSONObject().apply {
            put("hiddenPages", names("trend", "medications"))
            put("offFeatures", names("medications"))
        }, WatchContext.empty)
        assertEquals(listOf("medications"), off.offFeatures)
        assertTrue(off.isFeatureOff("medications"))
        assertFalse(off.visiblePages(workoutActive = false).contains(WatchPage.MEDICATIONS))

        // The watch drops the page even when the hidden list does not name it.
        val notHidden = ContextPayloadMapper.parseContext(JSONObject().apply {
            put("hiddenPages", names())
            put("offFeatures", names("medications"))
        }, WatchContext.empty)
        assertFalse(notHidden.visiblePages(workoutActive = false).contains(WatchPage.MEDICATIONS))
        assertTrue(notHidden.visiblePages(workoutActive = false).contains(WatchPage.WATER))

        // Kept while the phone leaves it out; an empty list turns it back on.
        val carried = ContextPayloadMapper.parseContext(JSONObject().apply {
            put("today", CheckInDate.today())
        }, off)
        assertEquals(listOf("medications"), carried.offFeatures)
        val backOn = ContextPayloadMapper.parseContext(JSONObject().apply {
            put("hiddenPages", names("trend"))
            put("offFeatures", names())
        }, off)
        assertFalse(backOn.isFeatureOff("medications"))
        assertTrue(backOn.visiblePages(workoutActive = false).contains(WatchPage.MEDICATIONS))

        // Goals when the page of the feature was the only one shown.
        val onlyMedications = ContextPayloadMapper.parseContext(JSONObject().apply {
            put(
                "hiddenPages",
                names(*WatchPage.defaultOrder.filter { it != WatchPage.MEDICATIONS }.map { it.key }.toTypedArray())
            )
            put("offFeatures", names("medications"))
        }, WatchContext.empty)
        assertEquals(listOf(WatchPage.GOALS), onlyMedications.visiblePages(workoutActive = false))

        val resolveString: (Int, Array<out Any>) -> String = { id, _ ->
            when (id) {
                R.string.tile_meds_turned_off -> "Turned off"
                R.string.tile_meds_turned_off_hint -> "Turn on in the phone app"
                else -> error("Unexpected string resource id: $id")
            }
        }
        val tile = TileModels.buildMedicationsTileModel(medications = null, turnedOff = true)
        assertTrue(tile.turnedOff)
        assertEquals(0f, tile.progress, 0f)
        assertTrue(tile.doseRows.isEmpty())
        assertEquals("Turned off", TileModels.formatMedicationsHeadline(tile, resolveString))
        assertEquals("Turn on in the phone app", TileModels.formatMedicationsSubtitle(tile, resolveString))
        assertFalse(TileModels.buildMedicationsTileModel(medications = null).turnedOff)

        // The complication says it is off instead of asking for a sync.
        val offSpec = ComplicationModels.buildMedicationsSpec(medications = null, turnedOff = true)
        assertEquals("Off", offSpec.shortText)
        assertEquals("Turned off", offSpec.longText)
        assertEquals("Medications turned off", offSpec.contentDescription)
        assertEquals(0f, offSpec.progressValue, 0f)
        assertEquals("Not synced", ComplicationModels.buildMedicationsSpec(medications = null).longText)
    }

    @Test
    fun `the context kept for a restart keeps the page layout the phone left out`() {
        fun names(vararg keys: String) = JSONArray().apply { keys.forEach { put(it) } }
        val full = JSONObject().apply {
            put("pageOrder", names("goals", "water"))
            put("hiddenPages", names("medications"))
            put("offFeatures", names("medications"))
        }
        val first = ContextPayloadMapper.parseContext(full, WatchContext.empty)
        assertEquals(full.toString(), ContextPayloadMapper.persistableContextJson(full.toString(), first))

        // A push sent while the phone did not know its feature choices.
        val partial = JSONObject().apply {
            put("today", CheckInDate.today())
            put("pageOrder", names("water", "goals"))
        }
        val second = ContextPayloadMapper.parseContext(partial, first)
        val kept = JSONObject(ContextPayloadMapper.persistableContextJson(partial.toString(), second))
        val restored = ContextPayloadMapper.parseContext(kept, WatchContext.empty)
        assertEquals(listOf("water", "goals"), restored.pageOrder)
        assertEquals(listOf("medications"), restored.hiddenPages)
        assertEquals(listOf("medications"), restored.offFeatures)
        assertFalse(restored.visiblePages(workoutActive = false).contains(WatchPage.MEDICATIONS))
    }

    @Test
    fun `phone media state parses metadata, volume percentage, and outbound payloads`() {
        val fullJson = JSONObject().apply {
            put("type", "mediaState")
            put("title", "  Blinding Lights  ")
            put("artist", "The Weeknd")
            put("album", "After Hours")
            put("appName", "Symfonium")
            put("isPlaying", true)
            put("volume", 9)
            put("maxVolume", 15)
            put("hasSession", true)
            put("hasMetadataAccess", true)
            put("epoch", 1760000000000.0)
            put("seq", 7.0)
            put("updatedAt", 1760000000000.0)
        }
        val state = ContextPayloadMapper.parsePhoneMediaState(fullJson)
        assertEquals("Blinding Lights", state.title)
        assertEquals("The Weeknd", state.artist)
        assertEquals("After Hours", state.album)
        assertEquals("Symfonium", state.appName)
        assertEquals("The Weeknd", state.secondaryLabel)
        assertTrue(state.isPlaying)
        assertEquals(60, state.volumePercent)
        assertTrue(state.hasSession)
        assertTrue(state.hasMetadataAccess)
        assertEquals(1760000000000L, state.epoch)
        assertEquals(7L, state.seq)

        val fallbackJson = JSONObject().apply {
            put("type", "mediaState")
            put("isPlaying", true)
            put("volume", 20)
            put("maxVolume", 15)
            put("hasSession", true)
            put("hasMetadataAccess", false)
        }
        val fallback = ContextPayloadMapper.parsePhoneMediaState(fallbackJson)
        assertNull(fallback.title)
        assertNull(fallback.secondaryLabel)
        assertEquals(15, fallback.volume)
        assertEquals(100, fallback.volumePercent)
        assertFalse(fallback.hasMetadataAccess)
        assertEquals(0L, fallback.epoch)
        assertEquals(0L, fallback.seq)

        val noArtist = PhoneMediaState(title = "Track", artist = "  ", appName = "Symfonium")
        assertEquals("Symfonium", noArtist.secondaryLabel)

        val control = OutboundPayloads.mediaControl("next")
        assertEquals("mediaControl", control.getString("type"))
        assertEquals("next", control.getString("action"))
        assertFalse(control.has("steps"))

        val multiStepVol = OutboundPayloads.mediaControl("volumeUp", steps = 3)
        assertEquals("volumeUp", multiStepVol.getString("action"))
        assertEquals(3, multiStepVol.getInt("steps"))

        val req = OutboundPayloads.mediaStateRequest(active = true, epoch = 100L, visitId = 42L)
        assertEquals("mediaStateRequest", req.getString("type"))
        assertTrue(req.getBoolean("active"))
        assertEquals(100L, req.getDouble("epoch").toLong())
        assertEquals(42L, req.getDouble("visitId").toLong())
    }

    @Test
    fun `media snapshot ordering rejects stale seq within epoch and accepts new epoch across clock rollback`() {
        val current = PhoneMediaState(title = "Current", epoch = 200L, seq = 5L, updatedAtMs = 5000L)

        // First snapshot is always accepted.
        assertTrue(MediaControlLogic.shouldAcceptSnapshot(current, null))
        // Newer seq in same epoch is accepted, even if wall clock jumped backward.
        assertTrue(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "Next", epoch = 200L, seq = 6L, updatedAtMs = 1000L),
                current
            )
        )
        // Reordered earlier seq in same epoch is rejected.
        assertFalse(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "Stale", epoch = 200L, seq = 4L, updatedAtMs = 9000L),
                current
            )
        )
        // Higher producer epoch (phone restart) is accepted even with lower seq and earlier clock.
        assertTrue(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "Restarted", epoch = 201L, seq = 1L, updatedAtMs = 1000L),
                current
            )
        )
        // Delayed delivery from a retired producer epoch is rejected.
        assertFalse(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "OldEpoch", epoch = 199L, seq = 99L, updatedAtMs = 9999L),
                current
            )
        )
        // Legacy snapshots without epoch fall back to updatedAtMs.
        val legacyCurrent = PhoneMediaState(title = "Legacy", updatedAtMs = 5000L)
        assertTrue(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "LegacyNew", updatedAtMs = 5001L),
                legacyCurrent
            )
        )
        assertFalse(
            MediaControlLogic.shouldAcceptSnapshot(
                PhoneMediaState(title = "LegacyOld", updatedAtMs = 4999L),
                legacyCurrent
            )
        )
    }

    @Test
    fun `media control target resolves phone by default and falls back to watch when offline or watch plays locally`() {
        val phonePlaying = PhoneMediaState(isPlaying = true, hasSession = true)
        val phonePaused = PhoneMediaState(isPlaying = false, hasSession = true)

        assertEquals(
            MediaTarget.PHONE,
            MediaControlLogic.resolveEffectiveTarget(
                manualTarget = null,
                phoneReachable = true,
                watchMusicActive = false,
                phoneMedia = phonePlaying
            )
        )
        assertEquals(
            MediaTarget.WATCH,
            MediaControlLogic.resolveEffectiveTarget(
                manualTarget = null,
                phoneReachable = true,
                watchMusicActive = true,
                phoneMedia = phonePaused
            )
        )
        assertEquals(
            MediaTarget.PHONE,
            MediaControlLogic.resolveEffectiveTarget(
                manualTarget = null,
                phoneReachable = true,
                watchMusicActive = true,
                phoneMedia = phonePlaying
            )
        )
        assertEquals(
            MediaTarget.WATCH,
            MediaControlLogic.resolveEffectiveTarget(
                manualTarget = MediaTarget.PHONE,
                phoneReachable = false,
                watchMusicActive = false,
                phoneMedia = phonePlaying
            )
        )
        assertEquals(
            MediaTarget.WATCH,
            MediaControlLogic.resolveEffectiveTarget(
                manualTarget = MediaTarget.WATCH,
                phoneReachable = true,
                watchMusicActive = false,
                phoneMedia = phonePlaying
            )
        )
    }

    @Test
    fun `water and weight tile models format presets, sparkline bars, deltas, and pending medication rows`() {
        val today = CheckInDate.today()
        val medSnap = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("m1:s1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.TAKEN),
                MedicationDose("m2:s2", "m2", "s2", "Magnesium", "400 mg", "09:00 PM", MedicationDoseStatus.PENDING)
            )
        )
        val medTile = TileModels.buildMedicationsTileModel(medSnap)
        assertEquals("m2:s2", medTile.doseRows[0].doseId)
        assertTrue(medTile.doseRows[0].isPending)
        assertEquals("m1:s1", medTile.doseRows[1].doseId)
        assertFalse(medTile.doseRows[1].isPending)

        val syncedContainers = listOf(
            WaterContainer(id = 10, name = "Glass", servingVolumeMl = 250.0, unit = "ml"),
            WaterContainer(id = 11, name = "Bottle", servingVolumeMl = 500.0, unit = "ml")
        )
        val waterCtx = WatchContext(waterDisplayUnit = "ml")
        val unsyncedWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 250.0,
            watchCtx = waterCtx,
            containers = emptyList(),
            locale = Locale.US
        )
        assertTrue(unsyncedWaterTile.containers.isEmpty())

        val waterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 250.0,
            watchCtx = waterCtx,
            containers = syncedContainers,
            locale = Locale.US
        )
        assertTrue(waterTile.hasOwner)
        assertEquals("1500 ml", waterTile.consumedText)
        assertEquals("2500 ml", waterTile.goalText)
        assertEquals("1000 ml", waterTile.remainingText)
        assertFalse(waterTile.isGoalMet)
        assertEquals("250 ml", waterTile.queuedText)
        assertEquals(0.6f, waterTile.progress, 0.001f)
        assertEquals(2, waterTile.containers.size)
        assertEquals("+250 ml", waterTile.containers[0].addText)
        assertEquals("+500 ml", waterTile.containers[1].addText)
        assertFalse(waterTile.syncFailed)

        val ozWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 0.0,
            goalMl = 2500.0,
            queuedMl = 0.0,
            watchCtx = WatchContext(waterDisplayUnit = "oz"),
            containers = syncedContainers,
            locale = Locale.US
        )
        assertEquals("+8.5 oz", ozWaterTile.containers[0].addText)
        assertEquals("+16.9 oz", ozWaterTile.containers[1].addText)

        val deOzWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 250.0,
            watchCtx = WatchContext(waterDisplayUnit = "oz"),
            containers = syncedContainers,
            locale = Locale.GERMANY
        )
        assertEquals("+8,5 oz", deOzWaterTile.containers[0].addText)
        assertEquals("50,7 oz", deOzWaterTile.consumedText)
        assertEquals("84,5 oz", deOzWaterTile.goalText)

        val deLiterWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 0.0,
            watchCtx = WatchContext(waterDisplayUnit = "liter"),
            containers = syncedContainers,
            locale = Locale.GERMANY
        )
        assertEquals("1,50L", deLiterWaterTile.consumedText)
        assertEquals("2,50L", deLiterWaterTile.goalText)
        assertEquals("+0,25L", deLiterWaterTile.containers[0].addText)

        // Native-digit locale must localize milliliter digits as well
        val arLocale = Locale.forLanguageTag("ar-EG")
        val arMlWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 250.0,
            watchCtx = waterCtx,
            containers = syncedContainers,
            locale = arLocale
        )
        assertEquals(String.format(arLocale, "%d ml", 1500), arMlWaterTile.consumedText)
        assertEquals("+${String.format(arLocale, "%d ml", 250)}", arMlWaterTile.containers[0].addText)

        val failedWaterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 1500.0,
            goalMl = 2500.0,
            queuedMl = 0.0,
            watchCtx = waterCtx,
            containers = syncedContainers,
            waterSyncState = SyncState.FAILED,
            locale = Locale.US
        )
        assertTrue(failedWaterTile.syncFailed)

        val history = listOf(
            HistoryPoint("2026-01-01", 82.0, 17.4),
            HistoryPoint("2026-01-02", 81.6, null),
            HistoryPoint("2026-01-03", 81.2, 17.0),
            HistoryPoint(today, 80.5, 16.8)
        )
        val weightCtx = WatchContext(
            today = today,
            todayWeightKg = 81.0,
            todayBodyFatPercentage = 16.8,
            weightUnit = WeightUnit.KG
        )
        val weightTile = TileModels.buildWeightTileModel(
            watchCtx = weightCtx,
            history = history,
            unit = WeightUnit.KG,
            today = today
        )
        assertTrue(weightTile.hasData)
        assertTrue(weightTile.loggedToday)
        assertEquals(1.0f, weightTile.progress, 0.001f)
        assertEquals("81.0 kg", weightTile.weightValueText)
        assertEquals(-0.2, weightTile.stepDelta ?: 0.0, 0.01)
        assertEquals(-1.0, weightTile.trendDelta ?: 0.0, 0.01)
        assertEquals(4, weightTile.trendCount)
        assertEquals(16.8, weightTile.bodyFatPercent ?: 0.0, 0.01)
        assertEquals(4, weightTile.sparklineFractions.size)
        assertEquals(1.0f, weightTile.sparklineFractions.first(), 0.01f)
        assertEquals(0.0f, weightTile.sparklineFractions.last(), 0.01f)
    }

    @Test
    fun `complication models build calories remaining, sleep, meds, exercise live-or-scheduled, and weight specs`() {
        val today = CheckInDate.today()
        val nutrition = NutritionSnapshot(
            day = today,
            caloriesConsumed = 1650.0,
            caloriesBurned = 380.0,
            caloriesRemaining = 550.0,
            calorieProgress = 0.75,
            carbs = MacroGoal(180.0, 220.0, 0.82),
            fat = MacroGoal(50.0, 65.0, 0.77),
            protein = MacroGoal(130.0, 170.0, 0.76),
            rows = null
        )
        val calRem = ComplicationModels.buildCaloriesRemainingSpec(nutrition, EnergyDisplay.KCAL)
        assertEquals("550", calRem.shortText)
        assertTrue(calRem.shortText.length <= 7)
        assertEquals("left", calRem.shortTitle)
        assertEquals("550 kcal left \u00B7 130/170g P", calRem.longText)
        assertEquals("C 180g \u00B7 F 50g", calRem.longTitle)
        assertEquals("550 kcal left \u00B7 130/170g P \u00B7 C 180g \u00B7 F 50g", calRem.contentDescription)
        assertEquals(550f, calRem.progressValue, 0.1f)
        assertEquals(2200f, calRem.goalValue, 0.1f)
        assertEquals(550f, calRem.rangedValueOverride ?: -1f, 0.1f)

        val calRemKj = ComplicationModels.buildCaloriesRemainingSpec(nutrition, EnergyDisplay(isKj = true))
        assertEquals("2301kJ", calRemKj.shortText)
        assertTrue(calRemKj.shortText.length <= 7)
        assertEquals("left", calRemKj.shortTitle)

        val overNutrition = nutrition.copy(caloriesConsumed = 2320.0, caloriesRemaining = -120.0)
        val calOver = ComplicationModels.buildCaloriesRemainingSpec(overNutrition, EnergyDisplay.KCAL)
        assertEquals("-120", calOver.shortText)
        assertTrue(calOver.shortText.length <= 7)
        assertEquals("over", calOver.shortTitle)
        assertEquals("120 kcal over \u00B7 130/170g P", calOver.longText)
        assertEquals(0f, calOver.progressValue, 0.1f)
        assertEquals(0f, calOver.rangedValueOverride ?: -1f, 0.1f)

        val overKj = ComplicationModels.buildCaloriesRemainingSpec(
            nutrition.copy(caloriesConsumed = 5200.0, caloriesRemaining = -3000.0),
            EnergyDisplay(isKj = true)
        )
        assertEquals("-13k kJ", overKj.shortText)
        assertTrue(overKj.shortText.length <= 7)
        assertEquals("over", overKj.shortTitle)

        val extremeOverKj = ComplicationModels.buildCaloriesRemainingSpec(
            nutrition.copy(caloriesConsumed = 26000.0, caloriesRemaining = -23805.0),
            EnergyDisplay(isKj = true)
        )
        assertEquals("-100kkJ", extremeOverKj.shortText)
        assertTrue(extremeOverKj.shortText.length <= 7)

        val bfOnlyTodayTile = TileModels.buildWeightTileModel(
            watchCtx = WatchContext(today = today, todayWeightKg = null, todayBodyFatPercentage = 16.8),
            history = listOf(HistoryPoint("2026-01-01", 81.2, 17.4)),
            unit = WeightUnit.KG,
            today = today
        )
        assertFalse(bfOnlyTodayTile.loggedToday)
        assertEquals(16.8, bfOnlyTodayTile.bodyFatPercent ?: 0.0, 0.01)

        val bfWithoutAnyWeightTile = TileModels.buildWeightTileModel(
            watchCtx = WatchContext(today = today, todayWeightKg = null, todayBodyFatPercentage = 16.8),
            history = emptyList(),
            unit = WeightUnit.KG,
            today = today
        )
        assertTrue(bfWithoutAnyWeightTile.hasData)
        assertFalse(bfWithoutAnyWeightTile.hasWeight)
        assertFalse(bfWithoutAnyWeightTile.loggedToday)
        assertEquals(16.8, bfWithoutAnyWeightTile.bodyFatPercent ?: 0.0, 0.01)
        val bfOnlySpec = ComplicationModels.buildWeightSpec(bfWithoutAnyWeightTile)
        assertEquals("16.8%", bfOnlySpec.shortText)
        assertEquals("BF", bfOnlySpec.shortTitle)
        assertEquals("BF 16.8%", bfOnlySpec.longText)

        // Body-fat-only snapshot retains latest dated body fat after midnight rollover
        val afterMidnightBfTile = TileModels.buildWeightTileModel(
            watchCtx = WatchContext(
                today = "2026-01-01",
                todayBodyFatPercentage = 21.0
            ),
            history = emptyList(),
            unit = WeightUnit.KG,
            today = "2026-01-02"
        )
        assertTrue(afterMidnightBfTile.hasData)
        assertFalse(afterMidnightBfTile.hasWeight)
        assertEquals(21.0, afterMidnightBfTile.bodyFatPercent ?: 0.0, 0.01)

        // Context lastBodyFatPercentage fills matching history date when history row omits bodyFatPercentage
        val mergedLastBfTile = TileModels.buildWeightTileModel(
            watchCtx = WatchContext(
                today = today,
                lastEntryDate = "2026-01-02",
                lastWeightKg = 80.0,
                lastBodyFatPercentage = 20.0
            ),
            history = listOf(
                HistoryPoint("2026-01-01", 80.5, 25.0),
                HistoryPoint("2026-01-02", 80.0, null)
            ),
            unit = WeightUnit.KG,
            today = today
        )
        assertEquals(20.0, mergedLastBfTile.bodyFatPercent ?: 0.0, 0.01)

        val sleepScored = SleepSnapshot(
            day = today,
            totalSeconds = 7 * 3600 + 24 * 60,
            timeInBedSeconds = 8 * 3600,
            sleepScore = 84,
            bedtime = "11:00 PM",
            wakeTime = "6:24 AM"
        )
        val sleepSpec = ComplicationModels.buildSleepSpec(sleepScored)
        assertEquals("84", sleepSpec.shortText)
        assertEquals("7h 24m", sleepSpec.shortTitle)
        assertEquals("Sleep 7h 24m \u00B7 Score 84", sleepSpec.longText)
        assertEquals(84f, sleepSpec.progressValue, 0.01f)
        assertEquals(100f, sleepSpec.goalValue, 0.01f)

        val sleepUnscored = sleepScored.copy(sleepScore = null)
        val unscoredSpec = ComplicationModels.buildSleepSpec(sleepUnscored)
        assertEquals("7h 24m", unscoredSpec.shortText)
        assertEquals(null, unscoredSpec.shortTitle)
        assertEquals(8f, unscoredSpec.goalValue, 0.01f)

        val inBedOnly = sleepScored.copy(totalSeconds = 0, sleepScore = null)
        val inBedSpec = ComplicationModels.buildSleepSpec(inBedOnly)
        assertEquals("8h 0m", inBedSpec.shortText)
        assertEquals("In bed", inBedSpec.shortTitle)
        assertEquals("In bed 8h 0m", inBedSpec.longText)
        assertEquals("In bed 8h 0m", inBedSpec.contentDescription)
        assertEquals(0f, inBedSpec.progressValue, 0.01f)

        val scoredInBedOnly = sleepScored.copy(totalSeconds = 0, sleepScore = 84)
        val scoredInBedSpec = ComplicationModels.buildSleepSpec(scoredInBedOnly)
        assertEquals("84", scoredInBedSpec.shortText)
        assertEquals("In bed", scoredInBedSpec.shortTitle)
        assertEquals("In bed 8h 0m \u00B7 Score 84", scoredInBedSpec.longText)

        val macroWithGoal = ComplicationModels.buildMacroSpec("Protein", 120f, configuredGoal = 160f, fallbackGoal = 150f)
        assertEquals("120g", macroWithGoal.shortText)
        assertEquals("/160g", macroWithGoal.shortTitle)
        assertEquals("40g left", macroWithGoal.longTitle)

        val macroWithoutGoal = ComplicationModels.buildMacroSpec("Protein", 100f, configuredGoal = null, fallbackGoal = 150f)
        assertEquals("100g", macroWithoutGoal.shortText)
        assertNull(macroWithoutGoal.shortTitle)
        assertEquals("Protein 100g", macroWithoutGoal.longText)
        assertNull(macroWithoutGoal.longTitle)
        assertEquals("Protein: 100g", macroWithoutGoal.contentDescription)
        assertEquals(100f, macroWithoutGoal.progressValue, 0.01f)
        assertFalse(macroWithoutGoal.hasGoalTarget)
        assertTrue(macroWithGoal.hasGoalTarget)

        assertEquals("8:00a", ComplicationModels.compactDoseTime("08:00 AM"))
        assertEquals("9:30p", ComplicationModels.compactDoseTime("09:30 PM"))
        val meds = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.TAKEN),
                MedicationDose("2", "m2", "s2", "Magnesium", "400 mg", "08:00 PM", MedicationDoseStatus.PENDING)
            )
        )
        val medsSpec = ComplicationModels.buildMedicationsSpec(meds)
        assertEquals("1/2", medsSpec.shortText)
        assertEquals("8:00p", medsSpec.shortTitle)
        assertEquals("1/2 \u00B7 Magnesium 8:00p", medsSpec.longText)
        assertEquals("400 mg", medsSpec.longTitle)
        assertEquals("1/2 \u00B7 Magnesium \u00B7 400 mg \u00B7 8:00p", medsSpec.contentDescription)
        assertNotNull(medsSpec.validUntil)
        assertNotNull(calRem.validUntil)
        assertNotNull(sleepSpec.validUntil)

        val amoxComplicationSnap = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("1", "m1", "s1", "Vitamin D", "2000 IU", "07:00 AM", MedicationDoseStatus.TAKEN),
                MedicationDose("2", "m2", "s2", "Amoxicillin 250 mg", "1 cap", "08:00 AM", MedicationDoseStatus.PENDING)
            )
        )
        val amoxCompSpec = ComplicationModels.buildMedicationsSpec(amoxComplicationSnap)
        assertEquals("1/2 \u00B7 Amoxici\u2026250 mg 8:00a", amoxCompSpec.longText)

        val uncompactedComplicationSnap = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("1", "m1", "s1", "Vitamin D", "2000 IU", "07:00 AM", MedicationDoseStatus.TAKEN),
                MedicationDose("2", "m2", "s2", "Augmentin 875 mg / 125 mg", "1 tab", "08:00 AM", MedicationDoseStatus.PENDING)
            )
        )
        val fallbackCompSpec = ComplicationModels.buildMedicationsSpec(uncompactedComplicationSnap)
        assertEquals("1/2 \u00B7 Medications 8:00a", fallbackCompSpec.longText)

        val skippedMeds = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.TAKEN),
                MedicationDose("2", "m2", "s2", "Magnesium", "400 mg", "08:00 PM", MedicationDoseStatus.SKIPPED)
            )
        )
        val skippedSpec = ComplicationModels.buildMedicationsSpec(skippedMeds)
        assertEquals("1/2 \u00B7 1 skipped \u00B7 All done", skippedSpec.longText)

        val scheduled = listOf(ScheduledWorkout("p1", "Push Day A", "PPL", "Today"))
        val plannedSpec = ComplicationModels.buildExerciseSpec(
            exercise = null,
            scheduledWorkouts = scheduled
        )
        assertEquals("0m", plannedSpec.shortText)
        assertEquals("Today: Push Day A", plannedSpec.longText)
        assertNotNull(plannedSpec.validUntil)

        val liveSpec = ComplicationModels.buildExerciseSpec(
            exercise = ExerciseSummarySnapshot(today, 20, 45, 180, 400, 1),
            scheduledWorkouts = scheduled,
            activeSessionLabel = "Workout",
            activeSessionMinutes = 34
        )
        assertEquals("34m", liveSpec.shortText)
        assertEquals("Live", liveSpec.shortTitle)
        assertEquals("Workout \u00B7 34m", liveSpec.longText)
        assertEquals(54f, liveSpec.progressValue, 0.01f)
        assertNotNull(liveSpec.validUntil)

        val weightModel = TileModels.buildWeightTileModel(
            watchCtx = WatchContext(today = today, todayWeightKg = 80.92, todayBodyFatPercentage = 16.8, weightUnit = WeightUnit.LBS),
            history = listOf(HistoryPoint("2026-01-01", 81.10), HistoryPoint(today, 80.92, 16.8)),
            unit = WeightUnit.LBS,
            today = today
        )
        val weightSpec = ComplicationModels.buildWeightSpec(weightModel)
        assertEquals("178.4", weightSpec.shortText)
        assertEquals("-0.4", weightSpec.shortTitle)
        assertEquals("178.4 lbs \u00B7 -0.4 lbs", weightSpec.longText)
        assertEquals("BF 16.8%", weightSpec.longTitle)
        assertEquals("178.4 lbs \u00B7 -0.4 lbs \u00B7 BF 16.8%", weightSpec.contentDescription)
        assertNull(weightSpec.validUntil)
    }

    @Test
    fun `weight tile queued status, causal check-in settlement, and enabled-page complication routing`() {
        val today = CheckInDate.today()
        val optimisticCtx = WatchContext(
            today = today,
            todayWeightKg = 80.0,
            todayBodyFatPercentage = 16.5,
            weightUnit = WeightUnit.KG
        )
        val optimisticHistory = listOf(
            HistoryPoint("2026-01-01", 80.6, 16.8),
            HistoryPoint(today, 80.0, 16.5)
        )

        val queuedTile = TileModels.buildWeightTileModel(
            watchCtx = optimisticCtx,
            history = optimisticHistory,
            unit = WeightUnit.KG,
            today = today,
            todayUnconfirmed = true
        )
        assertTrue(queuedTile.hasData)
        assertFalse(queuedTile.loggedToday)
        assertTrue(queuedTile.queuedToday)
        assertEquals("80.0 kg", queuedTile.weightValueText)
        assertEquals(0.85f, queuedTile.progress, 0.001f)

        val confirmedTile = TileModels.buildWeightTileModel(
            watchCtx = optimisticCtx,
            history = optimisticHistory,
            unit = WeightUnit.KG,
            today = today,
            todayUnconfirmed = false
        )
        assertTrue(confirmedTile.loggedToday)
        assertFalse(confirmedTile.queuedToday)
        assertEquals(1.0f, confirmedTile.progress, 0.001f)

        val savedRec = CheckInStore.PendingWeightRecord(
            id = "c-watch-80",
            day = today,
            weightKg = 80.0,
            bodyFatPercentage = null,
            state = SyncState.SAVED,
            ownerId = "srv-1",
            baselineGeneratedAtMs = 1000L,
            baselineWeightKg = 79.0,
            baselineBodyFatPercentage = 20.0
        )
        // Pre-write snapshot right after direct sendAck must NOT retire the 80 kg overlay
        val preWriteSnap = WatchContext(
            today = today,
            todayWeightKg = 79.0,
            todayBodyFatPercentage = 20.0,
            generatedAtMs = 1000L,
            ackedClientIds = emptyList(),
            weightUnit = WeightUnit.KG
        )
        assertFalse(
            CheckInStore.isSavedWeightRecordSettled(
                savedRec,
                preWriteSnap,
                listOf(HistoryPoint(today, 79.0, 20.0))
            )
        )

        // Unrelated body-fat change (20% -> 21%) without weight change or rec.id ack must NOT retire weight-only edit
        val bfOnlyChangeSnap = WatchContext(
            today = today,
            todayWeightKg = 79.0,
            todayBodyFatPercentage = 21.0,
            generatedAtMs = 1500L,
            ackedClientIds = (1..20).map { "other-ack-$it" },
            weightUnit = WeightUnit.KG
        )
        assertFalse(
            CheckInStore.isSavedWeightRecordSettled(
                savedRec,
                bfOnlyChangeSnap,
                listOf(HistoryPoint(today, 79.0, 21.0))
            )
        )

        // Post-write snapshot with a later 81 kg phone edit + ackedClientIds retires the 80 kg overlay
        val phoneEditWithAck = WatchContext(
            today = today,
            todayWeightKg = 81.0,
            generatedAtMs = 2000L,
            ackedClientIds = listOf("c-watch-80"),
            weightUnit = WeightUnit.KG
        )
        assertTrue(
            CheckInStore.isSavedWeightRecordSettled(
                savedRec,
                phoneEditWithAck,
                listOf(HistoryPoint(today, 81.0))
            )
        )

        // Snapshot from an intermediate prior edit (80 kg, edit-1 acked, edit-2 not yet in ackedClientIds) must NOT retire edit-2 (81 kg)
        val edit2SavedRec = savedRec.copy(id = "c-watch-81", weightKg = 81.0)
        val intermediateEdit1Snap = WatchContext(
            today = today,
            todayWeightKg = 80.0,
            generatedAtMs = 2500L,
            ackedClientIds = listOf("c-watch-80"),
            weightUnit = WeightUnit.KG
        )
        assertFalse(
            CheckInStore.isSavedWeightRecordSettled(
                edit2SavedRec,
                intermediateEdit1Snap,
                listOf(HistoryPoint(today, 80.0))
            )
        )

        // Medication date-bound tile action, distinguishable strength labels, & causal override retirement
        val amox250 = MedicationDose("d-250", "m250", "s1", "Amoxicillin 250 mg", "1 cap", "08:00 AM", MedicationDoseStatus.PENDING)
        val amox500 = MedicationDose("d-500", "m500", "s2", "Amoxicillin 500 mg", "1 cap", "08:00 AM", MedicationDoseStatus.PENDING)
        val distinctSnap = MedicationSnapshot(day = today, doses = listOf(amox250, amox500))
        val distinctTile = TileModels.buildMedicationsTileModel(distinctSnap)
        assertEquals("Amoxicil\u2026250 mg", distinctTile.doseRows[0].name)
        assertEquals("Amoxicil\u2026500 mg", distinctTile.doseRows[1].name)
        assertTrue(distinctTile.doseRows[0].isDirectlyActionable)
        assertTrue(distinctTile.doseRows[1].isDirectlyActionable)

        val er1500 = MedicationDose("d-1500", "m1500", "s3", "Extended Release Drug 1500 mg", "1 tab", "09:00 AM", MedicationDoseStatus.PENDING)
        val tooLongStrength = MedicationDose("d-combo", "mcombo", "s4", "Augmentin 875 mg / 125 mg", "1 tab", "09:00 AM", MedicationDoseStatus.PENDING)
        val mcgDose = MedicationDose("d-mcg", "mmcg", "s5", "ExampleMed 10 mcg", "1 tab", "09:00 AM", MedicationDoseStatus.PENDING)
        assertEquals("Extende\u20261500 mg", TileModels.compactDoseName("Extended Release Drug 1500 mg"))
        val strengthTile = TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(er1500, tooLongStrength, mcgDose)))
        assertEquals("Exte\u20261500 mg", strengthTile.doseRows[0].name)
        assertTrue(strengthTile.doseRows[0].isDirectlyActionable)
        assertFalse(strengthTile.doseRows[1].isDirectlyActionable)
        assertEquals("Examp\u202610 mcg", strengthTile.doseRows[2].name)
        assertTrue(strengthTile.doseRows[2].isDirectlyActionable)
        assertFalse(TileModels.compactDoseNameWithSafety("Vitamin B12 1000 mcg").second)

        val takenAlpha = MedicationDose("d-alpha", "ma", "s1", "LongMedication Alpha", "1 tab", "08:00 AM", MedicationDoseStatus.TAKEN)
        val pendingBeta = MedicationDose("d-beta", "mb", "s2", "LongMedication Beta", "1 tab", "08:00 AM", MedicationDoseStatus.PENDING)
        val crossStatusCollisionTile = TileModels.buildMedicationsTileModel(
            MedicationSnapshot(day = today, doses = listOf(takenAlpha, pendingBeta))
        )
        assertEquals("d-beta", crossStatusCollisionTile.doseRows[0].doseId)
        assertFalse(crossStatusCollisionTile.doseRows[0].isDirectlyActionable)

        val dup1 = MedicationDose("dup-1", "m1", "s1", "Vitamin D", "1000 IU", "08:00 AM", MedicationDoseStatus.PENDING)
        val dup2 = MedicationDose("dup-2", "m2", "s2", "Vitamin D", "1000 IU", "08:00 AM", MedicationDoseStatus.PENDING)
        val dupSnap = MedicationSnapshot(day = today, doses = listOf(dup1, dup2))
        val dupTile = TileModels.buildMedicationsTileModel(dupSnap)
        assertFalse(dupTile.doseRows[0].isDirectlyActionable)
        assertFalse(dupTile.doseRows[1].isDirectlyActionable)
        assertNull(
            resolveMedicationTileActionDose(
                formatMedicationTileActionId("tok-abc", today, "dup-1", medicationDoseFingerprint(dup1)),
                "tok-abc",
                dupSnap
            )
        )

        val doseToday = MedicationDose("dose:1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.PENDING)
        val todayMedSnap = MedicationSnapshot(day = today, doses = listOf(doseToday))
        val validMedClick = formatMedicationTileActionId("tok-abc", today, "dose:1", medicationDoseFingerprint(doseToday))
        val staleYesterdayClick = formatMedicationTileActionId("tok-abc", "2020-01-01", "dose:1", medicationDoseFingerprint(doseToday))
        assertNotNull(resolveMedicationTileActionDose(validMedClick, "tok-abc", todayMedSnap))
        assertNull(resolveMedicationTileActionDose(staleYesterdayClick, "tok-abc", todayMedSnap))
        assertNull(resolveMedicationTileActionDose(validMedClick, "tok-other", todayMedSnap))
        val editedDetailSnap = MedicationSnapshot(
            day = today,
            doses = listOf(doseToday.copy(detail = "4000 IU"))
        )
        assertNull(resolveMedicationTileActionDose(validMedClick, "tok-abc", editedDetailSnap))

        val savedMedRec = CheckInStore.PendingMedicationRecord(
            id = "med-c1",
            doseId = "dose:1",
            medicationId = "m1",
            scheduleId = "s1",
            day = today,
            taken = true,
            state = SyncState.SAVED,
            ownerId = "srv-1",
            baselineGeneratedAtMs = 1000L,
            baselineStatus = MedicationDoseStatus.PENDING
        )
        assertFalse(CheckInStore.isSavedMedicationRecordSettled(savedMedRec, preWriteSnap, todayMedSnap))
        val phoneUndidMedSnap = WatchContext(
            today = today,
            generatedAtMs = 2000L,
            ackedClientIds = listOf("med-c1")
        )
        assertTrue(CheckInStore.isSavedMedicationRecordSettled(savedMedRec, phoneUndidMedSnap, todayMedSnap))

        // Queued medication & weight reconciliation when server snapshot confirms without clientId
        val queuedMedRec = savedMedRec.copy(state = SyncState.QUEUED)
        assertFalse(CheckInStore.isQueuedMedicationRecordSettled(queuedMedRec, preWriteSnap, todayMedSnap))
        val takenMedSnap = MedicationSnapshot(
            day = today,
            doses = listOf(doseToday.copy(status = MedicationDoseStatus.TAKEN))
        )
        assertTrue(CheckInStore.isQueuedMedicationRecordSettled(queuedMedRec, preWriteSnap, takenMedSnap))

        // Multi-toggle oscillation (PENDING -> TAKEN -> PENDING -> TAKEN) must wait for latest clientId
        val oscillatedMedRec = queuedMedRec.copy(id = "med-c3", hasSupersededInFlight = true)
        val firstToggleAckSnap = WatchContext(today = today, ackedClientIds = listOf("med-c1"))
        assertFalse(CheckInStore.isQueuedMedicationRecordSettled(oscillatedMedRec, firstToggleAckSnap, takenMedSnap))
        val latestToggleAckSnap = WatchContext(today = today, ackedClientIds = listOf("med-c1", "med-c3"))
        assertTrue(CheckInStore.isQueuedMedicationRecordSettled(oscillatedMedRec, latestToggleAckSnap, takenMedSnap))

        val queuedWeightRec = savedRec.copy(
            state = SyncState.QUEUED,
            weightKg = 81.0,
            baselineWeightKg = 80.0
        )
        val stillBaselineSnap = WatchContext(today = today, todayWeightKg = 80.0, weightUnit = WeightUnit.KG)
        assertFalse(
            CheckInStore.isQueuedWeightRecordSettled(
                queuedWeightRec,
                stillBaselineSnap,
                listOf(HistoryPoint(today, 80.0))
            )
        )
        // Unchanged baseline must not settle a newer queued edit that requests the same 80 kg value
        val sameAsBaselineQueued = queuedWeightRec.copy(weightKg = 80.0, baselineWeightKg = 80.0)
        assertFalse(
            CheckInStore.isQueuedWeightRecordSettled(
                sameAsBaselineQueued,
                stillBaselineSnap,
                listOf(HistoryPoint(today, 80.0))
            )
        )
        val serverConfirmed81Snap = WatchContext(today = today, todayWeightKg = 81.0, weightUnit = WeightUnit.KG)
        assertTrue(
            CheckInStore.isQueuedWeightRecordSettled(
                queuedWeightRec,
                serverConfirmed81Snap,
                listOf(HistoryPoint(today, 81.0))
            )
        )
        // Multi-edit oscillation (79 -> 80 -> 81 -> 80) must wait for latest clientId
        val oscillatedWeightRec = queuedWeightRec.copy(
            id = "c-watch-80-second",
            weightKg = 80.0,
            baselineWeightKg = 79.0,
            hasSupersededInFlight = true
        )
        val firstWeightAckSnap = WatchContext(
            today = today,
            todayWeightKg = 80.0,
            ackedClientIds = listOf("c-watch-80-first"),
            weightUnit = WeightUnit.KG
        )
        assertFalse(
            CheckInStore.isQueuedWeightRecordSettled(
                oscillatedWeightRec,
                firstWeightAckSnap,
                listOf(HistoryPoint(today, 80.0))
            )
        )
        val latestWeightAckSnap = firstWeightAckSnap.copy(
            ackedClientIds = listOf("c-watch-80-first", "c-watch-80-second")
        )
        assertTrue(
            CheckInStore.isQueuedWeightRecordSettled(
                oscillatedWeightRec,
                latestWeightAckSnap,
                listOf(HistoryPoint(today, 80.0))
            )
        )

        // Launch-time enabled-page destination fallbacks for complications & tiles
        val noMedsOrWorkout = listOf(WatchPage.GOALS, WatchPage.WATER, WatchPage.STEPS, WatchPage.TREND)
        assertEquals(
            WatchPage.GOALS,
            CheckInStore.resolveNavigationPage(WatchPage.MEDICATIONS, noMedsOrWorkout)
        )
        assertEquals(
            WatchPage.STEPS,
            CheckInStore.resolveNavigationPage(WatchPage.WORKOUT, noMedsOrWorkout)
        )
        assertEquals(
            WatchPage.TREND,
            CheckInStore.resolveNavigationPage(WatchPage.ENTRY, noMedsOrWorkout)
        )
        assertEquals(
            WatchPage.GOALS,
            CheckInStore.resolveNavigationPage(WatchPage.WATER, listOf(WatchPage.GOALS, WatchPage.STEPS))
        )
        assertEquals(
            WatchPage.MEDICATIONS,
            CheckInStore.resolveNavigationPage(WatchPage.MEDICATIONS, listOf(WatchPage.GOALS, WatchPage.MEDICATIONS))
        )
        assertEquals(
            WatchPage.WORKOUT,
            CheckInStore.resolveNavigationPage(WatchPage.WORKOUT, listOf(WatchPage.GOALS, WatchPage.WORKOUT, WatchPage.STEPS))
        )

        // Retained SAVED overlay records survive beneath replacement QUEUED edits so failed replacements restore accepted values
        val queuedUndo = savedMedRec.copy(id = "med-c2", taken = false, state = SyncState.QUEUED, hasSupersededInFlight = true)
        val stackedMeds = CheckInStore.appendQueuedMedicationRecord(listOf(savedMedRec), queuedUndo)
        assertEquals(2, stackedMeds.size)
        assertEquals(false, CheckInStore.effectiveMedicationRecordsByDose(stackedMeds, today)["dose:1"]?.taken)
        val afterFailedUndo = stackedMeds.filterNot { it.id == "med-c2" }
        assertEquals(true, CheckInStore.effectiveMedicationRecordsByDose(afterFailedUndo, today)["dose:1"]?.taken)

        // Rapid unacked medication toggle (PENDING -> TAKEN -> PENDING): earlier TAKEN stays eligible for ack and restores if undo fails
        val rapidMedTake = savedMedRec.copy(id = "med-rapid-1", taken = true, state = SyncState.QUEUED)
        val rapidMedUndo = savedMedRec.copy(id = "med-rapid-2", taken = false, state = SyncState.QUEUED, hasSupersededInFlight = true)
        val medsBothInFlight = CheckInStore.appendQueuedMedicationRecord(
            CheckInStore.appendQueuedMedicationRecord(emptyList(), rapidMedTake),
            rapidMedUndo
        )
        assertEquals(2, medsBothInFlight.size)
        assertTrue(medsBothInFlight[0].superseded)
        assertEquals(false, CheckInStore.effectiveMedicationRecordsByDose(medsBothInFlight, today)["dose:1"]?.taken)
        val afterMedTakeAcked = CheckInStore.applyMedicationAcknowledgement(medsBothInFlight, "med-rapid-1", ok = true)
        assertEquals(false, CheckInStore.effectiveMedicationRecordsByDose(afterMedTakeAcked.records, today)["dose:1"]?.taken)
        val afterMedUndoFailed = CheckInStore.applyMedicationAcknowledgement(afterMedTakeAcked.records, "med-rapid-2", ok = false)
        assertTrue(afterMedUndoFailed.markFailedForDose)
        assertEquals(true, CheckInStore.effectiveMedicationRecordsByDose(afterMedUndoFailed.records, today)["dose:1"]?.taken)
        val failedMedTile = TileModels.buildMedicationsTileModel(todayMedSnap, failedDoseIds = setOf("dose:1"))
        assertEquals("!", failedMedTile.doseRows.single().statusSymbol)

        val queuedReplacement81 = savedRec.copy(id = "c-watch-81", weightKg = 81.0, state = SyncState.QUEUED, hasSupersededInFlight = true)
        val stackedWeights = CheckInStore.appendQueuedWeightRecord(listOf(savedRec), queuedReplacement81)
        assertEquals(2, stackedWeights.size)
        assertEquals(81.0, CheckInStore.orderWeightOverlayRecords(stackedWeights).last().weightKg, 0.001)
        val afterFailed81 = stackedWeights.filterNot { it.id == "c-watch-81" }
        assertEquals(80.0, CheckInStore.orderWeightOverlayRecords(afterFailed81).last().weightKg, 0.001)

        // Rapid unacked 80 kg -> 81 kg: 80 kg stays eligible for ack while superseded; if 80 kg succeeds and 81 kg fails, 80 kg restores
        val rapid80 = savedRec.copy(id = "c-rapid-80", weightKg = 80.0, bodyFatPercentage = 21.0, state = SyncState.QUEUED)
        val rapid81 = savedRec.copy(id = "c-rapid-81", weightKg = 81.0, bodyFatPercentage = null, state = SyncState.QUEUED, hasSupersededInFlight = true)
        val bothInFlight = CheckInStore.appendQueuedWeightRecord(
            CheckInStore.appendQueuedWeightRecord(emptyList(), rapid80),
            rapid81
        )
        assertEquals(2, bothInFlight.size)
        assertTrue(bothInFlight[0].superseded)
        assertFalse(bothInFlight[1].superseded)
        assertEquals(listOf(81.0), CheckInStore.orderWeightOverlayRecords(bothInFlight).map { it.weightKg })

        val after80Acked = CheckInStore.applyWeightAcknowledgement(bothInFlight, "c-rapid-80", ok = true)
        assertFalse(after80Acked.clearFailureForDay)
        assertEquals(81.0, CheckInStore.orderWeightOverlayRecords(after80Acked.records).last().weightKg, 0.001)

        val after81Rejected = CheckInStore.applyWeightAcknowledgement(after80Acked.records, "c-rapid-81", ok = false)
        assertTrue(after81Rejected.markFailedForDay)
        assertEquals(80.0, CheckInStore.orderWeightOverlayRecords(after81Rejected.records).single().weightKg, 0.001)
        assertEquals(21.0, CheckInStore.orderWeightOverlayRecords(after81Rejected.records).single().bodyFatPercentage ?: 0.0, 0.001)

        // Weight-only replacement carries forward prior accepted BF in inheritedBodyFatPercentage while keeping bodyFatPercentage null
        val after81Accepted = CheckInStore.applyWeightAcknowledgement(after80Acked.records, "c-rapid-81", ok = true)
        val acceptedSingle = after81Accepted.records.single()
        assertEquals(81.0, acceptedSingle.weightKg, 0.001)
        assertNull(acceptedSingle.bodyFatPercentage)
        assertEquals(21.0, acceptedSingle.inheritedBodyFatPercentage ?: 0.0, 0.001)

        // Future-dated cached weight point (e.g. after moving watch timezone backwards) must not override today's headline
        val backwardDateToday = "2026-04-07"
        val backwardDateCtx = WatchContext(
            today = backwardDateToday,
            todayWeightKg = 80.0,
            lastEntryDate = "2026-04-06",
            lastWeightKg = 80.5,
            weightUnit = WeightUnit.KG
        )
        val futureContaminatedHistory = listOf(
            HistoryPoint("2026-04-06", 80.5, 18.0),
            HistoryPoint(backwardDateToday, 80.0, 17.8),
            HistoryPoint("2026-04-08", 79.0, 17.5)
        )
        val backwardDateTile = TileModels.buildWeightTileModel(
            watchCtx = backwardDateCtx,
            history = futureContaminatedHistory,
            unit = WeightUnit.KG,
            today = backwardDateToday,
            todayUnconfirmed = true
        )
        assertEquals("80.0 kg", backwardDateTile.weightValueText)
        assertEquals(17.8, backwardDateTile.bodyFatPercent ?: 0.0, 0.001)
        assertTrue(backwardDateTile.queuedToday)

        // Prior body-fat-only day (Tuesday 21%) survives across midnight when Wednesday saves weight-only (79.5 kg)
        val tuesdayBfOnlyBase = WatchContext(
            today = "2026-04-07",
            todayWeightKg = null,
            todayBodyFatPercentage = 21.0,
            lastEntryDate = "2026-04-06",
            lastWeightKg = 80.0,
            lastBodyFatPercentage = 18.0,
            weightUnit = WeightUnit.KG
        )
        val wednesdayWeightOnlyHistory = listOf(
            HistoryPoint("2026-04-06", 80.0, 18.0),
            HistoryPoint("2026-04-08", 79.5, null)
        )
        val resolvedPriorBf = CheckInStore.resolvePriorBodyFatPercentage(
            baseWatchContext = tuesdayBfOnlyBase,
            history = wednesdayWeightOnlyHistory,
            today = "2026-04-08"
        )
        assertEquals(21.0, resolvedPriorBf ?: 0.0, 0.001)
        val wednesdayOverlayCtx = WatchContext(
            today = "2026-04-08",
            todayWeightKg = 79.5,
            todayBodyFatPercentage = null,
            lastEntryDate = "2026-04-06",
            lastWeightKg = 80.0,
            lastBodyFatPercentage = resolvedPriorBf,
            weightUnit = WeightUnit.KG
        )
        val wednesdayTile = TileModels.buildWeightTileModel(
            watchCtx = wednesdayOverlayCtx,
            history = wednesdayWeightOnlyHistory,
            unit = WeightUnit.KG,
            today = "2026-04-08",
            todayUnconfirmed = true
        )
        assertEquals("79.5 kg", wednesdayTile.weightValueText)
        assertEquals(21.0, wednesdayTile.bodyFatPercent ?: 0.0, 0.001)

        // Explicit Wednesday body fat (19.5%) still overrides Tuesday's 21%
        val wednesdayExplicitBfTile = TileModels.buildWeightTileModel(
            watchCtx = wednesdayOverlayCtx.copy(todayBodyFatPercentage = 19.5),
            history = listOf(
                HistoryPoint("2026-04-06", 80.0, 18.0),
                HistoryPoint("2026-04-08", 79.5, 19.5)
            ),
            unit = WeightUnit.KG,
            today = "2026-04-08",
            todayUnconfirmed = true
        )
        assertEquals(19.5, wednesdayExplicitBfTile.bodyFatPercent ?: 0.0, 0.001)

        // Narrow pillRow detail truncation: distinguishing strength clipped off or visible prefixes colliding must block inline toggle
        val clippedStrengthA = MedicationDose("cs-1", "m1", "s1", "Metformin", "Extended release 500 mg", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedStrengthB = MedicationDose("cs-2", "m2", "s2", "Metformin", "Extended release 1000 mg", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedStrengthTile = TileModels.buildMedicationsTileModel(
            MedicationSnapshot(day = today, doses = listOf(clippedStrengthA, clippedStrengthB))
        )
        assertFalse(clippedStrengthTile.doseRows[0].isDirectlyActionable)
        assertFalse(clippedStrengthTile.doseRows[1].isDirectlyActionable)

        val clippedTimeA = MedicationDose("ct-1", "m1", "s1", "Vitamin D", "1000 IU", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedTimeB = MedicationDose("ct-2", "m1", "s2", "Vitamin D", "1000 IU", "08:00 PM", MedicationDoseStatus.PENDING)
        val clippedTimeTile = TileModels.buildMedicationsTileModel(
            MedicationSnapshot(day = today, doses = listOf(clippedTimeA, clippedTimeB))
        )
        assertFalse(clippedTimeTile.doseRows[0].isDirectlyActionable)
        assertFalse(clippedTimeTile.doseRows[1].isDirectlyActionable)

        val visibleStrengthA = MedicationDose("vs-1", "m1", "s1", "Ibuprofen", "200 mg", "08:00 AM", MedicationDoseStatus.PENDING)
        val visibleStrengthB = MedicationDose("vs-2", "m2", "s2", "Ibuprofen", "400 mg", "08:00 AM", MedicationDoseStatus.PENDING)
        val visibleStrengthTile = TileModels.buildMedicationsTileModel(
            MedicationSnapshot(day = today, doses = listOf(visibleStrengthA, visibleStrengthB))
        )
        assertTrue(visibleStrengthTile.doseRows[0].isDirectlyActionable)
        assertTrue(visibleStrengthTile.doseRows[1].isDirectlyActionable)

        // Clipped compound concentration denominator (e.g. "100 mg/mL" -> "100 mg/m…") must block inline toggle
        val clippedConcentration = MedicationDose("cc-1", "m1", "s1", "Metformin", "100 mg/mL", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedConcentrationTile = TileModels.buildMedicationsTileModel(
            MedicationSnapshot(day = today, doses = listOf(clippedConcentration))
        )
        assertFalse(clippedConcentrationTile.doseRows.single().isDirectlyActionable)

        // Clipped unrecognized unit with digits (e.g. "2.5 mmol" or "2 kBq" truncated on a long name) must fail closed,
        // while a clipped detail whose complete recognized strength stays visible ("500 mg with food") remains actionable
        val clippedMmol = MedicationDose("cm-1", "m1", "s1", "Potassium Chloride", "2.5 mmol", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedUnknownUnit = MedicationDose("cu-1", "m2", "s2", "Diagnostic Agent", "2 kBq", "08:00 AM", MedicationDoseStatus.PENDING)
        val clippedWithVisibleStrength = MedicationDose("cv-1", "m3", "s3", "Vitamin D", "500 mg with food", "08:00 AM", MedicationDoseStatus.PENDING)
        assertFalse(
            TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(clippedMmol)))
                .doseRows.single().isDirectlyActionable
        )
        assertFalse(
            TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(clippedUnknownUnit)))
                .doseRows.single().isDirectlyActionable
        )
        assertTrue(
            TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(clippedWithVisibleStrength)))
                .doseRows.single().isDirectlyActionable
        )

        // Timezone rollback to April 7 with April 8 edit still queued must preserve April 7 base lastWeightKg (80 kg) over April 6 history (81 kg)
        val rollbackBaseCtx = WatchContext(
            today = "2026-04-08",
            todayWeightKg = null,
            lastEntryDate = "2026-04-07",
            lastWeightKg = 80.0,
            lastBodyFatPercentage = 19.0,
            weightUnit = WeightUnit.KG
        )
        val rollbackHistory = listOf(
            HistoryPoint("2026-04-06", 81.0, 20.0),
            HistoryPoint("2026-04-08", 79.0, null)
        )
        val preservedTodayLast = CheckInStore.resolveLastReadingAfterOverlay(
            baseWatchContext = rollbackBaseCtx,
            history = rollbackHistory,
            today = "2026-04-07",
            hasTodayOverlay = false
        )
        assertEquals(80.0, preservedTodayLast.weightKg ?: 0.0, 0.001)
        assertEquals(19.0, preservedTodayLast.bodyFatPercentage ?: 0.0, 0.001)
        assertEquals("2026-04-07", preservedTodayLast.entryDate)

        // When a local April 7 overlay IS present, lastReading still resolves to the older April 6 prior (81 kg)
        val priorWhenOverlaid = CheckInStore.resolveLastReadingAfterOverlay(
            baseWatchContext = rollbackBaseCtx,
            history = rollbackHistory,
            today = "2026-04-07",
            hasTodayOverlay = true
        )
        assertEquals(81.0, priorWhenOverlaid.weightKg ?: 0.0, 0.001)
        assertEquals("2026-04-06", priorWhenOverlaid.entryDate)

        // Unicode fractional strengths (e.g. ½ mg) must be preserved when they fit, or block inline toggle when dropped
        val (fracKeptName, fracKeptIntact) = TileModels.compactDoseNameWithSafety("Example Medication ½ mg")
        assertEquals("Example Me\u2026\u00BD mg", fracKeptName)
        assertTrue(fracKeptIntact)
        val (_, fracTooLongIntact) = TileModels.compactDoseNameWithSafety("Example Medication ½ mg / 250 mg")
        assertFalse(fracTooLongIntact)
        val fracTooLongDose = MedicationDose("fr-1", "m1", "s1", "Example Medication ½ mg / 250 mg", "1 tab", "08:00 AM", MedicationDoseStatus.PENDING)
        assertFalse(
            TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(fracTooLongDose)))
                .doseRows.single().isDirectlyActionable
        )

        // Untouched weight drafts must reseed whenever the local calendar date changes (e.g. rollback Apr 8 -> Apr 7)
        assertTrue(CheckInStore.shouldReseedWeightDraft(lastDraftSeedDay = "2026-04-08", today = "2026-04-07", rejectedExpired = false))
        assertFalse(CheckInStore.shouldReseedWeightDraft(lastDraftSeedDay = "2026-04-07", today = "2026-04-07", rejectedExpired = false))
        assertTrue(CheckInStore.shouldReseedWeightDraft(lastDraftSeedDay = "2026-04-07", today = "2026-04-07", rejectedExpired = true))
    }

    @Test
    fun `custom complication config parsing, serialization, and starter parity`() {
        val starters = CustomComplicationCodec.starterDefinitions()
        assertEquals(
            listOf("starter-caloriesRemaining", "starter-macros", "starter-weight", "starter-sleepScore"),
            starters.map { it.id }
        )
        assertEquals(2, starters[1].extras.size)

        val wireJson = JSONObject().apply {
            put("type", "complicationConfig")
            put("revision", 1730000000000L)
            put("reload", true)
            put("builtIns", JSONArray().apply {
                put(JSONObject().apply {
                    put("key", "steps")
                    put("color", "heart")
                    put("icon", "bolt.fill")
                })
                put(JSONObject().apply {
                    put("key", "empty")
                })
            })
            put("definitions", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", "c-1")
                    put("name", "Macros Mix")
                    put("source", "protein")
                    put("format", "percent")
                    put("gauge", true)
                    put("color", "protein")
                    put("icon", "fish.fill")
                    put("extras", JSONArray().apply {
                        put(JSONObject().apply {
                            put("source", "protein") // duplicate primary should be skipped
                            put("format", "value")
                            put("color", "protein")
                            put("icon", "fish.fill")
                        })
                        put(JSONObject().apply {
                            put("source", "carbs")
                            put("format", "remaining")
                            put("color", "carbs")
                            put("icon", "leaf.fill")
                        })
                        put(JSONObject().apply {
                            put("source", "fat")
                            put("format", "value")
                            put("color", "fat")
                            put("icon", "drop.fill")
                        })
                        put(JSONObject().apply {
                            put("source", "water") // 3rd extra exceeds MAX_EXTRAS=2
                            put("format", "percent")
                            put("color", "water")
                            put("icon", "drop.fill")
                        })
                    })
                })
                put(JSONObject().apply {
                    put("id", "")
                    put("name", "Invalid")
                    put("source", "steps")
                })
            })
        }

        val parsed = CustomComplicationCodec.parseConfig(wireJson)
        assertNotNull(parsed)
        assertEquals(1730000000000L, parsed!!.revision)
        assertTrue(parsed.reload)
        assertEquals(1, parsed.definitions.size)
        val def = parsed.definitions.single()
        assertEquals("c-1", def.id)
        assertEquals("Macros Mix", def.name)
        assertEquals(listOf("carbs", "fat"), def.extras.map { it.source })
        assertEquals(1, parsed.builtIns?.size)
        assertEquals("steps", parsed.builtIns?.single()?.key)
        assertEquals("heart", parsed.builtIns?.single()?.color)
        assertEquals("bolt.fill", parsed.builtIns?.single()?.icon)

        // Round-trip definitions and built-ins serialization
        val roundTrippedDefs = CustomComplicationCodec.parseDefinitionsArray(
            JSONArray(CustomComplicationCodec.serializeDefinitions(parsed.definitions))
        )
        assertEquals(parsed.definitions, roundTrippedDefs)
        val roundTrippedBuiltIns = CustomComplicationCodec.parseBuiltInsArray(
            JSONArray(CustomComplicationCodec.serializeBuiltIns(parsed.builtIns!!))
        )
        assertEquals(parsed.builtIns, roundTrippedBuiltIns)
    }

    @Test
    fun `custom complication metrics, energy units, formatting, and multi-value render specs`() {
        val today = CheckInDate.today()
        val nowMs = 1_700_010_000_000L
        val fastStartMs = nowMs - (10L * 3600L + 30L * 60L) * 1000L
        val fastTargetMs = fastStartMs + 16L * 3600L * 1000L

        val ctx = WatchContext(
            today = today,
            todayWeightKg = 80.0,
            todayBodyFatPercentage = 17.4,
            weightUnit = WeightUnit.LBS,
            energyUnit = "kJ",
            waterDisplayUnit = "oz",
            waterGoalMl = 2957.35,
            water = WaterSnapshot(day = today, consumedMl = 1478.675, fromFoodMl = null, log = emptyList()),
            steps = StepsSnapshot(day = today, count = 6500),
            stepGoal = 10_000,
            fastSynced = true,
            fast = WatchFast(startedAtMs = fastStartMs, targetEndAtMs = fastTargetMs, label = "16:8"),
            nutrition = NutritionSnapshot(
                day = today,
                caloriesConsumed = 1000.0,
                caloriesBurned = 300.0,
                caloriesRemaining = 500.0,
                calorieProgress = 0.67,
                protein = MacroGoal(120.0, 160.0, 0.75),
                carbs = MacroGoal(150.0, 200.0, 0.75),
                fat = MacroGoal(50.0, 70.0, 0.714),
                rows = listOf(
                    NutrientRow("dietary_fiber", "Fiber", "g", 18.0, 30.0, 0.6)
                )
            ),
            sleep = SleepSnapshot(
                day = today,
                totalSeconds = 7 * 3600 + 42 * 60,
                timeInBedSeconds = 8 * 3600 + 5 * 60,
                sleepScore = 82,
                deepSeconds = 5400,
                remSeconds = 6300,
                lightSeconds = 15600,
                restingHeartRate = 58,
                hrvMs = 45,
                spo2 = 97
            ),
            exerciseSummary = ExerciseSummarySnapshot(
                day = today,
                minutes = 30,
                minutesGoal = 60,
                calories = 250,
                caloriesGoal = 500,
                sessionCount = 2
            )
        )

        val metrics = CustomComplicationEngine.buildMetrics(ctx)

        // Energy converts to kJ (1000 kcal * 4.184 = 4184 kJ)
        assertEquals("kJ", metrics["calories"]?.unit)
        assertEquals(4184.0, metrics["calories"]?.value ?: 0.0, 1.0)
        assertEquals(2092.0, metrics["caloriesRemaining"]?.value ?: 0.0, 1.0)
        assertEquals("kJ", metrics["exerciseCalories"]?.unit)

        // Custom Goals nutrient source
        assertEquals(18.0, metrics["nutrient:dietary_fiber"]?.value ?: 0.0, 0.01)
        assertEquals(0.6, metrics["nutrient:dietary_fiber"]?.progress ?: 0.0, 0.01)

        // Water in oz
        assertEquals("oz", metrics["water"]?.unit)
        assertEquals(50.0, metrics["water"]?.value ?: 0.0, 0.1)

        // Fasting formatting: elapsed, remaining, percent
        val fastElapsed = CustomComplicationEngine.formatMetric("fasting", "value", metrics["fasting"], nowMs, today, Locale.US)
        assertEquals("10:30", fastElapsed.text)
        assertEquals("of 16:00", fastElapsed.detail)
        val fastLeft = CustomComplicationEngine.formatMetric("fasting", "remaining", metrics["fasting"], nowMs, today, Locale.US)
        assertEquals("5:30", fastLeft.text)
        assertEquals("left", fastLeft.detail)

        // Sleep duration & score
        val sleepDur = CustomComplicationEngine.formatMetric("sleepDuration", "value", metrics["sleepDuration"], nowMs, today, Locale.US)
        assertEquals("7:42", sleepDur.text)
        val sleepScore = CustomComplicationEngine.formatMetric("sleepScore", "percent", metrics["sleepScore"], nowMs, today, Locale.US)
        assertEquals("82%", sleepScore.text)
        assertEquals(0.82, sleepScore.progress ?: 0.0, 0.001)

        // Stale day metric hides itself
        val stale = CustomComplicationEngine.formatMetric("steps", "value", metrics["steps"], nowMs, today = "1999-01-01", locale = Locale.US)
        assertEquals("—", stale.text)

        // Single-value gauge toggle
        val calDefNoGauge = CustomComplicationDefinition(
            id = "d1",
            name = "Cal left",
            source = "calories",
            format = "remaining",
            gauge = false,
            color = "calories",
            icon = "flame.fill"
        )
        val specNoGauge = CustomComplicationEngine.buildRenderSpec(calDefNoGauge, metrics, nowMs, today, Locale.US)
        assertNull(specNoGauge.progress)
        assertEquals("2,092", specNoGauge.shortText)
        assertEquals("left", specNoGauge.shortTitle)
        assertEquals("2,092 · kJ left", specNoGauge.longText)
        assertEquals(WatchPage.GOALS.key, specNoGauge.tapPageKey)

        // Multi-value Macros starter builds concentric rings + multi-color ramp + joined long text
        val macrosDef = CustomComplicationCodec.starterDefinitions()[1]
        val macrosSpec = CustomComplicationEngine.buildRenderSpec(macrosDef, metrics, nowMs, today, Locale.US)
        assertEquals(3, macrosSpec.rings.size)
        assertEquals(3, macrosSpec.rampColors.size)
        assertEquals("75% · 75% · 71%", macrosSpec.longText)
        assertEquals("Macros", macrosSpec.longTitle)

        // Tap page routing covers Sleep, Weight, Exercise, Water, Fasting, Steps, Goals
        assertEquals("sleep", CustomComplicationEngine.resolveTapPageKey("sleepScore"))
        assertEquals(WatchPage.ENTRY.key, CustomComplicationEngine.resolveTapPageKey("weight"))
        assertEquals(WatchPage.WORKOUT.key, CustomComplicationEngine.resolveTapPageKey("exerciseMinutes"))
        assertEquals(WatchPage.WATER.key, CustomComplicationEngine.resolveTapPageKey("water"))
        assertEquals(WatchPage.FASTING.key, CustomComplicationEngine.resolveTapPageKey("fasting"))
        assertEquals(WatchPage.STEPS.key, CustomComplicationEngine.resolveTapPageKey("steps"))

        // All 17 icon keys resolve to distinct valid drawables and 12 colors resolve to palette values
        assertEquals(R.drawable.ic_complication_calories, CustomComplicationIcons.drawableFor("flame.fill"))
        assertEquals(R.drawable.ic_custom_lungs, CustomComplicationIcons.drawableFor("lungs.fill"))
        assertEquals(CustomComplicationPalette.SLEEP, CustomComplicationPalette.colorArgb("sleep"))
        assertNull(CustomComplicationPalette.knownColorArgbOrNull("unknown"))

        // Mixed daily + non-daily definition keeps weight visible at midnight rollover instead of expiring whole slot
        val weightAndSteps = CustomComplicationDefinition(
            id = "mix-1",
            name = "Weight & Steps",
            source = "weight",
            format = "value",
            gauge = false,
            color = "weight",
            icon = "scalemass.fill",
            extras = listOf(
                CustomComplicationItem(source = "steps", format = "value", color = "steps", icon = "figure.walk")
            )
        )
        val mixedToday = CustomComplicationEngine.buildRenderSpec(weightAndSteps, metrics, nowMs, today, Locale.US)
        assertTrue(mixedToday.hasNonDailyItems)
        assertNotNull(mixedToday.dailyRolloverAt)
        assertNull(mixedToday.validUntil)
        val mixedNextDay = CustomComplicationEngine.buildRenderSpec(weightAndSteps, metrics, nowMs, "2099-01-01", Locale.US)
        assertEquals("176.4 · —", mixedNextDay.longText)

        // Progress compatibility distinguishes value-only vs goal-backed definitions
        assertFalse(CustomComplicationEngine.definitionSupportsProgress(CustomComplicationCodec.starterDefinitions()[2])) // Weight
        assertTrue(CustomComplicationEngine.definitionSupportsProgress(CustomComplicationCodec.starterDefinitions()[1])) // Macros
        assertTrue(CustomComplicationEngine.definitionSupportsProgress(CustomComplicationCodec.starterDefinitions()[3])) // Sleep score

        // Value-only percentage (SpO2) and bare-unit (RHR) render specs format cleanly without middot noise
        val spo2Def = CustomComplicationDefinition(
            id = "spo2-1",
            name = "Blood oxygen",
            source = "spo2",
            format = "value",
            gauge = false,
            color = "heart",
            icon = "lungs.fill"
        )
        assertFalse(CustomComplicationEngine.definitionSupportsProgress(spo2Def))
        val spo2Spec = CustomComplicationEngine.buildRenderSpec(spo2Def, metrics, nowMs, today, Locale.US)
        assertEquals("97%", spo2Spec.shortText)
        assertNull(spo2Spec.shortTitle)
        assertEquals("97%", spo2Spec.longText)
        assertNull(spo2Spec.progress)

        val rhrDef = CustomComplicationDefinition(
            id = "rhr-1",
            name = "Resting HR",
            source = "restingHeartRate",
            format = "value",
            gauge = false,
            color = "heart",
            icon = "heart.fill"
        )
        val rhrSpec = CustomComplicationEngine.buildRenderSpec(rhrDef, metrics, nowMs, today, Locale.US)
        assertEquals("58", rhrSpec.shortText)
        assertEquals("bpm", rhrSpec.shortTitle)
        assertEquals("58 bpm", rhrSpec.longText)

        // Single-value fasting produces live clock metadata for non-rewinding Wear OS TimeDifferenceComplicationText
        val fastDef = CustomComplicationDefinition(
            id = "fast-1",
            name = "Fast",
            source = "fasting",
            format = "remaining",
            gauge = true,
            color = "fasting",
            icon = "timer"
        )
        val fastSpec = CustomComplicationEngine.buildRenderSpec(fastDef, metrics, nowMs, today, Locale.US)
        assertNotNull(fastSpec.fastingLiveClock)
        assertEquals(fastStartMs, fastSpec.fastingLiveClock?.startedAtMs)
        assertEquals(fastTargetMs, fastSpec.fastingLiveClock?.targetEndAtMs)
        assertEquals("remaining", fastSpec.fastingLiveClock?.format)

        // Locale-aware percentage formatting (e.g., fr-FR uses localized percent format)
        val frPercent = CustomComplicationEngine.percentText(0.75, Locale.FRANCE)
        assertTrue(frPercent.contains("75") && frPercent.endsWith("%") && frPercent != "75%")

        // Live fast override: null liveFast clears stale WatchContext.fast (e.g., fast ended offline on watch)
        val endedFastMetrics = CustomComplicationEngine.buildMetrics(
            context = ctx,
            useLiveFast = true,
            liveFast = null
        )
        val endedFastShown = CustomComplicationEngine.formatMetric("fasting", "value", endedFastMetrics["fasting"], nowMs, today, Locale.US)
        assertEquals("—", endedFastShown.text)

        // Optimistic water total logged today overrides stale yesterday WaterSnapshot date
        val yesterdayWaterCtx = ctx.copy(
            water = WaterSnapshot(day = "2020-01-01", consumedMl = 500.0, fromFoodMl = null, log = emptyList())
        )
        val optimisticWaterMetrics = CustomComplicationEngine.buildMetrics(
            context = yesterdayWaterCtx,
            effectiveWaterMl = 250.0,
            effectiveWaterDay = today
        )
        assertEquals(today, optimisticWaterMetrics["water"]?.day)
        val optimisticWaterShown = CustomComplicationEngine.formatMetric("water", "value", optimisticWaterMetrics["water"], nowMs, today, Locale.US)
        assertTrue(optimisticWaterShown.text != "—")

        // Hidden stale daily metrics must not poison dailyRolloverAt for today's live metrics
        val staleSleepCtx = ctx.copy(
            sleep = ctx.sleep?.copy(day = "2020-01-01")
        )
        val staleSleepMetrics = CustomComplicationEngine.buildMetrics(staleSleepCtx)
        val weightStepsStaleSleep = CustomComplicationDefinition(
            id = "mix-stale",
            name = "Mix",
            source = "weight",
            format = "value",
            gauge = false,
            color = "weight",
            icon = "scalemass.fill",
            extras = listOf(
                CustomComplicationItem(source = "steps", format = "value", color = "steps", icon = "figure.walk"),
                CustomComplicationItem(source = "sleepDuration", format = "value", color = "sleep", icon = "bed.double.fill")
            )
        )
        val mixStaleSpec = CustomComplicationEngine.buildRenderSpec(weightStepsStaleSleep, staleSleepMetrics, nowMs, today, Locale.US)
        assertEquals(ComplicationModels.endOfLocalDayInstant(today), mixStaleSpec.dailyRolloverAt)
        assertEquals(1, mixStaleSpec.rings.size)

        // Three-value definition with large numbers compacts extras into <=7-char shortTitle instead of dropping them
        val weightStepsCal = CustomComplicationDefinition(
            id = "mix-3",
            name = "Summary",
            source = "weight",
            format = "value",
            gauge = false,
            color = "weight",
            icon = "scalemass.fill",
            extras = listOf(
                CustomComplicationItem(source = "steps", format = "value", color = "steps", icon = "figure.walk"),
                CustomComplicationItem(source = "caloriesRemaining", format = "value", color = "calories", icon = "flame.fill")
            )
        )
        val mix3Spec = CustomComplicationEngine.buildRenderSpec(weightStepsCal, metrics, nowMs, today, Locale.US)
        assertEquals("176.4", mix3Spec.shortText)
        assertEquals("7k/2k", mix3Spec.shortTitle)
        assertEquals("176.4 · 6,500 · 2,092", mix3Spec.longText)

        // caloriesRemaining with format="remaining" falls back to metric.value during compaction too
        val mix3RemainingFmt = weightStepsCal.copy(
            extras = listOf(
                CustomComplicationItem(source = "steps", format = "value", color = "steps", icon = "figure.walk"),
                CustomComplicationItem(source = "caloriesRemaining", format = "remaining", color = "calories", icon = "flame.fill")
            )
        )
        val mix3RemSpec = CustomComplicationEngine.buildRenderSpec(mix3RemainingFmt, metrics, nowMs, today, Locale.US)
        assertEquals("7k/2k", mix3RemSpec.shortTitle)

        // Native-digit locale preserves localized digits during ultra-compaction
        val arLocale = Locale.forLanguageTag("ar-EG")
        val arFmt = java.text.NumberFormat.getIntegerInstance(arLocale).apply { isGroupingUsed = false }
        val mix3ArSpec = CustomComplicationEngine.buildRenderSpec(weightStepsCal, metrics, nowMs, today, arLocale)
        assertEquals("${arFmt.format(7L)}k/${arFmt.format(2L)}k", mix3ArSpec.shortTitle)
    }

    @Test
    fun `hydration tile prioritizes primary water and quick add presets in 2x2 pages`() {
        val rawCtx = JSONObject().apply {
            put("today", "2026-11-25")
            put("waterDisplayUnit", "oz")
            put("containers", JSONArray().apply {
                put(JSONObject().apply {
                    put("id", 1)
                    put("name", "Glass")
                    put("servingVolumeMl", 236.588)
                    put("unit", "oz")
                    put("isPrimary", false)
                    put("isQuickAdd", false)
                })
                put(JSONObject().apply {
                    put("id", 2)
                    put("name", "Water Bottle")
                    put("servingVolumeMl", 473.176)
                    put("unit", "oz")
                    put("isPrimary", true)
                    put("isQuickAdd", false)
                })
                put(JSONObject().apply {
                    put("id", 3)
                    put("name", "Yeti Tumbler")
                    put("servingVolumeMl", 946.353)
                    put("unit", "oz")
                    put("isPrimary", false)
                    put("isQuickAdd", false)
                })
                put(JSONObject().apply {
                    put("id", 4)
                    put("name", "Drip Coffee")
                    put("servingVolumeMl", 240.0)
                    put("unit", "oz")
                    put("isPrimary", false)
                    put("isQuickAdd", true)
                })
                put(JSONObject().apply {
                    put("id", 5)
                    put("name", "Coke Zero")
                    put("servingVolumeMl", 354.882)
                    put("unit", "oz")
                    put("isPrimary", false)
                    put("isQuickAdd", true)
                })
            })
        }

        val ctx = ContextPayloadMapper.parseContext(rawCtx, WatchContext.empty)
        val parsed = ctx.waterContainers!!
        assertEquals(5, parsed.size)
        assertTrue(parsed[1].isPrimary)
        assertTrue(parsed[3].isQuickAdd)
        assertTrue(parsed[4].isQuickAdd)

        // Page 0 shows primary vessel + Quick Add presets (Drip Coffee, Coke Zero) + first remaining vessel
        val page0 = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 700.0,
            goalMl = 2400.0,
            queuedMl = 0.0,
            watchCtx = ctx,
            containers = parsed,
            locale = Locale.US,
            page = 0
        )
        assertEquals(4, page0.containers.size)
        assertEquals(0, page0.pageIndex)
        assertEquals(2, page0.totalPages)
        assertEquals(5, page0.totalContainerCount)
        assertEquals(listOf(2, 4, 5, 1), page0.containers.map { it.id })
        assertFalse(page0.containers[0].isQuickAdd)
        assertTrue(page0.containers[1].isQuickAdd)
        assertTrue(page0.containers[2].isQuickAdd)
        assertEquals("Drip Coffee", page0.containers[1].name)
        assertEquals("Coke Zero", page0.containers[2].name)

        // Page 1 shows remaining standard vessel(s), and page 2 wraps cleanly back to page 0
        val page1 = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 700.0,
            goalMl = 2400.0,
            queuedMl = 0.0,
            watchCtx = ctx,
            containers = parsed,
            locale = Locale.US,
            page = 1
        )
        assertEquals(1, page1.pageIndex)
        assertEquals(2, page1.totalPages)
        assertEquals(listOf(3), page1.containers.map { it.id })

        val wrappedPage = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 700.0,
            goalMl = 2400.0,
            queuedMl = 0.0,
            watchCtx = ctx,
            containers = parsed,
            locale = Locale.US,
            page = 2
        )
        assertEquals(0, wrappedPage.pageIndex)
        assertEquals(listOf(2, 4, 5, 1), wrappedPage.containers.map { it.id })
    }

    @Test
    fun `trend page model surfaces synced body fat even with check-in hidden or single bf reading`() {
        val today = "2026-11-25"
        // Case 1: Only 1 Body Fat % reading synced from smart scale, plus socks-on weigh-in today
        val historySingleBf = listOf(
            HistoryPoint("2026-11-20", 82.0, 19.4),
            HistoryPoint(today, 81.2, null)
        )
        val ctxSingleBf = WatchContext(
            today = today,
            todayWeightKg = 81.2,
            todayBodyFatPercentage = null,
            lastWeightKg = 82.0,
            lastBodyFatPercentage = 19.4,
            lastEntryDate = "2026-11-20",
            weightUnit = WeightUnit.KG
        )
        val singleBfModel = TrendModels.buildTrendPageModel(
            watchCtx = ctxSingleBf,
            history = historySingleBf,
            unit = WeightUnit.KG,
            today = today
        )
        assertTrue(singleBfModel.hasAnyBodyFat)
        assertEquals(81.2, singleBfModel.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(-0.8, singleBfModel.weightDeltaDisplay ?: 0.0, 0.01)
        assertEquals(19.4, singleBfModel.latestBodyFatPercent ?: 0.0, 0.01)
        assertNull(singleBfModel.bodyFatDeltaPercent)
        assertEquals(1, singleBfModel.bodyFatSamples.size)

        // Case 2: Multiple synced smart-scale Weight + Body Fat % readings compute both deltas
        val historyMultiBf = listOf(
            HistoryPoint("2026-11-18", 82.5, 19.8),
            HistoryPoint("2026-11-22", 81.8, 19.3),
            HistoryPoint(today, 81.1, 18.9)
        )
        val ctxMultiBf = WatchContext(
            today = today,
            todayWeightKg = 81.1,
            todayBodyFatPercentage = 18.9,
            weightUnit = WeightUnit.KG
        )
        val multiBfModel = TrendModels.buildTrendPageModel(
            watchCtx = ctxMultiBf,
            history = historyMultiBf,
            unit = WeightUnit.KG,
            today = today
        )
        assertTrue(multiBfModel.hasAnyBodyFat)
        assertEquals(81.1, multiBfModel.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(-1.4, multiBfModel.weightDeltaDisplay ?: 0.0, 0.01)
        assertEquals(18.9, multiBfModel.latestBodyFatPercent ?: 0.0, 0.01)
        assertEquals(-0.9, multiBfModel.bodyFatDeltaPercent ?: 0.0, 0.01)
        assertEquals(3, multiBfModel.bodyFatSamples.size)
    }

    @Test
    fun `direct api client medication write decision and parsers match mobile contracts`() {
        val emptyEntries = JSONArray()
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.Create("taken"),
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "med-1",
                scheduleId = "sched-1",
                taken = true,
                skipped = false,
                entries = emptyEntries
            )
        )
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.Create("prn_taken"),
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "med-prn",
                scheduleId = "",
                taken = true,
                skipped = false,
                entries = emptyEntries
            )
        )

        val takenEntries = JSONArray().apply {
            put(
                JSONObject()
                    .put("id", "entry-99")
                    .put("medication_id", "med-1")
                    .put("schedule_id", "sched-1")
                    .put("status", "taken")
            )
        }
        // Idempotent when already taken
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.None,
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "med-1",
                scheduleId = "sched-1",
                taken = true,
                skipped = false,
                entries = takenEntries
            )
        )
        // Unticking deletes the matched entry
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.Delete("entry-99"),
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "med-1",
                scheduleId = "sched-1",
                taken = false,
                skipped = false,
                entries = takenEntries
            )
        )

        val containersRaw = JSONArray().apply {
            // Unlinked 12oz Can & 32oz Owala: server already stores `volume` in ml
            put(
                JSONObject()
                    .put("id", 1)
                    .put("name", "12oz Can")
                    .put("volume", 354.882)
                    .put("unit", "oz")
                    .put("servings_per_container", 1)
                    .put("is_primary", false)
                    .put("is_quick_add", false)
            )
            put(
                JSONObject()
                    .put("id", 2)
                    .put("name", "32oz Owala")
                    .put("volume", 946.352)
                    .put("unit", "oz")
                    .put("servings_per_container", 1)
                    .put("is_primary", true)
                    .put("is_quick_add", false)
            )
            // Food-linked Quick Add with explicit `linked_variant_water_ml` + `hydration_factor`
            put(
                JSONObject()
                    .put("id", 3)
                    .put("name", "Drip Coffee")
                    .put("volume", 0.0)
                    .put("unit", "ml")
                    .put("servings_per_container", 1)
                    .put("is_primary", false)
                    .put("is_quick_add", true)
                    .put("linked_food_id", "f-coffee")
                    .put("linked_quantity", 2)
                    .put("linked_variant_serving_size", "1")
                    .put("linked_variant_serving_unit", "cup")
                    .put("linked_variant_water_ml", "240")
                    .put("hydration_factor", 0.9)
            )
            // Food-linked Quick Add falling back to `linked_variant_serving_unit = "fl oz"` + `hydration_factor`
            put(
                JSONObject()
                    .put("id", 4)
                    .put("name", "Coke")
                    .put("volume", 0.0)
                    .put("unit", "ml")
                    .put("servings_per_container", 1)
                    .put("is_primary", false)
                    .put("is_quick_add", true)
                    .put("linked_food_id", "f-coke")
                    .put("linked_quantity", 12)
                    .put("linked_variant_serving_size", 12)
                    .put("linked_variant_serving_unit", "fl oz")
                    .put("hydration_factor", 1.0)
            )
            // Food-linked Quick Add with weight unit "oz" (not fluid) and no explicit water_ml -> 0 ml
            put(
                JSONObject()
                    .put("id", 5)
                    .put("name", "Protein Bar")
                    .put("volume", 0.0)
                    .put("unit", "ml")
                    .put("servings_per_container", 1)
                    .put("is_primary", false)
                    .put("is_quick_add", true)
                    .put("linked_food_id", "f-bar")
                    .put("linked_quantity", 2)
                    .put("linked_variant_serving_unit", "oz")
            )
        }.toString()
        val parsedContainers = WearDirectApiClient.parseWaterContainersJson(containersRaw, "oz")!!
        assertEquals(5, parsedContainers.size)
        // 12oz Can: 354.882 ml -> "+12 oz" (never double-converted to +354.9 oz)
        assertEquals(354.882, parsedContainers[0].servingVolumeMl, 0.001)
        assertEquals("oz", parsedContainers[0].unit)
        assertEquals("12 oz", formatWaterAmount(parsedContainers[0].servingVolumeMl, parsedContainers[0].unit, Locale.US))
        // 32oz Owala: 946.352 ml -> "+32 oz"
        assertTrue(parsedContainers[1].isPrimary)
        assertEquals(946.352, parsedContainers[1].servingVolumeMl, 0.001)
        assertEquals("32 oz", formatWaterAmount(parsedContainers[1].servingVolumeMl, parsedContainers[1].unit, Locale.US))
        // Drip Coffee: (240 * 2 / 1) * 0.9 = 432.0 ml, displays in user's global "oz" preference
        assertTrue(parsedContainers[2].isQuickAdd)
        assertEquals(432.0, parsedContainers[2].servingVolumeMl, 0.001)
        assertEquals("oz", parsedContainers[2].unit)
        assertEquals("14.6 oz", formatWaterAmount(parsedContainers[2].servingVolumeMl, parsedContainers[2].unit, Locale.US))
        // Coke: 12 fl oz * 29.5735 * 1.0 = 354.882 ml -> "12 oz"
        assertTrue(parsedContainers[3].isQuickAdd)
        assertEquals(354.882, parsedContainers[3].servingVolumeMl, 0.001)
        assertEquals("oz", parsedContainers[3].unit)
        assertEquals("12 oz", formatWaterAmount(parsedContainers[3].servingVolumeMl, parsedContainers[3].unit, Locale.US))
        // Solid weight "oz" returns 0 ml
        assertEquals(0.0, parsedContainers[4].servingVolumeMl, 0.001)

        val rangeRaw = JSONArray().apply {
            put(JSONObject().put("entry_date", "2026-11-25").put("weight", 81.4))
            put(JSONObject().put("entry_date", "2026-11-21").put("weight", 82.1).put("body_fat_percentage", 18.7))
        }.toString()
        val parsedHistory = WearDirectApiClient.parseHistoryRangeJson(rangeRaw, "2026-11-25")!!
        assertEquals(81.4, parsedHistory.todayWeightKg ?: 0.0, 0.01)
        assertNull(parsedHistory.todayBodyFatPercentage)
        assertEquals(18.7, parsedHistory.lastBodyFatPercentage ?: 0.0, 0.01)

        val (eatingWindowFast, eatingKnown) = WearDirectApiClient.parseFastJson(
            JSONObject()
                .put("id", "f1")
                .put("start_time", "2026-11-25T12:00:00.000Z")
                .put("is_eating_window", true)
                .toString()
        )
        assertTrue(eatingKnown)
        assertNull(eatingWindowFast)
    }

    @Test
    fun `medications tile paginates full day doses in 4-item pages and resolves inline taps on any page`() {
        val today = CheckInDate.today()
        val doses = listOf(
            MedicationDose("m1:s1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.TAKEN),
            MedicationDose("m2:s1", "m2", "s1", "Omega 3", "1000 mg", "08:00 AM", MedicationDoseStatus.PENDING),
            MedicationDose("m3:s1", "m3", "s1", "Creatine", "5 g", "12:00 PM", MedicationDoseStatus.PENDING),
            MedicationDose("m4:s1", "m4", "s1", "Zinc", "30 mg", "06:00 PM", MedicationDoseStatus.PENDING),
            MedicationDose("m5:s1", "m5", "s1", "Magnesium", "400 mg", "09:00 PM", MedicationDoseStatus.PENDING),
            MedicationDose("m6:s1", "m6", "s1", "Melatonin", "3 mg", "10:00 PM", MedicationDoseStatus.PENDING)
        )
        val snap = MedicationSnapshot(day = today, doses = doses)

        val page0 = TileModels.buildMedicationsTileModel(snap, page = 0)
        assertEquals(6, page0.totalCount)
        assertEquals(5, page0.pendingCount)
        assertEquals(1, page0.takenCount)
        assertEquals(0, page0.pageIndex)
        assertEquals(2, page0.totalPages)
        assertEquals(listOf("m2:s1", "m3:s1", "m4:s1", "m5:s1"), page0.doseRows.map { it.doseId })

        val page1 = TileModels.buildMedicationsTileModel(snap, page = 1)
        assertEquals(1, page1.pageIndex)
        assertEquals(2, page1.totalPages)
        assertEquals(listOf("m6:s1", "m1:s1"), page1.doseRows.map { it.doseId })
        assertTrue(page1.doseRows[0].isDirectlyActionable)
        assertFalse(page1.doseRows[1].isDirectlyActionable)

        // Inline tap on page 2 (m6:s1) resolves cleanly via resolveMedicationTileActionDose
        val page2Row = page1.doseRows[0]
        val actionId = formatMedicationTileActionId("tok123", today, page2Row.doseId, page2Row.displayFingerprint)
        val resolved = resolveMedicationTileActionDose(actionId, "tok123", snap)
        assertEquals("m6:s1", resolved?.id)

        // When Medications is turned off in Settings -> Features, pagination collapses to turned-off state
        val medSnap = snap
        val turnedOffPaged = TileModels.buildMedicationsTileModel(medSnap, turnedOff = true, page = 1)
        assertTrue(turnedOffPaged.turnedOff)
        assertFalse(turnedOffPaged.hasData)
        assertTrue(turnedOffPaged.doseRows.isEmpty())
        assertEquals(0, turnedOffPaged.pageIndex)
        assertEquals(1, turnedOffPaged.totalPages)
    }

    @Test
    fun `credential generation watermark, outbound channel split, and future-date trend guard`() {
        // Watermark rejects stale credential generations while accepting newer or equal generations
        assertTrue(WearServerCredentialsStore.shouldAcceptGeneration(incomingGeneration = 1L, watermark = 0L))
        assertTrue(WearServerCredentialsStore.shouldAcceptGeneration(incomingGeneration = 5L, watermark = 5L))
        assertTrue(WearServerCredentialsStore.shouldAcceptGeneration(incomingGeneration = 6L, watermark = 5L))
        assertFalse(WearServerCredentialsStore.shouldAcceptGeneration(incomingGeneration = 4L, watermark = 5L))
        assertFalse(WearServerCredentialsStore.shouldAcceptGeneration(incomingGeneration = 0L, watermark = 5L))

        val fpA = WearServerCredentialsStore.computeFingerprint(
            generation = 7L,
            ownerId = "srv-1",
            baseUrl = "https://sparky.example.com",
            headers = mapOf("Authorization" to "Bearer abc", "X-Proxy" to "1")
        )
        val fpB = WearServerCredentialsStore.computeFingerprint(
            generation = 7L,
            ownerId = "srv-1",
            baseUrl = "https://sparky.example.com",
            headers = mapOf("X-Proxy" to "1", "Authorization" to "Bearer abc")
        )
        assertEquals(fpA, fpB)

        // Bridge-only workout telemetry never routes through blocking direct HTTP channel
        assertTrue(WearSessionManager.DIRECT_HTTP_TYPES.contains("waterIntake"))
        assertTrue(WearSessionManager.DIRECT_HTTP_TYPES.contains("medicationTaken"))
        assertTrue(WearSessionManager.DIRECT_HTTP_TYPES.contains("checkIn"))
        assertFalse(WearSessionManager.DIRECT_HTTP_TYPES.contains("setCompleted"))
        assertFalse(WearSessionManager.DIRECT_HTTP_TYPES.contains("heartRateBatch"))
        assertFalse(WearSessionManager.DIRECT_HTTP_TYPES.contains("runFinished"))

        // Future-dated watchCtx.today (e.g. timezone rollback) must NOT relabel future readings onto local today
        val futureCtx = WatchContext(
            today = "2026-11-26",
            todayWeightKg = 79.0,
            todayBodyFatPercentage = 17.5,
            lastEntryDate = "2026-11-24",
            lastWeightKg = 81.0,
            lastBodyFatPercentage = 18.5,
            weightUnit = WeightUnit.KG
        )
        val rollbackTrend = TrendModels.buildTrendPageModel(
            watchCtx = futureCtx,
            history = listOf(HistoryPoint("2026-11-24", 81.0, 18.5)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(81.0, rollbackTrend.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(18.5, rollbackTrend.latestBodyFatPercent ?: 0.0, 0.01)
        assertEquals(listOf("2026-11-24"), rollbackTrend.weightSamples.map { it.day })
    }

    @Test
    fun `medication 2x2 grid compacts long names within 12-char budget and withholds direct action when strength clips`() {
        val today = CheckInDate.today()
        val gridSnap = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("m1:s1", "m1", "s1", "Methotrex 10 mg", "1 tab", "08:00 AM", MedicationDoseStatus.PENDING),
                MedicationDose("m2:s1", "m2", "s1", "Methotrex 15 mg", "1 tab", "08:00 PM", MedicationDoseStatus.PENDING),
                MedicationDose("m3:s1", "m3", "s1", "Methotrexate 125000 mcg", "1 tab", "09:00 PM", MedicationDoseStatus.PENDING)
            )
        )
        val model = TileModels.buildMedicationsTileModel(gridSnap, page = 0)
        assertEquals(3, model.doseRows.size)
        val row10 = model.doseRows.first { it.doseId == "m1:s1" }
        val row15 = model.doseRows.first { it.doseId == "m2:s1" }
        val rowClipped = model.doseRows.first { it.doseId == "m3:s1" }

        assertTrue(row10.name.length <= 12)
        assertTrue(row15.name.length <= 12)
        assertTrue(row10.name != row15.name)
        assertTrue(row10.name.endsWith("10 mg"))
        assertTrue(row15.name.endsWith("15 mg"))
        assertTrue(row10.isDirectlyActionable)
        assertTrue(row15.isDirectlyActionable)

        // When strength tail exceeds grid budget, direct LoadAction must be withheld
        assertFalse(rowClipped.isDirectlyActionable)
        val blockedAction = formatMedicationTileActionId("tok123", today, rowClipped.doseId, rowClipped.displayFingerprint)
        assertNull(resolveMedicationTileActionDose(blockedAction, "tok123", gridSnap))

        // Standard 10-12 char names like Famotidine and Rosuvastatin render uncut in the 2x2 grid
        val uncutSnap = MedicationSnapshot(
            day = today,
            doses = listOf(
                MedicationDose("u1:s1", "u1", "s1", "Rosuvastatin", "10 mg", "08:00 AM", MedicationDoseStatus.PENDING),
                MedicationDose("u2:s1", "u2", "s1", "Famotidine", "20 mg", "08:00 AM", MedicationDoseStatus.PENDING),
                MedicationDose("u3:s1", "u3", "s1", "Valsartan", "80 mg", "08:00 AM", MedicationDoseStatus.PENDING),
                MedicationDose("u4:s1", "u4", "s1", "Adderall", "10 mg", "08:00 AM", MedicationDoseStatus.PENDING)
            )
        )
        val uncutModel = TileModels.buildMedicationsTileModel(uncutSnap, page = 0)
        assertEquals("Rosuvastatin", uncutModel.doseRows.first { it.doseId == "u1:s1" }.name)
        assertEquals("Famotidine", uncutModel.doseRows.first { it.doseId == "u2:s1" }.name)
    }

    @Test
    fun `credential revocation barrier, persisted checkIn and fast patching, and token-scoped in-flight tracking`() {
        // Active credential record allows equal-generation duplicate; cleared record rejects equal-generation replay
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 3L,
                hasActiveBlob = true
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 5L,
                hasActiveBlob = false
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 6L,
                lastSavedGen = 5L,
                revokedGen = 5L,
                hasActiveBlob = false
            )
        )

        // Stale accountCleared generation is rejected when newer credentials or context are active
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 4L,
                lastSavedGen = 6L,
                revokedGen = 2L,
                hasActiveBlob = true,
                activeContextGeneration = 6L
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 4L,
                lastSavedGen = 3L,
                revokedGen = 3L,
                hasActiveBlob = false,
                activeContextGeneration = 5L
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 6L,
                lastSavedGen = 5L,
                revokedGen = 2L,
                hasActiveBlob = true,
                activeContextGeneration = 5L
            )
        )

        // Retired contextGeneration <= revocation barrier is rejected
        assertFalse(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 0L,
                lastSavedCredGen = 5L,
                revokedCredGen = 5L,
                hasActiveCredBlob = false
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 6L,
                currentAcceptedContextGen = 0L,
                lastSavedCredGen = 5L,
                revokedCredGen = 5L,
                hasActiveCredBlob = false
            )
        )

        // Same-day direct checkIn patches todayWeightKg + history + ackedClientIds while preserving bodyFatPercentage
        val ctxObj = JSONObject()
            .put("today", "2026-11-25")
            .put("todayWeightKg", 80.0)
            .put("todayBodyFatPercentage", 18.2)
            .put("history", JSONArray().put(JSONObject().put("day", "2026-11-24").put("weightKg", 80.5)))
        CheckInStore.patchContextJsonObject(
            obj = ctxObj,
            ackedClientId = "chk-1",
            entryDate = "2026-11-25",
            hasCheckIn = true,
            checkInWeightKg = 79.4,
            checkInBodyFat = null,
            fastUpdated = true,
            fast = WatchFast(startedAtMs = 1_700_000_000_000L, targetEndAtMs = 1_700_057_600_000L, label = "16:8")
        )
        assertEquals(79.4, ctxObj.getDouble("todayWeightKg"), 0.001)
        assertEquals(18.2, ctxObj.getDouble("todayBodyFatPercentage"), 0.001)
        assertEquals(2, ctxObj.getJSONArray("history").length())
        assertEquals("chk-1", ctxObj.getJSONArray("ackedClientIds").getString(0))
        assertTrue(ctxObj.getBoolean("fastKnown"))
        assertEquals(1_700_000_000_000L, ctxObj.getJSONObject("fast").getLong("startedAt"))

        // Non-matching-day direct checkIn upserts history + ackedClientId while leaving todayWeightKg untouched
        CheckInStore.patchContextJsonObject(
            obj = ctxObj,
            ackedClientId = "chk-mismatch",
            entryDate = "2026-11-26",
            localToday = "2026-11-25",
            hasCheckIn = true,
            checkInWeightKg = 79.0,
            fastUpdated = true,
            fast = null
        )
        assertEquals(79.4, ctxObj.getDouble("todayWeightKg"), 0.001)
        assertEquals(2, ctxObj.getJSONArray("ackedClientIds").length())
        assertEquals(3, ctxObj.getJSONArray("history").length())
        assertTrue(ctxObj.isNull("fast"))

        // Token-scoped in-flight tracker preserves new generation tokens across ClearQueued(retiredThroughGeneration)
        val tracker = InFlightClientTracker()
        tracker.register("cid-1", opToken = 10L, enqueuedGeneration = 1L)
        tracker.register("cid-1", opToken = 11L, enqueuedGeneration = 2L)
        tracker.register("cid-2", opToken = 12L, enqueuedGeneration = 1L)
        tracker.clearRetired(retiredThroughGeneration = 1L)
        assertTrue(tracker.isInFlight("cid-1"))
        assertFalse(tracker.isInFlight("cid-2"))
        tracker.release("cid-1", opToken = 10L)
        assertTrue(tracker.isInFlight("cid-1"))
        tracker.release("cid-1", opToken = 11L)
        assertFalse(tracker.isInFlight("cid-1"))

        // Monotonic live-refresh sequence rejects out-of-order older completions
        val seq = java.util.concurrent.atomic.AtomicLong(0L)
        assertTrue(WearSessionManager.tryAdvanceRefreshSeq(seq, 2L))
        assertFalse(WearSessionManager.tryAdvanceRefreshSeq(seq, 1L))
        assertTrue(WearSessionManager.tryAdvanceRefreshSeq(seq, 3L))
    }

    @Test
    fun `in-memory direct checkIn settlement retires superseded SAVED record so subsequent server refresh shows newest weight`() {
        val today = "2026-11-25"
        val base0 = WatchContext(
            today = today,
            todayWeightKg = 80.0,
            todayBodyFatPercentage = 18.0,
            weightUnit = WeightUnit.KG
        )
        val hist0 = listOf(HistoryPoint(today, 80.0, 18.0))

        // 81 kg queued, then superseded by 82 kg queued
        val rec81 = CheckInStore.PendingWeightRecord(
            id = "c-81",
            day = today,
            weightKg = 81.0,
            bodyFatPercentage = null,
            state = SyncState.QUEUED,
            ownerId = "srv-1",
            baselineWeightKg = 80.0
        )
        val rec82 = CheckInStore.PendingWeightRecord(
            id = "c-82",
            day = today,
            weightKg = 82.0,
            bodyFatPercentage = null,
            state = SyncState.QUEUED,
            ownerId = "srv-1",
            baselineWeightKg = 80.0,
            hasSupersededInFlight = true
        )
        val bothQueued = CheckInStore.appendQueuedWeightRecord(listOf(rec81), rec82)
        val acked82 = CheckInStore.applyWeightAcknowledgement(bothQueued, "c-82", ok = true).records
        val (settledCtx, settledHist) = CheckInStore.applyDirectOutcomeToBaseState(
            baseCtx = base0,
            baseHist = hist0,
            clientId = "c-82",
            outcome = DirectWriteOutcome.Applied(
                syncedDomain = "checkIn",
                entryDate = today,
                weightKg = 82.0,
                bodyFatPercentage = null
            ),
            today = today
        )
        assertEquals(82.0, settledCtx.todayWeightKg ?: 0.0, 0.001)
        assertEquals(18.0, settledCtx.todayBodyFatPercentage ?: 0.0, 0.001)
        assertTrue(settledCtx.ackedClientIds.contains("c-82"))
        assertTrue(CheckInStore.isSavedWeightRecordSettled(acked82.single(), settledCtx, settledHist))

        // Newer unacked QUEUED edit (82.5 kg) is NOT retired by c-82 settlement
        val rec825 = rec82.copy(id = "c-825", weightKg = 82.5, state = SyncState.QUEUED)
        assertFalse(CheckInStore.isQueuedWeightRecordSettled(rec825, settledCtx, settledHist))

        // Subsequent direct server refresh with 83 kg shows 83 kg cleanly
        val refreshedCtx = settledCtx.copy(
            todayWeightKg = 83.0,
            history = listOf(HistoryPoint(today, 83.0, 18.0))
        )
        val tile = TileModels.buildWeightTileModel(
            watchCtx = refreshedCtx,
            history = refreshedCtx.history,
            unit = WeightUnit.KG,
            today = today,
            todayUnconfirmed = false
        )
        assertEquals("83.0 kg", tile.weightValueText)
    }

    @Test
    fun `weightless dated body-fat reading is preserved for lastBf and trend curve without adding 0 kg weight sample`() {
        val rawRange = JSONArray()
            .put(JSONObject().put("entry_date", "2026-11-23").put("weight", 82.0).put("body_fat_percentage", 19.0))
            .put(JSONObject().put("entry_date", "2026-11-24").put("body_fat_percentage", 21.0))
            .toString()

        val parsed = WearDirectApiClient.parseHistoryRangeJson(rawRange, today = "2026-11-25")!!
        assertEquals(82.0, parsed.lastWeightKg ?: 0.0, 0.001)
        assertEquals("2026-11-23", parsed.lastEntryDate)
        assertEquals(21.0, parsed.lastBodyFatPercentage ?: 0.0, 0.001)
        assertEquals(listOf("2026-11-23"), parsed.history.map { it.day })
        assertEquals(listOf("2026-11-23", "2026-11-24"), parsed.bodyFatHistory.map { it.day })

        val ctx = WatchContext(
            today = "2026-11-25",
            lastEntryDate = parsed.lastEntryDate,
            lastWeightKg = parsed.lastWeightKg,
            lastBodyFatPercentage = parsed.lastBodyFatPercentage,
            history = parsed.history,
            bodyFatHistory = parsed.bodyFatHistory,
            weightUnit = WeightUnit.KG
        )
        val trend = TrendModels.buildTrendPageModel(
            watchCtx = ctx,
            history = parsed.history,
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(1, trend.weightSamples.size)
        assertEquals(82.0, trend.weightSamples.single().weightKg, 0.001)
        assertEquals(2, trend.bodyFatSamples.size)
        assertEquals(21.0, trend.latestBodyFatPercent ?: 0.0, 0.001)
        assertEquals(2.0, trend.bodyFatDeltaPercent ?: 0.0, 0.001)

        // Context generation watermark requires strictly newer generation on owner switch and fastEnd startedAt guards replay
        assertFalse(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 7L,
                currentAcceptedContextGen = 7L,
                lastSavedCredGen = 7L,
                revokedCredGen = 5L,
                hasActiveCredBlob = true,
                requireStrictlyNewerContextGen = true
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 8L,
                currentAcceptedContextGen = 7L,
                lastSavedCredGen = 7L,
                revokedCredGen = 5L,
                hasActiveCredBlob = true,
                requireStrictlyNewerContextGen = true
            )
        )
        assertTrue(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = "fast-old",
                endedAtMs = 1_700_000_000_000L,
                serverFastId = "fast-new",
                serverStartedAtMs = 1_700_000_005_000L
            )
        )
        assertFalse(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = "fast-same",
                endedAtMs = 1_700_000_000_000L,
                serverFastId = "fast-same",
                serverStartedAtMs = 1_699_990_000_000L
            )
        )
        assertTrue(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = null,
                expectedStartedAtMs = 1_700_000_000_000L,
                endedAtMs = 1_700_000_000_000L,
                serverFastId = "fast-new",
                serverStartedAtMs = 1_700_000_002_000L
            )
        )
        assertTrue(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = null,
                expectedStartedAtMs = 0L,
                endedAtMs = 1_700_003_600_000L,
                serverFastId = "fast-same",
                serverStartedAtMs = 1_700_000_000_000L
            )
        )
        assertFalse(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = null,
                expectedStartedAtMs = 1_700_000_000_400L,
                endedAtMs = 1_700_003_600_000L,
                serverFastId = "fast-same",
                serverStartedAtMs = 1_700_000_000_000L
            )
        )
    }

    @Test
    fun `mTLS direct HTTP disablement preserves context acceptance and TrendModels enforces 14-day curve cutoff`() {
        // When mTLS disables direct HTTP (hasActiveCredBlob = false, lastSavedCredGen = 5, revokedCredGen = 0),
        // phone context updates at generation 5 for the current owner remain accepted
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 0L,
                hasActiveCredBlob = false
            )
        )

        // TrendModels keeps >14d latest reading for hero display while filtering chart curve & delta to 14-day window
        val oldAndRecentHistory = listOf(
            HistoryPoint("2026-11-01", 85.0, 22.0),
            HistoryPoint("2026-11-20", 81.0, 19.0),
            HistoryPoint("2026-11-25", 80.2, 18.6)
        )
        val trend14d = TrendModels.buildTrendPageModel(
            watchCtx = WatchContext(today = "2026-11-25", weightUnit = WeightUnit.KG),
            history = oldAndRecentHistory,
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(80.2, trend14d.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(listOf("2026-11-20", "2026-11-25"), trend14d.weightSamples.map { it.day })
        assertEquals(-0.8, trend14d.weightDeltaDisplay ?: 0.0, 0.01)
        assertEquals(listOf("2026-11-20", "2026-11-25"), trend14d.bodyFatSamples.map { it.day })
        assertEquals(-0.4, trend14d.bodyFatDeltaPercent ?: 0.0, 0.01)

        // Only >14d reading: hero still shows 85.0 kg / 22.0% while 14-day chart samples stay empty
        val staleOnlyTrend = TrendModels.buildTrendPageModel(
            watchCtx = WatchContext(today = "2026-11-25", weightUnit = WeightUnit.KG),
            history = listOf(HistoryPoint("2026-11-01", 85.0, 22.0)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(85.0, staleOnlyTrend.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(22.0, staleOnlyTrend.latestBodyFatPercent ?: 0.0, 0.01)
        assertTrue(staleOnlyTrend.weightSamples.isEmpty())
        assertTrue(staleOnlyTrend.bodyFatSamples.isEmpty())
    }

    @Test
    fun `confirmed water tap retirement, persisted waterLog and refresh snapshot, midnight BF guard, and Quick Add disambiguation`() {
        // 1. Concurrent delete + tap (500 -> 250 -> 500 mL): confirmed tap retires immediately instead of lingering as +250 SAVED
        val tap250 = PendingWaterTap(
            id = "tap-250",
            volumeMl = 250.0,
            containerId = 1,
            containerName = "Glass",
            createdAtMs = 1_000L,
            day = "2026-11-25",
            state = SyncState.SAVED,
            ownerId = "srv-1"
        )
        val baselines = mutableMapOf("tap-250" to 500.0)
        val (remainingTaps, retired) = CheckInStore.settleConfirmedWaterTap(
            existingTaps = listOf(tap250),
            baselines = baselines,
            confirmedTapId = "tap-250"
        )
        assertTrue(retired)
        assertTrue(remainingTaps.isEmpty())
        assertTrue(baselines.isEmpty())

        // 2. Persist waterLog, waterLog delete pruning, and refreshed history snapshot in last_context_json
        val ctxJson = JSONObject()
            .put("today", "2026-11-24")
            .put("todayWeightKg", 81.0)
            .put("todayBodyFatPercentage", 19.5)
        val liveSnap = DirectLiveSnapshot(
            ownerId = "srv-1",
            day = "2026-11-25",
            waterConsumedMl = 500.0,
            waterLog = listOf(
                WaterLogEntry("w1", "Glass", 250.0, "08:00"),
                WaterLogEntry("w2", "Bottle", 250.0, "09:00")
            ),
            history = listOf(HistoryPoint("2026-11-24", 81.0, 19.5)),
            todayWeightKg = null,
            todayBodyFatPercentage = null,
            lastWeightKg = 81.0,
            lastBodyFatPercentage = 19.5,
            lastEntryDate = "2026-11-24"
        )
        CheckInStore.patchContextJsonObject(
            obj = ctxJson,
            ackedClientId = null,
            entryDate = "2026-11-25",
            waterConsumedMl = liveSnap.waterConsumedMl,
            waterLog = liveSnap.waterLog,
            refreshedSnapshot = liveSnap
        )
        assertEquals("2026-11-25", ctxJson.getString("today"))
        assertFalse(ctxJson.has("todayWeightKg"))
        assertFalse(ctxJson.has("todayBodyFatPercentage"))
        assertEquals(81.0, ctxJson.getDouble("lastWeightKg"), 0.001)
        assertEquals(2, ctxJson.getJSONArray("waterLog").length())

        CheckInStore.patchContextJsonObject(
            obj = ctxJson,
            ackedClientId = "del-1",
            entryDate = "2026-11-25",
            waterConsumedMl = 250.0,
            deletedWaterEntryId = "w1"
        )
        assertEquals(1, ctxJson.getJSONArray("waterLog").length())
        assertEquals("w2", ctxJson.getJSONArray("waterLog").getJSONObject(0).getString("id"))

        // 3. Midnight check-in guard: yesterday's baseCtx.todayBodyFatPercentage does NOT bleed onto today's weight-only check-in
        val yesterdayBase = WatchContext(
            today = "2026-11-24",
            todayWeightKg = 81.0,
            todayBodyFatPercentage = 19.5,
            weightUnit = WeightUnit.KG
        )
        val (todaySettledCtx, _) = CheckInStore.applyDirectOutcomeToBaseState(
            baseCtx = yesterdayBase,
            baseHist = listOf(HistoryPoint("2026-11-24", 81.0, 19.5)),
            clientId = "chk-midnight",
            outcome = DirectWriteOutcome.Applied(
                syncedDomain = "checkIn",
                entryDate = "2026-11-25",
                weightKg = 80.4,
                bodyFatPercentage = null
            ),
            today = "2026-11-25"
        )
        assertEquals(80.4, todaySettledCtx.todayWeightKg ?: 0.0, 0.001)
        assertNull(todaySettledCtx.todayBodyFatPercentage)

        // 4. Shared-prefix Quick Add drinks keep distinguishing suffix, while exact label+volume collisions withhold direct action
        val containers = listOf(
            WaterContainer(id = 1, name = "Water Bottle", servingVolumeMl = 500.0, unit = "ml", isPrimary = true),
            WaterContainer(id = 2, name = "Iced Coffee Regular", servingVolumeMl = 240.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 3, name = "Iced Coffee Decaf", servingVolumeMl = 240.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 4, name = "Custom Shake", servingVolumeMl = 300.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 5, name = "Custom Shake", servingVolumeMl = 300.0, unit = "ml", isQuickAdd = true)
        )
        val waterTile = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 0.0,
            goalMl = 2500.0,
            queuedMl = 0.0,
            watchCtx = WatchContext(waterDisplayUnit = "ml"),
            containers = containers,
            locale = Locale.US,
            page = 0
        )
        val regChip = waterTile.containers.first { it.id == 2 }
        val decafChip = waterTile.containers.first { it.id == 3 }
        assertTrue(regChip.name != decafChip.name)
        assertTrue(regChip.isDirectlyActionable)
        assertTrue(decafChip.isDirectlyActionable)

        val allWaterChips = TileModels.buildAllWaterContainerChips(
            TileModels.orderWaterTileContainers(containers),
            WatchContext(waterDisplayUnit = "ml"),
            Locale.US
        )
        assertFalse(allWaterChips.first { it.id == 4 }.isDirectlyActionable)
        assertFalse(allWaterChips.first { it.id == 5 }.isDirectlyActionable)
    }

    @Test
    fun `session recovery without preset, fast auto-calculated id and clock-skew clamp, water timeFormat, midnight water persistence, and pending fast refresh guard`() {
        // 1. Recover pre-minted workout session even when preset was deleted (presetBody = null),
        // reject 0-exercise sessions, and match edited/reordered presets by (exercise_id, occurrence) + set_number
        val emptySessionJson = JSONObject()
            .put("id", "sess-empty")
            .put("name", "Empty")
            .put("exercises", JSONArray())
            .toString()
        assertNull(
            WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
                sessionBody = emptySessionJson,
                presetBody = null,
                fallbackSessionId = "sess-empty"
            )
        )
        val zeroSetsSessionJson = JSONObject()
            .put("id", "sess-zero-sets")
            .put("name", "Zero Sets")
            .put("exercises", JSONArray().put(
                JSONObject()
                    .put("id", "entry-empty")
                    .put("exercise_id", "ex-bench")
                    .put("sets", JSONArray())
            ))
            .toString()
        assertNull(
            WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
                sessionBody = zeroSetsSessionJson,
                presetBody = null,
                fallbackSessionId = "sess-zero-sets"
            )
        )

        val storedSessionJson = JSONObject()
            .put("id", "sess-recovered-1")
            .put("name", "Push Day")
            .put("exercises", JSONArray()
                .put(
                    JSONObject()
                        .put("id", "entry-1")
                        .put("exercise_id", "ex-bench")
                        .put("superset_group", 1)
                        .put("exercise_snapshot", JSONObject()
                            .put("id", "ex-bench")
                            .put("name", "Bench Press")
                            .put("modality", "weight_reps")
                            .put("equipment", JSONArray().put("Barbell"))
                        )
                        .put("sets", JSONArray().put(
                            JSONObject()
                                .put("id", "set-101")
                                .put("set_number", 1)
                                .put("set_type", "normal")
                                .put("rest_time", 90)
                                .put("reps", 8.0)
                                .put("weight", 80.0)
                        ))
                )
                .put(
                    JSONObject()
                        .put("id", "entry-2")
                        .put("exercise_id", "ex-ohp")
                        .put("exercise_snapshot", JSONObject()
                            .put("id", "ex-ohp")
                            .put("name", "Overhead Press")
                            .put("modality", "weight_reps")
                        )
                        .put("sets", JSONArray().put(
                            JSONObject()
                                .put("id", "set-201")
                                .put("set_number", 2)
                                .put("set_type", "normal")
                                .put("rest_time", 90)
                        ))
                )
                .put(
                    JSONObject()
                        .put("id", "entry-3")
                        .put("exercise_id", "ex-ohp")
                        .put("exercise_snapshot", JSONObject()
                            .put("id", "ex-ohp")
                            .put("name", "Overhead Press Burnout")
                            .put("modality", "weight_reps")
                        )
                        .put("sets", JSONArray().put(
                            JSONObject()
                                .put("id", "set-301")
                                .put("set_number", 1)
                                .put("set_type", "normal")
                                .put("rest_time", 60)
                        ))
                )
            )
            .toString()

        val recoveredWithoutPreset = WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
            sessionBody = storedSessionJson,
            presetBody = null,
            fallbackSessionId = "sess-recovered-1"
        )
        assertNotNull(recoveredWithoutPreset)
        assertEquals("sess-recovered-1", recoveredWithoutPreset!!.sessionId)
        assertEquals("Push Day", recoveredWithoutPreset.workoutName)
        assertEquals("standard", recoveredWithoutPreset.workoutFormat)
        assertEquals(3, recoveredWithoutPreset.exercises.size)
        assertEquals("Bench Press", recoveredWithoutPreset.exercises[0].name)
        assertEquals(8.0, recoveredWithoutPreset.exercises[0].sets.single().targetReps ?: 0.0, 0.01)
        assertEquals(80.0, recoveredWithoutPreset.exercises[0].sets.single().targetWeightKg ?: 0.0, 0.01)

        // Preset reordered to [ex-ohp, ex-bench, ex-ohp]: session's own logged reps/weight on ex-bench stay 8x80,
        // while unlogged set_number=2 on ex-ohp #1 picks up ex-ohp #1 set_number=2 target and ex-ohp #2 picks up ex-ohp #2 target
        val reorderedPresetJson = JSONObject()
            .put("name", "Push Day AMRAP")
            .put("workout_format", "amrap")
            .put("time_cap_seconds", 900)
            .put("exercises", JSONArray()
                .put(
                    JSONObject()
                        .put("exercise_id", "ex-ohp")
                        .put("superset_group", 9)
                        .put("sets", JSONArray()
                            .put(JSONObject().put("set_number", 1).put("reps", 12.0).put("weight", 45.0))
                            .put(JSONObject().put("set_number", 2).put("reps", 10.0).put("weight", 50.0))
                        )
                )
                .put(
                    JSONObject()
                        .put("exercise_id", "ex-bench")
                        .put("superset_group", 9)
                        .put("sets", JSONArray().put(JSONObject().put("set_number", 1).put("reps", 5.0).put("weight", 100.0)))
                )
                .put(
                    JSONObject()
                        .put("exercise_id", "ex-ohp")
                        .put("sets", JSONArray().put(JSONObject().put("set_number", 1).put("reps", 20.0).put("weight", 30.0)))
                )
            )
            .toString()
        val recoveredWithPreset = WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
            sessionBody = storedSessionJson,
            presetBody = reorderedPresetJson,
            fallbackSessionId = "sess-recovered-1"
        )
        assertNotNull(recoveredWithPreset)
        assertEquals("amrap", recoveredWithPreset!!.workoutFormat)
        assertEquals(900, recoveredWithPreset.timeCapSeconds)
        // Session's own values win over preset's 5x100 on ex-bench, and preset's superset_group=9 does not pair ex-ohp
        assertEquals(8.0, recoveredWithPreset.exercises[0].sets.single().targetReps ?: 0.0, 0.01)
        assertEquals(80.0, recoveredWithPreset.exercises[0].sets.single().targetWeightKg ?: 0.0, 0.01)
        assertNull(recoveredWithPreset.exercises[0].supersetRun)
        assertNull(recoveredWithPreset.exercises[1].supersetRun)
        // Unlogged set_number=2 on ex-ohp #1 matches ex-ohp #1 set_number=2 (10 reps @ 50 kg), and ex-ohp #2 matches (20 reps @ 30 kg)
        assertEquals(10.0, recoveredWithPreset.exercises[1].sets.single().targetReps ?: 0.0, 0.01)
        assertEquals(50.0, recoveredWithPreset.exercises[1].sets.single().targetWeightKg ?: 0.0, 0.01)
        assertEquals(20.0, recoveredWithPreset.exercises[2].sets.single().targetReps ?: 0.0, 0.01)
        assertEquals(30.0, recoveredWithPreset.exercises[2].sets.single().targetWeightKg ?: 0.0, 0.01)

        // 2. Calculated fast omits WatchFast.id while manual fast retains id and eating window returns null
        val autoCalcRaw = JSONObject()
            .put("id", "calc-window-99")
            .put("start_time", "2026-11-25T02:00:00.000Z")
            .put("target_end_time", "2026-11-25T18:00:00.000Z")
            .put("fasting_type", "16:8")
            .put("is_auto_calculated", true)
            .toString()
        val (autoFast, autoKnown) = WearDirectApiClient.parseFastJson(autoCalcRaw)
        assertTrue(autoKnown)
        assertNotNull(autoFast)
        assertNull(autoFast!!.id)

        val manualRaw = JSONObject()
            .put("id", "manual-fast-42")
            .put("start_time", "2026-11-25T02:00:00.000Z")
            .put("target_end_time", "2026-11-25T18:00:00.000Z")
            .put("fasting_type", "16:8")
            .put("is_auto_calculated", false)
            .toString()
        val (manualFast, manualKnown) = WearDirectApiClient.parseFastJson(manualRaw)
        assertTrue(manualKnown)
        assertEquals("manual-fast-42", manualFast?.id)

        val eatingWindowRaw = JSONObject()
            .put("id", "eat-1")
            .put("start_time", "2026-11-25T18:00:00.000Z")
            .put("is_eating_window", true)
            .toString()
        val (eatingFast, eatingKnown) = WearDirectApiClient.parseFastJson(eatingWindowRaw)
        assertTrue(eatingKnown)
        assertNull(eatingFast)

        // 3. Direct endFast clamps slight watch clock lag to serverStartMs while keeping later end times unchanged
        val serverStart = 1_700_000_010_000L
        assertEquals(serverStart, WearDirectApiClient.resolveClampedFastEndMs(serverStart - 1_000L, serverStart))
        assertEquals(serverStart + 60_000L, WearDirectApiClient.resolveClampedFastEndMs(serverStart + 60_000L, serverStart))
        assertEquals(serverStart - 1_000L, WearDirectApiClient.resolveClampedFastEndMs(serverStart - 1_000L, null))

        // 4. Water log timeFormat parsing, carry-forward, and 24h vs 12h formatting
        val ctxWithTimeFmt = ContextPayloadMapper.parseContext(
            JSONObject().put("today", "2026-11-25").put("timeFormat", "h:mm A"),
            WatchContext.empty
        )
        assertEquals("h:mm A", ctxWithTimeFmt.timeFormat)
        val carriedTimeFmt = ContextPayloadMapper.parseContext(
            JSONObject().put("today", "2026-11-25"),
            ctxWithTimeFmt
        )
        assertEquals("h:mm A", carriedTimeFmt.timeFormat)
        val persistedWithTimeFmt = JSONObject(
            ContextPayloadMapper.persistableContextJson(JSONObject().put("today", "2026-11-25").toString(), carriedTimeFmt)
        )
        assertEquals("h:mm A", persistedWithTimeFmt.getString("timeFormat"))

        val waterLogRaw = JSONArray().put(
            JSONObject()
                .put("id", "wl-1")
                .put("source", "manual")
                .put("container_name", "Bottle")
                .put("water_ml", 500.0)
                .put("logged_at", "2026-11-25T20:05:00.000Z")
        ).toString()
        val parsed24h = WearDirectApiClient.parseWaterLogJson(waterLogRaw, "HH:mm", Locale.US)!!
        val parsed12h = WearDirectApiClient.parseWaterLogJson(waterLogRaw, "h:mm A", Locale.US)!!
        assertTrue(parsed24h.single().time.matches(Regex("^\\d{2}:\\d{2}$")))
        assertTrue(parsed12h.single().time.contains("M", ignoreCase = true))

        // 5. Confirmed water write after midnight before refresh advances persisted context and survives restart
        val yesterdayPersisted = JSONObject()
            .put("workoutServerId", "srv-1")
            .put("today", "2026-11-24")
            .put("todayWeightKg", 81.2)
            .put("todayBodyFatPercentage", 18.4)
            .put("waterConsumedMl", 1500.0)
            .put("waterFromFoodMl", 200.0)
            .put("caloriesConsumed", 2100.0)
            .put("caloriesBurned", 400.0)
            .put("caloriesRemaining", 300.0)
            .put("medications", JSONArray().put(
                JSONObject()
                    .put("id", "m1:s1")
                    .put("medicationId", "m1")
                    .put("scheduleId", "s1")
                    .put("name", "Vit D")
                    .put("status", "taken")
            ))
        CheckInStore.patchContextJsonObject(
            obj = yesterdayPersisted,
            ackedClientId = "tap-after-midnight",
            entryDate = "2026-11-25",
            waterConsumedMl = 250.0,
            waterLog = listOf(WaterLogEntry("w-mid-1", "Glass", 250.0, "00:04"))
        )
        assertEquals("2026-11-25", yesterdayPersisted.getString("today"))
        assertEquals(250.0, yesterdayPersisted.getDouble("waterConsumedMl"), 0.001)
        assertFalse(yesterdayPersisted.has("waterFromFoodMl"))
        assertFalse(yesterdayPersisted.has("todayWeightKg"))
        assertFalse(yesterdayPersisted.has("caloriesConsumed"))
        assertFalse(yesterdayPersisted.has("medications"))
        assertEquals(81.2, yesterdayPersisted.getDouble("lastWeightKg"), 0.001)
        assertEquals(18.4, yesterdayPersisted.getDouble("lastBodyFatPercentage"), 0.001)
        assertEquals("2026-11-24", yesterdayPersisted.getString("lastEntryDate"))

        val restoredAfterRestart = ContextPayloadMapper.parseContext(yesterdayPersisted, WatchContext.empty)
        assertEquals("2026-11-25", restoredAfterRestart.today)
        assertEquals(250.0, restoredAfterRestart.water?.consumedMl ?: 0.0, 0.001)
        assertEquals(listOf("w-mid-1"), restoredAfterRestart.water?.log?.map { it.id })
        assertNull(restoredAfterRestart.nutrition)
        assertNull(restoredAfterRestart.medications)

        // 6. Post-midnight live refresh with history clears yesterday's calories/medications/sleep before updating today,
        // while same-day live refresh preserves phone-sourced nutrition/medications/sleep
        val yesterdayBeforeLiveRefresh = JSONObject()
            .put("workoutServerId", "srv-1")
            .put("today", "2026-11-24")
            .put("todayWeightKg", 81.5)
            .put("caloriesConsumed", 1950.0)
            .put("caloriesBurned", 320.0)
            .put("caloriesRemaining", 450.0)
            .put("medications", JSONArray().put(
                JSONObject()
                    .put("id", "m1:s1")
                    .put("medicationId", "m1")
                    .put("scheduleId", "s1")
                    .put("name", "Vit D")
                    .put("status", "taken")
            ))
            .put("sleep", JSONObject().put("day", "2026-11-24").put("totalSeconds", 28800))
        val postMidnightLiveSnap = DirectLiveSnapshot(
            ownerId = "srv-1",
            day = "2026-11-25",
            waterConsumedMl = 0.0,
            history = listOf(HistoryPoint("2026-11-24", 81.5)),
            lastWeightKg = 81.5,
            lastEntryDate = "2026-11-24"
        )
        CheckInStore.patchContextJsonObject(
            obj = yesterdayBeforeLiveRefresh,
            ackedClientId = null,
            entryDate = "2026-11-25",
            waterConsumedMl = postMidnightLiveSnap.waterConsumedMl,
            refreshedSnapshot = postMidnightLiveSnap
        )
        assertEquals("2026-11-25", yesterdayBeforeLiveRefresh.getString("today"))
        assertFalse(yesterdayBeforeLiveRefresh.has("caloriesConsumed"))
        assertFalse(yesterdayBeforeLiveRefresh.has("medications"))
        assertFalse(yesterdayBeforeLiveRefresh.has("sleep"))

        // Post-midnight live refresh even when history endpoint failed (history == null) still clears yesterday's fields
        val yesterdayNoHistoryRefresh = JSONObject()
            .put("workoutServerId", "srv-1")
            .put("today", "2026-11-24")
            .put("caloriesConsumed", 1800.0)
            .put("sleep", JSONObject().put("day", "2026-11-24").put("totalSeconds", 25000))
        CheckInStore.patchContextJsonObject(
            obj = yesterdayNoHistoryRefresh,
            ackedClientId = null,
            entryDate = "2026-11-25",
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", history = null)
        )
        assertEquals("2026-11-25", yesterdayNoHistoryRefresh.getString("today"))
        assertFalse(yesterdayNoHistoryRefresh.has("caloriesConsumed"))
        assertFalse(yesterdayNoHistoryRefresh.has("sleep"))

        val sameDayBeforeRefresh = JSONObject()
            .put("workoutServerId", "srv-1")
            .put("today", "2026-11-25")
            .put("caloriesConsumed", 850.0)
            .put("caloriesBurned", 120.0)
            .put("caloriesRemaining", 1400.0)
            .put("sleep", JSONObject().put("day", "2026-11-25").put("totalSeconds", 27000))
        CheckInStore.patchContextJsonObject(
            obj = sameDayBeforeRefresh,
            ackedClientId = null,
            entryDate = "2026-11-25",
            waterConsumedMl = 500.0,
            refreshedSnapshot = postMidnightLiveSnap.copy(waterConsumedMl = 500.0)
        )
        assertEquals(850.0, sameDayBeforeRefresh.getDouble("caloriesConsumed"), 0.001)
        assertTrue(sameDayBeforeRefresh.has("sleep"))

        // 7. PendingFastOp full persistence, supersede on repeated Start/End, outbound retry payload, and live-refresh guard
        val opStart = CheckInStore.PendingFastOp(
            clientId = "fast-start-c1",
            ownerId = "srv-1",
            kind = "fastStart",
            presetId = "18-6",
            hours = 18.0,
            startedAtMs = 1_700_000_000_000L
        )
        var pendingFastOps = CheckInStore.recordPendingFastOp(emptyList(), opStart)
        assertEquals(1, pendingFastOps.size)
        val serializedStart = CheckInStore.serializePendingFastOps(pendingFastOps)
        val restoredStart = CheckInStore.deserializePendingFastOps(serializedStart, "srv-1")
        assertEquals(listOf(opStart), restoredStart)
        assertTrue(CheckInStore.deserializePendingFastOps(serializedStart, "srv-other").isEmpty())

        val retryStartPayload = CheckInStore.buildPendingFastOutboundPayload(restoredStart.single())!!
        assertEquals("fastStart", retryStartPayload.getString("type"))
        assertEquals("fast-start-c1", retryStartPayload.getString("clientId"))
        assertEquals("18-6", retryStartPayload.getString("presetId"))
        assertEquals(1_700_000_000_000L, retryStartPayload.getLong("startedAt"))

        // Tapping End before Start settles retains the in-flight Start op and appends End at the tail
        val opEnd = CheckInStore.PendingFastOp(
            clientId = "fast-end-c2",
            ownerId = "srv-1",
            kind = "fastEnd",
            startedAtMs = 1_700_000_000_000L,
            fastId = "manual-fast-42",
            endedAtMs = 1_700_003_600_000L
        )
        pendingFastOps = CheckInStore.recordPendingFastOp(pendingFastOps, opEnd)
        assertEquals(listOf("fast-start-c1", "fast-end-c2"), pendingFastOps.map { it.clientId })
        assertNull(pendingFastOps.last().toOptimisticWatchFast())
        val retryEndPayload = CheckInStore.buildPendingFastOutboundPayload(pendingFastOps.last())!!
        assertEquals("fastEnd", retryEndPayload.getString("type"))
        assertEquals("fast-end-c2", retryEndPayload.getString("clientId"))
        assertEquals("manual-fast-42", retryEndPayload.getString("fastId"))
        assertEquals(1_700_000_000_000L, retryEndPayload.getLong("startedAt"))
        assertEquals(1_700_003_600_000L, retryEndPayload.getLong("endedAt"))

        // Settling fast-start-c1 leaves fast-end-c2 pending as the active overlay
        pendingFastOps = CheckInStore.settlePendingFastOp(pendingFastOps, "fast-start-c1")
        assertEquals(listOf("fast-end-c2"), pendingFastOps.map { it.clientId })

        val optimisticFast = opStart.toOptimisticWatchFast()!!
        val staleRefreshNoFast = DirectLiveSnapshot(
            ownerId = "srv-1",
            day = "2026-11-25",
            waterConsumedMl = 750.0,
            fast = null,
            fastKnown = true
        )
        val (keptFast, applyWhilePending) = CheckInStore.resolveFastForLiveRefresh(
            currentFast = optimisticFast,
            snapshot = staleRefreshNoFast,
            pendingFastOps = pendingFastOps
        )
        assertFalse(applyWhilePending)
        assertEquals(optimisticFast, keptFast)

        val persistedDuringPendingFast = JSONObject()
            .put("today", "2026-11-25")
            .put("fastKnown", true)
            .put("fast", JSONObject().put("startedAt", optimisticFast.startedAtMs).put("label", "18-6"))
        CheckInStore.patchContextJsonObject(
            obj = persistedDuringPendingFast,
            ackedClientId = null,
            entryDate = "2026-11-25",
            waterConsumedMl = staleRefreshNoFast.waterConsumedMl,
            fastUpdated = applyWhilePending,
            fast = if (applyWhilePending) keptFast else null
        )
        assertEquals(750.0, persistedDuringPendingFast.getDouble("waterConsumedMl"), 0.001)
        assertEquals(optimisticFast.startedAtMs, persistedDuringPendingFast.getJSONObject("fast").getLong("startedAt"))

        pendingFastOps = CheckInStore.settlePendingFastOp(pendingFastOps, "fast-end-c2")
        assertTrue(pendingFastOps.isEmpty())
        val (refreshedFastAfterSettle, applyAfterSettle) = CheckInStore.resolveFastForLiveRefresh(
            currentFast = optimisticFast,
            snapshot = staleRefreshNoFast,
            pendingFastOps = pendingFastOps
        )
        assertTrue(applyAfterSettle)
        assertNull(refreshedFastAfterSettle)
    }

    @Test
    fun `credential dedup readability guard, timestamp fastEnd endedAt guard, persisted baseFast and containers, checkIn rollover, bf date isolation, ack cap, blank timeFormat, and 3-way water compaction`() {
        // 1. Credential resend deduplicates only when stored encrypted record currently decrypts cleanly
        assertTrue(
            WearServerCredentialsStore.shouldDeduplicateCredentialSave(
                hasBlob = true,
                prevOwner = "srv-1",
                ownerId = "srv-1",
                prevFingerprint = "fp-1",
                fingerprint = "fp-1",
                currentRecordReadable = true
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldDeduplicateCredentialSave(
                hasBlob = true,
                prevOwner = "srv-1",
                ownerId = "srv-1",
                prevFingerprint = "fp-1",
                fingerprint = "fp-1",
                currentRecordReadable = false
            )
        )

        // 2. Timestamp-only fastEnd skips replacement fast started after endedAt even within 1,000 ms of original start
        val fastAStart = 1_700_000_000_000L
        val fastAEnd = fastAStart + 200L
        val replacementFastBStart = fastAStart + 700L
        assertTrue(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = null,
                expectedStartedAtMs = fastAStart,
                endedAtMs = fastAEnd,
                serverFastId = "fast-b",
                serverStartedAtMs = replacementFastBStart
            )
        )
        // Exact fastId remains authoritative when present
        assertFalse(
            WearDirectApiClient.shouldSkipReplayFastEnd(
                expectedFastId = "fast-a",
                expectedStartedAtMs = fastAStart,
                endedAtMs = fastAEnd,
                serverFastId = "fast-a",
                serverStartedAtMs = replacementFastBStart
            )
        )

        // 3. Confirmed startFast persists baseFast in last_context_json even while a newer endFast is pending
        val confirmedBaseFast = WatchFast(
            startedAtMs = 1_700_000_000_000L,
            targetEndAtMs = 1_700_057_600_000L,
            label = "16-8",
            id = "srv-fast-99"
        )
        val persistedWithPendingEnd = JSONObject().put("today", "2026-11-25")
        CheckInStore.patchContextJsonObject(
            obj = persistedWithPendingEnd,
            ackedClientId = "fast-start-c1",
            localToday = "2026-11-25",
            fastUpdated = true,
            fast = confirmedBaseFast
        )
        assertEquals("srv-fast-99", persistedWithPendingEnd.getJSONObject("fast").getString("id"))
        val pendingEndOnly = listOf(
            CheckInStore.PendingFastOp(
                clientId = "fast-end-c2",
                ownerId = "srv-1",
                kind = "fastEnd",
                startedAtMs = confirmedBaseFast.startedAtMs,
                fastId = confirmedBaseFast.id,
                endedAtMs = 1_700_000_500_000L
            )
        )
        val restoredBaseCtx = ContextPayloadMapper.parseContext(persistedWithPendingEnd, WatchContext.empty)
        assertEquals("srv-fast-99", restoredBaseCtx.fast?.id)
        assertNull(pendingEndOnly.single().toOptimisticWatchFast())

        // 4. Today's first direct check-in advances persisted "today" and cleans yesterday's day-scoped fields, while backdated check-in stays history-only
        val yesterdayForCheckIn = JSONObject()
            .put("workoutServerId", "srv-1")
            .put("today", "2026-11-24")
            .put("todayWeightKg", 81.0)
            .put("todayBodyFatPercentage", 19.2)
            .put("caloriesConsumed", 2050.0)
            .put("sleep", JSONObject().put("day", "2026-11-24").put("totalSeconds", 27000))
        CheckInStore.patchContextJsonObject(
            obj = yesterdayForCheckIn,
            ackedClientId = "chk-today-first",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            hasCheckIn = true,
            checkInWeightKg = 80.5,
            checkInBodyFat = null
        )
        assertEquals("2026-11-25", yesterdayForCheckIn.getString("today"))
        assertEquals(80.5, yesterdayForCheckIn.getDouble("todayWeightKg"), 0.001)
        assertFalse(yesterdayForCheckIn.has("todayBodyFatPercentage"))
        assertFalse(yesterdayForCheckIn.has("caloriesConsumed"))
        assertFalse(yesterdayForCheckIn.has("sleep"))
        assertEquals(81.0, yesterdayForCheckIn.getDouble("lastWeightKg"), 0.001)
        assertEquals(19.2, yesterdayForCheckIn.getDouble("lastBodyFatPercentage"), 0.001)
        assertEquals("2026-11-24", yesterdayForCheckIn.getString("lastEntryDate"))

        // Backdated check-in (entryDate < localToday) updates history without rolling "today"
        val backdatedObj = JSONObject()
            .put("today", "2026-11-24")
            .put("caloriesConsumed", 1500.0)
        CheckInStore.patchContextJsonObject(
            obj = backdatedObj,
            ackedClientId = "chk-backdated",
            entryDate = "2026-11-23",
            localToday = "2026-11-25",
            hasCheckIn = true,
            checkInWeightKg = 82.0
        )
        assertEquals("2026-11-24", backdatedObj.getString("today"))
        assertEquals(1500.0, backdatedObj.getDouble("caloriesConsumed"), 0.001)
        assertEquals(1, backdatedObj.getJSONArray("history").length())

        // 5. TrendModels never fabricates a bodyFatSamples chart point at lastEntryDate (weight date) from lastBodyFatPercentage
        val decoupledBfCtx = WatchContext(
            today = "2026-11-25",
            lastEntryDate = "2026-11-24",
            lastWeightKg = 80.5,
            lastBodyFatPercentage = 19.2,
            weightUnit = WeightUnit.KG
        )
        val decoupledTrend = TrendModels.buildTrendPageModel(
            watchCtx = decoupledBfCtx,
            history = listOf(HistoryPoint("2026-11-24", 80.5, null)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(19.2, decoupledTrend.latestBodyFatPercent ?: 0.0, 0.001)
        assertTrue(decoupledTrend.bodyFatSamples.isEmpty())

        // 6. persistableContextJson fills blank timeFormat from WatchContext
        val blankTimeFmtRaw = JSONObject().put("today", "2026-11-25").put("timeFormat", "   ").toString()
        val patchedTimeFmtJson = JSONObject(
            ContextPayloadMapper.persistableContextJson(blankTimeFmtRaw, WatchContext(timeFormat = "HH:mm"))
        )
        assertEquals("HH:mm", patchedTimeFmtJson.getString("timeFormat"))

        // 7. Refreshed waterContainers persist into JSON (non-empty, empty [], and null preserving cached) and cap ackedClientIds at 40
        val containerPersistObj = JSONObject().put("today", "2026-11-25")
        val refreshedContainers = listOf(
            WaterContainer(id = 7, name = "Tumbler", servingVolumeMl = 600.0, unit = "oz", isPrimary = true, isQuickAdd = false)
        )
        CheckInStore.patchContextJsonObject(
            obj = containerPersistObj,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            refreshedSnapshot = DirectLiveSnapshot(
                ownerId = "srv-1",
                day = "2026-11-25",
                waterContainers = refreshedContainers
            )
        )
        val restoredContainersCtx = ContextPayloadMapper.parseContext(containerPersistObj, WatchContext.empty)
        assertEquals(1, restoredContainersCtx.waterContainers?.size)
        assertEquals("Tumbler", restoredContainersCtx.waterContainers?.single()?.name)
        assertTrue(restoredContainersCtx.waterContainers?.single()?.isPrimary == true)

        // Null waterContainers keeps cached containers
        CheckInStore.patchContextJsonObject(
            obj = containerPersistObj,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", waterContainers = null)
        )
        assertEquals(1, ContextPayloadMapper.parseContext(containerPersistObj, WatchContext.empty).waterContainers?.size)

        // Empty waterContainers writes []
        CheckInStore.patchContextJsonObject(
            obj = containerPersistObj,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", waterContainers = emptyList())
        )
        assertTrue(ContextPayloadMapper.parseContext(containerPersistObj, WatchContext.empty).waterContainers?.isEmpty() == true)

        // Bound persisted ackedClientIds at 40 most recent unique IDs
        for (idx in 1..45) {
            CheckInStore.patchContextJsonObject(
                obj = containerPersistObj,
                ackedClientId = "ack-$idx",
                entryDate = "2026-11-25",
                localToday = "2026-11-25"
            )
        }
        val persistedAckArr = containerPersistObj.getJSONArray("ackedClientIds")
        assertEquals(40, persistedAckArr.length())
        assertEquals("ack-6", persistedAckArr.getString(0))
        assertEquals("ack-45", persistedAckArr.getString(39))

        // 8. 3-way colliding water preset names preserve distinguishing suffixes (Coff…A, Coff…B, Coff…Dark)
        val threeWayPresets = listOf(
            WaterContainer(id = 11, name = "Coffee Blend Medium A", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 12, name = "Coffee Blend Medium B", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 13, name = "Coffee Blend Dark", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true)
        )
        val threeWayChips = TileModels.buildAllWaterContainerChips(
            threeWayPresets,
            WatchContext(waterDisplayUnit = "ml"),
            Locale.US
        )
        assertEquals(listOf("Coff\u2026A", "Coff\u2026B", "Coff\u2026Dark"), threeWayChips.map { it.name })
        assertTrue(threeWayChips.all { it.isDirectlyActionable })
    }

    @Test
    fun `contextSeq same-gen ordering, ack fastKnown restoration, date rollback rebase, bf seed isolation, localized workout fallbacks, and post-midnight queued check-in precedence`() {
        // 1. Reject older or duplicate contextSeq within same contextGeneration, accept strictly newer seq or newer generation
        assertFalse(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 2L,
                hasActiveCredBlob = true,
                incomingContextSeq = 9L,
                currentAcceptedContextSeq = 10L
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 2L,
                hasActiveCredBlob = true,
                incomingContextSeq = 10L,
                currentAcceptedContextSeq = 10L
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 2L,
                hasActiveCredBlob = true,
                incomingContextSeq = 0L,
                currentAcceptedContextSeq = 10L
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 5L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 2L,
                hasActiveCredBlob = true,
                incomingContextSeq = 11L,
                currentAcceptedContextSeq = 10L
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 6L,
                currentAcceptedContextGen = 5L,
                lastSavedCredGen = 5L,
                revokedCredGen = 2L,
                hasActiveCredBlob = true,
                incomingContextSeq = 1L,
                currentAcceptedContextSeq = 10L
            )
        )

        // 2 & 5. Authoritative fastKnown/fast on ACK restores active fast B on stale fastEnd ACK,
        // while legacy ACK without fastKnown promotes matched pending op and failed ACK preserves baseFast
        val fastB = WatchFast(startedAtMs = 1_700_010_000_000L, targetEndAtMs = 1_700_067_600_000L, label = "16:8", id = "fast-b")
        val endOp = CheckInStore.PendingFastOp(
            clientId = "end-a",
            ownerId = "srv-1",
            kind = "fastEnd",
            startedAtMs = 1_700_000_000_000L,
            fastId = "fast-a",
            endedAtMs = 1_700_005_000_000L
        )
        val (restoredFromAck, persistAckFast) = CheckInStore.resolveFastForAck(
            currentBaseFast = null,
            matchedOp = endOp,
            ok = true,
            fastKnown = true,
            settledFast = fastB
        )
        assertTrue(persistAckFast)
        assertEquals(fastB, restoredFromAck)

        val (clearedOnEndAck, persistEndClear) = CheckInStore.resolveFastForAck(
            currentBaseFast = fastB,
            matchedOp = endOp,
            ok = true,
            fastKnown = true,
            settledFast = null
        )
        assertTrue(persistEndClear)
        assertNull(clearedOnEndAck)

        val startOp = CheckInStore.PendingFastOp(
            clientId = "start-1",
            ownerId = "srv-1",
            kind = "fastStart",
            presetId = "16-8",
            hours = 16.0,
            startedAtMs = 1_700_020_000_000L
        )
        val (promotedNoFastKnown, persistPromoted) = CheckInStore.resolveFastForAck(
            currentBaseFast = null,
            matchedOp = startOp,
            ok = true,
            fastKnown = false,
            settledFast = null
        )
        assertTrue(persistPromoted)
        assertEquals(1_700_020_000_000L, promotedNoFastKnown?.startedAtMs)

        val (keptOnFailure, persistOnFailure) = CheckInStore.resolveFastForAck(
            currentBaseFast = fastB,
            matchedOp = endOp,
            ok = false,
            fastKnown = false,
            settledFast = null
        )
        assertFalse(persistOnFailure)
        assertEquals(fastB, keptOnFailure)

        // 3. Offline Start A -> End A -> Start B retains chronological pending fast ops and survives restart
        val startOp2 = startOp.copy(clientId = "start-2", startedAtMs = 1_700_030_000_000L)
        val pendingPair = CheckInStore.recordPendingFastOp(listOf(startOp), endOp)
        assertEquals(listOf("start-1", "end-a"), pendingPair.map { it.clientId })
        val afterSecondStart = CheckInStore.recordPendingFastOp(pendingPair, startOp2)
        assertEquals(listOf("start-1", "end-a", "start-2"), afterSecondStart.map { it.clientId })
        assertEquals(1_700_030_000_000L, afterSecondStart.last().toOptimisticWatchFast()?.startedAtMs)
        val roundTrippedChain = CheckInStore.deserializePendingFastOps(
            CheckInStore.serializePendingFastOps(afterSecondStart),
            expectedOwnerId = "srv-1"
        )
        assertEquals(listOf("start-1", "end-a", "start-2"), roundTrippedChain.map { it.clientId })

        // 4. Accepted current-day live refresh rebases persisted "today" backward on date rollback (Nov 26 -> Nov 25)
        // without promoting Nov 26's future weight into lastWeightKg, while write-only ACKs remain strictly forward-only
        val futureDayPersisted = JSONObject()
            .put("today", "2026-11-26")
            .put("todayWeightKg", 79.0)
            .put("todayBodyFatPercentage", 17.5)
            .put("lastEntryDate", "2026-11-24")
            .put("lastWeightKg", 81.0)
            .put("caloriesConsumed", 1400.0)
            .put("sleep", JSONObject().put("day", "2026-11-26").put("totalSeconds", 26000))
        val rollbackSnap = DirectLiveSnapshot(
            ownerId = "srv-1",
            day = "2026-11-25",
            waterConsumedMl = 250.0,
            history = listOf(HistoryPoint("2026-11-24", 81.0), HistoryPoint("2026-11-25", 80.5)),
            todayWeightKg = 80.5,
            lastWeightKg = 81.0,
            lastEntryDate = "2026-11-24"
        )
        CheckInStore.patchContextJsonObject(
            obj = futureDayPersisted,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = 250.0,
            refreshedSnapshot = rollbackSnap
        )
        assertEquals("2026-11-25", futureDayPersisted.getString("today"))
        assertEquals(80.5, futureDayPersisted.getDouble("todayWeightKg"), 0.001)
        assertEquals(81.0, futureDayPersisted.getDouble("lastWeightKg"), 0.001)
        assertEquals("2026-11-24", futureDayPersisted.getString("lastEntryDate"))
        assertFalse(futureDayPersisted.has("caloriesConsumed"))
        assertFalse(futureDayPersisted.has("sleep"))

        // Write-only ACK with older entryDate does NOT rebase "today" backward
        val forwardOnlyObj = JSONObject().put("today", "2026-11-26").put("caloriesConsumed", 500.0)
        CheckInStore.patchContextJsonObject(
            obj = forwardOnlyObj,
            ackedClientId = "w-old",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = 300.0
        )
        assertEquals("2026-11-26", forwardOnlyObj.getString("today"))
        assertEquals(500.0, forwardOnlyObj.getDouble("caloriesConsumed"), 0.001)

        // 6. resolveBodyFatSeed never dates lastBodyFatPercentage using lastEntryDate (weight date)
        val bfSeedCtx = WatchContext(
            today = "2026-11-25",
            lastEntryDate = "2026-11-24",
            lastWeightKg = 80.0,
            lastBodyFatPercentage = 17.0,
            bodyFatHistory = listOf(HistoryPoint("2026-11-23", 80.2, 18.4))
        )
        assertEquals(18.4, CheckInStore.resolveBodyFatSeed(bfSeedCtx, emptyList(), "2026-11-25") ?: 0.0, 0.001)
        val bfFallbackCtx = bfSeedCtx.copy(bodyFatHistory = emptyList())
        assertEquals(17.0, CheckInStore.resolveBodyFatSeed(bfFallbackCtx, emptyList(), "2026-11-25") ?: 0.0, 0.001)

        // 7. Localized default Workout/Exercise fallback names used only when server omits names
        val unnamedSession = JSONObject()
            .put("id", "sess-unnamed")
            .put("exercises", JSONArray().put(
                JSONObject()
                    .put("id", "e1")
                    .put("sets", JSONArray().put(JSONObject().put("id", "s1").put("reps", 10.0)))
            ))
            .toString()
        val localizedPlan = WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
            sessionBody = unnamedSession,
            presetBody = null,
            fallbackSessionId = "sess-unnamed",
            defaultWorkoutName = "Entrenamiento",
            defaultExerciseName = "Ejercicio"
        )!!
        assertEquals("Entrenamiento", localizedPlan.workoutName)
        assertEquals("Ejercicio", localizedPlan.exercises.single().name)

        // 11. After midnight, queued watch check-in in history takes precedence over stale watchCtx.todayWeightKg / todayBodyFatPercentage
        val staleMidnightCtx = WatchContext(
            today = "2026-11-24",
            todayWeightKg = 81.5,
            todayBodyFatPercentage = 19.5,
            weightUnit = WeightUnit.KG
        )
        val midnightTrend = TrendModels.buildTrendPageModel(
            watchCtx = staleMidnightCtx,
            history = listOf(HistoryPoint("2026-11-24", 80.1, 18.2)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(80.1, midnightTrend.latestWeightDisplay ?: 0.0, 0.01)
        assertEquals(18.2, midnightTrend.latestBodyFatPercent ?: 0.0, 0.01)
    }

    @Test
    fun `in-memory revocation guard, preset set_number preservation, duplicate fast ACK guard, prior-day bf rollover, renderer schema check, water suffix compaction, and exact medication schedule precedence`() {
        // 1. In-memory revocation/clear barrier blocks direct requests even if disk persistence lagged or failed
        assertEquals(7L, WearServerCredentialsStore.effectiveRevokedGeneration(persistedRevokedGen = 4L, inMemoryMinRevokedGen = 7L))
        assertTrue(
            WearServerCredentialsStore.isCredentialSessionDisabledInMemory(
                writeId = 5L,
                lastSavedGen = 4L,
                minClearedWriteId = 5L,
                minRevokedGen = 0L
            )
        )
        assertTrue(
            WearServerCredentialsStore.isCredentialSessionDisabledInMemory(
                writeId = 6L,
                lastSavedGen = 4L,
                minClearedWriteId = 5L,
                minRevokedGen = 4L
            )
        )
        assertFalse(
            WearServerCredentialsStore.isCredentialSessionDisabledInMemory(
                writeId = 6L,
                lastSavedGen = 5L,
                minClearedWriteId = 5L,
                minRevokedGen = 4L
            )
        )

        // 2. Preset set_number preserves non-consecutive numbers like 1, 3 and falls back to 1-based index when missing
        assertEquals(3, WearDirectApiClient.resolvePresetSetNumber(JSONObject().put("set_number", 3), index = 1))
        assertEquals(2, WearDirectApiClient.resolvePresetSetNumber(JSONObject(), index = 1))
        assertEquals(1, WearDirectApiClient.resolvePresetSetNumber(JSONObject().put("set_number", 0), index = 0))

        // 3. Pending fast op list never evicts unresolved ops at MAX_PENDING_FAST_OPS: rejects new clientId while allowing in-place replacement and other owners
        var chain = emptyList<CheckInStore.PendingFastOp>()
        for (i in 1..CheckInStore.MAX_PENDING_FAST_OPS) {
            assertTrue(CheckInStore.canEnqueuePendingFastOp(chain, "srv-1", "op-$i"))
            chain = CheckInStore.recordPendingFastOp(
                chain,
                CheckInStore.PendingFastOp(
                    clientId = "op-$i",
                    ownerId = "srv-1",
                    kind = if (i % 2 == 1) "fastStart" else "fastEnd",
                    startedAtMs = 1_700_000_000_000L + i * 1_000L
                )
            )
        }
        assertEquals(CheckInStore.MAX_PENDING_FAST_OPS, chain.size)
        assertFalse(CheckInStore.canEnqueuePendingFastOp(chain, "srv-1", "op-overflow"))
        val afterOverflow = CheckInStore.recordPendingFastOp(
            chain,
            CheckInStore.PendingFastOp(
                clientId = "op-overflow",
                ownerId = "srv-1",
                kind = "fastStart",
                startedAtMs = 1_700_000_999_000L
            )
        )
        assertEquals(CheckInStore.MAX_PENDING_FAST_OPS, afterOverflow.size)
        assertEquals("op-1", afterOverflow.first().clientId)
        assertEquals("op-12", afterOverflow.last().clientId)
        assertTrue(CheckInStore.canEnqueuePendingFastOp(chain, "srv-1", "op-5"))
        val afterReplace = CheckInStore.recordPendingFastOp(
            chain,
            CheckInStore.PendingFastOp(
                clientId = "op-5",
                ownerId = "srv-1",
                kind = "fastStart",
                startedAtMs = 1_700_000_555_000L
            )
        )
        assertEquals(CheckInStore.MAX_PENDING_FAST_OPS, afterReplace.size)
        assertEquals("op-1", afterReplace.first().clientId)
        assertEquals("op-5", afterReplace.last().clientId)
        assertTrue(CheckInStore.canEnqueuePendingFastOp(chain, "srv-2", "other-owner-op"))
        // Deserializing > MAX_PENDING_FAST_OPS legacy persisted ops never drops any unresolved op
        val oversizedRaw = CheckInStore.serializePendingFastOps(
            (1..14).map { idx ->
                CheckInStore.PendingFastOp(
                    clientId = "persisted-$idx",
                    ownerId = "srv-1",
                    kind = if (idx % 2 == 1) "fastStart" else "fastEnd",
                    startedAtMs = 1_700_000_000_000L + idx * 1_000L
                )
            }
        )
        val restoredOversized = CheckInStore.deserializePendingFastOps(oversizedRaw, "srv-1")
        assertEquals(14, restoredOversized.size)
        assertEquals("persisted-1", restoredOversized.first().clientId)
        assertEquals("persisted-14", restoredOversized.last().clientId)

        // 4. Duplicate settled fastEnd ACK (matchedOp == null) with fastKnown=true, fast=null cannot wipe active Fast B
        val fastB = WatchFast(startedAtMs = 1_700_050_000_000L, targetEndAtMs = 1_700_107_600_000L, label = "16:8", id = "fast-b")
        val (baseAfterDupAck, persistedDupAck) = CheckInStore.resolveFastForAck(
            currentBaseFast = fastB,
            matchedOp = null,
            ok = true,
            fastKnown = true,
            settledFast = null
        )
        assertFalse(persistedDupAck)
        assertEquals(fastB, baseAfterDupAck)

        // 5. Weight-only direct check-in after midnight preserves yesterday's todayBodyFatPercentage in bodyFatHistory and rolls last*
        val yesterdayBase = WatchContext(
            today = "2026-11-24",
            todayWeightKg = 81.2,
            todayBodyFatPercentage = 19.4,
            lastEntryDate = "2026-11-22",
            lastWeightKg = 81.8,
            lastBodyFatPercentage = 19.9,
            bodyFatHistory = listOf(HistoryPoint("2026-11-22", 81.8, 19.9))
        )
        val (rolledCtx, _) = CheckInStore.applyDirectOutcomeToBaseState(
            baseCtx = yesterdayBase,
            baseHist = listOf(HistoryPoint("2026-11-22", 81.8, 19.9)),
            clientId = "chk-today-wt-only",
            outcome = DirectWriteOutcome.Applied(
                syncedDomain = "checkIn",
                entryDate = "2026-11-25",
                weightKg = 80.6,
                bodyFatPercentage = null
            ),
            today = "2026-11-25"
        )
        assertEquals("2026-11-25", rolledCtx.today)
        assertEquals(80.6, rolledCtx.todayWeightKg ?: 0.0, 0.001)
        assertNull(rolledCtx.todayBodyFatPercentage)
        assertEquals("2026-11-24", rolledCtx.lastEntryDate)
        assertEquals(81.2, rolledCtx.lastWeightKg ?: 0.0, 0.001)
        assertEquals(19.4, rolledCtx.lastBodyFatPercentage ?: 0.0, 0.001)
        assertEquals(listOf("2026-11-22", "2026-11-24"), rolledCtx.bodyFatHistory.map { it.day })
        assertEquals(19.4, rolledCtx.bodyFatHistory.last().bodyFatPercentage ?: 0.0, 0.001)

        // 7. Renderer schema version check for expanded circularProgressIndicator
        assertFalse(supportsExpandedCircularProgressIndicator(1, 402))
        assertTrue(supportsExpandedCircularProgressIndicator(1, 403))
        assertTrue(supportsExpandedCircularProgressIndicator(2, 0))

        // 8. Multi-word differing suffixes keep first differing segment (Travel Mug Blue/Red Edition)
        val travelMugs = listOf(
            WaterContainer(id = 21, name = "Travel Mug Blue Edition", servingVolumeMl = 450.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 22, name = "Travel Mug Red Edition", servingVolumeMl = 450.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 23, name = "Water Bottle", servingVolumeMl = 500.0, unit = "ml", isPrimary = true)
        )
        val mugChips = TileModels.buildAllWaterContainerChips(
            travelMugs,
            WatchContext(waterDisplayUnit = "ml"),
            Locale.US
        )
        assertEquals("Trav\u2026Blue E", mugChips.first { it.id == 21 }.name)
        assertEquals("Trav\u2026Red Ed", mugChips.first { it.id == 22 }.name)
        assertTrue(mugChips.first { it.id == 21 }.isDirectlyActionable)
        assertTrue(mugChips.first { it.id == 22 }.isDirectlyActionable)

        // 9. Exact schedule_id match wins over an earlier unscheduled legacy row in decideMedicationWrite
        val medEntries = JSONArray()
            .put(JSONObject().put("id", "legacy-unsched").put("medication_id", "m1").put("status", "taken"))
            .put(JSONObject().put("id", "sched-exact").put("medication_id", "m1").put("schedule_id", "s1").put("status", "skipped"))
        val medDecision = WearDirectApiClient.decideMedicationWrite(
            medicationId = "m1",
            scheduleId = "s1",
            taken = true,
            skipped = false,
            entries = medEntries
        )
        assertEquals(WearDirectApiClient.MedicationWriteDecision.Update("sched-exact", "taken"), medDecision)
    }

    @Test
    fun `live medication refresh prefers exact schedule_id, stale TYPE_DELETED checks contextSeq, and JSON rollover persists dated bodyFatHistory`() {
        // 1. Live medication refresh prefers exact schedule_id match over an earlier unscheduled legacy row
        val doses = listOf(
            MedicationDose("m1:s1", "m1", "s1", "Vitamin D", "2000 IU", "08:00 AM", MedicationDoseStatus.PENDING),
            MedicationDose("m2:s2", "m2", "s2", "Magnesium", "400 mg", "08:00 PM", MedicationDoseStatus.PENDING),
            MedicationDose("m3:", "m3", "", "Ibuprofen", "200 mg", "PRN", MedicationDoseStatus.PENDING)
        )
        val liveEntries = JSONArray()
            .put(JSONObject().put("id", "legacy-m1").put("medication_id", "m1").put("status", "taken"))
            .put(JSONObject().put("id", "exact-m1-s1").put("medication_id", "m1").put("schedule_id", "s1").put("status", "skipped"))
            .put(JSONObject().put("id", "legacy-m2").put("medication_id", "m2").put("status", "taken"))
            .put(JSONObject().put("id", "prn-m3").put("medication_id", "m3").put("status", "prn_taken"))
        val resolvedStatuses = WearDirectApiClient.resolveMedicationStatusesFromEntries(doses, liveEntries)
        assertEquals(MedicationDoseStatus.SKIPPED, resolvedStatuses["m1:s1"])
        assertEquals(MedicationDoseStatus.TAKEN, resolvedStatuses["m2:s2"])
        assertEquals(MedicationDoseStatus.TAKEN, resolvedStatuses["m3:"])

        // 2. Stale TYPE_DELETED guard treats same-generation higher contextSeq replacement as stale while allowing genuine deletions
        assertFalse(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 5L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 10L,
                credGenAtEvent = 5L,
                currentCredGen = 5L
            )
        )
        assertTrue(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 5L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 11L,
                credGenAtEvent = 5L,
                currentCredGen = 5L
            )
        )

        // 5. JSON rollover persists prior day's dated body-fat point into bodyFatHistory (with weightKg only when present, no duplicates)
        val rolloverWithWeight = JSONObject()
            .put("today", "2026-11-24")
            .put("todayWeightKg", 81.2)
            .put("todayBodyFatPercentage", 19.4)
            .put(
                "bodyFatHistory",
                JSONArray().put(JSONObject().put("day", "2026-11-22").put("weightKg", 81.8).put("bodyFatPercentage", 19.9))
            )
        CheckInStore.patchContextJsonObject(
            obj = rolloverWithWeight,
            ackedClientId = "w-new-day",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = 250.0
        )
        assertEquals("2026-11-25", rolloverWithWeight.getString("today"))
        assertFalse(rolloverWithWeight.has("todayBodyFatPercentage"))
        val bfHistWeighted = rolloverWithWeight.getJSONArray("bodyFatHistory")
        assertEquals(2, bfHistWeighted.length())
        val rolledPointWeighted = bfHistWeighted.getJSONObject(1)
        assertEquals("2026-11-24", rolledPointWeighted.getString("day"))
        assertEquals(19.4, rolledPointWeighted.getDouble("bodyFatPercentage"), 0.001)
        assertEquals(81.2, rolledPointWeighted.getDouble("weightKg"), 0.001)

        val rolloverWeightless = JSONObject()
            .put("today", "2026-11-24")
            .put("todayBodyFatPercentage", 18.7)
        CheckInStore.patchContextJsonObject(
            obj = rolloverWeightless,
            ackedClientId = "w-new-day-2",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = 250.0
        )
        val bfHistWeightless = rolloverWeightless.getJSONArray("bodyFatHistory")
        assertEquals(1, bfHistWeightless.length())
        val rolledPointWeightless = bfHistWeightless.getJSONObject(0)
        assertEquals("2026-11-24", rolledPointWeightless.getString("day"))
        assertEquals(18.7, rolledPointWeightless.getDouble("bodyFatPercentage"), 0.001)
        assertFalse(rolledPointWeightless.has("weightKg"))
        val parsedAfterRollover = ContextPayloadMapper.parseContext(rolloverWeightless, WatchContext.empty)
        assertEquals(1, parsedAfterRollover.bodyFatHistory.size)
        assertEquals("2026-11-24", parsedAfterRollover.bodyFatHistory.single().day)
        assertEquals(18.7, parsedAfterRollover.bodyFatHistory.single().bodyFatPercentage ?: 0.0, 0.001)

        // Existing bodyFatHistory entry for existingToday is not duplicated
        val rolloverAlreadyDated = JSONObject()
            .put("today", "2026-11-24")
            .put("todayBodyFatPercentage", 18.7)
            .put(
                "bodyFatHistory",
                JSONArray().put(JSONObject().put("day", "2026-11-24").put("bodyFatPercentage", 18.7))
            )
        CheckInStore.patchContextJsonObject(
            obj = rolloverAlreadyDated,
            ackedClientId = "w-new-day-3",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = 250.0
        )
        assertEquals(1, rolloverAlreadyDated.getJSONArray("bodyFatHistory").length())
    }

    @Test
    fun `uncommitted credential rollback, writeId-scoped delete and refresh, direct request admission, water partial confirmation, direct water reconciliation, and session workout format precedence`() {
        // 1. Failed credential commit preserves last committed record and forces identical resend to retry instead of deduplicating
        val committedA = WearServerCredentialsStore.CredentialStoreRecord(
            ownerId = "srv-1",
            encryptedBlob = "ivA:ctA",
            fingerprint = "fp-a",
            lastGeneration = 5L,
            writeId = 5L
        )
        val candidateB = WearServerCredentialsStore.CredentialStoreRecord(
            ownerId = "srv-1",
            encryptedBlob = "ivB:ctB",
            fingerprint = "fp-b",
            lastGeneration = 5L,
            writeId = 6L
        )
        val (afterFailedCommit, didCommit) = WearServerCredentialsStore.resolveCredentialStateAfterCommit(
            previousCommitted = committedA,
            candidate = candidateB,
            commitSucceeded = false
        )
        assertFalse(didCommit)
        assertEquals(committedA, afterFailedCommit)
        assertFalse(
            WearServerCredentialsStore.shouldDeduplicateCredentialSave(
                hasBlob = true,
                prevOwner = afterFailedCommit.ownerId,
                ownerId = "srv-1",
                prevFingerprint = afterFailedCommit.fingerprint,
                fingerprint = "fp-b",
                currentRecordReadable = true,
                isCurrentWriteCommitted = true
            )
        )
        assertFalse(
            WearServerCredentialsStore.shouldDeduplicateCredentialSave(
                hasBlob = true,
                prevOwner = "srv-1",
                ownerId = "srv-1",
                prevFingerprint = "fp-b",
                fingerprint = "fp-b",
                currentRecordReadable = true,
                isCurrentWriteCommitted = false
            )
        )

        // 2. TYPE_DELETED revocation clears only when expectedWriteId matches currentWriteId (even at same generation)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = null,
                lastSavedGen = 5L,
                revokedGen = 2L,
                hasActiveBlob = true,
                activeContextGeneration = 5L,
                expectedWriteId = 5L,
                currentWriteId = 6L
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = null,
                lastSavedGen = 5L,
                revokedGen = 2L,
                hasActiveBlob = true,
                activeContextGeneration = 5L,
                expectedWriteId = 5L,
                currentWriteId = 5L
            )
        )
        assertTrue(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 5L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 10L,
                credGenAtEvent = 5L,
                currentCredGen = 5L,
                credWriteIdAtEvent = 5L,
                currentCredWriteId = 6L
            )
        )

        // 3. Direct HTTP request admission requires BOTH active account generation AND current credential session
        assertTrue(WearServerCredentialsStore.isDirectRequestAdmitted(isAccountActive = true, isSessionCurrent = true))
        assertFalse(WearServerCredentialsStore.isDirectRequestAdmitted(isAccountActive = false, isSessionCurrent = true))
        assertFalse(WearServerCredentialsStore.isDirectRequestAdmitted(isAccountActive = true, isSessionCurrent = false))

        // 4. Water intake only retires pending optimistic tap when authoritative water_ml arrives; log-only confirmation keeps gauge amount without duplicating log row
        val sampleLog = listOf(WaterLogEntry("e1", "Glass", 250.0, "10:00 AM"))
        assertEquals("tap-1" to null, WearDirectApiClient.resolveWaterIntakeConfirmation("tap-1", 750.0, sampleLog))
        assertEquals(null to "tap-1", WearDirectApiClient.resolveWaterIntakeConfirmation("tap-1", null, sampleLog))
        assertEquals(null to null, WearDirectApiClient.resolveWaterIntakeConfirmation("tap-1", null, null))

        val pendingTap = PendingWaterTap(
            id = "tap-1",
            volumeMl = 250.0,
            containerId = 1,
            containerName = "Glass",
            createdAtMs = 1_700_000_000_000L,
            day = "2026-11-25",
            state = SyncState.SAVED,
            ownerId = "srv-1"
        )
        val (markedTaps, markedChanged) = CheckInStore.markWaterTapLogConfirmed(listOf(pendingTap), "tap-1")
        assertTrue(markedChanged)
        assertEquals(1, markedTaps.size)
        assertTrue(markedTaps.single().logConfirmed)
        assertEquals(250.0, markedTaps.sumOf { it.volumeMl }, 0.001)
        assertTrue(CheckInStore.filterPendingWaterLogTaps(markedTaps).isEmpty())

        // 5. DirectLiveSnapshot carries credentialWriteId and rejects refresh if credentials rotated or cleared
        val liveSnap = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", credentialWriteId = 8L)
        assertTrue(
            WearSessionManager.shouldApplyLiveRefresh(
                startGen = 2L,
                currentGen = 2L,
                startRev = 4L,
                currentRev = 4L,
                expectedOwnerId = "srv-1",
                activeOwnerId = "srv-1",
                snapshotOwnerId = liveSnap.ownerId,
                snapshotCredWriteId = liveSnap.credentialWriteId,
                currentCredWriteId = 8L,
                isCredSessionCurrent = true
            )
        )
        assertFalse(
            WearSessionManager.shouldApplyLiveRefresh(
                startGen = 2L,
                currentGen = 2L,
                startRev = 4L,
                currentRev = 4L,
                expectedOwnerId = "srv-1",
                activeOwnerId = "srv-1",
                snapshotOwnerId = liveSnap.ownerId,
                snapshotCredWriteId = liveSnap.credentialWriteId,
                currentCredWriteId = 9L,
                isCredSessionCurrent = true
            )
        )
        assertFalse(
            WearSessionManager.shouldApplyLiveRefresh(
                startGen = 2L,
                currentGen = 2L,
                startRev = 4L,
                currentRev = 4L,
                expectedOwnerId = "srv-1",
                activeOwnerId = "srv-1",
                snapshotOwnerId = liveSnap.ownerId,
                snapshotCredWriteId = liveSnap.credentialWriteId,
                currentCredWriteId = 8L,
                isCredSessionCurrent = false
            )
        )

        // 6. Unreconciled direct water writes are preserved against older cached phone snapshots until acked or day rolls over
        val (unrecDay, unrecIds) = CheckInStore.recordUnreconciledDirectWaterId(
            currentDay = "",
            currentIds = emptySet(),
            today = "2026-11-25",
            clientId = "w-750"
        )
        val localDirectWater = WaterSnapshot(
            day = "2026-11-25",
            consumedMl = 750.0,
            fromFoodMl = 100.0,
            log = listOf(WaterLogEntry("e1", "Bottle", 500.0, "09:00 AM"), WaterLogEntry("e2", "Glass", 250.0, "10:00 AM"))
        )
        val olderPhoneWater = WaterSnapshot(
            day = "2026-11-25",
            consumedMl = 500.0,
            fromFoodMl = 220.0,
            log = listOf(WaterLogEntry("e1", "Bottle", 500.0, "09:00 AM"))
        )
        val preservedResult = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-25",
            unreconciledIds = unrecIds,
            unreconciledDay = unrecDay,
            currentLocalWater = localDirectWater,
            incomingPhoneWater = olderPhoneWater,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(preservedResult.preservedLocalDirectWater)
        assertEquals(setOf("w-750"), preservedResult.remainingIds)
        assertEquals(750.0, preservedResult.effectiveWater?.consumedMl ?: 0.0, 0.001)
        assertEquals(220.0, preservedResult.effectiveWater?.fromFoodMl ?: 0.0, 0.001)
        assertEquals(2, preservedResult.effectiveWater?.log?.size)

        val persistedPhoneJson = JSONObject()
            .put("today", "2026-11-25")
            .put("waterConsumedMl", 500.0)
            .put("waterGoalMl", 2800.0)
            .toString()
        val patchedPersisted = JSONObject(
            CheckInStore.applyPreservedWaterToContextJson(persistedPhoneJson, preservedResult.effectiveWater!!)
        )
        assertEquals(750.0, patchedPersisted.getDouble("waterConsumedMl"), 0.001)
        assertEquals(2800.0, patchedPersisted.getDouble("waterGoalMl"), 0.001)
        assertEquals(2, patchedPersisted.getJSONArray("waterLog").length())

        val ackedPhoneWater = WaterSnapshot(
            day = "2026-11-25",
            consumedMl = 1000.0,
            fromFoodMl = 220.0,
            log = localDirectWater.log + WaterLogEntry("e3", "Glass", 250.0, "11:00 AM")
        )
        val reconciledResult = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-25",
            unreconciledIds = unrecIds,
            unreconciledDay = unrecDay,
            currentLocalWater = localDirectWater,
            incomingPhoneWater = ackedPhoneWater,
            incomingAckedClientIds = listOf("w-750")
        )
        assertFalse(reconciledResult.preservedLocalDirectWater)
        assertTrue(reconciledResult.remainingIds.isEmpty())
        assertEquals(1000.0, reconciledResult.effectiveWater?.consumedMl ?: 0.0, 0.001)

        // Day rollover clears prior day's unreconciled IDs
        val nextDayResult = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-26",
            unreconciledIds = unrecIds,
            unreconciledDay = unrecDay,
            currentLocalWater = localDirectWater,
            incomingPhoneWater = WaterSnapshot("2026-11-26", 0.0, null, emptyList()),
            incomingAckedClientIds = emptyList()
        )
        assertFalse(nextDayResult.preservedLocalDirectWater)
        assertTrue(nextDayResult.remainingIds.isEmpty())
        assertEquals(0.0, nextDayResult.effectiveWater?.consumedMl ?: -1.0, 0.001)

        // 7. watchDirectSynced includes clientId when non-empty and workout recovery prefers sessionObj workout_format/time_cap_seconds over presetObj
        val noticeWithClient = WearSessionManager.buildDirectSyncNotice(
            domain = "water",
            ownerId = "srv-1",
            entryDate = "2026-11-25",
            clientId = "w-750"
        )
        assertEquals("watchDirectSynced", noticeWithClient.getString("type"))
        assertEquals("water", noticeWithClient.getString("domain"))
        assertEquals("srv-1", noticeWithClient.getString("ownerId"))
        assertEquals("2026-11-25", noticeWithClient.getString("entryDate"))
        assertEquals("w-750", noticeWithClient.getString("clientId"))
        val noticeWithoutClient = WearSessionManager.buildDirectSyncNotice(
            domain = "fasting",
            ownerId = "srv-1",
            entryDate = null,
            clientId = ""
        )
        assertFalse(noticeWithoutClient.has("clientId"))
        assertFalse(noticeWithoutClient.has("entryDate"))

        val recoveredSessionJson = JSONObject()
            .put("id", "sess-fmt")
            .put("workout_format", "amrap")
            .put("time_cap_seconds", 900)
            .put("exercises", JSONArray().put(
                JSONObject()
                    .put("id", "e1")
                    .put("exercise_id", "ex-1")
                    .put("exercise_name", "Burpees")
                    .put("sets", JSONArray().put(JSONObject().put("id", "s1").put("set_number", 1).put("reps", 15.0)))
            ))
            .toString()
        val presetWithDifferentFormat = JSONObject()
            .put("name", "Metcon")
            .put("workout_format", "emom")
            .put("time_cap_seconds", 600)
            .toString()
        val recoveredPlan = WearDirectApiClient.buildWorkoutPlanFromSessionAndOptionalPreset(
            sessionBody = recoveredSessionJson,
            presetBody = presetWithDifferentFormat,
            fallbackSessionId = "sess-fmt"
        )!!
        assertEquals("amrap", recoveredPlan.workoutFormat)
        assertEquals(900, recoveredPlan.timeCapSeconds)
    }

    @Test
    fun `credential-only delete writeId guard, revocation acceptance vs persistence, transportRevision mTLS recovery, unconfirmed workout retry preservation, and dependent fastEnd phone fallback`() {
        // 1 & 2. WriteId-bound credential disable/clear protects newer credentials while allowing matching writeId cleanup
        assertTrue(WearServerCredentialsStore.shouldDisableCredentialsForAccountClear(expectedWriteId = 5L, currentWriteId = 5L))
        assertFalse(WearServerCredentialsStore.shouldDisableCredentialsForAccountClear(expectedWriteId = 5L, currentWriteId = 6L))
        assertTrue(WearServerCredentialsStore.shouldDisableCredentialsForAccountClear(expectedWriteId = null, currentWriteId = 6L))

        val acceptedUnpersisted = WearServerCredentialsStore.RevocationResult(
            accepted = true,
            persisted = false,
            targetWriteId = 5L,
            revokedGeneration = 4L
        )
        assertTrue(acceptedUnpersisted.accepted)
        assertFalse(acceptedUnpersisted.persisted)
        assertEquals(5L, acceptedUnpersisted.targetWriteId)

        // 3. Ordered transportRevision enables mTLS -> direct HTTP recovery at same generation G without letting stale direct/mTLS notices regress
        // mTLS notice at gen 5, rev 2 while blob is active (rev 1) is accepted
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = true,
                incomingTransportRev = 2L,
                lastTransportRev = 1L,
                isMtlsNotice = true
            )
        )
        // Older direct payload (gen 5, rev 1) cannot undo active mTLS (hasActiveBlob = false, lastTransportRev = 2)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 1L,
                lastTransportRev = 2L,
                isMtlsNotice = false
            )
        )
        // Equal transportRevision (gen 5, rev 2) cannot undo active mTLS
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 2L,
                lastTransportRev = 2L,
                isMtlsNotice = false
            )
        )
        // Strictly newer direct payload (gen 5, rev 3) recovers direct HTTP after mTLS removal at same generation 5
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 3L,
                lastTransportRev = 2L,
                isMtlsNotice = false
            )
        )
        // Delayed mTLS notice (gen 5, rev 2) cannot undo recovered direct HTTP (lastTransportRev = 3)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = true,
                incomingTransportRev = 2L,
                lastTransportRev = 3L,
                isMtlsNotice = true
            )
        )
        // Higher transportRevision NEVER bypasses sign-out revocation barrier (gen 5 <= revokedGen 5)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 5L,
                hasActiveBlob = false,
                incomingTransportRev = 99L,
                lastTransportRev = 2L,
                isMtlsNotice = false
            )
        )

        // 4. Preserve UnconfirmedCreate(sessionId) if retry returns FailedBeforeCreate so phone recovers existing session
        val initialUnconfirmed = PresetWorkoutDirectResult.UnconfirmedCreate("sess-pre-minted-1")
        assertEquals(
            initialUnconfirmed,
            WearSessionManager.resolvePresetWorkoutRetryOutcome(
                initial = initialUnconfirmed,
                retry = PresetWorkoutDirectResult.FailedBeforeCreate
            )
        )
        val recoveredPlan = ActiveWorkoutPlan(
            sessionId = "sess-pre-minted-1",
            workoutName = "Push Day",
            exercises = emptyList(),
            setOrder = emptyList()
        )
        assertEquals(
            PresetWorkoutDirectResult.Started(recoveredPlan),
            WearSessionManager.resolvePresetWorkoutRetryOutcome(
                initial = initialUnconfirmed,
                retry = PresetWorkoutDirectResult.Started(recoveredPlan)
            )
        )

        // 5. Dependent fastEnd defers to phone fallback when an earlier fastStart is still pending for the same owner
        val startA = CheckInStore.PendingFastOp(clientId = "start-a", ownerId = "srv-1", kind = "fastStart", startedAtMs = 1_700_000_000_000L)
        val endA = CheckInStore.PendingFastOp(clientId = "end-a", ownerId = "srv-1", kind = "fastEnd", startedAtMs = 1_700_000_000_000L, endedAtMs = 1_700_000_600_000L)
        val startB = CheckInStore.PendingFastOp(clientId = "start-b", ownerId = "srv-1", kind = "fastStart", startedAtMs = 1_700_001_000_000L)
        val otherOwnerStart = startA.copy(clientId = "start-other", ownerId = "srv-2")

        assertTrue(CheckInStore.hasPendingFastStartBefore(listOf(startA, endA), "srv-1", "end-a"))
        assertTrue(WearSessionManager.shouldDeferFastEndToPhone("fastEnd", hasPrecedingPendingStart = true))
        assertFalse(WearSessionManager.shouldDeferFastEndToPhone("fastStart", hasPrecedingPendingStart = true))
        // Once start-a settles, end-a does NOT defer behind a LATER start-b or another owner's start
        assertFalse(CheckInStore.hasPendingFastStartBefore(listOf(endA, startB), "srv-1", "end-a"))
        assertFalse(CheckInStore.hasPendingFastStartBefore(listOf(otherOwnerStart, endA), "srv-1", "end-a"))

        // 6. M3 Tile curve-clearance insets widen lower rows to keep all cards clear of the circular progress ring
        assertEquals(5f, TILE_OUTER_RING_STROKE_DP, 0.01f)
        assertEquals(8f, tileRowCurveInsetDp(0, 1), 0.01f)
        assertEquals(0f, tileRowCurveInsetDp(0, 2), 0.01f)
        assertEquals(5f, tileRowCurveInsetDp(1, 2), 0.01f)
        assertEquals(0f, tileRowCurveInsetDp(0, 3), 0.01f)
        assertEquals(1f, tileRowCurveInsetDp(1, 3), 0.01f)
        assertEquals(7f, tileRowCurveInsetDp(2, 3), 0.01f)
    }

    @Test
    fun `refreshed containers base sync, null-water reconciliation preservation, fast failure state retention, water log-only refresh trigger, logConfirmed tap settlement, and 4-way water container compaction`() {
        // #8. applyRefreshedContainersToBaseContext updates baseWatchContext for non-null lists (including empty) and leaves null untouched
        val staleContainers = listOf(WaterContainer(1, "Old Mug", 300.0, "ml"))
        val freshContainers = listOf(WaterContainer(2, "New Bottle", 500.0, "ml"))
        val baseWithStale = WatchContext(waterContainers = staleContainers)
        assertEquals(freshContainers, CheckInStore.applyRefreshedContainersToBaseContext(baseWithStale, freshContainers).waterContainers)
        assertEquals(emptyList<WaterContainer>(), CheckInStore.applyRefreshedContainersToBaseContext(baseWithStale, emptyList()).waterContainers)
        assertEquals(staleContainers, CheckInStore.applyRefreshedContainersToBaseContext(baseWithStale, null).waterContainers)

        // #9. reconcileIncomingPhoneWater preserves local direct water and unreconciled IDs when phone context omits today's water (even if acked)
        val localDirect = WaterSnapshot(
            day = "2026-11-25",
            consumedMl = 750.0,
            fromFoodMl = 120.0,
            log = listOf(WaterLogEntry("e1", "Bottle", 750.0, "09:00 AM"))
        )
        val missingPhoneWater = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-25",
            unreconciledIds = setOf("w-750"),
            unreconciledDay = "2026-11-25",
            currentLocalWater = localDirect,
            incomingPhoneWater = null,
            incomingAckedClientIds = listOf("w-750")
        )
        assertTrue(missingPhoneWater.preservedLocalDirectWater)
        assertEquals(setOf("w-750"), missingPhoneWater.remainingIds)
        assertEquals(localDirect, missingPhoneWater.effectiveWater)

        // #10. resolveFastSyncState preserves FAILED when final pending op fails, and transitions back to QUEUED/SAVED once cleared
        assertEquals(SyncState.FAILED, CheckInStore.resolveFastSyncState(ownerPendingCount = 0, fastSyncFailed = true))
        assertEquals(SyncState.FAILED, CheckInStore.resolveFastSyncState(ownerPendingCount = 2, fastSyncFailed = true))
        assertEquals(SyncState.QUEUED, CheckInStore.resolveFastSyncState(ownerPendingCount = 1, fastSyncFailed = false))
        assertEquals(SyncState.SAVED, CheckInStore.resolveFastSyncState(ownerPendingCount = 0, fastSyncFailed = false))

        // #11. Direct drink add with waterMl != null but waterLog == null still triggers forced live refresh (while delete with log omitted does not)
        assertTrue(
            CheckInStore.shouldForceWaterRefreshAfterDirectOutcome(
                matchesToday = true,
                outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = 750.0, waterLog = null)
            )
        )
        assertTrue(
            CheckInStore.shouldForceWaterRefreshAfterDirectOutcome(
                matchesToday = true,
                outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = null, waterLog = localDirect.log)
            )
        )
        assertFalse(
            CheckInStore.shouldForceWaterRefreshAfterDirectOutcome(
                matchesToday = true,
                outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = 750.0, waterLog = localDirect.log)
            )
        )
        assertFalse(
            CheckInStore.shouldForceWaterRefreshAfterDirectOutcome(
                matchesToday = true,
                outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = 500.0, waterLog = null, deletedWaterEntryId = "e1")
            )
        )

        // #12. logConfirmed water taps do not rely on baseline threshold (even if server total drops after phone delete) and settle on authoritative refresh
        val logConfirmedTap = PendingWaterTap(
            id = "tap-log-only",
            volumeMl = 250.0,
            containerId = 1,
            containerName = "Glass",
            createdAtMs = 1_700_000_000_000L,
            day = "2026-11-25",
            state = SyncState.SAVED,
            ownerId = "srv-1",
            logConfirmed = true
        )
        val regularSavedTap = logConfirmedTap.copy(id = "tap-regular", logConfirmed = false)
        assertFalse(CheckInStore.shouldSettleSavedTapByBaseline(logConfirmedTap, baselineMl = 500.0, serverMl = 750.0))
        assertTrue(CheckInStore.shouldSettleSavedTapByBaseline(regularSavedTap, baselineMl = 500.0, serverMl = 750.0))

        val baselines = mutableMapOf("tap-log-only" to 500.0, "tap-regular" to 500.0)
        val (afterNoMlRefresh, changedNoMl) = CheckInStore.settleLogConfirmedWaterTapsOnRefresh(
            existingTaps = listOf(logConfirmedTap, regularSavedTap),
            baselines = baselines,
            day = "2026-11-25",
            hasAuthoritativeWaterMl = false
        )
        assertFalse(changedNoMl)
        assertEquals(2, afterNoMlRefresh.size)

        val (afterAuthRefresh, changedAuth) = CheckInStore.settleLogConfirmedWaterTapsOnRefresh(
            existingTaps = listOf(logConfirmedTap, regularSavedTap),
            baselines = baselines,
            day = "2026-11-25",
            hasAuthoritativeWaterMl = true
        )
        assertTrue(changedAuth)
        assertEquals(listOf("tap-regular"), afterAuthRefresh.map { it.id })
        assertFalse(baselines.containsKey("tap-log-only"))

        // #17. Multi-segment 4-way colliding container names stay distinct and actionable via group-wide minOf prefix
        val fourWayContainers = listOf(
            WaterContainer(id = 31, name = "Insulated Bottle A - Left", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 32, name = "Insulated Bottle A - Right", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 33, name = "Insulated Bottle B - Left", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 34, name = "Insulated Bottle B - Right", servingVolumeMl = 250.0, unit = "ml", isQuickAdd = true)
        )
        val fourWayChips = TileModels.buildAllWaterContainerChips(
            fourWayContainers,
            WatchContext(waterDisplayUnit = "ml"),
            Locale.US
        )
        assertEquals(4, fourWayChips.map { it.name }.toSet().size)
        assertEquals(
            listOf("Insu\u2026A - Le", "Insu\u2026A - Ri", "Insu\u2026B - Le", "Insu\u2026B - Ri"),
            fourWayChips.map { it.name }
        )
        assertTrue(fourWayChips.all { it.isDirectlyActionable })
    }

    @Test
    fun `credential delete staleness, workout recovery persistence, ordered fast op hold, direct medications projection, water delete and partial ack reconciliation, history merge, revocation startup check, newest-first water log, goals overflow, locale bf formatting, and unicode container disambiguation`() {
        // 1. Credential deletion ignores contextSeq/contextGen advances while still guarding gen, credGen, and credWriteId
        assertFalse(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 6L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 12L,
                credGenAtEvent = 5L,
                currentCredGen = 5L,
                credWriteIdAtEvent = 4L,
                currentCredWriteId = 4L,
                isContextDelete = false
            )
        )
        assertTrue(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 5L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 11L,
                credGenAtEvent = 5L,
                currentCredGen = 5L,
                credWriteIdAtEvent = 4L,
                currentCredWriteId = 4L,
                isContextDelete = true
            )
        )
        assertTrue(
            WearSessionManager.isStaleDeleteEvent(
                genAtEvent = 1L,
                currentGen = 1L,
                ctxGenAtEvent = 5L,
                currentCtxGen = 5L,
                ctxSeqAtEvent = 10L,
                currentCtxSeq = 10L,
                credGenAtEvent = 5L,
                currentCredGen = 5L,
                credWriteIdAtEvent = 4L,
                currentCredWriteId = 5L,
                isContextDelete = false
            )
        )

        // 2. Unconfirmed workout create recovery persists sessionId + startGen across retries and prunes on account switch/start
        val baseWorkoutReq = OutboundPayloads.workoutStartRequest("42", "srv-1")
        val recoveryPayload = WearSessionManager.buildUnconfirmedWorkoutRecoveryPayload(baseWorkoutReq, "sess-rec-1")
        assertEquals("sess-rec-1", recoveryPayload.getString("sessionId"))
        assertEquals("42", recoveryPayload.getString("presetId"))

        val rec1 = WearSessionManager.PendingWorkoutRecovery(
            ownerId = "srv-1",
            presetId = "42",
            sessionId = "sess-rec-1",
            accountGen = 3L,
            deliveredToPhone = false
        )
        val storedRecs = WearSessionManager.deserializeWorkoutRecoveries(
            WearSessionManager.serializeWorkoutRecoveries(
                WearSessionManager.recordWorkoutRecovery(emptyList(), rec1)
            )
        )
        assertEquals(listOf(rec1), storedRecs)
        assertEquals(rec1, WearSessionManager.matchingWorkoutRecovery(storedRecs, "srv-1", "42", currentGen = 3L))
        assertNull(WearSessionManager.matchingWorkoutRecovery(storedRecs, "srv-1", "42", currentGen = 4L))
        assertEquals(listOf(rec1), WearSessionManager.replayableWorkoutRecoveries(storedRecs, "srv-1", currentGen = 3L))
        assertTrue(WearSessionManager.replayableWorkoutRecoveries(storedRecs, "srv-1", currentGen = 4L).isEmpty())
        val deliveredRecs = WearSessionManager.recordWorkoutRecovery(storedRecs, rec1.copy(deliveredToPhone = true))
        assertEquals(listOf(rec1.copy(deliveredToPhone = true)), WearSessionManager.replayableWorkoutRecoveries(deliveredRecs, "srv-1", currentGen = 3L))
        assertEquals("sess-rec-1", WearSessionManager.matchingWorkoutRecovery(deliveredRecs, "srv-1", "42", currentGen = 3L)?.sessionId)
        assertTrue(WearSessionManager.removeWorkoutRecoveryBySession(deliveredRecs, "sess-rec-1").isEmpty())
        assertTrue(WearSessionManager.pruneRetiredWorkoutRecoveries(storedRecs, retiredThroughGeneration = 3L).isEmpty())

        // 3. Dependent fastStart & fastEnd are held on the watch behind ANY earlier unsettled fast op and dispatched strictly FIFO upon settlement
        val fStartA = CheckInStore.PendingFastOp(clientId = "s-a", ownerId = "srv-1", kind = "fastStart", startedAtMs = 1_700_000_000_000L, orderSeq = 1L)
        val fEndA = CheckInStore.PendingFastOp(clientId = "e-a", ownerId = "srv-1", kind = "fastEnd", startedAtMs = 1_700_000_000_000L, endedAtMs = 1_700_000_600_000L, orderSeq = 2L)
        val fStartB = CheckInStore.PendingFastOp(clientId = "s-b", ownerId = "srv-1", kind = "fastStart", startedAtMs = 1_700_001_000_000L, orderSeq = 3L)
        val chainOps = listOf(fStartA, fEndA, fStartB)
        assertFalse(CheckInStore.hasEarlierUnsettledFastOp(chainOps, "srv-1", "s-a"))
        assertTrue(CheckInStore.hasEarlierUnsettledFastOp(chainOps, "srv-1", "e-a"))
        assertTrue(CheckInStore.hasEarlierUnsettledFastOp(chainOps, "srv-1", "s-b"))
        assertTrue(WearSessionManager.shouldHoldDependentFastOp("fastEnd", hasEarlierUnsettledOp = true))
        assertTrue(WearSessionManager.shouldHoldDependentFastOp("fastStart", hasEarlierUnsettledOp = true))
        assertFalse(WearSessionManager.shouldHoldDependentFastOp("fastEnd", hasEarlierUnsettledOp = false))
        assertEquals(listOf(fStartA), CheckInStore.selectDispatchablePendingFastOps(chainOps, "srv-1"))
        assertTrue(CheckInStore.selectDispatchablePendingFastOps(chainOps, "srv-1") { it == "s-a" }.isEmpty())
        val afterStartASettled = CheckInStore.settlePendingFastOp(chainOps, "s-a")
        assertFalse(CheckInStore.hasEarlierUnsettledFastOp(afterStartASettled, "srv-1", "e-a"))
        assertTrue(CheckInStore.hasEarlierUnsettledFastOp(afterStartASettled, "srv-1", "s-b"))
        assertEquals(listOf(fEndA), CheckInStore.selectDispatchablePendingFastOps(afterStartASettled, "srv-1"))
        val afterEndASettled = CheckInStore.settlePendingFastOp(afterStartASettled, "e-a")
        assertEquals(listOf(fStartB), CheckInStore.selectDispatchablePendingFastOps(afterEndASettled, "srv-1"))

        // 4. Direct server medications schedule + entries projection mirrors watchMedications.ts (including month-end, PRN, sorting, dose formatting, and persistence)
        val medsServerJson = JSONArray()
            .put(
                JSONObject()
                    .put("id", "m-daily")
                    .put("name", "Vitamin D")
                    .put("is_active", true)
                    .put("is_supplement", true)
                    .put("dose_amount", 2.0)
                    .put("dose_unit", "dose")
                    .put(
                        "schedules",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("id", "s-pm")
                                    .put("schedule_type_id", "daily")
                                    .put("time_of_day", "20:00:00")
                                    .put("dose_amount", 1.0)
                            )
                            .put(
                                JSONObject()
                                    .put("id", "s-am")
                                    .put("schedule_type_id", "daily")
                                    .put("time_of_day", "08:30:00")
                            )
                    )
            )
            .put(
                JSONObject()
                    .put("id", "m-month")
                    .put("name", "Monthly B12")
                    .put("is_active", true)
                    .put("strength_value", 1000.0)
                    .put("strength_unit", "mcg")
                    .put(
                        "schedules",
                        JSONArray().put(
                            JSONObject()
                                .put("id", "s-31")
                                .put("schedule_type_id", "monthly")
                                .put("day_of_month", 31)
                                .put("time_of_day", "09:00")
                        )
                    )
            )
            .put(
                JSONObject()
                    .put("id", "m-prn")
                    .put("name", "Ibuprofen")
                    .put("is_active", true)
                    .put("dose_amount", 200.0)
                    .put("dose_unit", "mg")
                    .put("schedules", JSONArray())
            )
            .put(
                JSONObject()
                    .put("id", "m-inactive")
                    .put("name", "Old Med")
                    .put("is_active", false)
                    .put(
                        "schedules",
                        JSONArray().put(JSONObject().put("id", "s-old").put("schedule_type_id", "daily"))
                    )
            )
            .toString()
        val entriesServerJson = JSONArray()
            .put(JSONObject().put("id", "ent-1").put("medication_id", "m-daily").put("schedule_id", "s-am").put("status", "taken"))
            .put(JSONObject().put("id", "ent-2").put("medication_id", "m-prn").put("status", "prn_taken"))
            .toString()
        val projectedMeds = WearDirectApiClient.buildMedicationsSnapshotFromServerJson(
            medicationsBody = medsServerJson,
            entriesBody = entriesServerJson,
            today = "2026-11-30",
            timeFormat = "HH:mm",
            timeZone = java.util.TimeZone.getTimeZone("UTC"),
            locale = Locale.US
        )!!
        assertEquals("2026-11-30", projectedMeds.day)
        assertEquals(
            listOf("m-daily:s-am", "m-month:s-31", "m-daily:s-pm", "m-prn:"),
            projectedMeds.doses.map { it.id }
        )
        assertEquals("2 servings", projectedMeds.doses[0].detail)
        assertEquals("08:30", projectedMeds.doses[0].time)
        assertEquals(MedicationDoseStatus.TAKEN, projectedMeds.doses[0].status)
        assertEquals("1000 mcg", projectedMeds.doses[1].detail)
        assertEquals("1 serving", projectedMeds.doses[2].detail)
        assertEquals("200 mg", projectedMeds.doses[3].detail)
        assertEquals(MedicationDoseStatus.TAKEN, projectedMeds.doses[3].status)
        val emptyProjectedMeds = WearDirectApiClient.buildMedicationsSnapshotFromServerJson("[]", "[]", "2026-11-30")!!
        assertTrue(emptyProjectedMeds.doses.isEmpty())

        val persistedMedsObj = JSONObject().put("today", "2026-11-29")
        CheckInStore.patchContextJsonObject(
            obj = persistedMedsObj,
            ackedClientId = null,
            entryDate = "2026-11-30",
            localToday = "2026-11-30",
            refreshedMedications = projectedMeds,
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-30", medications = projectedMeds)
        )
        val reparsedMeds = ContextPayloadMapper.parseContext(persistedMedsObj, WatchContext.empty).medications!!
        assertEquals(projectedMeds.doses, reparsedMeds.doses)

        // 5. Log-only direct water tap on a new day persists 0.0 base (not waterLog.sumOf) to prevent double count on restart
        val newDayLogOnlyObj = JSONObject()
            .put("today", "2026-11-24")
            .put("waterConsumedMl", 1200.0)
        CheckInStore.patchContextJsonObject(
            obj = newDayLogOnlyObj,
            ackedClientId = "tap-a",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = null,
            waterLog = listOf(WaterLogEntry("e1", "Glass", 250.0, "08:00 AM"))
        )
        assertEquals("2026-11-25", newDayLogOnlyObj.getString("today"))
        assertEquals(0.0, newDayLogOnlyObj.getDouble("waterConsumedMl"), 0.001)
        assertEquals(1, newDayLogOnlyObj.getJSONArray("waterLog").length())

        // 6. Later direct water write with authoritative waterMl retires earlier logConfirmed Tap A along with Tap B
        val tapA = PendingWaterTap("tap-a", 250.0, 1, "Glass", 1_000L, "2026-11-25", SyncState.SAVED, "srv-1", logConfirmed = true)
        val tapB = PendingWaterTap("tap-b", 500.0, 2, "Bottle", 2_000L, "2026-11-25", SyncState.SAVED, "srv-1", logConfirmed = false)
        val tapC = PendingWaterTap("tap-c", 200.0, 3, "Cup", 3_000L, "2026-11-25", SyncState.QUEUED, "srv-1", logConfirmed = false)
        val tapBaselines = mutableMapOf("tap-a" to 0.0, "tap-b" to 0.0, "tap-c" to 750.0)
        val (afterLogOnlyB, _) = CheckInStore.settleDirectWaterTapsForOutcome(
            existingTaps = listOf(tapA, tapB, tapC),
            baselines = tapBaselines,
            day = "2026-11-25",
            outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = null, logConfirmedWaterTapId = "tap-b")
        )
        assertEquals(listOf("tap-a", "tap-b", "tap-c"), afterLogOnlyB.map { it.id })
        assertTrue(afterLogOnlyB.first { it.id == "tap-b" }.logConfirmed)
        val (afterAuthTapB, authChanged) = CheckInStore.settleDirectWaterTapsForOutcome(
            existingTaps = listOf(tapA, tapB, tapC),
            baselines = tapBaselines,
            day = "2026-11-25",
            outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = 750.0, confirmedWaterTapId = "tap-b")
        )
        assertTrue(authChanged)
        assertEquals(listOf("tap-c"), afterAuthTapB.map { it.id })
        assertFalse(tapBaselines.containsKey("tap-a"))
        assertFalse(tapBaselines.containsKey("tap-b"))

        // 7. Partial water acks (Tap A in phone context #1, Tap B in phone context #2) defer Tap A coverage until phone water is adopted, then settle BOTH A and B together
        val localAbWater = WaterSnapshot("2026-11-25", 0.0, null, listOf(WaterLogEntry("e1", "Glass", 250.0, "08:00 AM"), WaterLogEntry("e2", "Bottle", 500.0, "08:05 AM")))
        val phoneCtx1 = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-25",
            unreconciledIds = setOf("tap-a", "tap-b"),
            unreconciledDay = "2026-11-25",
            currentLocalWater = localAbWater,
            incomingPhoneWater = WaterSnapshot("2026-11-25", 250.0, null, listOf(WaterLogEntry("e1", "Glass", 250.0, "08:00 AM"))),
            incomingAckedClientIds = listOf("tap-a"),
            deferredAckedIds = emptySet()
        )
        assertTrue(phoneCtx1.preservedLocalDirectWater)
        assertEquals(setOf("tap-b"), phoneCtx1.remainingIds)
        assertEquals(setOf("tap-a"), phoneCtx1.deferredAckedIds)
        assertTrue(phoneCtx1.settledIds.isEmpty())

        val phoneCtx2 = CheckInStore.reconcileIncomingPhoneWater(
            today = "2026-11-25",
            unreconciledIds = phoneCtx1.remainingIds,
            unreconciledDay = "2026-11-25",
            currentLocalWater = phoneCtx1.effectiveWater,
            incomingPhoneWater = WaterSnapshot("2026-11-25", 750.0, null, localAbWater.log),
            incomingAckedClientIds = listOf("tap-b"),
            deferredAckedIds = phoneCtx1.deferredAckedIds
        )
        assertFalse(phoneCtx2.preservedLocalDirectWater)
        assertTrue(phoneCtx2.remainingIds.isEmpty())
        assertTrue(phoneCtx2.deferredAckedIds.isEmpty())
        assertEquals(setOf("tap-a", "tap-b"), phoneCtx2.settledIds)
        assertEquals(750.0, phoneCtx2.effectiveWater?.consumedMl ?: 0.0, 0.001)

        // 8 & 9. Earlier fast success (End A seq=1) NEVER clears later fast failure (Start B seq=2) in either order, while later success clears earlier failure
        var outOrderFailFirst = CheckInStore.FastSyncOutcomeState()
        outOrderFailFirst = CheckInStore.applyFastOpOutcome(outOrderFailFirst, opOrderSeq = 2L, ok = false)
        outOrderFailFirst = CheckInStore.applyFastOpOutcome(outOrderFailFirst, opOrderSeq = 1L, ok = true)
        assertTrue(outOrderFailFirst.isFailed)

        var inOrderSuccessFirst = CheckInStore.FastSyncOutcomeState()
        inOrderSuccessFirst = CheckInStore.applyFastOpOutcome(inOrderSuccessFirst, opOrderSeq = 1L, ok = true)
        inOrderSuccessFirst = CheckInStore.applyFastOpOutcome(inOrderSuccessFirst, opOrderSeq = 2L, ok = false)
        assertTrue(inOrderSuccessFirst.isFailed)

        var laterSuccessClears = CheckInStore.FastSyncOutcomeState()
        laterSuccessClears = CheckInStore.applyFastOpOutcome(laterSuccessClears, opOrderSeq = 1L, ok = false)
        laterSuccessClears = CheckInStore.applyFastOpOutcome(laterSuccessClears, opOrderSeq = 2L, ok = true)
        assertFalse(laterSuccessClears.isFailed)

        val serializedOrderOps = CheckInStore.serializePendingFastOps(listOf(fStartA, fEndA))
        val restoredOrderOps = CheckInStore.deserializePendingFastOps(serializedOrderOps, "srv-1")
        assertEquals(listOf(1L, 2L), restoredOrderOps.map { it.orderSeq })

        // 10. Follow-up direct read admission requires active account AND current credential session
        assertTrue(WearDirectApiClient.shouldRunFollowUpDirectRead(isAccountActive = true, isSessionCurrent = true))
        assertFalse(WearDirectApiClient.shouldRunFollowUpDirectRead(isAccountActive = false, isSessionCurrent = true))
        assertFalse(WearDirectApiClient.shouldRunFollowUpDirectRead(isAccountActive = true, isSessionCurrent = false))

        // 11. 14-day direct refresh preserves older >14d history/bodyFatHistory while replacing/clearing stale points inside [refreshStartDay..today]
        val existingLongHistory = listOf(
            HistoryPoint("2026-11-05", 82.0, 20.5),
            HistoryPoint("2026-11-18", 81.2, 19.8),
            HistoryPoint("2026-11-24", 80.6, 19.4)
        )
        val mergedWithEmpty14d = CheckInStore.mergeDirectRefreshHistory(
            existing = existingLongHistory,
            refreshed = emptyList(),
            snapshotDay = "2026-11-25"
        )
        assertEquals(listOf("2026-11-05"), mergedWithEmpty14d.map { it.day })
        val mergedWithRecent14d = CheckInStore.mergeDirectRefreshHistory(
            existing = existingLongHistory,
            refreshed = listOf(HistoryPoint("2026-11-25", 80.1, 19.1)),
            snapshotDay = "2026-11-25"
        )
        assertEquals(listOf("2026-11-05", "2026-11-25"), mergedWithRecent14d.map { it.day })

        val persistedLongObj = JSONObject()
            .put("today", "2026-11-25")
            .put(
                "bodyFatHistory",
                JSONArray()
                    .put(JSONObject().put("day", "2026-11-05").put("bodyFatPercentage", 20.5))
                    .put(JSONObject().put("day", "2026-11-18").put("bodyFatPercentage", 19.8))
            )
        CheckInStore.patchContextJsonObject(
            obj = persistedLongObj,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            bodyFatHistory = emptyList(),
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", history = emptyList(), bodyFatHistory = emptyList())
        )
        val mergedBfArr = persistedLongObj.getJSONArray("bodyFatHistory")
        assertEquals(1, mergedBfArr.length())
        assertEquals("2026-11-05", mergedBfArr.getJSONObject(0).getString("day"))

        // 12. Startup revocation barrier check revokes restoredGen <= revokedGen while preserving unrevoked phone-only and newer contexts
        assertFalse(WearServerCredentialsStore.isPersistedContextRevoked(revokedGen = 0L, restoredContextGen = 0L))
        assertFalse(WearServerCredentialsStore.isPersistedContextRevoked(revokedGen = 0L, restoredContextGen = 5L))
        assertTrue(WearServerCredentialsStore.isPersistedContextRevoked(revokedGen = 5L, restoredContextGen = 0L))
        assertTrue(WearServerCredentialsStore.isPersistedContextRevoked(revokedGen = 5L, restoredContextGen = 5L))
        assertFalse(WearServerCredentialsStore.isPersistedContextRevoked(revokedGen = 5L, restoredContextGen = 6L))

        // 13. Water log stays strictly newest-first and undo deletes the newest entry (first element)
        val pendingNewest = listOf(WaterLogEntry("pending_2", "Bottle", 500.0, "09:10 AM"), WaterLogEntry("pending_1", "Glass", 250.0, "09:05 AM"))
        val serverNewest = listOf(WaterLogEntry("srv_2", "Mug", 300.0, "09:00 AM"), WaterLogEntry("srv_1", "Cup", 200.0, "08:00 AM"))
        val combinedLog = CheckInStore.combineWaterLogNewestFirst(pendingNewest, serverNewest)
        assertEquals(listOf("pending_2", "pending_1", "srv_2", "srv_1"), combinedLog.map { it.id })
        assertEquals("pending_2", CheckInStore.selectLatestWaterEntryForUndo(combinedLog)?.id)
        assertEquals("srv_2", CheckInStore.selectLatestWaterEntryForUndo(serverNewest)?.id)

        // 14. Confirmed water delete retains subtraction when waterMl == null and does not double-subtract when waterMl != null
        val prevWater = WaterSnapshot("2026-11-25", 750.0, null, listOf(WaterLogEntry("e2", "Bottle", 500.0, "09:00 AM"), WaterLogEntry("e1", "Glass", 250.0, "08:00 AM")))
        val afterDeleteNoTotal = CheckInStore.resolveWaterConsumedMlAfterDirectOutcome(
            prev = prevWater,
            outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = null, waterLog = listOf(WaterLogEntry("e1", "Glass", 250.0, "08:00 AM")), deletedWaterEntryId = "e2")
        )
        assertEquals(250.0, afterDeleteNoTotal, 0.001)
        val afterDeleteWithTotal = CheckInStore.resolveWaterConsumedMlAfterDirectOutcome(
            prev = prevWater,
            outcome = DirectWriteOutcome.Applied(syncedDomain = "water", entryDate = "2026-11-25", waterMl = 250.0, deletedWaterEntryId = "e2")
        )
        assertEquals(250.0, afterDeleteWithTotal, 0.001)
        val persistedDelObj = JSONObject()
            .put("today", "2026-11-25")
            .put("waterConsumedMl", 750.0)
            .put(
                "waterLog",
                JSONArray()
                    .put(JSONObject().put("id", "e2").put("name", "Bottle").put("volumeMl", 500.0).put("time", "09:00 AM"))
                    .put(JSONObject().put("id", "e1").put("name", "Glass").put("volumeMl", 250.0).put("time", "08:00 AM"))
            )
        CheckInStore.patchContextJsonObject(
            obj = persistedDelObj,
            ackedClientId = "del-1",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            waterConsumedMl = null,
            waterLog = listOf(WaterLogEntry("e1", "Glass", 250.0, "08:00 AM")),
            deletedWaterEntryId = "e2"
        )
        assertEquals(250.0, persistedDelObj.getDouble("waterConsumedMl"), 0.001)

        // 15. Goals calorie overflow ring computes unrounded consumed / (consumed + remaining) and falls back when goal <= 0
        val overflowSnap = NutritionSnapshot(
            day = "2026-11-25",
            caloriesConsumed = 2200.0,
            caloriesBurned = 300.0,
            caloriesRemaining = -200.0,
            calorieProgress = 1.0,
            carbs = MacroGoal(0.0, 0.0, 0.0),
            fat = MacroGoal(0.0, 0.0, 0.0),
            protein = MacroGoal(0.0, 0.0, 0.0),
            rows = null
        )
        assertEquals(1.1f, computeGoalsCalorieRawProgress(overflowSnap), 0.001f)
        val zeroGoalSnap = overflowSnap.copy(caloriesConsumed = 500.0, caloriesRemaining = -500.0, calorieProgress = 0.85)
        assertEquals(0.85f, computeGoalsCalorieRawProgress(zeroGoalSnap), 0.001f)

        // 16. Locale-aware body fat percent formatting
        assertEquals("18.5%", formatBodyFatPercent(18.5, Locale.US, showPositiveSign = false))
        assertEquals("+0.4%", formatBodyFatPercent(0.4, Locale.US, showPositiveSign = true))
        assertEquals("-0.4%", formatBodyFatPercent(-0.4, Locale.US, showPositiveSign = true))
        assertEquals("0.0%", formatBodyFatPercent(-0.01, Locale.US, showPositiveSign = true))
        assertTrue(formatBodyFatPercent(18.5, Locale.FRANCE, showPositiveSign = false).contains("18,5"))

        // 17. TrendModels keeps undated lastBodyFatPercentage for hero summary without fabricating a weight-date sample, and plots dated bodyFatHistory on its own body-fat date
        val undatedLastBfTrend = TrendModels.buildTrendPageModel(
            watchCtx = WatchContext(
                today = "2026-11-25",
                lastEntryDate = "2026-11-24",
                lastWeightKg = 80.5,
                lastBodyFatPercentage = 18.2,
                weightUnit = WeightUnit.KG
            ),
            history = emptyList(),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(18.2, undatedLastBfTrend.latestBodyFatPercent ?: 0.0, 0.001)
        assertTrue(undatedLastBfTrend.bodyFatSamples.isEmpty())
        assertNull(undatedLastBfTrend.bodyFatDeltaPercent)

        val datedLastBfTrend = TrendModels.buildTrendPageModel(
            watchCtx = WatchContext(
                today = "2026-11-25",
                lastEntryDate = "2026-11-24",
                lastWeightKg = 80.5,
                lastBodyFatPercentage = 18.2,
                bodyFatHistory = listOf(HistoryPoint("2026-11-23", 0.0, 18.2)),
                weightUnit = WeightUnit.KG
            ),
            history = listOf(HistoryPoint("2026-11-20", 81.0, 19.0)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(18.2, datedLastBfTrend.latestBodyFatPercent ?: 0.0, 0.001)
        assertEquals(listOf("2026-11-20", "2026-11-23"), datedLastBfTrend.bodyFatSamples.map { it.day })
        assertEquals(-0.8, datedLastBfTrend.bodyFatDeltaPercent ?: 0.0, 0.001)

        // 18. Unicode code-point container compaction (Travel Mug😀 vs Travel Mug𠮷) & raw-diff disambiguation (Reusable Bottle Blue vs Reusable Bottle  Blue)
        val emojiContainers = listOf(
            WaterContainer(id = 41, name = "Travel Mug\uD83D\uDE00", servingVolumeMl = 400.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 42, name = "Travel Mug\uD842\uDFB7", servingVolumeMl = 400.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 43, name = "Glass", servingVolumeMl = 250.0, unit = "ml", isPrimary = true)
        )
        val emojiChips = TileModels.buildAllWaterContainerChips(emojiContainers, WatchContext(waterDisplayUnit = "ml"), Locale.US)
        assertEquals("Travel Mug\uD83D\uDE00", emojiChips.first { it.id == 41 }.name)
        assertEquals("Travel Mug\uD842\uDFB7", emojiChips.first { it.id == 42 }.name)
        assertTrue(emojiChips.all { it.isDirectlyActionable })
        // Truncation landing right on supplementary emojis sharing a high surrogate never splits surrogate pairs
        val longEmojiContainers = listOf(
            WaterContainer(id = 44, name = "My Travel M\uD83D\uDE00", servingVolumeMl = 400.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 45, name = "My Travel M\uD83D\uDE01", servingVolumeMl = 400.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 46, name = "Glass", servingVolumeMl = 250.0, unit = "ml", isPrimary = true)
        )
        val longEmojiChips = TileModels.buildAllWaterContainerChips(longEmojiContainers, WatchContext(waterDisplayUnit = "ml"), Locale.US)
        assertEquals("My T\u2026\uD83D\uDE00", longEmojiChips.first { it.id == 44 }.name)
        assertEquals("My T\u2026\uD83D\uDE01", longEmojiChips.first { it.id == 45 }.name)
        assertTrue(longEmojiChips.all { it.isDirectlyActionable })

        val whitespaceDiffContainers = listOf(
            WaterContainer(id = 51, name = "Reusable Bottle Blue", servingVolumeMl = 500.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 52, name = "Reusable Bottle  Blue", servingVolumeMl = 500.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 53, name = "Glass", servingVolumeMl = 250.0, unit = "ml", isPrimary = true)
        )
        val wsChips = TileModels.buildAllWaterContainerChips(whitespaceDiffContainers, WatchContext(waterDisplayUnit = "ml"), Locale.US)
        assertTrue(wsChips.first { it.id == 51 }.name != wsChips.first { it.id == 52 }.name)
        assertTrue(wsChips.all { it.isDirectlyActionable })

        val trueDuplicateContainers = listOf(
            WaterContainer(id = 61, name = "Reusable Bottle Blue", servingVolumeMl = 500.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 62, name = "Reusable Bottle Blue", servingVolumeMl = 500.0, unit = "ml", isQuickAdd = true),
            WaterContainer(id = 63, name = "Glass", servingVolumeMl = 250.0, unit = "ml", isPrimary = true)
        )
        val dupChips = TileModels.buildAllWaterContainerChips(trueDuplicateContainers, WatchContext(waterDisplayUnit = "ml"), Locale.US)
        assertFalse(dupChips.first { it.id == 61 }.isDirectlyActionable)
        assertFalse(dupChips.first { it.id == 62 }.isDirectlyActionable)
    }

    @Test
    fun pass16DirectSyncRevocationWorkoutRecoveryAndCancelParity() {
        // 1 & 2. Multi-dose medication NEVER reuses a legacy schedule_id == null entry across sibling doses, while single-dose & exact/PRN matches still work
        val multiAndSingleMedsJson = JSONArray()
            .put(
                JSONObject()
                    .put("id", "m-twice")
                    .put("name", "Metformin")
                    .put("is_active", true)
                    .put(
                        "schedules",
                        JSONArray()
                            .put(JSONObject().put("id", "s-am").put("schedule_type_id", "daily").put("time_of_day", "08:00"))
                            .put(JSONObject().put("id", "s-pm").put("schedule_type_id", "daily").put("time_of_day", "20:00"))
                    )
            )
            .put(
                JSONObject()
                    .put("id", "m-once")
                    .put("name", "Magnesium")
                    .put("is_active", true)
                    .put(
                        "schedules",
                        JSONArray()
                            .put(JSONObject().put("id", "s-only").put("schedule_type_id", "daily").put("time_of_day", "09:00"))
                    )
            )
            .put(
                JSONObject()
                    .put("id", "m-prn")
                    .put("name", "Advil")
                    .put("is_active", true)
                    .put("schedules", JSONArray())
            )
            .toString()

        assertEquals(
            2,
            WearDirectApiClient.countDueScheduledDosesForMedication(
                medicationsBody = multiAndSingleMedsJson,
                medicationId = "m-twice",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertEquals(
            1,
            WearDirectApiClient.countDueScheduledDosesForMedication(
                medicationsBody = multiAndSingleMedsJson,
                medicationId = "m-once",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertTrue(
            WearDirectApiClient.canUseLegacyMedicationFallbackForSchedule(
                medicationsBody = multiAndSingleMedsJson,
                medicationId = "m-once",
                scheduleId = "s-only",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertFalse(
            WearDirectApiClient.canUseLegacyMedicationFallbackForSchedule(
                medicationsBody = multiAndSingleMedsJson,
                medicationId = "m-once",
                scheduleId = "s-other",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertFalse(
            WearDirectApiClient.canUseLegacyMedicationFallbackForSchedule(
                medicationsBody = multiAndSingleMedsJson,
                medicationId = "m-twice",
                scheduleId = "s-am",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )

        val legacyEntries = JSONArray()
            .put(JSONObject().put("id", "leg-twice").put("medication_id", "m-twice").put("schedule_id", JSONObject.NULL).put("status", "taken"))
            .put(JSONObject().put("id", "leg-once").put("medication_id", "m-once").put("schedule_id", JSONObject.NULL).put("status", "taken"))
            .put(JSONObject().put("id", "ent-prn").put("medication_id", "m-prn").put("status", "prn_taken"))

        val snapWithLegacy = WearDirectApiClient.buildMedicationsSnapshotFromServerJson(
            medicationsBody = multiAndSingleMedsJson,
            entriesBody = legacyEntries.toString(),
            today = "2026-11-30",
            timeFormat = "HH:mm",
            timeZone = java.util.TimeZone.getTimeZone("UTC"),
            locale = Locale.US
        )!!
        assertEquals(MedicationDoseStatus.PENDING, snapWithLegacy.doses.first { it.id == "m-twice:s-am" }.status)
        assertEquals(MedicationDoseStatus.PENDING, snapWithLegacy.doses.first { it.id == "m-twice:s-pm" }.status)
        assertEquals(MedicationDoseStatus.TAKEN, snapWithLegacy.doses.first { it.id == "m-once:s-only" }.status)
        assertEquals(MedicationDoseStatus.TAKEN, snapWithLegacy.doses.first { it.id == "m-prn:" }.status)

        val resolvedStatuses = WearDirectApiClient.resolveMedicationStatusesFromEntries(snapWithLegacy.doses, legacyEntries)
        assertEquals(MedicationDoseStatus.PENDING, resolvedStatuses["m-twice:s-am"])
        assertEquals(MedicationDoseStatus.PENDING, resolvedStatuses["m-twice:s-pm"])
        assertEquals(MedicationDoseStatus.TAKEN, resolvedStatuses["m-once:s-only"])
        assertEquals(MedicationDoseStatus.TAKEN, resolvedStatuses["m-prn:"])

        // Exact schedule_id match on multi-dose medication applies ONLY to the matched dose
        val exactEntries = JSONArray()
            .put(JSONObject().put("id", "ex-am").put("medication_id", "m-twice").put("schedule_id", "s-am").put("status", "taken"))
        val snapWithExact = WearDirectApiClient.buildMedicationsSnapshotFromServerJson(
            medicationsBody = multiAndSingleMedsJson,
            entriesBody = exactEntries.toString(),
            today = "2026-11-30",
            timeFormat = "HH:mm",
            timeZone = java.util.TimeZone.getTimeZone("UTC"),
            locale = Locale.US
        )!!
        assertEquals(MedicationDoseStatus.TAKEN, snapWithExact.doses.first { it.id == "m-twice:s-am" }.status)
        assertEquals(MedicationDoseStatus.PENDING, snapWithExact.doses.first { it.id == "m-twice:s-pm" }.status)

        // Write decision blocks legacy fallback when multi-dose (allowLegacyUnscheduledFallback = false)
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.Create("taken"),
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "m-twice",
                scheduleId = "s-am",
                taken = true,
                skipped = false,
                entries = legacyEntries,
                allowLegacyUnscheduledFallback = false
            )
        )
        assertEquals(
            WearDirectApiClient.MedicationWriteDecision.Delete("leg-once"),
            WearDirectApiClient.decideMedicationWrite(
                medicationId = "m-once",
                scheduleId = "s-only",
                taken = false,
                skipped = false,
                entries = legacyEntries,
                allowLegacyUnscheduledFallback = true
            )
        )

        // 3. Pending unpersisted revocation barrier tracks failed commits and clears ONLY once committed at >= pending
        assertEquals(
            5L,
            WearServerCredentialsStore.resolvePendingUnpersistedRevokedGeneration(
                currentPending = 0L,
                attemptedRevokedGen = 5L,
                commitSucceeded = false
            )
        )
        assertEquals(
            7L,
            WearServerCredentialsStore.resolvePendingUnpersistedRevokedGeneration(
                currentPending = 5L,
                attemptedRevokedGen = 7L,
                commitSucceeded = false
            )
        )
        assertEquals(
            7L,
            WearServerCredentialsStore.resolvePendingUnpersistedRevokedGeneration(
                currentPending = 7L,
                attemptedRevokedGen = 6L,
                commitSucceeded = true
            )
        )
        assertEquals(
            0L,
            WearServerCredentialsStore.resolvePendingUnpersistedRevokedGeneration(
                currentPending = 7L,
                attemptedRevokedGen = 7L,
                commitSucceeded = true
            )
        )

        // 4. Live refresh child requests require both active account AND current credential session
        assertTrue(WearDirectApiClient.shouldExecuteLiveRefreshChild(isAccountActive = true, isSessionCurrent = true))
        assertFalse(WearDirectApiClient.shouldExecuteLiveRefreshChild(isAccountActive = false, isSessionCurrent = true))
        assertFalse(WearDirectApiClient.shouldExecuteLiveRefreshChild(isAccountActive = true, isSessionCurrent = false))

        // 5 & 6. Workout recovery non-resurrection on concurrent removal + generation-safe pruning + replay eligibility
        val recGen2 = WearSessionManager.PendingWorkoutRecovery("srv-1", "p-1", "sess-2", accountGen = 2L, deliveredToPhone = false)
        val recGen3 = WearSessionManager.PendingWorkoutRecovery("srv-1", "p-1", "sess-3", accountGen = 3L, deliveredToPhone = true)
        assertEquals(
            listOf(recGen3),
            WearSessionManager.replayableWorkoutRecoveries(listOf(recGen2, recGen3), ownerId = "srv-1", currentGen = 3L)
        )
        // Updating a record that was already removed returns null (never resurrects)
        assertNull(
            WearSessionManager.updateExistingWorkoutRecovery(
                existing = listOf(recGen3),
                sessionId = "sess-2",
                accountGen = 2L
            ) { it.copy(deliveredToPhone = true) }
        )
        // Updating a record that is still present updates in place
        val updatedInPlace = WearSessionManager.updateExistingWorkoutRecovery(
            existing = listOf(recGen2, recGen3),
            sessionId = "sess-2",
            accountGen = 2L
        ) { it.copy(deliveredToPhone = true) }!!
        assertTrue(updatedInPlace.first { it.sessionId == "sess-2" }.deliveredToPhone)
        // Generation-safe pruning drops retired gen <= 2 while preserving newer gen 3
        assertEquals(
            listOf(recGen3),
            WearSessionManager.pruneRetiredWorkoutRecoveries(listOf(recGen2, recGen3), retiredThroughGeneration = 2L)
        )

        // 7. Unreconciled direct fasting state survives stale phone contexts, persists cleanly, and reconciles on ack or strictly newer fast
        val (fastOwner1, fastIds1) = CheckInStore.recordUnreconciledDirectFastId("", emptySet(), "srv-1", "fast-start-1")
        assertEquals("srv-1", fastOwner1)
        assertEquals(setOf("fast-start-1"), fastIds1)
        val (fastOwner2, fastIds2) = CheckInStore.recordUnreconciledDirectFastId(fastOwner1, fastIds1, "srv-2", "fast-start-2")
        assertEquals("srv-2", fastOwner2)
        assertEquals(setOf("fast-start-2"), fastIds2)

        val localDirectFast = WatchFast(
            startedAtMs = 1_700_000_000_000L,
            targetEndAtMs = 1_700_057_600_000L,
            label = "16:8 Leangains",
            id = "f-1"
        )
        // Stale phone context (fast = null, no ack) preserves local direct fast
        val staleAfterStart = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = setOf("fast-start-1"),
            unreconciledOwner = "srv-1",
            unreconciledStartedAtWatermarkMs = localDirectFast.startedAtMs,
            currentLocalBaseFast = localDirectFast,
            incomingPhoneFast = null,
            incomingFastKnown = true,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(staleAfterStart.preservedLocalDirectFast)
        assertEquals(localDirectFast, staleAfterStart.effectiveFast)
        assertEquals(setOf("fast-start-1"), staleAfterStart.remainingIds)

        val preservedStartJson = CheckInStore.applyPreservedFastToContextJson(
            JSONObject().put("today", "2026-11-25").put("fastKnown", true).put("fast", JSONObject.NULL).toString(),
            staleAfterStart.effectiveFast
        )
        val parsedPreservedStart = ContextPayloadMapper.parseContext(JSONObject(preservedStartJson), WatchContext.empty)
        assertEquals(localDirectFast, parsedPreservedStart.fast)

        // Stale phone context (old fast still active, no ack) preserves local direct fastEnd (null)
        val staleAfterEnd = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = setOf("fast-end-1"),
            unreconciledOwner = "srv-1",
            unreconciledStartedAtWatermarkMs = localDirectFast.startedAtMs,
            currentLocalBaseFast = null,
            incomingPhoneFast = localDirectFast,
            incomingFastKnown = true,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(staleAfterEnd.preservedLocalDirectFast)
        assertNull(staleAfterEnd.effectiveFast)
        assertEquals(setOf("fast-end-1"), staleAfterEnd.remainingIds)

        val preservedEndJson = CheckInStore.applyPreservedFastToContextJson(
            JSONObject()
                .put("today", "2026-11-25")
                .put("fastKnown", true)
                .put("fast", JSONObject().put("startedAt", localDirectFast.startedAtMs))
                .toString(),
            null
        )
        val parsedPreservedEnd = ContextPayloadMapper.parseContext(JSONObject(preservedEndJson), WatchContext.empty)
        assertNull(parsedPreservedEnd.fast)

        // Strictly newer fast started on phone adopts immediately even without clientId ack
        val newerPhoneFast = WatchFast(
            startedAtMs = localDirectFast.startedAtMs + 60_000L,
            targetEndAtMs = null,
            label = "18:6 Warrior",
            id = "f-2"
        )
        val adoptedNewer = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = setOf("fast-end-1"),
            unreconciledOwner = "srv-1",
            unreconciledStartedAtWatermarkMs = localDirectFast.startedAtMs,
            currentLocalBaseFast = null,
            incomingPhoneFast = newerPhoneFast,
            incomingFastKnown = true,
            incomingAckedClientIds = emptyList()
        )
        assertFalse(adoptedNewer.preservedLocalDirectFast)
        assertTrue(adoptedNewer.remainingIds.isEmpty())
        assertEquals(newerPhoneFast, adoptedNewer.effectiveFast)

        // Phone ack reconciles pending direct fast ID and adopts incoming phone fast
        val ackedStart = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = setOf("fast-start-1"),
            unreconciledOwner = "srv-1",
            unreconciledStartedAtWatermarkMs = localDirectFast.startedAtMs,
            currentLocalBaseFast = localDirectFast,
            incomingPhoneFast = localDirectFast,
            incomingFastKnown = true,
            incomingAckedClientIds = listOf("fast-start-1")
        )
        assertFalse(ackedStart.preservedLocalDirectFast)
        assertTrue(ackedStart.remainingIds.isEmpty())
        assertEquals(localDirectFast, ackedStart.effectiveFast)

        // Once reconciled, a subsequent phone-side fast end (fast = null) is accepted authoritatively
        val laterPhoneEnd = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = ackedStart.remainingIds,
            unreconciledOwner = "",
            unreconciledStartedAtWatermarkMs = 0L,
            currentLocalBaseFast = localDirectFast,
            incomingPhoneFast = null,
            incomingFastKnown = true,
            incomingAckedClientIds = emptyList()
        )
        assertFalse(laterPhoneEnd.preservedLocalDirectFast)
        assertNull(laterPhoneEnd.effectiveFast)

        // 8. Cancelled water tap captures authoritative created entry ID (explicit POST ID or matching client_id) without guessing other entries
        assertEquals(
            "srv-entry-99",
            WearDirectApiClient.resolveCreatedWaterEntryId(
                postResponseBody = JSONObject().put("log_entry_id", "srv-entry-99").toString(),
                clientId = "tap-99",
                postWaterLogRaw = null
            )
        )
        assertEquals(
            "e2",
            WearDirectApiClient.resolveCreatedWaterEntryId(
                postResponseBody = JSONObject().put("water_ml", 500.0).toString(),
                clientId = "tap-2",
                postWaterLogRaw = JSONArray()
                    .put(JSONObject().put("id", "e2").put("client_id", "tap-2"))
                    .put(JSONObject().put("id", "e1").put("client_id", "tap-1"))
                    .toString()
            )
        )
        assertNull(
            WearDirectApiClient.resolveCreatedWaterEntryId(
                postResponseBody = JSONObject().put("water_ml", 500.0).toString(),
                clientId = "tap-2",
                postWaterLogRaw = JSONArray()
                    .put(JSONObject().put("id", "other-device-entry"))
                    .toString()
            )
        )
        assertEquals(
            WearSessionManager.CancelledWaterTapAction.APPLY_NORMALLY,
            WearSessionManager.resolveCancelledWaterTapPostAction(
                isWaterIntake = true,
                wasCancelledDuringFlight = false,
                createdEntryId = "e2"
            )
        )
        assertEquals(
            WearSessionManager.CancelledWaterTapAction.COMPENSATE_DELETE,
            WearSessionManager.resolveCancelledWaterTapPostAction(
                isWaterIntake = true,
                wasCancelledDuringFlight = true,
                createdEntryId = "e2"
            )
        )
        assertEquals(
            WearSessionManager.CancelledWaterTapAction.RECONCILE_VIA_REFRESH,
            WearSessionManager.resolveCancelledWaterTapPostAction(
                isWaterIntake = true,
                wasCancelledDuringFlight = true,
                createdEntryId = null
            )
        )
    }

    @Test
    fun pass17DirectMedicationFallbackDuplicateCommitMainCancelRefreshLastMetricsAndMtlsParity() {
        // 1 (#1): Failed or unparseable GET /api/v2/medications?activeOnly=true falls back to phone instead of allowLegacy = false no-op
        val singleAndMultiMedsJson = JSONArray()
            .put(
                JSONObject()
                    .put("id", "m-once")
                    .put("name", "Magnesium")
                    .put("is_active", true)
                    .put("schedules", JSONArray().put(JSONObject().put("id", "s-only").put("schedule_type_id", "daily")))
            )
            .put(
                JSONObject()
                    .put("id", "m-twice")
                    .put("name", "Metformin")
                    .put("is_active", true)
                    .put(
                        "schedules",
                        JSONArray()
                            .put(JSONObject().put("id", "s-am").put("schedule_type_id", "daily"))
                            .put(JSONObject().put("id", "s-pm").put("schedule_type_id", "daily"))
                    )
            )
            .toString()

        assertEquals(
            WearDirectApiClient.LegacyMedicationLookupResolution.FALLBACK_TO_PHONE,
            WearDirectApiClient.resolveLegacyMedicationFallback(
                medsGetSucceeded = false,
                medicationsBody = null,
                medicationId = "m-once",
                scheduleId = "s-only",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertEquals(
            WearDirectApiClient.LegacyMedicationLookupResolution.FALLBACK_TO_PHONE,
            WearDirectApiClient.resolveLegacyMedicationFallback(
                medsGetSucceeded = true,
                medicationsBody = "{not-valid-json",
                medicationId = "m-once",
                scheduleId = "s-only",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertEquals(
            WearDirectApiClient.LegacyMedicationLookupResolution.ALLOW_LEGACY,
            WearDirectApiClient.resolveLegacyMedicationFallback(
                medsGetSucceeded = true,
                medicationsBody = singleAndMultiMedsJson,
                medicationId = "m-once",
                scheduleId = "s-only",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )
        assertEquals(
            WearDirectApiClient.LegacyMedicationLookupResolution.DISALLOW_LEGACY,
            WearDirectApiClient.resolveLegacyMedicationFallback(
                medsGetSucceeded = true,
                medicationsBody = singleAndMultiMedsJson,
                medicationId = "m-twice",
                scheduleId = "s-am",
                entryDate = "2026-11-30",
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            )
        )

        // 2 (#2): Duplicate credential save skips disk write when unchanged, uses checked commit on revision advance, and returns PersistFailed on commit failure
        var writeCalls = 0
        assertEquals(
            WearServerCredentialsStore.SaveResult.Duplicate,
            WearServerCredentialsStore.resolveDuplicateCredentialSaveOutcome(
                incomingGen = 3L,
                lastSavedGen = 3L,
                incomingTransportRev = 2L,
                lastTransportRev = 2L
            ) { _, _ ->
                writeCalls++
                true
            }
        )
        assertEquals(0, writeCalls)

        var persistedPair: Pair<Long, Long>? = null
        assertEquals(
            WearServerCredentialsStore.SaveResult.Duplicate,
            WearServerCredentialsStore.resolveDuplicateCredentialSaveOutcome(
                incomingGen = 3L,
                lastSavedGen = 3L,
                incomingTransportRev = 4L,
                lastTransportRev = 2L
            ) { g, r ->
                writeCalls++
                persistedPair = g to r
                true
            }
        )
        assertEquals(1, writeCalls)
        assertEquals(3L to 4L, persistedPair)

        assertEquals(
            WearServerCredentialsStore.SaveResult.PersistFailed,
            WearServerCredentialsStore.resolveDuplicateCredentialSaveOutcome(
                incomingGen = 4L,
                lastSavedGen = 3L,
                incomingTransportRev = 1L,
                lastTransportRev = 2L
            ) { g, r ->
                persistedPair = g to r
                false
            }
        )
        assertEquals(4L to 1L, persistedPair)

        // 3 (#3): Main-thread atomic cancellation check skips applying cancelled water tap and triggers COMPENSATE_DELETE
        val cancelledWithId = WearSessionManager.decideMainDirectOutcome(
            accountMatchesOnMain = true,
            isWaterIntake = true,
            wasCancelledOnMain = true,
            createdEntryId = "srv-water-42"
        )!!
        assertFalse(cancelledWithId.shouldApplyOnMain)
        assertEquals(WearSessionManager.CancelledWaterTapAction.COMPENSATE_DELETE, cancelledWithId.postAction)

        val cancelledWithoutId = WearSessionManager.decideMainDirectOutcome(
            accountMatchesOnMain = true,
            isWaterIntake = true,
            wasCancelledOnMain = true,
            createdEntryId = null
        )!!
        assertTrue(cancelledWithoutId.shouldApplyOnMain)
        assertEquals(WearSessionManager.CancelledWaterTapAction.RECONCILE_VIA_REFRESH, cancelledWithoutId.postAction)

        val normalApply = WearSessionManager.decideMainDirectOutcome(
            accountMatchesOnMain = true,
            isWaterIntake = true,
            wasCancelledOnMain = false,
            createdEntryId = "srv-water-42"
        )!!
        assertTrue(normalApply.shouldApplyOnMain)
        assertEquals(WearSessionManager.CancelledWaterTapAction.APPLY_NORMALLY, normalApply.postAction)

        assertNull(
            WearSessionManager.decideMainDirectOutcome(
                accountMatchesOnMain = false,
                isWaterIntake = true,
                wasCancelledOnMain = false,
                createdEntryId = "srv-water-42"
            )
        )

        // 4 (#4): Direct server refresh preserves unreconciledDirectFastIds so delayed stale phone context after direct fastEnd + refresh cannot resurrect ended fast
        val endedFastStartMs = 1_700_000_000_000L
        val stalePhoneFast = WatchFast(startedAtMs = endedFastStartMs, targetEndAtMs = null, label = "16:8 Leangains", id = "f-ended")
        val keptWatermark = CheckInStore.resolveUnreconciledDirectFastWatermarkAfterRefresh(
            unreconciledOwner = "srv-1",
            unreconciledIds = setOf("fast-end-1"),
            currentWatermarkMs = endedFastStartMs,
            refreshOwnerId = "srv-1",
            refreshedFast = null
        )
        assertEquals(endedFastStartMs, keptWatermark)
        val afterStalePhonePostRefresh = CheckInStore.reconcileIncomingPhoneFast(
            ownerId = "srv-1",
            unreconciledIds = setOf("fast-end-1"),
            unreconciledOwner = "srv-1",
            unreconciledStartedAtWatermarkMs = keptWatermark,
            currentLocalBaseFast = null,
            incomingPhoneFast = stalePhoneFast,
            incomingFastKnown = true,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(afterStalePhonePostRefresh.preservedLocalDirectFast)
        assertNull(afterStalePhonePostRefresh.effectiveFast)
        assertEquals(setOf("fast-end-1"), afterStalePhonePostRefresh.remainingIds)

        // 5 (#6): Recomputing lastWeightKg / lastEntryDate / lastBodyFatPercentage clears deleted in-window readings, tracks BF dates separately, and preserves strictly older >14d readings
        val deletedInWindow = CheckInStore.resolveLastMetricsAfterDirectRefresh(
            snapshotDay = "2026-11-25",
            todayBodyFatPercentage = null,
            mergedHistory = emptyList(),
            mergedBodyFatHistory = emptyList(),
            prevHistory = listOf(HistoryPoint("2026-11-24", 80.5, 19.2)),
            prevBodyFatHistory = listOf(HistoryPoint("2026-11-24", 80.5, 19.2)),
            prevLastWeightKg = 80.5,
            prevLastEntryDate = "2026-11-24",
            prevLastBodyFatPercentage = 19.2
        )
        assertNull(deletedInWindow.lastWeightKg)
        assertNull(deletedInWindow.lastEntryDate)
        assertNull(deletedInWindow.lastBodyFatPercentage)

        // Separate body-fat date survives when in-window weight on another day is deleted
        val separateBfDate = CheckInStore.resolveLastMetricsAfterDirectRefresh(
            snapshotDay = "2026-11-25",
            todayBodyFatPercentage = null,
            mergedHistory = emptyList(),
            mergedBodyFatHistory = listOf(HistoryPoint("2026-11-22", 0.0, 18.7)),
            prevHistory = listOf(HistoryPoint("2026-11-24", 80.5, null)),
            prevBodyFatHistory = listOf(HistoryPoint("2026-11-22", 0.0, 18.7)),
            prevLastWeightKg = 80.5,
            prevLastEntryDate = "2026-11-24",
            prevLastBodyFatPercentage = 18.7
        )
        assertNull(separateBfDate.lastWeightKg)
        assertNull(separateBfDate.lastEntryDate)
        assertEquals(18.7, separateBfDate.lastBodyFatPercentage ?: 0.0, 0.001)

        // Strictly older >14d last readings outside history arrays remain preserved
        val strictlyOlderPreserved = CheckInStore.resolveLastMetricsAfterDirectRefresh(
            snapshotDay = "2026-11-25",
            todayBodyFatPercentage = null,
            mergedHistory = emptyList(),
            mergedBodyFatHistory = emptyList(),
            prevHistory = emptyList(),
            prevBodyFatHistory = emptyList(),
            prevLastWeightKg = 82.0,
            prevLastEntryDate = "2026-10-01",
            prevLastBodyFatPercentage = 20.5
        )
        assertEquals(82.0, strictlyOlderPreserved.lastWeightKg ?: 0.0, 0.001)
        assertEquals("2026-10-01", strictlyOlderPreserved.lastEntryDate)
        assertEquals(20.5, strictlyOlderPreserved.lastBodyFatPercentage ?: 0.0, 0.001)

        // Persisted JSON removes stale in-window lastWeightKg/lastEntryDate/lastBodyFatPercentage on empty 14d refresh
        val deletedJson = JSONObject()
            .put("today", "2026-11-25")
            .put("lastWeightKg", 80.5)
            .put("lastEntryDate", "2026-11-24")
            .put("lastBodyFatPercentage", 19.2)
            .put("history", JSONArray().put(JSONObject().put("day", "2026-11-24").put("weightKg", 80.5).put("bodyFatPercentage", 19.2)))
            .put("bodyFatHistory", JSONArray().put(JSONObject().put("day", "2026-11-24").put("bodyFatPercentage", 19.2)))
        CheckInStore.patchContextJsonObject(
            obj = deletedJson,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            bodyFatHistory = emptyList(),
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", history = emptyList(), bodyFatHistory = emptyList())
        )
        assertFalse(deletedJson.has("lastWeightKg"))
        assertFalse(deletedJson.has("lastEntryDate"))
        assertFalse(deletedJson.has("lastBodyFatPercentage"))

        // Persisted JSON keeps strictly older >14d last metrics when 14d window is empty
        val olderJson = JSONObject()
            .put("today", "2026-11-25")
            .put("lastWeightKg", 82.0)
            .put("lastEntryDate", "2026-10-01")
            .put("lastBodyFatPercentage", 20.5)
            .put("history", JSONArray())
            .put("bodyFatHistory", JSONArray())
        CheckInStore.patchContextJsonObject(
            obj = olderJson,
            ackedClientId = null,
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            bodyFatHistory = emptyList(),
            refreshedSnapshot = DirectLiveSnapshot(ownerId = "srv-1", day = "2026-11-25", history = emptyList(), bodyFatHistory = emptyList())
        )
        assertEquals(82.0, olderJson.getDouble("lastWeightKg"), 0.001)
        assertEquals("2026-10-01", olderJson.getString("lastEntryDate"))
        assertEquals(20.5, olderJson.getDouble("lastBodyFatPercentage"), 0.001)

        // 6 (#7): Expired waterIntake payload is rejected before direct send and before phone fallback without mutating entryDate
        assertFalse(WearSessionManager.isWaterIntakePayloadExpired("2026-11-25", "2026-11-25"))
        assertTrue(WearSessionManager.isWaterIntakePayloadExpired("2026-11-24", "2026-11-25"))
        assertTrue(WearSessionManager.isWaterIntakePayloadExpired("", "2026-11-25"))
        assertTrue(WearSessionManager.isWaterIntakePayloadExpired(null, "2026-11-25"))

        // 7 (Coordinated #8): Durable mTLS notice accepted even with no prior credentials, blocks older credentials, and keeps /sparky/context unrevoked
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 1L,
                lastSavedGen = 0L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 1L,
                lastTransportRev = 0L,
                isMtlsNotice = true
            )
        )
        // Re-pulling the exact same durable mTLS notice is idempotent (ignored)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 1L,
                lastSavedGen = 1L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 1L,
                lastTransportRev = 1L,
                isMtlsNotice = true
            )
        )
        // Older credential payload at lower transportRevision cannot overwrite mTLS notice
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 1L,
                lastSavedGen = 1L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 1L,
                lastTransportRev = 2L,
                isMtlsNotice = false
            )
        )
        // Phone /sparky/context for generation 1 remains accepted because mTLS does NOT advance revokedGen
        assertTrue(
            WearServerCredentialsStore.shouldAcceptContextPayload(
                hasContextGeneration = true,
                incomingContextGen = 1L,
                currentAcceptedContextGen = 0L,
                lastSavedCredGen = 1L,
                revokedCredGen = 0L,
                hasActiveCredBlob = false
            )
        )
    }

    @Test
    fun pass18DirectOverridesWorkoutPrePersistWaterCancelRefreshRetryTimestampAndLocaleParity() {
        // 1 (#8): Persisted owner+day unreconciled direct medication & check-in overrides survive stale phone context while merging unrelated entries and clearing on ack
        val medOverrides = CheckInStore.recordUnreconciledDirectMedicationOverride(
            existing = emptyMap(),
            ownerId = "srv-1",
            day = "2026-11-25",
            clientId = "med-c1",
            doseId = "m1:s1",
            status = MedicationDoseStatus.TAKEN
        )
        val restoredMeds = CheckInStore.deserializeUnreconciledDirectMedOverrides(
            CheckInStore.serializeUnreconciledDirectMedOverrides(medOverrides),
            ownerId = "srv-1",
            today = "2026-11-25"
        )
        assertEquals(medOverrides, restoredMeds)
        assertTrue(
            CheckInStore.deserializeUnreconciledDirectMedOverrides(
                CheckInStore.serializeUnreconciledDirectMedOverrides(medOverrides),
                ownerId = "srv-2",
                today = "2026-11-25"
            ).isEmpty()
        )
        val phoneMeds = MedicationSnapshot(
            day = "2026-11-25",
            doses = listOf(
                MedicationDose("m1:s1", "m1", "s1", "Med A", "10 mg", "08:00", MedicationDoseStatus.PENDING),
                MedicationDose("m2:s2", "m2", "s2", "Med B", "20 mg", "09:00", MedicationDoseStatus.TAKEN)
            )
        )
        val staleMedReconcile = CheckInStore.reconcileIncomingPhoneMedications(
            ownerId = "srv-1",
            today = "2026-11-25",
            unreconciled = restoredMeds,
            currentLocalMedications = null,
            incomingPhoneMedications = phoneMeds,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(staleMedReconcile.preservedLocalDirectMedications)
        assertEquals(MedicationDoseStatus.TAKEN, staleMedReconcile.effectiveMedications!!.doses.first { it.id == "m1:s1" }.status)
        assertEquals(MedicationDoseStatus.TAKEN, staleMedReconcile.effectiveMedications!!.doses.first { it.id == "m2:s2" }.status)
        val persistedMedJson = CheckInStore.applyPreservedMedicationsToContextJson(
            JSONObject().put("today", "2026-11-25").toString(),
            staleMedReconcile.effectiveMedications!!
        )
        val parsedPersistedMeds = ContextPayloadMapper.parseContext(JSONObject(persistedMedJson), WatchContext.empty).medications!!
        assertEquals(MedicationDoseStatus.TAKEN, parsedPersistedMeds.doses.first { it.id == "m1:s1" }.status)

        val ackedMedReconcile = CheckInStore.reconcileIncomingPhoneMedications(
            ownerId = "srv-1",
            today = "2026-11-25",
            unreconciled = staleMedReconcile.remaining,
            currentLocalMedications = staleMedReconcile.effectiveMedications,
            incomingPhoneMedications = phoneMeds,
            incomingAckedClientIds = listOf("med-c1")
        )
        assertFalse(ackedMedReconcile.preservedLocalDirectMedications)
        assertTrue(ackedMedReconcile.remaining.isEmpty())
        assertEquals(MedicationDoseStatus.PENDING, ackedMedReconcile.effectiveMedications!!.doses.first { it.id == "m1:s1" }.status)

        val checkInOverrides = CheckInStore.recordUnreconciledDirectCheckInOverride(
            existing = emptyMap(),
            ownerId = "srv-1",
            day = "2026-11-25",
            clientId = "ci-c1",
            weightKg = 79.4,
            bodyFatPercentage = 17.8
        )
        val restoredCheckIns = CheckInStore.deserializeUnreconciledDirectCheckInOverrides(
            CheckInStore.serializeUnreconciledDirectCheckInOverrides(checkInOverrides),
            ownerId = "srv-1"
        )
        assertEquals(checkInOverrides, restoredCheckIns)
        val stalePhoneCtx = WatchContext(
            today = "2026-11-25",
            todayWeightKg = 80.2,
            todayBodyFatPercentage = 18.5,
            history = listOf(HistoryPoint("2026-11-20", 81.0, 19.0), HistoryPoint("2026-11-25", 80.2, 18.5)),
            bodyFatHistory = listOf(HistoryPoint("2026-11-20", 81.0, 19.0), HistoryPoint("2026-11-25", 80.2, 18.5))
        )
        val staleCheckInReconcile = CheckInStore.reconcileIncomingPhoneCheckIns(
            ownerId = "srv-1",
            today = "2026-11-25",
            unreconciled = restoredCheckIns,
            incomingCtx = stalePhoneCtx,
            incomingAckedClientIds = emptyList()
        )
        assertTrue(staleCheckInReconcile.preservedLocalDirectCheckIns)
        assertEquals(79.4, staleCheckInReconcile.effectiveContext.todayWeightKg ?: 0.0, 0.001)
        assertEquals(17.8, staleCheckInReconcile.effectiveContext.todayBodyFatPercentage ?: 0.0, 0.001)
        // Unrelated history day from phone is merged alongside preserved direct day
        assertEquals(listOf("2026-11-20", "2026-11-25"), staleCheckInReconcile.effectiveContext.history.map { it.day })
        assertEquals(79.4, staleCheckInReconcile.effectiveContext.history.last().weightKg, 0.001)
        val persistedCiJson = CheckInStore.applyPreservedCheckInsToContextJson(
            JSONObject().put("today", "2026-11-25").toString(),
            staleCheckInReconcile.effectiveContext
        )
        val parsedPersistedCi = ContextPayloadMapper.parseContext(JSONObject(persistedCiJson), WatchContext.empty)
        assertEquals(79.4, parsedPersistedCi.todayWeightKg ?: 0.0, 0.001)
        assertEquals(17.8, parsedPersistedCi.todayBodyFatPercentage ?: 0.0, 0.001)

        val ackedCheckInReconcile = CheckInStore.reconcileIncomingPhoneCheckIns(
            ownerId = "srv-1",
            today = "2026-11-25",
            unreconciled = staleCheckInReconcile.remaining,
            incomingCtx = stalePhoneCtx,
            incomingAckedClientIds = listOf("ci-c1")
        )
        assertFalse(ackedCheckInReconcile.preservedLocalDirectCheckIns)
        assertTrue(ackedCheckInReconcile.remaining.isEmpty())
        assertEquals(80.2, ackedCheckInReconcile.effectiveContext.todayWeightKg ?: 0.0, 0.001)

        // 2 (#9): Workout recovery allocates & reuses sessionId before first direct attempt and clears only newly pre-persisted recovery on FailedBeforeCreate
        val priorRec = WearSessionManager.PendingWorkoutRecovery("srv-1", "p-1", "sess-prior", accountGen = 3L)
        assertEquals("sess-prior", WearSessionManager.resolveWorkoutStartSessionId(priorRec) { "sess-new" })
        assertEquals("sess-new", WearSessionManager.resolveWorkoutStartSessionId(null) { "sess-new" })
        assertTrue(WearSessionManager.shouldClearRecoveryAfterFailedBeforeCreate(hadExistingRecovery = false))
        assertFalse(WearSessionManager.shouldClearRecoveryAfterFailedBeforeCreate(hadExistingRecovery = true))

        // 3 (#11): Cancelled water tap builds matching DataItem retraction path and waterTapCancel payload
        assertEquals("/sparky/transfer/watch/waterIntake/tap-abc", WearSessionManager.waterIntakeDataItemPath("tap-abc"))
        val cancelPayload = OutboundPayloads.waterTapCancel(clientId = "tap-abc", ownerId = "srv-1")
        assertEquals("waterTapCancel", cancelPayload.getString("type"))
        assertEquals("tap-abc", cancelPayload.getString("clientId"))
        assertEquals("srv-1", cancelPayload.getString("ownerId"))

        // 4 (#2): Direct waterIntake rejects cross-midnight expired entryDate consistently with phone fallback
        assertTrue(WearDirectApiClient.isWaterIntakeDateExpired("2026-11-24", "2026-11-25"))
        assertFalse(WearDirectApiClient.isWaterIntakeDateExpired("2026-11-25", "2026-11-25"))

        // 5 (#4): Replaying old fastEnd while an auto-calculated fast is active returns parsed calculated fast instead of null, and falls back if unparseable
        val calcFastJson = JSONObject()
            .put("is_auto_calculated", true)
            .put("is_eating_window", false)
            .put("start_time", "2026-11-25T20:00:00.000Z")
            .put("target_end_time", "2026-11-26T09:00:00.000Z")
            .put("fasting_type", "Circadian Rhythm")
            .toString()
        val calcOutcome = WearDirectApiClient.resolveFastEndNonManualOutcome(calcFastJson) as DirectWriteOutcome.Applied
        assertEquals("Circadian Rhythm", calcOutcome.fast?.label)
        assertNull(calcOutcome.fast?.id)
        val eatingOutcome = WearDirectApiClient.resolveFastEndNonManualOutcome(
            JSONObject().put("is_auto_calculated", true).put("is_eating_window", true).toString()
        ) as DirectWriteOutcome.Applied
        assertNull(eatingOutcome.fast)
        val nullOutcome = WearDirectApiClient.resolveFastEndNonManualOutcome("null") as DirectWriteOutcome.Applied
        assertNull(nullOutcome.fast)
        assertEquals(
            DirectWriteOutcome.FallbackToPhone,
            WearDirectApiClient.resolveFastEndNonManualOutcome(
                JSONObject().put("is_auto_calculated", true).put("is_eating_window", false).toString()
            )
        )

        // 6 (#6): Supplement serving labels use localized NumberFormat + plural formatter for generic units while keeping custom units literal
        val genericSupp = JSONObject()
            .put("is_supplement", true)
            .put("dose_amount", 1.5)
            .put("dose_unit", "dose")
        val customUnitSupp = JSONObject()
            .put("is_supplement", true)
            .put("dose_amount", 1.5)
            .put("dose_unit", "caps")
        val frFormatted = WearDirectApiClient.formatMedicationDose(
            medObj = genericSupp,
            locale = Locale.FRANCE,
            formatSupplementServings = { qty, num -> if (qty == 1) "$num portion" else "$num portions" }
        )
        assertEquals("1,5 portions", frFormatted)
        val singleSupp = JSONObject().put("is_supplement", true).put("dose_amount", 1.0).put("dose_unit", "serving")
        assertEquals(
            "1 portion",
            WearDirectApiClient.formatMedicationDose(
                medObj = singleSupp,
                locale = Locale.FRANCE,
                formatSupplementServings = { qty, num -> if (qty == 1) "$num portion" else "$num portions" }
            )
        )
        assertEquals(
            "1,5 caps",
            WearDirectApiClient.formatMedicationDose(
                medObj = customUnitSupp,
                locale = Locale.FRANCE,
                formatSupplementServings = { _, _ -> error("must not pluralize custom units") }
            )
        )

        // 7 (#7): Discarded forced water reconcile retains coalesced retry, clears on complete snapshot or account retirement
        assertTrue(
            WearSessionManager.shouldScheduleReplacementWaterReconcile(
                wasRequiredReconcile = true,
                sameAccountAndOwner = true,
                isCredSessionCurrent = true,
                discardedByMutationRevision = true
            )
        )
        assertFalse(
            WearSessionManager.shouldScheduleReplacementWaterReconcile(
                wasRequiredReconcile = true,
                sameAccountAndOwner = false,
                isCredSessionCurrent = true,
                discardedByMutationRevision = true
            )
        )
        val (recState1, scheduled1) = WearSessionManager.recordPendingWaterReconcile(
            WearSessionManager.PendingWaterReconcileState(),
            ownerId = "srv-1",
            accountGen = 2L
        )
        assertTrue(scheduled1)
        assertTrue(recState1.isPending)
        val clearedComplete = WearSessionManager.clearPendingWaterReconcileOnComplete(recState1, "srv-1", 2L)
        assertFalse(clearedComplete.isPending)
        val clearedRetire = WearSessionManager.clearPendingWaterReconcileOnAccountRetirement(recState1, retiredThroughGeneration = 2L)
        assertFalse(clearedRetire.isPending)

        // 8 (#10): WaterLogEntry preserves loggedAtMs and merges pending + server entries sorted newest-first by timestamp before undo selection
        val serverLogParsed = WearDirectApiClient.parseWaterLogJson(
            JSONArray()
                .put(
                    JSONObject()
                        .put("id", "srv-newer")
                        .put("source", "manual")
                        .put("container_name", "Bottle")
                        .put("water_ml", 500.0)
                        .put("logged_at", "2026-11-25T10:05:00.000Z")
                )
                .put(
                    JSONObject()
                        .put("id", "srv-older")
                        .put("source", "manual")
                        .put("container_name", "Cup")
                        .put("water_ml", 200.0)
                        .put("logged_at", "2026-11-25T08:00:00.000Z")
                )
                .toString(),
            timeFormat = "HH:mm",
            locale = Locale.US
        )!!
        val pendingMiddleMs = ContextPayloadMapper.parseIsoMs("2026-11-25T09:00:00.000Z")!!
        val pendingMiddle = listOf(WaterLogEntry("pending_mid", "Glass", 250.0, "09:00", loggedAtMs = pendingMiddleMs))
        val mergedByTs = CheckInStore.combineWaterLogNewestFirst(pendingMiddle, serverLogParsed)
        assertEquals(listOf("srv-newer", "pending_mid", "srv-older"), mergedByTs.map { it.id })
        assertEquals("srv-newer", CheckInStore.selectLatestWaterEntryForUndo(mergedByTs)?.id)

        // 11 (#17): Body Fat delta formats in localized percentage points (pp) while readings stay %
        assertEquals("+0.4 pp", formatBodyFatDeltaPp(0.4, "pp", Locale.US))
        assertEquals("-0.8 pp", formatBodyFatDeltaPp(-0.8, "pp", Locale.US))
        assertEquals("0.0 pp", formatBodyFatDeltaPp(-0.01, "pp", Locale.US))
        assertEquals("-0,8 pp", formatBodyFatDeltaPp(-0.8, "pp", Locale.FRANCE))
    }

    @Test
    fun pass19AuthoritativeWaterIdPresetRecoveryMtlsPersistDurableCancelAndBodyFatDateParity() {
        // 1 (#4): resolveCreatedWaterEntryId supports nested entry.id & client_id match, never guesses unattributed rows
        assertEquals(
            "nested-77",
            WearDirectApiClient.resolveCreatedWaterEntryId(
                postResponseBody = JSONObject().put("entry", JSONObject().put("id", "nested-77")).toString(),
                clientId = "tap-77",
                postWaterLogRaw = null
            )
        )
        assertNull(
            WearDirectApiClient.resolveCreatedWaterEntryId(
                postResponseBody = JSONObject().put("water_ml", 750.0).toString(),
                clientId = "tap-77",
                postWaterLogRaw = JSONArray()
                    .put(JSONObject().put("id", "phone-drink-1").put("water_ml", 250.0))
                    .toString()
            )
        )

        // 2 (#5): Recovering server session without set targets when preset GET fails returns UnconfirmedCreate (not Started with placeholder targets)
        val targetlessSessionJson = JSONObject()
            .put("id", "sess-rec-5")
            .put("name", "Push Day")
            .put(
                "exercises",
                JSONArray().put(
                    JSONObject()
                        .put("id", "ex-entry-1")
                        .put("exercise_id", "ex-1")
                        .put("exercise_snapshot", JSONObject().put("id", "ex-1").put("name", "Bench Press").put("modality", "weight_reps"))
                        .put("sets", JSONArray().put(JSONObject().put("id", "set-1").put("set_number", 1).put("rest_time", 90)))
                )
            )
            .toString()
        val presetWithTargetsJson = JSONObject()
            .put("name", "Push Day")
            .put(
                "exercises",
                JSONArray().put(
                    JSONObject()
                        .put("exercise_id", "ex-1")
                        .put("sets", JSONArray().put(JSONObject().put("set_number", 1).put("reps", 10).put("weight", 80.0).put("rest_time", 90)))
                )
            )
            .toString()
        assertTrue(WearDirectApiClient.sessionNeedsPresetTargets(targetlessSessionJson))
        assertEquals(
            PresetWorkoutDirectResult.UnconfirmedCreate("sess-rec-5"),
            WearDirectApiClient.resolveRecoveredPresetWorkoutResult(
                sessionBody = targetlessSessionJson,
                presetBody = null,
                sessionId = "sess-rec-5"
            )
        )
        val recoveredWithPreset = WearDirectApiClient.resolveRecoveredPresetWorkoutResult(
            sessionBody = targetlessSessionJson,
            presetBody = presetWithTargetsJson,
            sessionId = "sess-rec-5"
        ) as PresetWorkoutDirectResult.Started
        assertEquals("sess-rec-5", recoveredWithPreset.plan.sessionId)
        assertEquals(80.0, recoveredWithPreset.plan.exercises.single().sets.single().targetWeightKg ?: 0.0, 0.001)

        // 3 (#7): Failed mTLS notice disk commit returns PersistFailed, raises pending mTLS barrier blocking direct load & non-mTLS saves, and clears once committed
        assertEquals(WearServerCredentialsStore.SaveResult.PersistFailed, WearServerCredentialsStore.resolveMtlsNoticeSaveResult(persisted = false))
        assertEquals(WearServerCredentialsStore.SaveResult.Rejected, WearServerCredentialsStore.resolveMtlsNoticeSaveResult(persisted = true))
        val (pendingMtlsGen, pendingMtlsRev) = WearServerCredentialsStore.resolvePendingUnpersistedMtlsBarrier(
            currentPendingGen = 0L,
            currentPendingRev = 0L,
            attemptedGen = 2L,
            attemptedRev = 3L,
            commitSucceeded = false
        )
        assertEquals(2L, pendingMtlsGen)
        assertEquals(3L, pendingMtlsRev)
        assertTrue(
            WearServerCredentialsStore.isBlockedByPendingMtlsBarrier(
                savedGen = 2L,
                savedTransportRev = 3L,
                pendingMtlsGen = pendingMtlsGen,
                pendingMtlsRev = pendingMtlsRev
            )
        )
        assertFalse(
            WearServerCredentialsStore.isBlockedByPendingMtlsBarrier(
                savedGen = 2L,
                savedTransportRev = 4L,
                pendingMtlsGen = pendingMtlsGen,
                pendingMtlsRev = pendingMtlsRev
            )
        )
        assertEquals(
            2L to 3L,
            WearServerCredentialsStore.effectiveMtlsWatermarkForNonMtlsSave(
                persistedGen = 2L,
                persistedTransportRev = 1L,
                pendingMtlsGen = pendingMtlsGen,
                pendingMtlsRev = pendingMtlsRev
            )
        )
        assertEquals(
            0L to 0L,
            WearServerCredentialsStore.resolvePendingUnpersistedMtlsBarrier(
                currentPendingGen = pendingMtlsGen,
                currentPendingRev = pendingMtlsRev,
                attemptedGen = 2L,
                attemptedRev = 3L,
                commitSucceeded = true
            )
        )

        // 4 (#8): cancelWaterTap always enqueues durable DataItem even when best-effort live message returns true
        assertTrue(WearSessionManager.shouldEnqueueDurableWaterTapCancel(accountStillCurrent = true, liveMessageSucceeded = true))
        assertTrue(WearSessionManager.shouldEnqueueDurableWaterTapCancel(accountStillCurrent = true, liveMessageSucceeded = false))
        assertFalse(WearSessionManager.shouldEnqueueDurableWaterTapCancel(accountStillCurrent = false, liveMessageSucceeded = true))
        assertEquals("4_srv-1_tap-9", WearSessionManager.waterTapCancelDataItemKey("srv-1", "tap-9", 4L))

        // 5 (#9): Workout recovery fallback re-checks record presence and cleans up stale DataItem ONLY when record was removed (NOT on flag commit failure)
        val activeRec = WearSessionManager.PendingWorkoutRecovery("srv-1", "p-1", "sess-9", accountGen = 3L)
        assertTrue(WearSessionManager.isWorkoutRecoveryPresent(listOf(activeRec), "sess-9", 3L))
        assertFalse(WearSessionManager.isWorkoutRecoveryPresent(emptyList(), "sess-9", 3L))
        assertTrue(WearSessionManager.shouldEnqueueWorkoutRecoveryFallback(recordStillPresent = true, accountGenCurrent = true))
        assertFalse(WearSessionManager.shouldEnqueueWorkoutRecoveryFallback(recordStillPresent = false, accountGenCurrent = true))
        assertTrue(
            WearSessionManager.shouldCleanupWorkoutRecoveryDataItem(
                queued = true,
                updateResult = WearSessionManager.WorkoutRecoveryUpdateResult.NOT_FOUND
            )
        )
        assertFalse(
            WearSessionManager.shouldCleanupWorkoutRecoveryDataItem(
                queued = true,
                updateResult = WearSessionManager.WorkoutRecoveryUpdateResult.COMMIT_FAILED
            )
        )
        assertFalse(
            WearSessionManager.shouldCleanupWorkoutRecoveryDataItem(
                queued = true,
                updateResult = WearSessionManager.WorkoutRecoveryUpdateResult.UPDATED
            )
        )

        // 6 (#17): Explicit lastBodyFatDate parses from JSON, populates TrendModels bfByDay under BF date (separate from weight lastEntryDate), and persists through direct refresh
        val parsedCtxWithBfDate = ContextPayloadMapper.parseContext(
            JSONObject()
                .put("today", "2026-11-25")
                .put("lastEntryDate", "2026-11-24")
                .put("lastWeightKg", 80.5)
                .put("lastBodyFatPercentage", 18.2)
                .put("lastBodyFatDate", "2026-11-22"),
            WatchContext.empty
        )
        assertEquals("2026-11-22", parsedCtxWithBfDate.lastBodyFatDate)
        val trendFromExplicitBfDate = TrendModels.buildTrendPageModel(
            watchCtx = parsedCtxWithBfDate,
            history = listOf(HistoryPoint("2026-11-20", 81.0, 19.0)),
            unit = WeightUnit.KG,
            today = "2026-11-25"
        )
        assertEquals(18.2, trendFromExplicitBfDate.latestBodyFatPercent ?: 0.0, 0.001)
        assertEquals(listOf("2026-11-20", "2026-11-22"), trendFromExplicitBfDate.bodyFatSamples.map { it.day })
        assertEquals(-0.8, trendFromExplicitBfDate.bodyFatDeltaPercent ?: 0.0, 0.001)

        val resolvedOlderBfDate = CheckInStore.resolveLastMetricsAfterDirectRefresh(
            snapshotDay = "2026-11-25",
            todayBodyFatPercentage = null,
            mergedHistory = emptyList(),
            mergedBodyFatHistory = emptyList(),
            prevHistory = emptyList(),
            prevBodyFatHistory = emptyList(),
            prevLastWeightKg = 80.5,
            prevLastEntryDate = "2026-11-24",
            prevLastBodyFatPercentage = 19.4,
            prevLastBodyFatDate = "2026-10-15"
        )
        assertNull(resolvedOlderBfDate.lastWeightKg)
        assertNull(resolvedOlderBfDate.lastEntryDate)
        assertEquals(19.4, resolvedOlderBfDate.lastBodyFatPercentage ?: 0.0, 0.001)
        assertEquals("2026-10-15", resolvedOlderBfDate.lastBodyFatDate)
    }

    @Test
    fun pass20TimeFormatNullWorkoutOwnershipRecoveryCommitStartupResendBfRolloverAndFractionalNutrients() {
        // 1 (#1): Explicit timeFormat: null resets previous timeFormat, while omission preserves it
        val prevWith24h = WatchContext(timeFormat = "HH:mm")
        val omittedTimeFmt = ContextPayloadMapper.parseContext(JSONObject().put("today", "2026-11-25"), prevWith24h)
        assertEquals("HH:mm", omittedTimeFmt.timeFormat)
        val explicitNullTimeFmt = ContextPayloadMapper.parseContext(
            JSONObject().put("today", "2026-11-25").put("timeFormat", JSONObject.NULL),
            prevWith24h
        )
        assertNull(explicitNullTimeFmt.timeFormat)

        // 2 (#10): Workout recovery payload carries accountGen and incoming workoutStart validates ownerId + accountGen
        val recPayloadWithGen = WearSessionManager.buildUnconfirmedWorkoutRecoveryPayload(
            OutboundPayloads.workoutStartRequest("42", "srv-1"),
            sessionId = "sess-10",
            accountGen = 7L
        )
        assertEquals(7L, recPayloadWithGen.getLong("accountGen"))
        assertTrue(
            WearSessionManager.shouldAcceptIncomingWorkoutStart(
                payloadOwnerId = "srv-1",
                payloadAccountGen = 7L,
                activeOwnerId = "srv-1",
                currentAccountGen = 7L
            )
        )
        assertFalse(
            WearSessionManager.shouldAcceptIncomingWorkoutStart(
                payloadOwnerId = "srv-1",
                payloadAccountGen = 7L,
                activeOwnerId = "srv-2",
                currentAccountGen = 7L
            )
        )
        assertFalse(
            WearSessionManager.shouldAcceptIncomingWorkoutStart(
                payloadOwnerId = "srv-1",
                payloadAccountGen = 7L,
                activeOwnerId = "srv-1",
                currentAccountGen = 8L
            )
        )
        // Legacy phone workoutStart without ownerId/accountGen remains accepted
        assertTrue(
            WearSessionManager.shouldAcceptIncomingWorkoutStart(
                payloadOwnerId = null,
                payloadAccountGen = 0L,
                activeOwnerId = "srv-2",
                currentAccountGen = 8L
            )
        )

        // 3 (#11): Failed deliveredToPhone commit retains queued DataItem; only NOT_FOUND triggers cleanup
        assertFalse(
            WearSessionManager.shouldCleanupWorkoutRecoveryDataItem(
                queued = true,
                updateResult = WearSessionManager.WorkoutRecoveryUpdateResult.COMMIT_FAILED
            )
        )
        assertTrue(
            WearSessionManager.shouldCleanupWorkoutRecoveryDataItem(
                queued = true,
                updateResult = WearSessionManager.WorkoutRecoveryUpdateResult.NOT_FOUND
            )
        )

        // 4 (#14): Startup resendQueued gate runs whenever a confirmed owner is active
        assertTrue(WearSessionManager.shouldResendQueuedOnStartup("srv-1"))
        assertFalse(WearSessionManager.shouldResendQueuedOnStartup(null))
        assertFalse(WearSessionManager.shouldResendQueuedOnStartup(""))

        // 5 (#16): Rolling todayBodyFatPercentage forward on a newer day's weight-only check-in updates lastBodyFatDate independently of weight dates in memory & JSON
        val prevDayCtx = WatchContext(
            today = "2026-11-24",
            todayWeightKg = 80.5,
            todayBodyFatPercentage = 18.6,
            lastEntryDate = "2026-11-20",
            lastWeightKg = 81.0,
            lastBodyFatPercentage = 19.0,
            lastBodyFatDate = "2026-11-20"
        )
        val (rolledCtx, _) = CheckInStore.applyDirectOutcomeToBaseState(
            baseCtx = prevDayCtx,
            baseHist = listOf(HistoryPoint("2026-11-20", 81.0, 19.0), HistoryPoint("2026-11-24", 80.5, 18.6)),
            clientId = "ci-new-day",
            outcome = DirectWriteOutcome.Applied(syncedDomain = "checkIn", entryDate = "2026-11-25", weightKg = 80.1, bodyFatPercentage = null),
            today = "2026-11-25"
        )
        assertEquals("2026-11-24", rolledCtx.lastEntryDate)
        assertEquals(80.5, rolledCtx.lastWeightKg ?: 0.0, 0.001)
        assertEquals(18.6, rolledCtx.lastBodyFatPercentage ?: 0.0, 0.001)
        assertEquals("2026-11-24", rolledCtx.lastBodyFatDate)

        // When prior day had NO todayBodyFatPercentage, existing (lastBodyFatPercentage, lastBodyFatDate) stay unchanged
        val prevWeightOnlyCtx = prevDayCtx.copy(todayBodyFatPercentage = null)
        val (unchangedBfCtx, _) = CheckInStore.applyDirectOutcomeToBaseState(
            baseCtx = prevWeightOnlyCtx,
            baseHist = listOf(HistoryPoint("2026-11-20", 81.0, 19.0), HistoryPoint("2026-11-24", 80.5, null)),
            clientId = "ci-new-day-2",
            outcome = DirectWriteOutcome.Applied(syncedDomain = "checkIn", entryDate = "2026-11-25", weightKg = 80.1, bodyFatPercentage = null),
            today = "2026-11-25"
        )
        assertEquals(19.0, unchangedBfCtx.lastBodyFatPercentage ?: 0.0, 0.001)
        assertEquals("2026-11-20", unchangedBfCtx.lastBodyFatDate)

        val rolloverJson = JSONObject()
            .put("today", "2026-11-24")
            .put("todayWeightKg", 80.5)
            .put("todayBodyFatPercentage", 18.6)
            .put("lastEntryDate", "2026-11-20")
            .put("lastWeightKg", 81.0)
            .put("lastBodyFatPercentage", 19.0)
            .put("lastBodyFatDate", "2026-11-20")
        CheckInStore.patchContextJsonObject(
            obj = rolloverJson,
            ackedClientId = "ci-new-day",
            entryDate = "2026-11-25",
            localToday = "2026-11-25",
            hasCheckIn = true,
            checkInWeightKg = 80.1,
            checkInBodyFat = null
        )
        assertEquals(18.6, rolloverJson.getDouble("lastBodyFatPercentage"), 0.001)
        assertEquals("2026-11-24", rolloverJson.getString("lastBodyFatDate"))

        // 6 (#20): Goals nutrient rows compute unrounded Double progress and format fractional micronutrients cleanly while keeping macros as integers
        assertEquals(0.5f, computeNutrientRowProgress(0.2, 0.4), 0.001f)
        assertEquals(0f, computeNutrientRowProgress(0.2, 0.0), 0.001f)
        assertEquals(0f, computeNutrientRowProgress(0.2, null), 0.001f)
        assertEquals("0.2", formatNutrientAmount(0.2, 0.4, Locale.US))
        assertEquals("0.4", formatNutrientAmount(0.4, 0.4, Locale.US))
        assertEquals("0,2", formatNutrientAmount(0.2, 0.4, Locale.FRANCE))
        assertEquals("145", formatNutrientAmount(145.3, 180.0, Locale.US))
        assertEquals("180", formatNutrientAmount(180.0, 180.0, Locale.US))
    }

    @Test
    fun pass20WorkoutPlanClearWaterReconcileBackoffWriteIdZeroPresetTargetsFastJsonAtomicSeqTileScaleAndBackfillParity() {
        // 1 (#1): Workout recovery only clears when plan store runs under active gen + owner
        assertTrue(WearSessionManager.shouldClearWorkoutRecoveryAfterPlanStore(3L, 3L, "srv-1", "srv-1"))
        assertFalse(WearSessionManager.shouldClearWorkoutRecoveryAfterPlanStore(3L, 4L, "srv-1", "srv-1"))
        assertFalse(WearSessionManager.shouldClearWorkoutRecoveryAfterPlanStore(3L, 3L, "srv-1", "srv-2"))

        // 2 (#2): Pending water reconcile retries with bounded backoff on null or partial snapshot
        assertTrue(
            WearSessionManager.shouldRetryPendingWaterReconcileOnNullOrPartial(
                wasRequiredReconcile = true,
                sameAccountAndOwner = true,
                isCredSessionCurrent = true,
                snapshotIsNull = true,
                snapshotSuppliedWater = false
            )
        )
        assertTrue(
            WearSessionManager.shouldRetryPendingWaterReconcileOnNullOrPartial(
                wasRequiredReconcile = true,
                sameAccountAndOwner = true,
                isCredSessionCurrent = true,
                snapshotIsNull = false,
                snapshotSuppliedWater = false
            )
        )
        assertFalse(
            WearSessionManager.shouldRetryPendingWaterReconcileOnNullOrPartial(
                wasRequiredReconcile = false,
                sameAccountAndOwner = true,
                isCredSessionCurrent = true,
                snapshotIsNull = true,
                snapshotSuppliedWater = false
            )
        )
        assertFalse(
            WearSessionManager.shouldRetryPendingWaterReconcileOnNullOrPartial(
                wasRequiredReconcile = true,
                sameAccountAndOwner = true,
                isCredSessionCurrent = true,
                snapshotIsNull = false,
                snapshotSuppliedWater = true
            )
        )
        assertEquals(2_000L, WearSessionManager.waterReconcileBackoffDelayMs(1))
        assertEquals(5_000L, WearSessionManager.waterReconcileBackoffDelayMs(2))
        assertEquals(12_000L, WearSessionManager.waterReconcileBackoffDelayMs(3))
        assertEquals(25_000L, WearSessionManager.waterReconcileBackoffDelayMs(4))

        // 3 (#3): Async revocation guard at writeId == 0L rejects clearing newer credentials at writeId >= 1L
        assertFalse(WearServerCredentialsStore.shouldDisableCredentialsForAccountClear(expectedWriteId = 0L, currentWriteId = 1L))
        assertTrue(WearServerCredentialsStore.shouldDisableCredentialsForAccountClear(expectedWriteId = 0L, currentWriteId = 0L))

        // 4 (#4): Workout recovery rejects invalid/empty/targetless preset JSON when session lacks set targets
        val targetlessSession = JSONObject()
            .put("id", "sess-20")
            .put("name", "Push")
            .put(
                "exercises",
                JSONArray().put(
                    JSONObject()
                        .put("id", "ex-e1")
                        .put("exercise_id", "ex-1")
                        .put("exercise_snapshot", JSONObject().put("id", "ex-1").put("name", "Bench").put("modality", "weight_reps"))
                        .put("sets", JSONArray().put(JSONObject().put("id", "s-1").put("set_number", 1).put("rest_time", 90)))
                )
            )
            .toString()
        assertEquals(
            PresetWorkoutDirectResult.UnconfirmedCreate("sess-20"),
            WearDirectApiClient.resolveRecoveredPresetWorkoutResult(targetlessSession, "{not-json", "sess-20")
        )
        val emptyPreset = JSONObject()
            .put("name", "Push")
            .put("exercises", JSONArray())
            .toString()
        assertEquals(
            PresetWorkoutDirectResult.UnconfirmedCreate("sess-20"),
            WearDirectApiClient.resolveRecoveredPresetWorkoutResult(targetlessSession, emptyPreset, "sess-20")
        )

        // 5 (#5): applyPreservedFastToContextJson persists carried-forward fast even when phone omits fast & fastKnown
        val carriedFast = WatchFast(startedAtMs = 1_700_000_000_000L, targetEndAtMs = 1_700_057_600_000L, label = "16:8", id = "f-20")
        val partialJson = JSONObject().put("today", "2026-11-26").toString()
        val persistedWithCarriedFast = CheckInStore.applyPreservedFastToContextJson(partialJson, carriedFast)
        val reparsedCarried = ContextPayloadMapper.parseContext(JSONObject(persistedWithCarriedFast), WatchContext.empty)
        assertTrue(reparsedCarried.fastSynced)
        assertEquals("f-20", reparsedCarried.fast?.id)

        // 7 (#7): Width- & fontScale-aware detail strength check disables direct action on narrow watches or large fontScale while preserving 1.0x normal watches
        val today = CheckInDate.today()
        val gridDoses = listOf(
            MedicationDose("g1:s1", "g1", "s1", "ExtendedA", "Extended 500mg", "08:00 AM", MedicationDoseStatus.PENDING),
            MedicationDose("g2:s1", "g2", "s1", "ExtendedB", "Extended 850mg", "08:00 PM", MedicationDoseStatus.PENDING),
            MedicationDose("g3:s1", "g3", "s1", "Aspirin", "5 mg", "11:30 PM", MedicationDoseStatus.PENDING),
            MedicationDose("g4:s1", "g4", "s1", "Valsartan", "20 mg", "09:00 AM", MedicationDoseStatus.PENDING)
        )
        val snap = MedicationSnapshot(day = today, doses = gridDoses)
        val normalModel = TileModels.buildMedicationsTileModel(snap, screenWidthDp = 225, fontScale = 1.0f)
        assertTrue(normalModel.doseRows.first { it.doseId == "g3:s1" }.isDirectlyActionable)
        assertTrue(normalModel.doseRows.first { it.doseId == "g4:s1" }.isDirectlyActionable)
        val largeFontModel = TileModels.buildMedicationsTileModel(snap, screenWidthDp = 225, fontScale = 1.4f)
        assertFalse(largeFontModel.doseRows.first { it.doseId == "g1:s1" }.isDirectlyActionable)
        assertFalse(largeFontModel.doseRows.first { it.doseId == "g2:s1" }.isDirectlyActionable)
        val narrowModel = TileModels.buildMedicationsTileModel(snap, screenWidthDp = 180, fontScale = 1.0f)
        assertFalse(narrowModel.doseRows.first { it.doseId == "g1:s1" }.isDirectlyActionable)

        // 8 (#8): Delayed prior-day check-in updates last* when >= existing and leaves newer last* intact, and waterTap stamps expiresAtMs
        val baseForBackfill = JSONObject()
            .put("today", "2026-11-26")
            .put("lastEntryDate", "2026-11-23")
            .put("lastWeightKg", 81.0)
            .put("lastBodyFatDate", "2026-11-23")
            .put("lastBodyFatPercentage", 19.0)
        CheckInStore.patchContextJsonObject(
            obj = baseForBackfill,
            ackedClientId = "ci-prev",
            entryDate = "2026-11-24",
            localToday = "2026-11-26",
            hasCheckIn = true,
            checkInWeightKg = 80.4,
            checkInBodyFat = 18.6
        )
        assertEquals("2026-11-24", baseForBackfill.getString("lastEntryDate"))
        assertEquals(80.4, baseForBackfill.getDouble("lastWeightKg"), 0.001)
        assertEquals("2026-11-24", baseForBackfill.getString("lastBodyFatDate"))
        assertEquals(18.6, baseForBackfill.getDouble("lastBodyFatPercentage"), 0.001)

        // Older backfill does not overwrite newer 2026-11-24 readings
        CheckInStore.patchContextJsonObject(
            obj = baseForBackfill,
            ackedClientId = "ci-older",
            entryDate = "2026-11-21",
            localToday = "2026-11-26",
            hasCheckIn = true,
            checkInWeightKg = 82.0,
            checkInBodyFat = 19.8
        )
        assertEquals("2026-11-24", baseForBackfill.getString("lastEntryDate"))
        assertEquals(80.4, baseForBackfill.getDouble("lastWeightKg"), 0.001)
        assertEquals("2026-11-24", baseForBackfill.getString("lastBodyFatDate"))
        assertEquals(18.6, baseForBackfill.getDouble("lastBodyFatPercentage"), 0.001)

        val tapPayload = OutboundPayloads.waterTap(clientId = "wt-20", entryDate = "2026-11-26", containerId = 1, ownerId = "srv-1")
        assertTrue(tapPayload.optLong("expiresAtMs", 0L) > 0L)
    }

    @Test
    fun midnightDailySummaryRefreshAndCustomComplicationPlaceholderParity() {
        val today = CheckInDate.today()
        val prevNutrition = NutritionSnapshot(
            day = "2026-11-25",
            caloriesConsumed = 1800.0,
            caloriesBurned = 200.0,
            caloriesRemaining = 400.0,
            calorieProgress = 0.82,
            carbs = MacroGoal(150.0, 200.0, 0.75),
            fat = MacroGoal(50.0, 65.0, 0.77),
            protein = MacroGoal(120.0, 150.0, 0.8),
            rows = listOf(
                NutrientRow("dietary_fiber", "Fiber", "g", 18.0, 30.0, 0.6),
                NutrientRow("protein", "Protein", "g", 120.0, 150.0, 0.8),
                NutrientRow("caffeine", "Caffeine", "mg", 80.0, 200.0, 0.4)
            )
        )
        val summaryJson = JSONObject()
            .put(
                "goals",
                JSONObject()
                    .put("calories", 2200)
                    .put("protein", 160)
                    .put("carbs", 220)
                    .put("fat", 70)
                    .put("dietary_fiber", 32)
                    .put("water_goal_ml", 3000)
                    .put("target_exercise_duration_minutes", 45)
                    .put("target_exercise_calories_burned", 400)
                    .put("target_steps", 12000)
                    .put("custom_nutrients", JSONObject().put("caffeine", 250))
            )
            .put(
                "adjustedGoals",
                JSONObject()
                    .put("calories", 2350)
                    .put("protein", 170)
                    .put("water_goal_ml", 3200)
            )
            .put(
                "calorieBalance",
                JSONObject()
                    .put("eaten", 650)
                    .put("burned", 180)
                    .put("remaining", 1880)
                    .put("goal", 2350)
            )
            .put(
                "foodEntries",
                JSONArray().put(
                    JSONObject()
                        .put("serving_size", 100.0)
                        .put("quantity", 150.0)
                        .put("protein", 20.0)
                        .put("carbs", 30.0)
                        .put("fat", 10.0)
                        .put("dietary_fiber", 4.0)
                        .put("custom_nutrients", JSONObject().put("caffeine", 60.0))
                )
            )
            .put(
                "supplementTotals",
                JSONObject()
                    .put("protein", 10.0)
                    .put("dietary_fiber", 2.0)
                    .put("custom_nutrients", JSONObject().put("caffeine", 40.0))
            )
            .put(
                "exerciseSessions",
                JSONArray().put(
                    JSONObject()
                        .put("exercise_name", "Morning Run")
                        .put("duration_minutes", 30)
                        .put("calories_burned", 180)
                )
            )
            .put("waterIntakeBreakdown", JSONObject().put("food_ml", 240))
            .toString()

        val parsed = WearDirectApiClient.parseDailySummaryJson(
            raw = summaryJson,
            today = today,
            existingNutrition = prevNutrition,
            includeFoodWater = false
        )
        assertNotNull(parsed)
        assertEquals(650.0, parsed!!.nutrition.caloriesConsumed, 0.001)
        assertEquals(180.0, parsed.nutrition.caloriesBurned, 0.001)
        assertEquals(1880.0, parsed.nutrition.caloriesRemaining, 0.001)
        assertEquals(3200.0, parsed.waterGoalMl!!, 0.001)
        assertNull(parsed.waterFromFoodMl)
        assertEquals(12000, parsed.stepGoal)
        assertEquals(30, parsed.exerciseSummary.minutes)
        assertEquals(45, parsed.exerciseSummary.minutesGoal)
        assertEquals(1, parsed.exerciseSummary.sessionCount)
        assertEquals(listOf("dietary_fiber", "protein", "caffeine"), parsed.nutrition.rows!!.map { it.key })
        assertEquals(8.0, parsed.nutrition.rows!![0].consumed, 0.001)
        assertEquals(32.0, parsed.nutrition.rows!![0].goal!!, 0.001)
        assertEquals(40.0, parsed.nutrition.rows!![1].consumed, 0.001)
        assertEquals(170.0, parsed.nutrition.rows!![1].goal!!, 0.001)
        assertEquals(130.0, parsed.nutrition.rows!![2].consumed, 0.001)
        assertEquals(250.0, parsed.nutrition.rows!![2].goal!!, 0.001)

        // (b) patchContextJsonObject + ContextPayloadMapper populates nutrition + steps + exerciseSummary after midnight rollover
        val oldContextJson = JSONObject()
            .put("ownerId", "srv-1")
            .put("today", "2026-11-25")
            .put("caloriesConsumed", 1800)
            .put("caloriesBurned", 200)
            .put("caloriesRemaining", 400)
        CheckInStore.patchContextJsonObject(
            obj = oldContextJson,
            ackedClientId = null,
            entryDate = today,
            localToday = today,
            refreshedSnapshot = DirectLiveSnapshot(
                ownerId = "srv-1",
                day = today,
                waterGoalMl = parsed.waterGoalMl,
                nutrition = parsed.nutrition,
                exerciseSummary = parsed.exerciseSummary,
                steps = StepsSnapshot(day = today, count = 4321),
                stepGoal = parsed.stepGoal
            )
        )
        val roundTripped = ContextPayloadMapper.parseContext(oldContextJson, WatchContext.empty)
        assertEquals(today, roundTripped.today)
        assertNotNull(roundTripped.nutrition)
        assertEquals(650.0, roundTripped.nutrition!!.caloriesConsumed, 0.001)
        assertEquals(listOf("dietary_fiber", "protein", "caffeine"), roundTripped.nutrition!!.rows!!.map { it.key })
        assertEquals(4321, roundTripped.steps?.count)
        assertEquals(12000, roundTripped.stepGoal)
        assertEquals(30, roundTripped.exerciseSummary?.minutes)
        assertEquals(3200.0, roundTripped.waterGoalMl!!, 0.001)

        // (c) Unsynced progress-capable custom complication resolves non-null empty-ring data (never NoDataComplicationData)
        val unsyncedSpec = CustomComplicationEngine.buildRenderSpec(
            definition = CustomComplicationDefinition(
                id = "custom-cal",
                name = "Calories",
                source = "calories",
                format = "value",
                icon = "flame.fill",
                color = "lime",
                gauge = true
            ),
            metrics = emptyMap(),
            nowMs = System.currentTimeMillis(),
            today = today,
            locale = Locale.US,
            preview = false
        )
        assertTrue(unsyncedSpec.supportsProgress)
        assertNull(unsyncedSpec.progress)
        assertEquals(0f, CustomComplicationService.resolveEffectiveProgress(unsyncedSpec)!!, 0.001f)
        val effectiveRings = CustomComplicationService.resolveEffectiveRings(unsyncedSpec)
        assertEquals(1, effectiveRings.size)
        assertEquals(0f, effectiveRings[0].progress, 0.001f)
    }

    @Test
    fun groupedPresetDailySummaryAndBlankSetPresetRecoveryParity() {
        val today = CheckInDate.today()
        // 1. Grouped preset workout sessions use total_duration_minutes and sum child exercises[] calories
        val summaryWithPreset = JSONObject()
            .put("goals", JSONObject().put("calories", 2200).put("target_exercise_duration_minutes", 60))
            .put(
                "exerciseSessions",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("type", "preset")
                            .put("name", "Push Day")
                            .put("total_duration_minutes", 42)
                            .put(
                                "exercises",
                                JSONArray()
                                    .put(JSONObject().put("calories_burned", 140.0))
                                    .put(JSONObject().put("calories_burned", 95.0))
                            )
                    )
                    .put(
                        JSONObject()
                            .put("type", "individual")
                            .put("exercise_name", "Walk")
                            .put("duration_minutes", 15)
                            .put("calories_burned", 65)
                    )
            )
            .toString()
        val parsed = WearDirectApiClient.parseDailySummaryJson(summaryWithPreset, today)
        assertNotNull(parsed)
        assertEquals(57, parsed!!.exerciseSummary.minutes)
        assertEquals(300, parsed.exerciseSummary.calories)
        assertEquals(2, parsed.exerciseSummary.sessionCount)
        assertEquals("Push Day", parsed.exerciseSummary.sessions[0].name)
        assertEquals(42, parsed.exerciseSummary.sessions[0].durationMinutes)
        assertEquals(235, parsed.exerciseSummary.sessions[0].calories)

        // 2. Recovering a preset that legitimately has blank sets (no targets by design) succeeds
        val sessionBody = JSONObject()
            .put("id", "sess-blank")
            .put("name", "Freestyle Push")
            .put(
                "exercises",
                JSONArray().put(
                    JSONObject()
                        .put("id", "ex-entry-1")
                        .put("exercise_id", "ex-1")
                        .put("exercise_name", "Push-up")
                        .put(
                            "sets",
                            JSONArray()
                                .put(JSONObject().put("id", "s-1").put("set_number", 1).put("reps", 12))
                                .put(JSONObject().put("id", "s-2").put("set_number", 2))
                        )
                )
            )
            .toString()
        val presetWithBlankSetBody = JSONObject()
            .put("id", 77)
            .put("name", "Freestyle Push")
            .put(
                "exercises",
                JSONArray().put(
                    JSONObject()
                        .put("exercise_id", "ex-1")
                        .put(
                            "sets",
                            JSONArray()
                                .put(JSONObject().put("set_number", 1).put("reps", 12))
                                .put(JSONObject().put("set_number", 2))
                        )
                )
            )
            .toString()
        val result = WearDirectApiClient.resolveRecoveredPresetWorkoutResult(
            sessionBody = sessionBody,
            presetBody = presetWithBlankSetBody,
            sessionId = "sess-blank"
        )
        assertTrue(result is PresetWorkoutDirectResult.Started)
        val started = result as PresetWorkoutDirectResult.Started
        assertEquals(12.0, started.plan.exercises[0].sets[0].targetReps!!, 0.001)
        assertNull(started.plan.exercises[0].sets[1].targetReps)
    }

    @Test
    fun medicationTileCommonSignatureCollidesAcrossGridRows() {
        val doses = listOf(
            MedicationDose("d1", "m1", "s1", "Supplement Alpha", "10 mg", "11:30 PM", MedicationDoseStatus.PENDING),
            MedicationDose("d2", "m2", "s2", "Other Med", "5 mg", "11:30 PM", MedicationDoseStatus.PENDING),
            MedicationDose("d3", "m3", "s3", "Supplement Beta", "10 mg", "11:30 PM", MedicationDoseStatus.PENDING)
        )
        val rows = TileModels.buildAllMedicationDoseRows(
            doses = doses,
            screenWidthDp = 192,
            fontScale = 1f
        )
        assertEquals(3, rows.size)
        // Row 0 ("Supplement Alpha") and Row 1 ("Supplement Beta") collide under common grid budget
        assertFalse(rows[0].isDirectlyActionable)
        assertTrue(rows[1].isDirectlyActionable)
        assertFalse(rows[2].isDirectlyActionable)

        // Content descriptions use untruncated full names and action/status context
        val medTakeCd = TileModels.buildMedicationCardContentDescription(
            dose = rows[1],
            markTakenFormat = { n, d -> "Mark $n ($d) as taken" },
            markTakenFailedFormat = { n, d, s -> "$n ($d), $s, tap to mark as taken" },
            openFormat = { n, d, s -> "$n ($d), $s, open medications" },
            statusLabel = "pending"
        )
        assertEquals("Mark Other Med (5 mg · 11:30p) as taken", medTakeCd)

        val medFailedActionableCd = TileModels.buildMedicationCardContentDescription(
            dose = rows[1].copy(statusSymbol = "!"),
            markTakenFormat = { n, d -> "Mark $n ($d) as taken" },
            markTakenFailedFormat = { n, d, s -> "$n ($d), $s, tap to mark as taken" },
            openFormat = { n, d, s -> "$n ($d), $s, open medications" },
            statusLabel = "failed to sync"
        )
        assertEquals("Other Med (5 mg · 11:30p), failed to sync, tap to mark as taken", medFailedActionableCd)

        val medOpenCd = TileModels.buildMedicationCardContentDescription(
            dose = rows[0],
            markTakenFormat = { n, d -> "Mark $n ($d) as taken" },
            markTakenFailedFormat = { n, d, s -> "$n ($d), $s, tap to mark as taken" },
            openFormat = { n, d, s -> "$n ($d), $s, open medications" },
            statusLabel = "pending"
        )
        assertEquals("Supplement Alpha (10 mg · 11:30p), pending, open medications", medOpenCd)

        val waterModel = TileModels.buildWaterTileModel(
            hasOwner = true,
            consumedMl = 500.0,
            goalMl = 2500.0,
            queuedMl = 0.0,
            watchCtx = WatchContext.empty.copy(waterDisplayUnit = "oz"),
            containers = listOf(WaterContainer(1, "Morning Drip Coffee", 240.0, "oz", isQuickAdd = true))
        )
        val waterCd = TileModels.buildWaterCardContentDescription(
            chip = waterModel.containers.first(),
            logFormat = { n, a -> "Log $n ($a)" },
            openFormat = { n, a -> "$n ($a), open hydration" }
        )
        assertTrue(waterCd.startsWith("Log Morning Drip Coffee (+"))

        val waterOpenCd = TileModels.buildWaterCardContentDescription(
            chip = waterModel.containers.first().copy(isDirectlyActionable = false),
            logFormat = { n, a -> "Log $n ($a)" },
            openFormat = { n, a -> "$n ($a), open hydration" }
        )
        assertTrue(waterOpenCd.startsWith("Morning Drip Coffee (+"))
        assertTrue(waterOpenCd.endsWith(", open hydration"))
    }

    @Test
    fun fastingPresetRejectionAndCredentialAckPayloadsParity() {
        // Point #6: unknown and blank presetIds return null and reject fastStart with 400
        assertEquals("16:8 Leangains" to 16.0, WearDirectApiClient.fastingPresetSpec("16-8"))
        assertEquals("Custom Fast" to 12.0, WearDirectApiClient.fastingPresetSpec("custom"))
        assertNull(WearDirectApiClient.fastingPresetSpec(""))
        assertNull(WearDirectApiClient.fastingPresetSpec("unknown-preset"))

        // Point #2: credentialsAck + requestContext(needsCredentials = true/false)
        val reqNoCreds = OutboundPayloads.contextRequest(needsCredentials = true)
        assertEquals("requestContext", reqNoCreds.getString("type"))
        assertTrue(reqNoCreds.getBoolean("needsCredentials"))

        val reqWithCreds = OutboundPayloads.contextRequest(needsCredentials = false)
        assertEquals("requestContext", reqWithCreds.getString("type"))
        assertFalse(reqWithCreds.has("needsCredentials"))

        val ack = OutboundPayloads.credentialsAck(generation = 5L, transportRevision = 12L, ownerId = "srv-1")
        assertEquals("credentialsAck", ack.getString("type"))
        assertEquals(5L, ack.getLong("generation"))
        assertEquals(12L, ack.getLong("transportRevision"))
        assertEquals("srv-1", ack.getString("ownerId"))

        // Round 4 Thread [3]: TYPE_DELETED on PATH_CREDENTIALS is ignored (does not wipe Keystore credentials),
        // while PATH_CONTEXT deletion, explicit requiresClientCertificate, and explicit revocation remain active.
        assertFalse(WearSessionManager.shouldHandleDeletedDataPath("/sparky/credentials"))
        assertTrue(WearSessionManager.shouldHandleDeletedDataPath("/sparky/context"))
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = true,
                incomingTransportRev = 2L,
                lastTransportRev = 1L,
                isMtlsNotice = true
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = true
            )
        )
        // Republishing matching (gen, rev) when local encrypted blob is missing (mtlsDisabled = false) succeeds
        assertTrue(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 0L,
                hasActiveBlob = false,
                incomingTransportRev = 2L,
                lastTransportRev = 2L,
                isMtlsNotice = false,
                mtlsDisabled = false
            )
        )
        // But when revoked (revokedGen == 5), matching (gen, rev) is still rejected
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = 5L,
                revokedGen = 5L,
                hasActiveBlob = false,
                incomingTransportRev = 2L,
                lastTransportRev = 2L,
                isMtlsNotice = false,
                mtlsDisabled = false
            )
        )

        // Failed credential commit rolls back mtlsDisabled = true so same-(gen, rev) direct save stays blocked
        val mTlsPrev = WearServerCredentialsStore.CredentialStoreRecord(
            ownerId = null,
            encryptedBlob = null,
            fingerprint = null,
            lastGeneration = 5L,
            writeId = 0L,
            lastTransportRevision = 2L,
            mtlsDisabled = true
        )
        val candidateDirect = WearServerCredentialsStore.CredentialStoreRecord(
            ownerId = "srv-1",
            encryptedBlob = "enc",
            fingerprint = "fp",
            lastGeneration = 5L,
            writeId = 1L,
            lastTransportRevision = 2L,
            mtlsDisabled = false
        )
        val (rolledBack, committedRollback) = WearServerCredentialsStore.resolveCredentialStateAfterCommit(
            previousCommitted = mTlsPrev,
            candidate = candidateDirect,
            commitSucceeded = false
        )
        assertFalse(committedRollback)
        assertTrue(rolledBack.mtlsDisabled)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptCredentialSave(
                incomingGeneration = 5L,
                lastSavedGen = rolledBack.lastGeneration,
                revokedGen = 0L,
                hasActiveBlob = rolledBack.encryptedBlob != null,
                incomingTransportRev = 2L,
                lastTransportRev = rolledBack.lastTransportRevision,
                isMtlsNotice = false,
                mtlsDisabled = rolledBack.mtlsDisabled
            )
        )

        // Round 5 Thread [2]: Committed mTLS notice (mtlsDisabled = true, lastSavedGen > 0) treats lastSavedGen as active
        // watermark against stale revocations (rev 5 rejected when lastSavedGen == 6), while rev 6 clears gen 6 and rev 5 clears gen 4.
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 5L,
                lastSavedGen = 6L,
                revokedGen = 0L,
                hasActiveBlob = false,
                mtlsDisabled = true
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 6L,
                lastSavedGen = 6L,
                revokedGen = 0L,
                hasActiveBlob = false,
                mtlsDisabled = true
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 5L,
                lastSavedGen = 4L,
                revokedGen = 0L,
                hasActiveBlob = false,
                mtlsDisabled = true
            )
        )

        // Round 5 Thread [3]: Late /sparky/context TYPE_DELETED scopes revocation to deletedContextGen (never null when creds are generation-bearing)
        val (revokeGen4, argGen4) = WearSessionManager.resolveContextDeleteRevocationGeneration(
            deletedContextGen = 4L,
            currentCredGen = 6L
        )
        assertTrue(revokeGen4)
        assertEquals(4L, argGen4)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = argGen4,
                lastSavedGen = 6L,
                revokedGen = 0L,
                hasActiveBlob = true
            )
        )
        val (revokeGenerationless, argGenerationless) = WearSessionManager.resolveContextDeleteRevocationGeneration(
            deletedContextGen = 0L,
            currentCredGen = 6L
        )
        assertFalse(revokeGenerationless)
        assertNull(argGenerationless)
        val (revokeLegacy, argLegacy) = WearSessionManager.resolveContextDeleteRevocationGeneration(
            deletedContextGen = 0L,
            currentCredGen = 0L
        )
        assertTrue(revokeLegacy)
        assertNull(argLegacy)

        // Failed gen-6 mTLS notice commit (lastSavedGen = 4, pendingUnpersistedMtlsGeneration = 6) rejects rev 5 and accepts rev 6
        val effectivePendingMtlsGen = maxOf(4L, 6L)
        assertFalse(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 5L,
                lastSavedGen = effectivePendingMtlsGen,
                revokedGen = 0L,
                hasActiveBlob = false,
                mtlsDisabled = true
            )
        )
        assertTrue(
            WearServerCredentialsStore.shouldAcceptRevocation(
                generation = 6L,
                lastSavedGen = effectivePendingMtlsGen,
                revokedGen = 0L,
                hasActiveBlob = false,
                mtlsDisabled = true
            )
        )
    }

    @Test
    fun fastingStartClientIdUuidAndCompletedReplayParity() {
        val validUuid = "550e8400-e29b-41d4-a716-446655440000"
        assertTrue(WearDirectApiClient.isValidUuid(validUuid))
        assertTrue(WearDirectApiClient.isValidUuid("  $validUuid  "))
        assertFalse(WearDirectApiClient.isValidUuid(""))
        assertFalse(WearDirectApiClient.isValidUuid("fast-123"))

        // buildFastStartRequestBody includes client_id only for valid UUIDs
        val withUuid = WearDirectApiClient.buildFastStartRequestBody(1_700_000_000_000L, 1_700_057_600_000L, "16:8 Leangains", validUuid)
        assertEquals(validUuid, withUuid.getString("client_id"))
        val withoutUuid = WearDirectApiClient.buildFastStartRequestBody(1_700_000_000_000L, 1_700_057_600_000L, "16:8 Leangains", "synthetic-id")
        assertFalse(withoutUuid.has("client_id"))

        // parseFastJson returns null to true for COMPLETED or ended fasts
        val completedJson = JSONObject()
            .put("id", "f-1")
            .put("start_time", "2026-11-26T00:00:00.000Z")
            .put("target_end_time", "2026-11-26T16:00:00.000Z")
            .put("fasting_type", "16:8 Leangains")
            .put("status", "COMPLETED")
            .toString()
        assertTrue(WearDirectApiClient.isCompletedFastJson(completedJson))
        assertEquals(null to true, WearDirectApiClient.parseFastJson(completedJson))

        val endedJson = JSONObject()
            .put("id", "f-2")
            .put("start_time", "2026-11-26T00:00:00.000Z")
            .put("end_time", "2026-11-26T10:00:00.000Z")
            .put("fasting_type", "16:8 Leangains")
            .toString()
        assertTrue(WearDirectApiClient.isCompletedFastJson(endedJson))
        assertEquals(null to true, WearDirectApiClient.parseFastJson(endedJson))

        // CANCELLED without end_time is terminal; ACTIVE with end_time remains active (matches /current)
        val cancelledJson = JSONObject()
            .put("id", "f-cancel")
            .put("start_time", "2026-11-26T00:00:00.000Z")
            .put("fasting_type", "16:8 Leangains")
            .put("status", "CANCELLED")
            .toString()
        assertTrue(WearDirectApiClient.isCompletedFastJson(cancelledJson))
        assertEquals(null to true, WearDirectApiClient.parseFastJson(cancelledJson))

        val activeWithEndTimeJson = JSONObject()
            .put("id", "f-active-end")
            .put("start_time", "2026-11-26T00:00:00.000Z")
            .put("end_time", "2026-11-26T10:00:00.000Z")
            .put("fasting_type", "16:8 Leangains")
            .put("status", "ACTIVE")
            .toString()
        assertFalse(WearDirectApiClient.isCompletedFastJson(activeWithEndTimeJson))
        val (parsedActiveWithEnd, activeWithEndKnown) = WearDirectApiClient.parseFastJson(activeWithEndTimeJson)
        assertTrue(activeWithEndKnown)
        assertEquals("f-active-end", parsedActiveWithEnd?.id)

        // Replaying an already-completed fast never revives it on the watch (re-fetches /api/fasting/current)
        val outcomeNull = WearDirectApiClient.resolveFastStartOutcome(
            startResBody = completedJson,
            fetchLatestCurrent = { "null" }
        )
        assertTrue(outcomeNull is DirectWriteOutcome.Applied)
        val appliedNull = outcomeNull as DirectWriteOutcome.Applied
        assertNull(appliedNull.fast)
        assertTrue(appliedNull.fastUpdated)
        assertEquals("terminal", appliedNull.fastStartOutcome)

        // Unreadable 2xx start body also queries /api/fasting/current instead of fabricating a timer
        val outcomeUnreadable = WearDirectApiClient.resolveFastStartOutcome(
            startResBody = null,
            fetchLatestCurrent = { "null" }
        )
        assertTrue(outcomeUnreadable is DirectWriteOutcome.Applied)
        val appliedUnreadable = outcomeUnreadable as DirectWriteOutcome.Applied
        assertNull(appliedUnreadable.fast)
        assertTrue(appliedUnreadable.fastUpdated)
        assertEquals("terminal", appliedUnreadable.fastStartOutcome)

        // Unreadable 2xx start body that re-fetches an unrelated active fast reports superseded
        val outcomeSuperseded = WearDirectApiClient.resolveFastStartOutcome(
            startResBody = null,
            clientId = validUuid,
            requestedStartedAtMs = 1_700_000_000_000L,
            fetchLatestCurrent = { activeWithEndTimeJson }
        )
        assertTrue(outcomeSuperseded is DirectWriteOutcome.Applied)
        assertEquals("superseded", (outcomeSuperseded as DirectWriteOutcome.Applied).fastStartOutcome)

        // Direct sync notice forwards fastStartOutcome and fastId when present
        val terminalNotice = WearSessionManager.buildDirectSyncNotice(
            domain = "fasting",
            ownerId = "srv-1",
            entryDate = null,
            clientId = validUuid,
            fastStartOutcome = "terminal"
        )
        assertEquals("terminal", terminalNotice.getString("fastStartOutcome"))
        assertFalse(terminalNotice.has("fastId"))

        val confirmedNotice = WearSessionManager.buildDirectSyncNotice(
            domain = "fasting",
            ownerId = "srv-1",
            entryDate = null,
            clientId = validUuid,
            fastStartOutcome = "confirmed",
            fastId = "fast-123"
        )
        assertEquals("confirmed", confirmedNotice.getString("fastStartOutcome"))
        assertEquals("fast-123", confirmedNotice.getString("fastId"))

        // Transient failure or invalid JSON on re-fetch falls back so the idempotent clientId stays persisted and retries
        val outcomeTransient = WearDirectApiClient.resolveFastStartOutcome(
            startResBody = endedJson,
            fetchLatestCurrent = { null }
        )
        assertEquals(DirectWriteOutcome.FallbackToPhone, outcomeTransient)

        val outcomeInvalid = WearDirectApiClient.resolveFastStartOutcome(
            startResBody = endedJson,
            fetchLatestCurrent = { "{}" }
        )
        assertEquals(DirectWriteOutcome.FallbackToPhone, outcomeInvalid)
    }
}
