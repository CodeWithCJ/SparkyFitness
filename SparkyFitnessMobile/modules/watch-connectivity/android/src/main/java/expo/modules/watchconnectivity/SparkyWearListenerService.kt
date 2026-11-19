package expo.modules.watchconnectivity

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

/**
 * Background listener service for messages and durable data transfers from the
 * Wear OS companion app. Ensures heart-rate batches, finished runs, and
 * queued transfers arriving when the phone app is backgrounded or cold-started
 * are persisted and routed to [WatchConnectivityHub].
 */
class SparkyWearListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    super.onMessageReceived(messageEvent)
    val bytes = messageEvent.data ?: return
    val json = bytes.toString(Charsets.UTF_8)
    WatchConnectivityHub.onNodeSeen(applicationContext, messageEvent.sourceNodeId)
    WatchConnectivityHub.handleIncomingJson(applicationContext, json)
  }

  private data class QueuedWatchItem(
    val uri: android.net.Uri,
    val json: String,
    val ts: Long,
    val seq: Long,
    val isTerminal: Int
  )

  override fun onDataChanged(dataEvents: DataEventBuffer) {
    super.onDataChanged(dataEvents)
    val itemsToConsume = mutableListOf<QueuedWatchItem>()
    for (event in dataEvents) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val item = event.dataItem
      val path = item.uri.path ?: continue
      if (!path.startsWith("/sparky/transfer/watch/")) continue
      val dataMap = DataMapItem.fromDataItem(item).dataMap
      val json = dataMap.getString("json") ?: continue
      val ts = dataMap.getLong("ts", 0L)
      val seq = dataMap.getLong("seq", 0L)
      val isTerminal = if (
        path.startsWith("/sparky/transfer/watch/workoutStop/") ||
        path.startsWith("/sparky/transfer/watch/workoutDiscard/")
      ) 1 else 0
      itemsToConsume.add(QueuedWatchItem(item.uri, json, ts, seq, isTerminal))
    }
    itemsToConsume.sortWith(compareBy<QueuedWatchItem>({ it.ts }, { it.seq }, { it.isTerminal }))
    val appCtx = applicationContext
    for (item in itemsToConsume) {
      WatchConnectivityHub.handleIncomingJson(appCtx, item.json)
      Wearable.getDataClient(appCtx).deleteDataItems(item.uri)
    }
  }
}
