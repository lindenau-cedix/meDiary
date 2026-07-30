package app.mediary.widget

import android.content.Context

/**
 * SharedPreferences schema for the meDiary sample widgets.
 *
 * Five values are stored for each widget instance (Android app-widget ID),
 * plus an app-global apiBase key mirrored by the WebView at startup (see
 * `app.mediary.bridge.WidgetBridgePlugin`).
 *
 * File: `mediary_widgets` (MODE_PRIVATE). Resetting app data removes all widget
 * bindings, so the user must add the widgets again afterward.
 */
object SampleWidgetPrefs {

    private const val FILE = "mediary_widgets"
    private const val KEY_API_BASE = "apiBase"

    /**
     * A widget binding. `colorHex` is the substance color returned by
     * `GET /api/substances`; if it is null or empty, the provider falls back
     * to the slot color from `colors.xml`.
     */
    data class Binding(
        val substanceId: Long,
        val substanceName: String,
        val amount: String?,
        /** "morning" | "noon" | "evening" | "night" | "now" */
        val slot: String,
        val colorHex: String?,
    )

    fun open(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun write(ctx: Context, widgetId: Int, b: Binding) {
        open(ctx).edit().apply {
            putLong("$widgetId.substanceId", b.substanceId)
            putString("$widgetId.substanceName", b.substanceName)
            putString("$widgetId.amount", b.amount)
            putString("$widgetId.slot", b.slot)
            putString("$widgetId.colorHex", b.colorHex)
            apply()
        }
    }

    fun read(ctx: Context, widgetId: Int): Binding? {
        val p = open(ctx)
        val name = p.getString("$widgetId.substanceName", null) ?: return null
        return Binding(
            substanceId = p.getLong("$widgetId.substanceId", 0L),
            substanceName = name,
            amount = p.getString("$widgetId.amount", null),
            slot = p.getString("$widgetId.slot", "now") ?: "now",
            colorHex = p.getString("$widgetId.colorHex", null),
        )
    }

    fun delete(ctx: Context, widgetId: Int) {
        open(ctx).edit()
            .remove("$widgetId.substanceId")
            .remove("$widgetId.substanceName")
            .remove("$widgetId.amount")
            .remove("$widgetId.slot")
            .remove("$widgetId.colorHex")
            .apply()
    }

    /** API base URL, set by the WebView via `WidgetBridgePlugin.setApiBase`. */
    fun apiBase(ctx: Context): String? =
        open(ctx).getString(KEY_API_BASE, null)?.takeIf { it.isNotBlank() }

    fun setApiBase(ctx: Context, url: String) {
        val normalized = url.trim().trimEnd('/')
        open(ctx).edit().putString(KEY_API_BASE, normalized).apply()
    }
}
