package app.mediary.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import app.mediary.MainActivity
import app.mediary.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Empfängt den Tap auf das Widget. Macht den eigentlichen `POST /api/intakes`
 * und blendet einen Toast ein:
 *
 *  - 201 → "Erfasst: <Substanz> <Menge>"
 *  - 401 → App öffnen (Cookie abgelaufen) + "Bitte App öffnen"
 *  - 0/Netzwerkfehler → "Server nicht erreichbar"
 *  - sonst → "Fehler: <message>"
 *
 * `goAsync()` ist nötig, weil OkHttp + JSON-Parsing blockieren — der
 * Receiver-Destroy darf erst NACH `pending.finish()` passieren.
 */
class SampleSendReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_SEND_SAMPLE = "app.mediary.widget.ACTION_SEND_SAMPLE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SEND_SAMPLE) return
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (widgetId < 0) {
            toast(context, context.getString(R.string.widget_toast_unknown, "Keine Widget-ID"))
            return
        }
        val binding = SampleWidgetPrefs.read(context, widgetId)
        if (binding == null) {
            toast(context, context.getString(R.string.widget_toast_unknown, "Keine Bindung"))
            return
        }

        val pending = goAsync()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope.launch {
            try {
                val result = ApiClient.sendIntake(
                    ctx = context,
                    substanceId = binding.substanceId,
                    substanceName = binding.substanceName,
                    amount = binding.amount,
                    slot = binding.slot,
                )
                withContext(Dispatchers.Main) {
                    val label = listOfNotNull(
                        binding.substanceName.takeIf { it.isNotBlank() },
                        binding.amount?.takeIf { it.isNotBlank() },
                    ).joinToString(" ")

                    when {
                        result.ok -> {
                            toast(
                                context,
                                context.getString(R.string.widget_toast_success, label.ifBlank { "Einnahme" }),
                            )
                        }
                        result.status == 401 -> {
                            openApp(context)
                            toast(context, context.getString(R.string.widget_toast_unauth))
                        }
                        result.status == 0 && result.message == "no-api-base" -> {
                            openApp(context)
                            toast(context, context.getString(R.string.widget_toast_no_api_base))
                        }
                        result.status == 0 -> {
                            toast(context, context.getString(R.string.widget_toast_offline))
                        }
                        else -> {
                            toast(context, context.getString(R.string.widget_toast_unknown, result.message))
                        }
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }

    private fun toast(c: Context, s: String) {
        Toast.makeText(c, s, Toast.LENGTH_SHORT).show()
    }

    private fun openApp(c: Context) {
        val i = Intent(c, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        c.startActivity(i)
    }
}
