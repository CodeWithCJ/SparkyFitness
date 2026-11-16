package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.PI
import kotlin.math.sin

/**
 * Synthesizes short, crisp countdown audio cues on the Wear OS speaker:
 * - [playTick]: single short high beep (880 Hz, 65 ms)
 * - [playEndChime]: rising two-note chime (880 Hz -> 1320 Hz, 180 ms)
 *
 * Respects the watch ringer mode: when on Silent or Vibrate, no sound plays
 * (only the companion haptic fires). Safe on watches without a speaker.
 */
object CountdownAudio {
  private const val SAMPLE_RATE = 16_000
  private val audioExecutor = Executors.newSingleThreadExecutor { r ->
    Thread(r, "sparky-countdown-audio").apply { isDaemon = true }
  }

  private val tickPcm: ShortArray by lazy {
    buildTonePcm(
      segments = listOf(880.0 to 65),
      amplitude = 0.45
    )
  }

  private val endChimePcm: ShortArray by lazy {
    buildTonePcm(
      segments = listOf(880.0 to 75, 0.0 to 20, 1320.0 to 105),
      amplitude = 0.55
    )
  }

  fun playTick(context: Context?) {
    if (!shouldPlaySound(context)) return
    audioExecutor.execute { writePcm(tickPcm) }
  }

  fun playEndChime(context: Context?) {
    if (!shouldPlaySound(context)) return
    audioExecutor.execute { writePcm(endChimePcm) }
  }

  private fun shouldPlaySound(context: Context?): Boolean {
    val ctx = context ?: return false
    return try {
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
      am.ringerMode == AudioManager.RINGER_MODE_NORMAL
    } catch (_: Throwable) {
      false
    }
  }

  private fun writePcm(pcm: ShortArray) {
    var track: AudioTrack? = null
    try {
      val byteCount = pcm.size * 2
      val minBuf = AudioTrack.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      if (minBuf <= 0) return
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      val format = AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()
      track = AudioTrack.Builder()
        .setAudioAttributes(attrs)
        .setAudioFormat(format)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(maxOf(byteCount, minBuf))
        .build()
      track.write(pcm, 0, pcm.size)
      track.play()
      val durationMs = (pcm.size * 1000L) / SAMPLE_RATE + 35L
      Thread.sleep(durationMs)
      track.stop()
    } catch (_: Throwable) {
      // Ignore on devices without audio output or when audio hardware is busy
    } finally {
      try {
        track?.release()
      } catch (_: Throwable) {}
    }
  }

  private fun buildTonePcm(segments: List<Pair<Double, Int>>, amplitude: Double): ShortArray {
    val totalSamples = segments.sumOf { (_, ms) -> (SAMPLE_RATE * ms) / 1000 }
    val out = ShortArray(totalSamples)
    var offset = 0
    for ((freqHz, ms) in segments) {
      val count = (SAMPLE_RATE * ms) / 1000
      val fadeSamples = minOf(count / 5, (SAMPLE_RATE * 8) / 1000)
      for (i in 0 until count) {
        if (freqHz > 0.0) {
          val env = when {
            i < fadeSamples -> i.toDouble() / fadeSamples.coerceAtLeast(1)
            i >= count - fadeSamples -> (count - 1 - i).toDouble() / fadeSamples.coerceAtLeast(1)
            else -> 1.0
          }
          val sample = sin(2.0 * PI * freqHz * i / SAMPLE_RATE) * amplitude * env
          out[offset + i] = (sample * Short.MAX_VALUE).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
      }
      offset += count
    }
    return out
  }
}

/**
 * One-shot countdown cues scheduled against a deadline [endsAtMs] rather than
 * counted off a repeating ticker, matching `CountdownCues.swift`.
 * Every [cancel] bumps [generation] so an already-dispatched coroutine from an
 * older schedule plays nothing.
 */
class CountdownCues(
  private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
) {
  private val generation = AtomicInteger(0)
  private val jobs = mutableListOf<Job>()

  fun schedule(
    endsAtMs: Long,
    seconds: Int,
    tick: () -> Unit,
    end: () -> Unit
  ) {
    cancel()
    if (seconds <= 0) return
    val now = System.currentTimeMillis()
    val scheduledGen = generation.get()
    for (remaining in 0..seconds) {
      val fireAtMs = endsAtMs - remaining.toLong() * 1000L
      val delayMs = fireAtMs - now
      if (delayMs <= 0L) continue
      val cue = if (remaining == 0) end else tick
      val job = scope.launch {
        delay(delayMs)
        if (generation.get() == scheduledGen) {
          cue()
        }
      }
      jobs.add(job)
    }
  }

  fun cancel() {
    generation.incrementAndGet()
    jobs.forEach { it.cancel() }
    jobs.clear()
  }
}
