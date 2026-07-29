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
 * Receives widget taps. Performs the actual `POST /api/intakes` and displays
 * a toast:
 *
 *  - 201 → "Recorded: <substance> <amount>"
 *  - 401 → open the app (expired cookie) + "Open the app"
 *  - 0/network error → "Server unavailable"
 *  - otherwise → "Error: <message>"
 *
 * `goAsync()` is required because OkHttp and JSON parsing block. The receiver
 * must not be destroyed until AFTER `pending.finish()`.
 */
class SampleSendReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_SEND_SAMPLE = "app.mediary.widget.ACTION_SEND_SAMPLE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SEND_SAMPLE) return
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (widgetId < 0) {
            toast(context, context.getString(R.string.widget_toast_unknown, context.getString(R.string.widget_toast_no_widget_id)))
            return
        }
        val binding = SampleWidgetPrefs.read(context, widgetId)
        if (binding == null) {
            toast(context, context.getString(R.string.widget_toast_unknown, context.getString(R.string.widget_toast_no_binding)))
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
                                context.getString(
                                    R.string.widget_toast_success,
                                    label.ifBlank { context.getString(R.string.widget_toast_default_intake) },
                                ),
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
