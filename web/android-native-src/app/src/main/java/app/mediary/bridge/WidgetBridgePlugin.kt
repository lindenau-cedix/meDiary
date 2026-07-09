package app.mediary.bridge

import android.content.Context
import app.mediary.widget.SampleWidgetPrefs
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Brücke für die API-URL vom WebView in den nativen SharedPreferences-
 * Speicher. Das Web ruft nach jedem `getApiBase()`-/ `setApiBase(...)`-
 * Aufruf `Capacitor.Plugins.WidgetBridge.setApiBase({ url })` auf; die
 * Widgets lesen den Wert anschließend aus den Prefs.
 *
 * Ohne diese Spiegelung kennt das Widget die API-URL erst, nachdem der
 * User die App mindestens einmal geöffnet hat. Der Mirror macht den
 * Wert sofort verfügbar.
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun setApiBase(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("url is required")
            return
        }
        val ctx: Context = context.applicationContext
        SampleWidgetPrefs.setApiBase(ctx, url)
        // Alle Widgets neu zeichnen — falls eine Instanz auf einen Wechsel
        // der API-Adresse wartet (z. B. Umzug in ein anderes Netz).
        app.mediary.widget.SampleWidgetProvider.refreshAll(ctx)
        call.resolve()
    }
}
