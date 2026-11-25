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
        val strengthTile = TileModels.buildMedicationsTileModel(MedicationSnapshot(day = today, doses = listOf(er1500, tooLongStrength, mcgDose)))
        assertEquals("Extende\u20261500 mg", strengthTile.doseRows[0].name)
        assertTrue(strengthTile.doseRows[0].isDirectlyActionable)
        assertFalse(strengthTile.doseRows[1].isDirectlyActionable)
        assertEquals("ExampleM\u202610 mcg", strengthTile.doseRows[2].name)
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
}
