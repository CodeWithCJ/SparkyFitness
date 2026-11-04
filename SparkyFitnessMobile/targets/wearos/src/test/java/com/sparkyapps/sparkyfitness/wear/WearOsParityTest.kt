package com.sparkyapps.sparkyfitness.wear

import androidx.compose.ui.graphics.toArgb
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

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

        val sleepTile = TileModels.buildSleepTileModel(ctx.sleep)
        assertTrue(sleepTile.hasData)
        assertEquals("7h 45m", sleepTile.durationText)
        assertEquals("Score 86", sleepTile.scoreText)
        assertEquals("11:00 PM – 6:45 AM", sleepTile.windowText)
        assertEquals(3, sleepTile.stages.size)
        assertEquals("RHR 54bpm · HRV 64ms", sleepTile.biometricsText)

        val medsTile = TileModels.buildMedicationsTileModel(ctx.medications)
        assertTrue(medsTile.hasData)
        assertEquals(1, medsTile.takenCount)
        assertEquals(2, medsTile.totalCount)
        assertEquals(1, medsTile.pendingCount)
        assertEquals("1 / 2 Taken", medsTile.headlineText)
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
        assertEquals("45m · 380/500 kcal", exerciseTile.headlineText)
        assertEquals("Upper Body Push", exerciseTile.rows[0].title)
    }
}
