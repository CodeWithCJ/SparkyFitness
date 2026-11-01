package com.sparkyapps.sparkyfitness.wear

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Mirrors Apple Watch `ContextPayloadMapper` and `OutboundPayloads`, converting
 * between JSON wire payloads and domain types.
 */
object ContextPayloadMapper {

  /**
   * Parses an incoming phone-to-watch JSON context payload into a [WatchContext],
   * carrying forward sticky preferences from [previous] when omitted.
   */
  fun parseContext(obj: JSONObject, previous: WatchContext): WatchContext {
    val fastKnown = obj.optBoolean("fastKnown", false) || obj.has("fast")
    return WatchContext(
      today = obj.optStringOrNull("today"),
      todayWeightKg = obj.optDoubleOrNull("todayWeightKg"),
      todayBodyFatPercentage = obj.optDoubleOrNull("todayBodyFatPercentage"),
      lastWeightKg = obj.optDoubleOrNull("lastWeightKg"),
      lastBodyFatPercentage = obj.optDoubleOrNull("lastBodyFatPercentage"),
      lastEntryDate = obj.optStringOrNull("lastEntryDate"),
      history = parseHistory(obj.optJSONArray("history")),
      ackedClientIds = obj.optStringList("ackedClientIds"),
      failedClientIds = obj.optStringList("failedClientIds"),
      updatedAtMs = System.currentTimeMillis(),
      weightUnit = WeightUnit.fromRaw(obj.optStringOrNull("weightUnit")) ?: previous.weightUnit,
      nutrition = parseNutrition(obj),
      water = parseWater(obj),
      waterContainers = parseContainers(obj) ?: previous.waterContainers,
      waterGoalMl = obj.optDoubleOrNull("waterGoalMl") ?: previous.waterGoalMl,
      waterDisplayUnit = obj.optStringOrNull("waterDisplayUnit") ?: previous.waterDisplayUnit,
      generatedAtMs = obj.optDoubleOrNull("pushedAt")?.toLong(),
      hapticsEnabled = obj.optBooleanOrNull("hapticsEnabled") ?: previous.hapticsEnabled,
      restAlertsEnabled = obj.optBooleanOrNull("restAlertsEnabled") ?: previous.restAlertsEnabled,
      pageOrder = if (obj.has("pageOrder")) obj.optStringList("pageOrder") else previous.pageOrder,
      hiddenPages = if (obj.has("hiddenPages")) obj.optStringList("hiddenPages") else previous.hiddenPages,
      setInputStyle = obj.optStringOrNull("setInputStyle") ?: previous.setInputStyle,
      startableWorkouts = parseStartableWorkouts(obj) ?: previous.startableWorkouts,
      scheduledWorkouts = parseScheduledWorkouts(obj) ?: previous.scheduledWorkouts,
      suggestedExercises = parseSuggestedExercises(obj) ?: previous.suggestedExercises,
      workoutServerId = if (obj.has("workoutServerId")) obj.optStringOrNull("workoutServerId") else previous.workoutServerId,
      distanceUnit = obj.optStringOrNull("distanceUnit") ?: previous.distanceUnit,
      doubleTapEnabled = obj.optBooleanOrNull("doubleTapEnabled") ?: previous.doubleTapEnabled,
      rpeEnabled = obj.optBooleanOrNull("rpeEnabled") ?: previous.rpeEnabled,
      medications = parseMedications(obj),
      fast = if (fastKnown) parseFast(obj.optJSONObject("fast")) else previous.fast,
      fastSynced = if (fastKnown) true else previous.fastSynced,
      steps = parseSteps(obj.optJSONObject("steps")),
      stepGoal = obj.optIntOrNull("stepGoal") ?: previous.stepGoal,
      sleep = parseSleep(obj.optJSONObject("sleep")),
      exerciseSummary = parseExerciseSummary(obj.optJSONObject("exerciseSummary")),
      runVoiceCues = obj.optBooleanOrNull("runVoiceCues") ?: previous.runVoiceCues,
      runAutoPause = obj.optBooleanOrNull("runAutoPause") ?: previous.runAutoPause,
      runCheckInMinutes = obj.optIntOrNull("runCheckInMinutes") ?: previous.runCheckInMinutes,
      runPaceBand = WatchPaceBand.normalized(
        obj.optDoubleOrNull("runPaceMinSecondsPerKm"),
        obj.optDoubleOrNull("runPaceMaxSecondsPerKm")
      ) ?: previous.runPaceBand,
      runHeartRateBand = WatchHeartRateBand.normalized(
        obj.optDoubleOrNull("runHeartRateMinBpm"),
        obj.optDoubleOrNull("runHeartRateMaxBpm")
      ) ?: previous.runHeartRateBand,
      runPlans = parseRunPlans(obj) ?: previous.runPlans,
      indoorDistanceScale = parseIndoorScale(obj.optJSONObject("indoorDistanceScale"))
        ?: previous.indoorDistanceScale
    )
  }

  private fun parseHistory(arr: JSONArray?): List<HistoryPoint> {
    if (arr == null) return emptyList()
    val list = mutableListOf<HistoryPoint>()
    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      val day = item.optStringOrNull("day") ?: continue
      val weightKg = item.optDoubleOrNull("weightKg") ?: continue
      list.add(
        HistoryPoint(
          day = day,
          weightKg = weightKg,
          bodyFatPercentage = item.optDoubleOrNull("bodyFatPercentage")
        )
      )
    }
    return list
  }

  private fun parseNutrition(obj: JSONObject): NutritionSnapshot? {
    val consumed = obj.optDoubleOrNull("caloriesConsumed") ?: return null
    val burned = obj.optDoubleOrNull("caloriesBurned") ?: return null
    val remaining = obj.optDoubleOrNull("caloriesRemaining") ?: return null
    val day = obj.optStringOrNull("today") ?: CheckInDate.today()

    return NutritionSnapshot(
      day = day,
      caloriesConsumed = consumed,
      caloriesBurned = burned,
      caloriesRemaining = remaining,
      calorieProgress = obj.optDoubleOrNull("calorieGoalProgress") ?: 0.0,
      carbs = MacroGoal(
        consumed = obj.optDoubleOrNull("carbsConsumed") ?: 0.0,
        goal = obj.optDoubleOrNull("carbsGoal") ?: 0.0,
        progress = obj.optDoubleOrNull("carbsGoalProgress") ?: 0.0
      ),
      fat = MacroGoal(
        consumed = obj.optDoubleOrNull("fatConsumed") ?: 0.0,
        goal = obj.optDoubleOrNull("fatGoal") ?: 0.0,
        progress = obj.optDoubleOrNull("fatGoalProgress") ?: 0.0
      ),
      protein = MacroGoal(
        consumed = obj.optDoubleOrNull("proteinConsumed") ?: 0.0,
        goal = obj.optDoubleOrNull("proteinGoal") ?: 0.0,
        progress = obj.optDoubleOrNull("proteinGoalProgress") ?: 0.0
      ),
      rows = parseNutrientRows(obj)
    )
  }

  private fun parseNutrientRows(obj: JSONObject): List<NutrientRow>? {
    if (!obj.has("goalNutrients")) return null
    val arr = obj.optJSONArray("goalNutrients") ?: return null
    val out = mutableListOf<NutrientRow>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val key = row.optStringOrNull("key") ?: continue
      val label = row.optStringOrNull("label") ?: continue
      val consumed = row.optDoubleOrNull("consumed") ?: continue
      val goal = row.optDoubleOrNull("goal")?.takeIf { it > 0 }
      out.add(
        NutrientRow(
          key = key,
          label = label,
          unit = row.optStringOrNull("unit") ?: "",
          consumed = consumed,
          goal = goal,
          progress = row.optDoubleOrNull("progress") ?: 0.0
        )
      )
    }
    return out
  }

  private fun parseWater(obj: JSONObject): WaterSnapshot? {
    val consumedMl = obj.optDoubleOrNull("waterConsumedMl") ?: return null
    val day = obj.optStringOrNull("today") ?: CheckInDate.today()
    val logArr = obj.optJSONArray("waterLog")
    val log = mutableListOf<WaterLogEntry>()
    if (logArr != null) {
      for (i in 0 until logArr.length()) {
        val entry = logArr.optJSONObject(i) ?: continue
        val id = entry.optStringOrNull("id") ?: continue
        val name = entry.optStringOrNull("name") ?: continue
        val volumeMl = entry.optDoubleOrNull("volumeMl") ?: continue
        val time = entry.optStringOrNull("time") ?: continue
        log.add(WaterLogEntry(id = id, name = name, volumeMl = volumeMl, time = time))
      }
    }
    return WaterSnapshot(
      day = day,
      consumedMl = consumedMl,
      fromFoodMl = obj.optDoubleOrNull("waterFromFoodMl"),
      log = log
    )
  }

  private fun parseContainers(obj: JSONObject): List<WaterContainer>? {
    if (!obj.has("containers")) return null
    val arr = obj.optJSONArray("containers") ?: return null
    val out = mutableListOf<WaterContainer>()
    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      val id = item.optIntOrNull("id") ?: continue
      val name = item.optStringOrNull("name") ?: continue
      val servingVolumeMl = item.optDoubleOrNull("servingVolumeMl") ?: continue
      val unit = item.optStringOrNull("unit") ?: "ml"
      out.add(WaterContainer(id = id, name = name, servingVolumeMl = servingVolumeMl, unit = unit))
    }
    return out
  }

  private fun parseMedications(obj: JSONObject): MedicationSnapshot? {
    if (!obj.has("medications")) return null
    val arr = obj.optJSONArray("medications") ?: return null
    val day = obj.optStringOrNull("today") ?: CheckInDate.today()
    val doses = mutableListOf<MedicationDose>()
    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      val id = item.optStringOrNull("id") ?: continue
      val medicationId = item.optStringOrNull("medicationId") ?: continue
      val scheduleId = item.optStringOrNull("scheduleId") ?: continue
      val name = item.optStringOrNull("name") ?: continue
      val status = MedicationDoseStatus.fromRaw(item.optStringOrNull("status")) ?: continue
      doses.add(
        MedicationDose(
          id = id,
          medicationId = medicationId,
          scheduleId = scheduleId,
          name = name,
          detail = item.optStringOrNull("detail") ?: "",
          time = item.optStringOrNull("time") ?: "",
          status = status
        )
      )
    }
    return MedicationSnapshot(day = day, doses = doses)
  }

  private fun parseFast(obj: JSONObject?): WatchFast? {
    if (obj == null) return null
    val startedAt = obj.optDoubleOrNull("startedAt")?.toLong() ?: return null
    val targetEndAt = obj.optDoubleOrNull("targetEndAt")?.toLong()
    return WatchFast(
      startedAtMs = startedAt,
      targetEndAtMs = targetEndAt,
      label = obj.optStringOrNull("label")
    )
  }

  private fun parseSteps(obj: JSONObject?): StepsSnapshot? {
    if (obj == null) return null
    val day = obj.optStringOrNull("day") ?: return null
    val count = obj.optIntOrNull("count") ?: return null
    return StepsSnapshot(day = day, count = count)
  }

  /**
   * Parses the day's sleep summary snapshot from the context payload.
   */
  private fun parseSleep(obj: JSONObject?): SleepSnapshot? {
    if (obj == null) return null
    val day = obj.optStringOrNull("day") ?: return null
    val totalSeconds = obj.optIntOrNull("totalSeconds") ?: return null
    val timeInBedSeconds = obj.optIntOrNull("timeInBedSeconds") ?: totalSeconds
    return SleepSnapshot(
      day = day,
      totalSeconds = totalSeconds,
      timeInBedSeconds = timeInBedSeconds,
      sleepScore = obj.optIntOrNull("sleepScore"),
      bedtime = obj.optStringOrNull("bedtime") ?: "",
      wakeTime = obj.optStringOrNull("wakeTime") ?: "",
      deepSeconds = obj.optIntOrNull("deepSeconds"),
      remSeconds = obj.optIntOrNull("remSeconds"),
      lightSeconds = obj.optIntOrNull("lightSeconds"),
      awakeSeconds = obj.optIntOrNull("awakeSeconds"),
      restingHeartRate = obj.optIntOrNull("restingHeartRate"),
      hrvMs = obj.optIntOrNull("hrvMs"),
      spo2 = obj.optIntOrNull("spo2"),
      napCount = obj.optIntOrNull("napCount") ?: 0,
      napSeconds = obj.optIntOrNull("napSeconds") ?: 0
    )
  }

  /**
   * Parses the day's exercise summary and logged sessions from the context payload.
   */
  private fun parseExerciseSummary(obj: JSONObject?): ExerciseSummarySnapshot? {
    if (obj == null) return null
    val day = obj.optStringOrNull("day") ?: return null
    val minutes = obj.optIntOrNull("minutes") ?: 0
    val minutesGoal = obj.optIntOrNull("minutesGoal") ?: 0
    val calories = obj.optIntOrNull("calories") ?: 0
    val caloriesGoal = obj.optIntOrNull("caloriesGoal") ?: 0
    val sessionCount = obj.optIntOrNull("sessionCount") ?: 0
    val sessionsArr = obj.optJSONArray("sessions")
    val sessions = mutableListOf<ExerciseSessionItem>()
    if (sessionsArr != null) {
      for (i in 0 until sessionsArr.length()) {
        val row = sessionsArr.optJSONObject(i) ?: continue
        val name = row.optStringOrNull("name")?.takeIf { it.isNotEmpty() } ?: continue
        sessions.add(
          ExerciseSessionItem(
            name = name,
            durationMinutes = row.optIntOrNull("durationMinutes") ?: 0,
            calories = row.optIntOrNull("calories") ?: 0
          )
        )
      }
    }
    return ExerciseSummarySnapshot(
      day = day,
      minutes = minutes,
      minutesGoal = minutesGoal,
      calories = calories,
      caloriesGoal = caloriesGoal,
      sessionCount = sessionCount,
      sessions = sessions
    )
  }

  private fun parseStartableWorkouts(obj: JSONObject): List<StartableWorkout>? {
    if (!obj.has("startableWorkouts")) return null
    val arr = obj.optJSONArray("startableWorkouts") ?: return emptyList()
    val out = mutableListOf<StartableWorkout>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val presetId = row.optStringOrNull("presetId")?.takeIf { it.isNotEmpty() } ?: continue
      val name = row.optStringOrNull("name")?.takeIf { it.isNotEmpty() } ?: continue
      out.add(StartableWorkout(presetId = presetId, name = name))
    }
    return out
  }

  private fun parseScheduledWorkouts(obj: JSONObject): List<ScheduledWorkout>? {
    if (!obj.has("scheduledWorkouts")) return null
    val arr = obj.optJSONArray("scheduledWorkouts") ?: return emptyList()
    val out = mutableListOf<ScheduledWorkout>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val presetId = row.optStringOrNull("presetId")?.takeIf { it.isNotEmpty() } ?: continue
      val name = row.optStringOrNull("name")?.takeIf { it.isNotEmpty() } ?: continue
      out.add(
        ScheduledWorkout(
          presetId = presetId,
          name = name,
          planName = row.optStringOrNull("planName") ?: "",
          caption = row.optStringOrNull("caption") ?: ""
        )
      )
    }
    return out
  }

  private fun parseSuggestedExercises(obj: JSONObject): List<SuggestedExercise>? {
    if (!obj.has("suggestedExercises")) return null
    val arr = obj.optJSONArray("suggestedExercises") ?: return emptyList()
    val out = mutableListOf<SuggestedExercise>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      val exerciseId = row.optStringOrNull("exerciseId")?.takeIf { it.isNotEmpty() } ?: continue
      val name = row.optStringOrNull("name")?.takeIf { it.isNotEmpty() } ?: continue
      out.add(SuggestedExercise(exerciseId = exerciseId, name = name))
    }
    return out
  }

  private fun parseIndoorScale(obj: JSONObject?): IndoorDistanceScale? {
    if (obj == null) return null
    return IndoorDistanceScale(
      walk = obj.optDoubleOrNull("walk") ?: 1.0,
      run = obj.optDoubleOrNull("run") ?: 1.0
    )
  }

  private fun parseRunPlans(obj: JSONObject): List<WatchRunPlan>? {
    if (!obj.has("runPlans")) return null
    val arr = obj.optJSONArray("runPlans") ?: return emptyList()
    val out = mutableListOf<WatchRunPlan>()
    for (i in 0 until arr.length()) {
      val row = arr.optJSONObject(i) ?: continue
      parseRunPlan(row)?.let { out.add(it) }
    }
    return out
  }

  fun parseRunPlan(row: JSONObject): WatchRunPlan? {
    val id = row.optStringOrNull("id")?.takeIf { it.isNotEmpty() } ?: return null
    val name = row.optStringOrNull("name")?.takeIf { it.isNotEmpty() } ?: return null
    val stepsArr = row.optJSONArray("steps") ?: return null
    val steps = mutableListOf<WatchRunPlan.Step>()
    for (i in 0 until stepsArr.length()) {
      val s = stepsArr.optJSONObject(i) ?: continue
      val label = s.optStringOrNull("label") ?: continue
      val seconds = s.optDoubleOrNull("seconds")?.takeIf { it > 0 } ?: continue
      steps.add(
        WatchRunPlan.Step(
          label = label,
          seconds = seconds,
          pace = WatchPaceBand.normalized(s.optDoubleOrNull("paceMin"), s.optDoubleOrNull("paceMax")),
          heartRate = WatchHeartRateBand.normalized(s.optDoubleOrNull("hrMin"), s.optDoubleOrNull("hrMax")),
          meters = s.optDoubleOrNull("meters")?.takeIf { it > 0 },
          unit = if (s.optStringOrNull("unit") == "mi") "mi" else null
        )
      )
    }
    if (steps.isEmpty()) return null
    return WatchRunPlan(
      id = id,
      name = name,
      programId = row.optStringOrNull("programId"),
      programIndex = row.optIntOrNull("programIndex"),
      steps = steps,
      activity = row.optStringOrNull("activity"),
      startText = row.optStringOrNull("startText"),
      doneText = row.optStringOrNull("doneText")
    )
  }

  fun parseRunStartRequest(obj: JSONObject): WatchRunStartRequest? {
    val requestId = obj.optStringOrNull("requestId")?.takeIf { it.isNotEmpty() } ?: return null
    val kind = obj.optStringOrNull("kind")?.takeIf { it == "run" || it == "walk" } ?: return null
    val place = obj.optStringOrNull("place")?.takeIf { it == "indoor" || it == "outdoor" } ?: return null
    val requestedAtMs = obj.optDoubleOrNull("requestedAt")?.toLong() ?: System.currentTimeMillis()
    val plan = obj.optJSONObject("plan")?.let { parseRunPlan(it) }
    val autoPause = obj.optBooleanOrNull("autoPause")
    val voiceCues = obj.optBooleanOrNull("voiceCues")
    val settings = if (autoPause != null && voiceCues != null) {
      WatchRunSettings(
        autoPause = autoPause,
        voiceCues = voiceCues,
        paceBand = WatchPaceBand.normalized(obj.optDoubleOrNull("paceMin"), obj.optDoubleOrNull("paceMax")),
        heartRateBand = WatchHeartRateBand.normalized(obj.optDoubleOrNull("hrMin"), obj.optDoubleOrNull("hrMax")),
        checkInMinutes = obj.optIntOrNull("checkInMinutes")
      )
    } else null
    return WatchRunStartRequest(
      requestId = requestId,
      kind = kind,
      place = place,
      requestedAtMs = requestedAtMs,
      plan = plan,
      settings = settings
    )
  }

  fun parseWorkoutPlan(obj: JSONObject, allowEmpty: Boolean = false): ActiveWorkoutPlan? {
    val sessionId = obj.optStringOrNull("sessionId") ?: return null
    val workoutName = obj.optStringOrNull("workoutName") ?: return null
    val exArr = obj.optJSONArray("exercises") ?: return null
    val exercises = mutableListOf<PlannedExercise>()
    for (i in 0 until exArr.length()) {
      val rawEx = exArr.optJSONObject(i) ?: continue
      val exerciseEntryId = rawEx.optStringOrNull("exerciseEntryId") ?: continue
      val name = rawEx.optStringOrNull("name") ?: continue
      val rawSets = rawEx.optJSONArray("sets") ?: continue
      val sets = mutableListOf<PlannedSet>()
      for (j in 0 until rawSets.length()) {
        val rawSet = rawSets.optJSONObject(j) ?: continue
        val setId = rawSet.optStringOrNull("setId") ?: continue
        sets.add(
          PlannedSet(
            setId = setId,
            targetReps = rawSet.optDoubleOrNull("targetReps"),
            targetWeightKg = rawSet.optDoubleOrNull("targetWeightKg"),
            restSeconds = rawSet.optIntOrNull("restSeconds") ?: 60,
            setType = rawSet.optStringOrNull("setType"),
            targetDurationSec = rawSet.optIntOrNull("targetDurationSec"),
            previousDurationSec = rawSet.optIntOrNull("previousDurationSec"),
            timed = rawSet.optBooleanOrNull("timed"),
            carry = rawSet.optBooleanOrNull("carry"),
            targetDistanceKm = rawSet.optDoubleOrNull("targetDistanceKm"),
            weighted = rawSet.optBooleanOrNull("weighted")
          )
        )
      }
      exercises.add(
        PlannedExercise(
          exerciseEntryId = exerciseEntryId,
          name = name,
          supersetRun = rawEx.optIntOrNull("supersetRun"),
          bodyweight = rawEx.optBooleanOrNull("bodyweight"),
          sets = sets
        )
      )
    }
    if (exercises.isEmpty() && !(allowEmpty && exArr.length() == 0)) return null
    return ActiveWorkoutPlan(
      sessionId = sessionId,
      workoutName = workoutName,
      exercises = exercises,
      setOrder = obj.optStringList("setOrder"),
      workoutFormat = obj.optStringOrNull("workoutFormat"),
      timeCapSeconds = obj.optIntOrNull("timeCapSeconds"),
      startedAtMs = parseIsoMs(obj.optStringOrNull("startedAt")),
      armedAtMs = parseIsoMs(obj.optStringOrNull("armedAt")),
      capEndsAtMs = parseIsoMs(obj.optStringOrNull("capEndsAt")),
      fromPreset = obj.optBooleanOrNull("fromPreset"),
      pausedAtMs = parseIsoMs(obj.optStringOrNull("pausedAt")),
      excludedPauseSeconds = obj.optIntOrNull("excludedPauseSeconds") ?: 0,
      prSetIds = obj.optStringList("prSetIds").toSet()
    )
  }

  fun parseIntervalTiming(obj: JSONObject): IntervalTimingUpdate? {
    val sessionId = obj.optStringOrNull("sessionId") ?: return null
    return IntervalTimingUpdate(
      sessionId = sessionId,
      armedAtMs = parseIsoMs(obj.optStringOrNull("armedAt")),
      capEndsAtMs = parseIsoMs(obj.optStringOrNull("capEndsAt")),
      pausedAtMs = parseIsoMs(obj.optStringOrNull("pausedAt")),
      excludedPauseSeconds = obj.optIntOrNull("excludedPauseSeconds") ?: 0
    )
  }

  data class SetTargetsUpdate(
    val sessionId: String,
    val revision: Double,
    val targets: Map<String, SetValues>,
    val completedSetIds: Set<String>,
    val rest: PhoneRest?,
    val armedAtMs: Long?,
    val prSetIds: Set<String>,
    val setTimers: Map<String, Long>
  )

  fun parseSetTargets(obj: JSONObject): SetTargetsUpdate? {
    val sessionId = obj.optStringOrNull("sessionId") ?: return null
    val revision = obj.optDoubleOrNull("revision") ?: return null
    val rawTargets = obj.optJSONArray("targets") ?: return null
    val targets = mutableMapOf<String, SetValues>()
    for (i in 0 until rawTargets.length()) {
      val raw = rawTargets.optJSONObject(i) ?: continue
      val setId = raw.optStringOrNull("setId") ?: continue
      targets[setId] = SetValues(
        weightKg = raw.optDoubleOrNull("targetWeightKg"),
        reps = raw.optDoubleOrNull("targetReps"),
        durationSec = raw.optIntOrNull("targetDurationSec"),
        previousDurationSec = raw.optIntOrNull("previousDurationSec"),
        distanceKm = raw.optDoubleOrNull("targetDistanceKm")
      )
    }
    val completed = obj.optStringList("completedSetIds").toSet()
    val prSetIds = obj.optStringList("prSetIds").toSet()
    val endsAt = obj.optDoubleOrNull("restEndsAt")?.toLong()
    val rest: PhoneRest? = when (obj.optStringOrNull("restState")) {
      "resting" -> endsAt?.let { PhoneRest.Resting(it, obj.optIntOrNull("restDurationSeconds") ?: 60) }
      "paused" -> PhoneRest.Paused
      "ready" -> PhoneRest.Ready
      else -> endsAt?.let { PhoneRest.Resting(it, obj.optIntOrNull("restDurationSeconds") ?: 60) }
    }
    val timers = mutableMapOf<String, Long>()
    val timersObj = obj.optJSONObject("setTimers")
    if (timersObj != null) {
      val keys = timersObj.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        timersObj.optDoubleOrNull(k)?.toLong()?.let { timers[k] = it }
      }
    }
    return SetTargetsUpdate(
      sessionId = sessionId,
      revision = revision,
      targets = targets,
      completedSetIds = completed,
      rest = rest,
      armedAtMs = obj.optDoubleOrNull("armedAt")?.toLong(),
      prSetIds = prSetIds,
      setTimers = timers
    )
  }

  fun parseRecordingState(obj: JSONObject): RecordingState? {
    val sessionId = obj.optStringOrNull("sessionId") ?: return null
    val status = obj.optStringOrNull("status") ?: return null
    val sentAt = obj.optDoubleOrNull("sentAt") ?: 0.0
    if (status == "ended") {
      return RecordingState(
        sessionId = sessionId,
        activity = obj.optStringOrNull("activity") ?: "run",
        indoor = obj.optBooleanOrNull("indoor") ?: false,
        status = "ended",
        startedAtMs = 0L,
        pausedMs = 0.0,
        pausedAtMs = null,
        distanceMeters = 0.0,
        paceSeconds = null,
        usesMiles = false,
        sentAtMs = sentAt,
        lapCount = 0,
        interval = null
      )
    }
    val activity = obj.optStringOrNull("activity") ?: return null
    val startedAtMs = obj.optDoubleOrNull("startedAt")?.toLong() ?: return null
    val intervalIndex = obj.optDoubleOrNull("intervalIndex")
    val intervalLabel = obj.optStringOrNull("intervalLabel")
    val intervalRemaining = obj.optDoubleOrNull("intervalRemaining")
    val interval = if (intervalIndex != null && intervalLabel != null && intervalRemaining != null) {
      IntervalStep(
        index = intervalIndex.toInt(),
        label = intervalLabel,
        remaining = intervalRemaining,
        next = obj.optStringOrNull("intervalNext")
      )
    } else null

    return RecordingState(
      sessionId = sessionId,
      activity = activity,
      indoor = obj.optBooleanOrNull("indoor") ?: false,
      status = status,
      startedAtMs = startedAtMs,
      pausedMs = obj.optDoubleOrNull("pausedMs") ?: 0.0,
      pausedAtMs = obj.optDoubleOrNull("pausedAt")?.toLong(),
      distanceMeters = obj.optDoubleOrNull("distanceMeters") ?: 0.0,
      paceSeconds = obj.optDoubleOrNull("paceSeconds"),
      usesMiles = obj.optStringOrNull("distanceUnit") == "mi",
      sentAtMs = sentAt,
      lapCount = obj.optIntOrNull("lapCount") ?: 0,
      interval = interval
    )
  }

  fun parseIsoMs(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")) {
      try {
        val sdf = SimpleDateFormat(pattern, Locale.US).apply {
          timeZone = TimeZone.getTimeZone("UTC")
        }
        val date = sdf.parse(iso)
        if (date != null) return date.time
      } catch (_: Throwable) {}
    }
    return null
  }

  fun formatIso(ms: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    return sdf.format(Date(ms))
  }
}

object OutboundPayloads {
  fun checkIn(checkIn: CheckIn, ownerId: String? = null): JSONObject = JSONObject().apply {
    put("type", "checkIn")
    put("clientId", checkIn.id)
    put("entryDate", checkIn.entryDate)
    put("weightKg", checkIn.weightKg)
    if (checkIn.bodyFatPercentage != null) {
      put("bodyFatPercentage", checkIn.bodyFatPercentage)
    }
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun waterTap(
    clientId: String,
    entryDate: String,
    containerId: Int,
    ownerId: String? = null
  ): JSONObject = JSONObject().apply {
    put("type", "waterIntake")
    put("clientId", clientId)
    put("entryDate", entryDate)
    put("containerId", containerId)
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun waterDelete(
    clientId: String,
    entryId: String,
    ownerId: String? = null
  ): JSONObject = JSONObject().apply {
    put("type", "waterDelete")
    put("clientId", clientId)
    put("entryId", entryId)
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun medicationTaken(
    clientId: String,
    entryDate: String,
    medicationId: String,
    scheduleId: String,
    taken: Boolean,
    ownerId: String? = null
  ): JSONObject = JSONObject().apply {
    put("type", "medicationTaken")
    put("clientId", clientId)
    put("entryDate", entryDate)
    put("medicationId", medicationId)
    put("scheduleId", scheduleId)
    put("taken", taken)
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun fastStart(presetId: String, clientId: String, ownerId: String? = null): JSONObject = JSONObject().apply {
    put("type", "fastStart")
    put("presetId", presetId)
    put("clientId", clientId)
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun fastEnd(clientId: String, ownerId: String? = null): JSONObject = JSONObject().apply {
    put("type", "fastEnd")
    put("clientId", clientId)
    if (!ownerId.isNullOrEmpty()) put("ownerId", ownerId)
  }

  fun contextRequest(): JSONObject = JSONObject().apply {
    put("type", "requestContext")
  }

  fun workoutStartRequest(presetId: String, serverId: String?): JSONObject = JSONObject().apply {
    put("type", "workoutStartRequested")
    put("presetId", presetId)
    if (!serverId.isNullOrEmpty()) {
      put("serverId", serverId)
    }
  }

  fun workoutEdit(sessionId: String, clientId: String, action: WorkoutEditAction): JSONObject =
    JSONObject().apply {
      put("type", "workoutEdit")
      put("sessionId", sessionId)
      put("clientId", clientId)
      when (action) {
        is WorkoutEditAction.AddSet -> {
          put("action", "addSet")
          put("exerciseEntryId", action.exerciseEntryId)
        }
        is WorkoutEditAction.DeleteSet -> {
          put("action", "deleteSet")
          put("setId", action.setId)
        }
        is WorkoutEditAction.SetSetType -> {
          put("action", "setSetType")
          put("setId", action.setId)
          put("setType", action.type)
        }
        is WorkoutEditAction.AddExercise -> {
          put("action", "addExercise")
          put("exerciseId", action.exerciseId)
        }
        is WorkoutEditAction.DeleteExercise -> {
          put("action", "deleteExercise")
          put("exerciseEntryId", action.exerciseEntryId)
        }
      }
    }

  fun presetUpdateAnswer(sessionId: String, update: Boolean): JSONObject = JSONObject().apply {
    put("type", "presetUpdateAnswer")
    put("sessionId", sessionId)
    put("update", update)
  }

  fun setCompleted(completed: CompletedSet): JSONObject = JSONObject().apply {
    put("type", "setCompleted")
    put("clientId", completed.clientId)
    put("sessionId", completed.sessionId)
    put("setId", completed.setId)
    completed.weightKg?.let { put("weightKg", it) }
    completed.reps?.let { put("reps", it) }
    completed.duration?.let { put("duration", it) }
    completed.distanceKm?.let { put("distanceKm", it) }
    completed.rpe?.let { put("rpe", it) }
    put("completedAt", ContextPayloadMapper.formatIso(completed.completedAtMs))
  }

  fun setUncompleted(clientId: String, sessionId: String, setId: String): JSONObject =
    JSONObject().apply {
      put("type", "setUncompleted")
      put("clientId", clientId)
      put("sessionId", sessionId)
      put("setId", setId)
    }

  fun restChanged(sessionId: String, previousEndsAtMs: Long, endsAtMs: Long?): JSONObject =
    JSONObject().apply {
      put("type", "restChanged")
      put("sessionId", sessionId)
      put("previousEndsAt", previousEndsAtMs.toDouble())
      if (endsAtMs != null) {
        put("endsAt", endsAtMs.toDouble())
      }
    }

  fun setTimerStarted(sessionId: String, setId: String, startedAtMs: Long, armedAtMs: Long?): JSONObject =
    JSONObject().apply {
      put("type", "setTimerStarted")
      put("sessionId", sessionId)
      put("setId", setId)
      put("startedAt", startedAtMs.toDouble())
      armedAtMs?.let { put("armedAt", it.toDouble()) }
    }

  fun setTimerStopped(sessionId: String, setId: String, seconds: Int, startedAtMs: Long): JSONObject =
    JSONObject().apply {
      put("type", "setTimerStopped")
      put("sessionId", sessionId)
      put("setId", setId)
      put("seconds", seconds)
      put("startedAt", startedAtMs.toDouble())
    }

  fun workoutStop(sessionId: String): JSONObject = JSONObject().apply {
    put("type", "workoutStop")
    put("sessionId", sessionId)
  }

  fun workoutDiscard(sessionId: String, armedAtMs: Long?): JSONObject = JSONObject().apply {
    put("type", "workoutDiscard")
    put("sessionId", sessionId)
    armedAtMs?.let { put("armedAt", it.toDouble()) }
  }

  fun liveHeartRate(sessionId: String, exerciseEntryId: String, bpm: Double, atMs: Long): JSONObject =
    JSONObject().apply {
      put("type", "liveHeartRate")
      put("sessionId", sessionId)
      put("exerciseEntryId", exerciseEntryId)
      put("bpm", bpm)
      put("at", atMs.toDouble())
    }

  fun heartRateBatch(batch: HeartRateBatch): JSONObject = JSONObject().apply {
    put("type", "heartRateBatch")
    put("clientId", batch.clientId)
    put("sessionId", batch.sessionId)
    put("exerciseEntryId", batch.exerciseEntryId)
    val arr = JSONArray()
    for (s in batch.samples) {
      arr.put(JSONObject().put("t", s.t).put("bpm", s.bpm))
    }
    put("samples", arr)
    batch.activeEnergyKcal?.let { put("activeEnergyKcal", it) }
    batch.durationMinutes?.takeIf { it > 0 }?.let { put("durationMinutes", it) }
  }

  fun recordingControl(sessionId: String, action: String, atMs: Long = System.currentTimeMillis()): JSONObject =
    JSONObject().apply {
      put("type", "recordingControl")
      put("sessionId", sessionId)
      put("action", action)
      put("at", atMs.toDouble())
    }

  fun recordingHeartRate(sessionId: String, clientId: String, samples: List<HeartRateSample>): JSONObject =
    JSONObject().apply {
      put("type", "recordingHeartRate")
      put("sessionId", sessionId)
      put("clientId", clientId)
      val arr = JSONArray()
      for (s in samples) {
        arr.put(JSONObject().put("t", s.t).put("bpm", s.bpm))
      }
      put("samples", arr)
    }

  fun runLive(
    runId: String,
    kind: String,
    place: String,
    status: String,
    autoPaused: Boolean,
    settings: WatchRunSettings,
    paceAlert: Boolean,
    heartRateAlert: Boolean,
    elapsed: Double,
    distanceMeters: Double,
    heartRate: Double?,
    energyKcal: Double,
    lapCount: Int,
    stepLabel: String?,
    stepRemaining: Double?,
    nextLabel: String?,
    requestId: String?
  ): JSONObject = JSONObject().apply {
    put("type", "runLive")
    put("runId", runId)
    put("kind", kind)
    put("place", place)
    put("status", status)
    put("autoPaused", autoPaused)
    put("autoPause", settings.autoPause)
    put("voiceCues", settings.voiceCues)
    put("paceAlert", paceAlert)
    put("heartRateAlert", heartRateAlert)
    put("elapsed", elapsed)
    put("distanceMeters", distanceMeters)
    put("energyKcal", energyKcal)
    put("lapCount", lapCount)
    put("sentAt", System.currentTimeMillis().toDouble())
    heartRate?.let { put("heartRate", it) }
    stepLabel?.let { put("stepLabel", it) }
    stepRemaining?.let { put("stepRemaining", it) }
    nextLabel?.let { put("nextLabel", it) }
    requestId?.let { put("requestId", it) }
  }

  fun runFinished(result: WatchRunResult): JSONObject = JSONObject().apply {
    put("type", "runFinished")
    put("clientId", result.clientId)
    put("kind", result.kind)
    put("place", result.place)
    put("startedAt", result.startedAtMs.toDouble())
    put("endedAt", result.endedAtMs.toDouble())
    put("activeSeconds", result.activeSeconds)
    put("distanceMeters", result.distanceMeters)
    put("activeEnergyKcal", result.activeEnergyKcal)
    put("route", JSONArray(result.route.map { JSONArray(it) }))
    put("heartRate", JSONArray(result.heartRate.map { JSONArray(it) }))
    put("laps", JSONArray(result.laps))
    put("lapDistances", JSONArray(result.lapDistances))
    put("distanceSeries", JSONArray(result.distanceSeries.map { JSONArray(it) }))
    put("planCompleted", result.planCompleted)
    put("distanceScale", result.distanceScale)
    result.estimatedDistanceMeters?.let { put("estimatedDistanceMeters", it) }
    result.plan?.let { plan ->
      put("planId", plan.id)
      if (plan.programId != null && plan.programIndex != null) {
        put("programId", plan.programId)
        put("programIndex", plan.programIndex)
      }
    }
  }

  fun runCue(id: String, text: String, atMs: Long = System.currentTimeMillis()): JSONObject =
    JSONObject().apply {
      put("type", "runCue")
      put("id", id)
      put("text", text)
      put("at", atMs.toDouble())
    }
}

// ---- JSONObject Extensions ----

internal fun JSONObject.optStringOrNull(key: String): String? {
  if (!has(key) || isNull(key)) return null
  return optString(key).takeIf { it.isNotEmpty() || opt(key) is String }
}

internal fun JSONObject.optDoubleOrNull(key: String): Double? {
  if (!has(key) || isNull(key)) return null
  val v = optDouble(key)
  return if (v.isNaN() || v.isInfinite()) null else v
}

internal fun JSONObject.optIntOrNull(key: String): Int? {
  if (!has(key) || isNull(key)) return null
  val d = optDoubleOrNull(key) ?: return null
  return d.toInt()
}

internal fun JSONObject.optBooleanOrNull(key: String): Boolean? {
  if (!has(key) || isNull(key)) return null
  return when (val raw = opt(key)) {
    is Boolean -> raw
    is Number -> raw.toInt() != 0
    is String -> raw.equals("true", ignoreCase = true)
    else -> null
  }
}

internal fun JSONObject.optStringList(key: String): List<String> {
  val arr = optJSONArray(key) ?: return emptyList()
  val list = mutableListOf<String>()
  for (i in 0 until arr.length()) {
    val s = arr.optString(i)
    if (!s.isNullOrEmpty()) list.add(s)
  }
  return list
}
