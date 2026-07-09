package app.mediary.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import app.mediary.R

/**
 * Provider für die 1×1-Home-Screen-Widgets „meDiary-Sample".
 *
 * Pro Instanz wird in `SampleWidgetPrefs` eine `Binding` gehalten. Tippt
 * der Nutzer, geht ein `ACTION_SEND_SAMPLE`-Broadcast an
 * [SampleSendReceiver], der den eigentlichen POST macht.
 *
 * Der `updatePeriodMillis` ist 0 (siehe `sample_widget_info.xml`) — das
 * Widget rendert nur bei Bedarf (Konfig-Änderung, onUpdate nach Re-Add).
 */
class SampleWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id -> updateAppWidget(context, appWidgetManager, id) }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { SampleWidgetPrefs.delete(context, it) }
    }

    companion object {
        /**
         * Setzt das RemoteViews für eine Widget-Instanz. Wenn keine
         * Bindung existiert (z. B. weil der User den Add-Wizard mit
         * Back abgebrochen hat), wird eine leere Kachel gerendert, deren
         * Tap die Config-Activity erneut öffnet.
         */
        fun updateAppWidget(
            context: Context,
            mgr: AppWidgetManager,
            widgetId: Int,
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_sample)
            val binding = SampleWidgetPrefs.read(context, widgetId)

            if (binding == null) {
                views.setTextViewText(R.id.widget_substance, "+")
                views.setTextViewText(R.id.widget_amount, "")
                views.setInt(R.id.widget_root, "setBackgroundColor", slotColor(context, "now"))
                val i = Intent(context, SampleWidgetConfigActivity::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                views.setOnClickPendingIntent(
                    R.id.widget_root,
                    PendingIntent.getActivity(
                        context, widgetId, i,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                )
            } else {
                views.setTextViewText(R.id.widget_substance, binding.substanceName)
                views.setTextViewText(R.id.widget_amount, binding.amount.orEmpty())
                val bg = parseColor(binding.colorHex) ?: slotColor(context, binding.slot)
                views.setInt(R.id.widget_root, "setBackgroundColor", bg)
                val tap = Intent(context, SampleSendReceiver::class.java).apply {
                    action = SampleSendReceiver.ACTION_SEND_SAMPLE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                }
                views.setOnClickPendingIntent(
                    R.id.widget_root,
                    PendingIntent.getBroadcast(
                        context, widgetId, tap,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                )
            }
            mgr.updateAppWidget(widgetId, views)
        }

        /** Alle Instanzen neu zeichnen — z. B. nach API-Base-Update. */
        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, SampleWidgetProvider::class.java))
            ids.forEach { updateAppWidget(context, mgr, it) }
        }

        /** Slot-Farbe aus `colors.xml` (Fallback, wenn Substanz-Farbe fehlt). */
        fun slotColor(ctx: Context, slot: String): Int {
            val resId = when (slot) {
                "morning" -> R.color.widget_slot_morning
                "noon"    -> R.color.widget_slot_noon
                "evening" -> R.color.widget_slot_evening
                "night"   -> R.color.widget_slot_night
                else      -> R.color.widget_slot_now
            }
            return ctx.getColor(resId)
        }

        private fun parseColor(hex: String?): Int? = hex?.let {
            try { android.graphics.Color.parseColor(it) } catch (_: IllegalArgumentException) { null }
        }
    }
}
