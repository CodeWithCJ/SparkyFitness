package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Disk-backed cache of exercise demo JPEGs sent by the phone during live
 * workouts (`exerciseImage` messages / DataItems). Mirrors `ExerciseDemoStore.swift`:
 * keeps up to 80 small JPEGs (~15 KB each) on disk, preserving any keys in the
 * active workout plan, and bumps [revision] whenever new pictures land so the
 * Demo page appears automatically.
 */
class ExerciseDemoStore(private val appContext: Context) {
  private val _revision = MutableStateFlow(0)
  val revision: StateFlow<Int> = _revision.asStateFlow()

  private val lock = Any()
  private val decoded = HashMap<String, List<ImageBitmap>>()

  private val directory: File
    get() = File(appContext.filesDir, "ExerciseDemo")

  fun receive(key: String, index: Int, data: ByteArray, keepKeys: Set<String> = emptySet()): Boolean {
    if (data.isEmpty() || data.size > 512 * 1024) return false
    val fileName = ExerciseDemoFiles.fileName(key, index) ?: return false
    val written = writeAtomic(fileName, data)
    if (written) {
      didChange(keepKeys)
    }
    return written
  }

  fun receiveBase64(key: String, index: Int, dataBase64: String, keepKeys: Set<String> = emptySet()): Boolean {
    if (dataBase64.isEmpty()) return false
    val bytes = try {
      Base64.decode(dataBase64, Base64.DEFAULT)
    } catch (_: Throwable) {
      return false
    }
    return receive(key, index, bytes, keepKeys)
  }

  /**
   * Returns up to [maxCount] decoded pictures (start, then optional end) for [key].
   * Returns empty until picture 0 has arrived (a lone picture 1 is ignored).
   */
  fun images(key: String?, maxCount: Int = 2): List<ImageBitmap> {
    if (key.isNullOrEmpty() || maxCount <= 0) return emptyList()
    synchronized(lock) {
      decoded[key]?.let { return it.take(maxCount) }
      val start = loadBitmap(key, 0) ?: return emptyList()
      val list = mutableListOf(start)
      if (maxCount > 1) {
        loadBitmap(key, 1)?.let { list.add(it) }
      }
      decoded[key] = list
      return list.take(maxCount)
    }
  }

  fun didChange(keepKeys: Set<String> = emptySet()) {
    synchronized(lock) {
      decoded.clear()
    }
    _revision.value = _revision.value + 1
    prune(keepKeys)
  }

  fun prune(keepKeys: Set<String>) {
    try {
      val dir = directory
      if (!dir.exists()) return
      val files = dir.listFiles()
        ?.filter { it.isFile && it.name.endsWith(".jpg") }
        ?.map { it.name to it.lastModified() }
        ?: return
      val toDelete = ExerciseDemoFiles.filesToDelete(files, keepingKeys = keepKeys)
      for (name in toDelete) {
        File(dir, name).delete()
      }
    } catch (_: Throwable) {}
  }

  fun clear() {
    synchronized(lock) {
      decoded.clear()
    }
    try {
      directory.listFiles()?.forEach { it.delete() }
    } catch (_: Throwable) {}
    _revision.value = _revision.value + 1
  }

  private fun writeAtomic(fileName: String, data: ByteArray): Boolean {
    return try {
      val dir = directory
      if (!dir.exists()) dir.mkdirs()
      val target = File(dir, fileName)
      val tmp = File(dir, "$fileName.tmp")
      tmp.writeBytes(data)
      if (!tmp.renameTo(target)) {
        target.writeBytes(data)
        tmp.delete()
      }
      true
    } catch (_: Throwable) {
      false
    }
  }

  private fun loadBitmap(key: String, index: Int): ImageBitmap? {
    val fileName = ExerciseDemoFiles.fileName(key, index) ?: return null
    val file = File(directory, fileName)
    if (!file.isFile) return null
    return try {
      BitmapFactory.decodeFile(file.absolutePath)?.asImageBitmap()
    } catch (_: Throwable) {
      null
    }
  }
}
