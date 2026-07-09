package app.mediary.widget

import android.content.Context

/**
 * SharedPreferences-Schema für die meDiary-Sample-Widgets.
 *
 * Pro Widget-Instanz (Android-AppWidget-ID) werden fünf Werte gehalten;
 * zusätzlich ein app-globaler apiBase-Schlüssel, den das WebView beim Start
 * spiegelt (siehe `app.mediary.bridge.WidgetBridgePlugin`).
 *
 * Datei: `mediary_widgets` (MODE_PRIVATE). Bei App-Daten-Reset gehen alle
 * Widget-Bindungen verloren — der Nutzer legt die Widgets dann neu an.
 */
object SampleWidgetPrefs {

    private const val FILE = "mediary_widgets"
    private const val KEY_API_BASE = "apiBase"

    /**
     * Eine Widget-Bindung. `colorHex` ist die Substanz-Farbe aus
     * `GET /api/substances`; wenn `null`/leer fällt der Provider auf die
     * Slot-Farbe aus `colors.xml` zurück.
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

    /** API-Basis-URL — wird vom WebView über `WidgetBridgePlugin.setApiBase` gesetzt. */
    fun apiBase(ctx: Context): String? =
        open(ctx).getString(KEY_API_BASE, null)?.takeIf { it.isNotBlank() }

    fun setApiBase(ctx: Context, url: String) {
        val normalized = url.trim().trimEnd('/')
        open(ctx).edit().putString(KEY_API_BASE, normalized).apply()
    }
}
