package com.sparkyapps.sparkyfitness.wear

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * The bar and plates a person owns, as sent by the phone on a barbell exercise
 * (`WatchPlateConfigPayload` in `modules/watch-connectivity`).
 */
data class WatchPlateConfig(
  /** "kg" or "lbs": the unit of every weight below. A set's weight is stored in kg. */
  val unit: String,
  val barWeight: Double,
  /** Weight of one collar; 0 when collars are off. */
  val collarWeight: Double,
  /** Pairs owned of each plate weight. */
  val plates: List<Plate>
) {
  data class Plate(
    val weight: Double,
    val pairs: Int
  )
}

/**
 * A weight shown or edited on the watch. Set weights travel and are stored in
 * kg (server keeps 2 decimals), so 105 lb arrives as 47.63 kg (105.011 lb).
 * Rounding to 0.1 lb or 0.01 kg matches the phone's `storedWeightInUnit` and
 * ensures the plate calculator solves the exact weight loaded.
 */
object WeightRounding {
  const val KG_PER_LB = 0.45359237

  fun displayed(kg: Double, lbs: Boolean): Double {
    val value = if (lbs) kg / KG_PER_LB else kg
    val factor = if (lbs) 10.0 else 100.0
    return round(value * factor) / factor
  }
}

/**
 * Bounded-knapsack plate calculator matching `WatchPlates.swift` and
 * `shared/src/utils/plateCalculator.ts`: finds the fewest plates per side
 * (heaviest first) from the owned inventory, or the nearest loadable weights
 * below and above when exact loading is impossible.
 */
object WatchPlates {
  data class Count(
    val weight: Double,
    val count: Int
  )

  data class Load(
    val plates: List<Count>,
    val perSide: Double,
    /** Bar, collars, and both sides, in the config's unit. */
    val total: Double
  )

  sealed class Result {
    data class Exact(val load: Load) : Result()
    data class Inexact(val below: Load?, val above: Load?) : Result()
    data object Invalid : Result()
  }

  private const val SCALE = 1000.0
  private const val NOT_REACHABLE = 0xFFFF
  private const val MAX_SEARCH_CELLS = 4_000_000L
  private const val EXACT_NOISE = 1e-9
  private const val MAX_TARGET_KG = 1000.0
  private const val MAX_CONFIG_WEIGHT = 10_000.0
  private const val MAX_PAIRS = 1000
  private const val MAX_UNITS = Int.MAX_VALUE.toLong()

  fun inUnit(kg: Double, config: WatchPlateConfig): Double =
    WeightRounding.displayed(kg = kg, lbs = config.unit == "lbs")

  fun toKg(value: Double, config: WatchPlateConfig): Double =
    if (config.unit == "lbs") value * WeightRounding.KG_PER_LB else value

  fun calculate(targetKg: Double, config: WatchPlateConfig): Result =
    calculateInternal(target = inUnit(targetKg, config), targetKg = targetKg, config = config)

  private fun calculateInternal(target: Double, targetKg: Double, config: WatchPlateConfig): Result {
    if (!targetKg.isFinite() || targetKg <= 0.0 || targetKg > MAX_TARGET_KG ||
      !target.isFinite() || target <= 0.0 ||
      !config.barWeight.isFinite() || !config.collarWeight.isFinite() ||
      config.barWeight < 0.0 || config.barWeight > MAX_CONFIG_WEIGHT ||
      config.collarWeight < 0.0 || config.collarWeight > MAX_CONFIG_WEIGHT
    ) {
      return Result.Invalid
    }

    val merged = HashMap<Int, Int>()
    for (plate in config.plates) {
      if (!plate.weight.isFinite() || plate.weight <= 0.0 || plate.pairs <= 0) continue
      if (plate.weight > MAX_CONFIG_WEIGHT) return Result.Invalid
      val units = round(plate.weight * SCALE).toInt()
      if (units <= 0) continue
      val clampedPairs = min(plate.pairs, MAX_PAIRS)
      merged[units] = min((merged[units] ?: 0) + clampedPairs, MAX_PAIRS)
    }
    val kinds = merged.entries
      .map { it.key to min(it.value, MAX_PAIRS) }
      .sortedByDescending { it.first }

    val fixed = round(config.barWeight * SCALE) + 2.0 * round(config.collarWeight * SCALE)
    val side = (target * SCALE - fixed) / 2.0
    val step = kinds.fold(0) { acc, (units, _) -> gcd(acc, units) }.let { if (it == 0) 1 else it }

    var maxSide = 0L
    for ((units, pairs) in kinds) {
      val product = units.toLong() * pairs.toLong()
      maxSide += product
      if (maxSide > MAX_UNITS) return Result.Invalid
    }
    val heaviest = kinds.firstOrNull()?.first?.toLong() ?: 0L
    val capLong = min(maxSide, max(0L, ceil(side).toLong()) + heaviest)
    if (capLong < 0L || capLong > MAX_UNITS) return Result.Invalid
    val cellsLong = capLong / step.toLong() + 1L
    val denomCount = max(kinds.size, 1).toLong()
    if (cellsLong <= 0L || cellsLong > Int.MAX_VALUE || cellsLong * denomCount > MAX_SEARCH_CELLS) {
      return Result.Invalid
    }
    val cells = cellsLong.toInt()
    val scaledKinds = kinds.map { (units, pairs) -> (units / step) to pairs }
    val table = fewestPlates(scaledKinds, cells)

    fun reachable(cell: Int): Boolean = cell in 0 until cells && table[0][cell] != NOT_REACHABLE

    fun load(cell: Int): Load {
      val plates = platesFor(cell, scaledKinds, table).map { (u, c) ->
        Count(weight = (u.toLong() * step.toLong()).toDouble() / SCALE, count = c)
      }
      val perSideUnits = (cell.toLong() * step.toLong()).toDouble()
      return Load(
        plates = plates,
        perSide = perSideUnits / SCALE,
        total = (fixed + 2.0 * perSideUnits) / SCALE
      )
    }

    val near = round(side)
    if (abs(side - near) < EXACT_NOISE && near >= 0.0) {
      val nearLong = near.toLong()
      if (nearLong % step.toLong() == 0L) {
        val exactCell = (nearLong / step.toLong()).toInt()
        if (reachable(exactCell)) return Result.Exact(load(exactCell))
      }
    }

    var below: Load? = null
    if (side >= 0.0) {
      var cell = min(floor(side / step.toDouble()).toInt(), cells - 1)
      while (cell >= 0 && !reachable(cell)) cell -= 1
      if (cell >= 0) below = load(cell)
    }

    var above: Load? = null
    var cell = max(ceil(side / step.toDouble()).toInt(), 0)
    while (cell < cells && !reachable(cell)) cell += 1
    if (cell < cells) above = load(cell)

    return Result.Inexact(below = below, above = above)
  }

  /**
   * Nearest loadable total strictly above (`up = true`) or below (`up = false`)
   * [targetKg], returned in kg; null past the lightest or heaviest loadable weight.
   */
  fun nextLoadable(fromKg: Double, up: Boolean, config: WatchPlateConfig): Double? {
    if (!fromKg.isFinite() || fromKg > MAX_TARGET_KG) return null
    val probe = inUnit(fromKg, config) + if (up) 0.0005 else -0.0005
    if (probe <= 0.0) return null
    val res = calculateInternal(target = probe, targetKg = toKg(probe, config), config = config)
    val load = when (res) {
      is Result.Inexact -> if (up) res.above else res.below
      else -> null
    } ?: return null
    return toKg(load.total, config)
  }

  /** "20+10+1.25": each plate on one side, repeated by count. */
  fun summary(plates: List<Count>): String =
    plates.flatMap { count -> List(count.count) { number(count.weight) } }.joinToString("+")

  /** "20 · 10 · 1.25": spaced plate list for the calculator caption. */
  fun captionList(plates: List<Count>): String =
    plates.flatMap { count -> List(count.count) { number(count.weight) } }.joinToString(" · ")

  /** Formats 20, 1.25, 0.5 without trailing zeros. */
  fun number(value: Double): String {
    val text = String.format(java.util.Locale.US, "%.3f", value)
    return text.replace(Regex("\\.?0+$"), "")
  }

  private fun fewestPlates(kinds: List<Pair<Int, Int>>, cells: Int): Array<IntArray> {
    val table = Array(kinds.size + 1) { IntArray(cells) { NOT_REACHABLE } }
    table[kinds.size][0] = 0
    for (i in kinds.size - 1 downTo 0) {
      val (units, pairs) = kinds[i]
      val nextRow = table[i + 1]
      val curRow = table[i]
      for (sum in 0 until cells) {
        var best = NOT_REACHABLE
        for (k in 0..pairs) {
          val from = sum - k * units
          if (from < 0) break
          val rest = nextRow[from]
          if (rest != NOT_REACHABLE && rest + k < best) {
            best = rest + k
          }
        }
        curRow[sum] = best
      }
    }
    return table
  }

  private fun platesFor(
    cell: Int,
    kinds: List<Pair<Int, Int>>,
    table: Array<IntArray>
  ): List<Pair<Int, Int>> {
    val out = mutableListOf<Pair<Int, Int>>()
    var rest = cell
    for (i in kinds.indices) {
      val (units, pairs) = kinds[i]
      val need = table[i][rest]
      var k = min(pairs, if (units > 0) rest / units else 0)
      while (k >= 0) {
        val after = table[i + 1][rest - k * units]
        if (after != NOT_REACHABLE && after + k == need) {
          if (k > 0) out.add(units to k)
          rest -= k * units
          break
        }
        k -= 1
      }
    }
    return out
  }

  private fun gcd(a: Int, b: Int): Int {
    var x = abs(a)
    var y = abs(b)
    while (y != 0) {
      val t = x % y
      x = y
      y = t
    }
    return x
  }
}

/**
 * Facts needed by [RestRule] for one set in the running order.
 */
data class RestStepFacts(
  val exerciseEntryId: String,
  val supersetRun: Int?,
  /** 1-based position within its own exercise. */
  val setNumber: Int,
  val isDrop: Boolean,
  /** The set's own rest (`PlannedSet.restAfterSeconds`); null from an older phone. */
  val ownRestSeconds: Int?,
  /** The phone's rest before this set (`PlannedSet.restSeconds`). */
  val restBeforeSeconds: Int
)

/**
 * Mirrors `RestRule.swift` and `restSecBeforeNextSet` in `activeWorkoutStore.ts`:
 * - 0 when the next set is a drop set;
 * - 0 when the next set is another member of the same superset run in the same round;
 * - otherwise the completed set's own rest (`ownRestSeconds`), falling back to
 *   `next.restBeforeSeconds` when an older phone omitted `restAfterSeconds`.
 */
object RestRule {
  fun restAfter(completed: RestStepFacts, next: RestStepFacts): Int {
    val own = completed.ownRestSeconds ?: return next.restBeforeSeconds
    if (next.isDrop) return 0
    val run = next.supersetRun
    if (run != null &&
      completed.supersetRun == run &&
      completed.exerciseEntryId != next.exerciseEntryId &&
      completed.setNumber == next.setNumber
    ) {
      return 0
    }
    return own
  }

  /**
   * The index logging [cursor] moves on to: the first incomplete step after it,
   * else the first incomplete step anywhere other than [cursor]; null when it is
   * the only incomplete step left.
   */
  fun nextIndex(afterLogging: Int, isDone: List<Boolean>): Int? {
    for (i in (afterLogging + 1) until isDone.size) {
      if (!isDone[i]) return i
    }
    for (i in isDone.indices) {
      if (i != afterLogging && !isDone[i]) return i
    }
    return null
  }
}

/**
 * Distinguishes a phone-reported rest that the watch already skipped from a
 * brand-new rest that began after the skip.
 */
object StaleRest {
  fun isStale(endsAtMs: Long, durationSeconds: Int, skippedAtMs: Long?): Boolean {
    val skipped = skippedAtMs ?: return false
    val startedAtMs = endsAtMs - durationSeconds.toLong() * 1000L
    return startedAtMs <= skipped
  }
}

/**
 * Heart rate zone lookup using the 5 ascending bpm floors provided by the phone
 * (`heartRateZoneFloors`). Mirrors `WatchHeartRateZone.swift`.
 */
object WatchHeartRateZone {
  const val COUNT = 5

  /** Matching `HEART_RATE_ZONE_COLORS` in `shared/src/utils/heartRateZones.ts`. */
  val ZONE_COLORS_HEX = longArrayOf(
    0xFF94A3B8L, // Zone 1: slate
    0xFF3B82F6L, // Zone 2: blue
    0xFF22C55EL, // Zone 3: green
    0xFFF59E0BL, // Zone 4: amber
    0xFFEF4444L  // Zone 5: red
  )

  /** Zone 1..5 for [bpm], 0 below zone 1, or null when no valid floors arrived. */
  fun zone(bpm: Double, floors: List<Double>?): Int? {
    if (floors == null || floors.size != COUNT) return null
    var z = 0
    for (i in floors.indices) {
      if (bpm >= floors[i]) z = i + 1
    }
    return z
  }

  /** Validates that floors has 5 positive ascending numbers. */
  fun normalized(raw: List<Double>?): List<Double>? {
    if (raw == null || raw.size != COUNT) return null
    if (raw.any { !it.isFinite() || it <= 0.0 }) return null
    for (i in 0 until COUNT - 1) {
      if (raw[i] > raw[i + 1]) return null
    }
    return raw
  }

  /** Returns the ARGB hex color for [bpm], or [defaultHex] if no zones exist. */
  fun colorHex(bpm: Double?, floors: List<Double>?, defaultHex: Long = 0xFFED5E63L): Long {
    if (bpm == null) return defaultHex
    val z = zone(bpm, floors) ?: return defaultHex
    return ZONE_COLORS_HEX[max(z, 1) - 1]
  }
}

/**
 * Logged sets in the order they were completed, for stepping through
 * Edit Previous Set with ‹ and ›. Mirrors `LoggedSetOrder.swift`.
 */
object LoggedSetOrder {
  fun synced(order: List<String>, completed: Set<String>, planOrder: List<String>): List<String> {
    val result = order.filter { completed.contains(it) }.toMutableList()
    val known = result.toHashSet()
    for (id in planOrder) {
      if (completed.contains(id) && known.add(id)) {
        result.add(id)
      }
    }
    return result
  }

  fun older(than: Int): Int? = if (than > 0) than - 1 else null

  sealed class Newer {
    data class SetIndex(val index: Int) : Newer()
    data object Current : Newer()
  }

  fun newer(than: Int, count: Int): Newer =
    if (than + 1 < count) Newer.SetIndex(than + 1) else Newer.Current
}

/**
 * Naming and LRU pruning rules for exercise demo pictures sent by the phone.
 * Mirrors `ExerciseDemoFiles.swift`.
 */
object ExerciseDemoFiles {
  const val FILE_LIMIT = 80
  const val MAX_INDEX = 1

  fun safeKey(key: String): String? {
    val cleaned = buildString(key.length) {
      for (ch in key) {
        if (ch in 'a'..'z' || ch in 'A'..'Z' || ch in '0'..'9' || ch == '-' || ch == '_') {
          append(ch)
        } else {
          append('_')
        }
      }
    }
    return if (cleaned.isEmpty() || cleaned.length > 80) null else cleaned
  }

  fun fileName(key: String, index: Int): String? {
    if (index !in 0..MAX_INDEX) return null
    val safe = safeKey(key) ?: return null
    return "$safe-$index.jpg"
  }

  fun keyOfFileName(name: String): String? {
    if (!name.endsWith(".jpg")) return null
    val dash = name.lastIndexOf('-')
    if (dash <= 0) return null
    return name.substring(0, dash)
  }

  fun filesToDelete(
    files: List<Pair<String, Long>>,
    keepingKeys: Set<String>,
    limit: Int = FILE_LIMIT
  ): List<String> {
    val kept = keepingKeys.mapNotNull { safeKey(it) }.toSet()
    val overflow = files.size - limit
    if (overflow <= 0) return emptyList()
    return files
      .filter { (name, _) ->
        val k = keyOfFileName(name)
        k == null || !kept.contains(k)
      }
      .sortedBy { it.second }
      .take(overflow)
      .map { it.first }
  }
}

/**
 * Four workout effort bands (1-3 Easy, 4-6 Moderate, 7-8 Hard, 9-10 All Out).
 */
enum class EffortBand(val colorHex: Long) {
  EASY(0xFF3CC8B4L),
  MODERATE(0xFFE9C04AL),
  HARD(0xFFFF8A3DL),
  ALL_OUT(0xFFFF5A4EL);

  companion object {
    fun fromScore(score: Double): EffortBand = when {
      score < 3.5 -> EASY
      score < 6.75 -> MODERATE
      score < 8.75 -> HARD
      else -> ALL_OUT
    }
  }
}

/**
 * Pure set-completion reconciliation between phone snapshots and in-flight
 * wrist logs/unlogs so an older phone removal never discards a newer
 * unconfirmed wrist log.
 */
object SetCompletionSync {
  data class State(
    val completed: Set<String>,
    val phoneConfirmed: Set<String>,
    val wristLogged: Set<String>,
    val pendingUnlogs: Set<String>
  )

  fun reconcile(
    phoneDone: Set<String>,
    prevPhoneConfirmed: Set<String>,
    prevWristLogged: Set<String>,
    prevPendingUnlogs: Set<String>
  ): State {
    val nextPhoneConfirmed = (prevPhoneConfirmed + phoneDone).toMutableSet()
    val nextPendingUnlogs = prevPendingUnlogs.filter { phoneDone.contains(it) }.toSet()
    val droppedByPhone = nextPhoneConfirmed.filter { !phoneDone.contains(it) }.toSet()
    nextPhoneConfirmed.removeAll(droppedByPhone)
    val nextWristLogged = prevWristLogged.filter { !phoneDone.contains(it) }.toSet()

    val mergedDone = HashSet<String>()
    mergedDone.addAll(phoneDone)
    mergedDone.addAll(nextWristLogged)
    mergedDone.removeAll(nextPendingUnlogs)
    // Preserve any newly re-logged wrist IDs even when the phone is still acknowledging an earlier undo.
    mergedDone.removeAll(droppedByPhone - nextWristLogged)

    return State(
      completed = mergedDone,
      phoneConfirmed = nextPhoneConfirmed,
      wristLogged = nextWristLogged,
      pendingUnlogs = nextPendingUnlogs
    )
  }
}

/**
 * Decision rule for a phone-sent `workoutStop` message arriving on the watch.
 *
 * Ignores stops for non-matching sessions or sessions already showing the
 * finish summary / preset-update prompt (e.g. a phone echo after a watch
 * finish) so the summary, effort prompt, and preset card are never wiped.
 */
object RemoteWorkoutStop {
  enum class Action { IGNORE, FINISH, DISCARD }

  fun decide(
    activeSessionId: String?,
    incomingSessionId: String,
    isWorkoutActive: Boolean,
    discarded: Boolean
  ): Action {
    if (activeSessionId == null) return Action.IGNORE
    if (incomingSessionId.isNotEmpty() && activeSessionId != incomingSessionId) return Action.IGNORE
    if (!isWorkoutActive) return Action.IGNORE
    return if (discarded) Action.DISCARD else Action.FINISH
  }
}
