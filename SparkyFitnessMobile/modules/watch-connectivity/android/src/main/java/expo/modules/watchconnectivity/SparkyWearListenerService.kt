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

  override fun onDataChanged(dataEvents: DataEventBuffer) {
    super.onDataChanged(dataEvents)
    val itemsToConsume = mutableListOf< Pair<android.net.Uri, String> >()
    for (event in dataEvents) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val item = event.dataItem
      val path = item.uri.path ?: continue
      if (!path.startsWith("/sparky/transfer/watch/")) continue
      val dataMap = DataMapItem.fromDataItem(item).dataMap
      val json = dataMap.getString("json") ?: continue
      itemsToConsume.add(item.uri to json)
    }
    val appCtx = applicationContext
    for ((uri, json) in itemsToConsume) {
      WatchConnectivityHub.handleIncomingJson(appCtx, json)
      Wearable.getDataClient(appCtx).deleteDataItems(uri)
    }
  }
}
