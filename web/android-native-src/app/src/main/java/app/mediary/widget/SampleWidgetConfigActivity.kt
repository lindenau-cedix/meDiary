package app.mediary.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import app.mediary.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Konfigurations-Activity, die der System-Widget-Picker beim Platzieren
 * (oder per Long-Press → "Konfigurieren") startet.
 *
 * Felder:
 *  - Substanz-Spinner (gefüllt aus `GET /api/substances`; blockiert das
 *    Speichern, solange leer).
 *  - Menge (`EditText`, optional — leer = DEFAULTS-Standarddosis).
 *  - Tageszeit-Slot (`RadioGroup`: Morgens / Mittags / Abends / Nachts /
 *    Jetzt).
 *
 * `setResult(RESULT_CANCELED)` in `onCreate` sorgt dafür, dass das
 * System die unkonfigurierte Widget-Instanz wieder entfernt, falls der
 * User mit Back rausgeht.
 */
class SampleWidgetConfigActivity : AppCompatActivity() {

    private var widgetId: Int = AppWidgetManager.INVALID_APPWIDGET_ID
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var substances: List<ApiClient.Substance> = emptyList()
    private lateinit var spinner: Spinner
    private lateinit var amountField: EditText
    private lateinit var slotGroup: RadioGroup
    private lateinit var statusLine: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_widget_config)
        title = getString(R.string.widget_config_title)

        // Wichtig: Bei Back muss das System die unkonfigurierte Instanz
        // wieder entfernen.
        setResult(RESULT_CANCELED)

        widgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        )
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        spinner = findViewById(R.id.spinner_substance)
        amountField = findViewById(R.id.edit_amount)
        slotGroup = findViewById(R.id.radio_slot)
        statusLine = findViewById(R.id.text_status)

        findViewById<Button>(R.id.btn_save).setOnClickListener { onSave() }

        prefillFromExistingBinding()
        loadSubstances()
    }

    private fun prefillFromExistingBinding() {
        val existing = SampleWidgetPrefs.read(this, widgetId) ?: return
        amountField.setText(existing.amount.orEmpty())
        when (existing.slot) {
            "morning" -> slotGroup.check(R.id.radio_morning)
            "noon"    -> slotGroup.check(R.id.radio_noon)
            "evening" -> slotGroup.check(R.id.radio_evening)
            "night"   -> slotGroup.check(R.id.radio_night)
            else      -> slotGroup.check(R.id.radio_now)
        }
        // Substanz-Index wird in `loadSubstances` gesetzt, sobald die Liste da ist.
    }

    private fun loadSubstances() {
        val apiBase = SampleWidgetPrefs.apiBase(this)
        if (apiBase.isNullOrBlank()) {
            statusLine.text = getString(R.string.widget_config_no_api_base)
            statusLine.visibility = View.VISIBLE
            findViewById<Button>(R.id.btn_save).isEnabled = false
            return
        }
        statusLine.text = getString(R.string.widget_config_loading)
        statusLine.visibility = View.VISIBLE
        scope.launch {
            val loaded = withContext(Dispatchers.IO) { ApiClient.listSubstances(apiBase) }
            substances = loaded
            statusLine.visibility = View.GONE
            if (loaded.isEmpty()) {
                statusLine.text = getString(R.string.widget_config_load_failed)
                statusLine.visibility = View.VISIBLE
                findViewById<Button>(R.id.btn_save).isEnabled = false
                return@launch
            }
            val labels = loaded.map { s ->
                s.name + (s.defaultDose?.let { " ($it)" } ?: "")
            }
            spinner.adapter = ArrayAdapter(
                this@SampleWidgetConfigActivity,
                android.R.layout.simple_spinner_dropdown_item,
                labels,
            )
            // Default-Substanz: vorhandene Bindung, sonst die erste.
            val existing = SampleWidgetPrefs.read(this@SampleWidgetConfigActivity, widgetId)
            val pickIdx = existing?.let { ex ->
                loaded.indexOfFirst { it.id == ex.substanceId }.takeIf { it >= 0 }
            } ?: 0
            spinner.setSelection(pickIdx)
            // Default-Menge aus Substanz, falls EditText noch leer.
            if (amountField.text.isNullOrBlank()) {
                loaded.getOrNull(pickIdx)?.defaultDose?.let { amountField.setText(it) }
            }
        }
    }

    private fun onSave() {
        val selected = substances.getOrNull(spinner.selectedItemPosition)
        if (selected == null) {
            Toast.makeText(this, R.string.widget_config_pick_substance, Toast.LENGTH_SHORT).show()
            return
        }
        val amount = amountField.text.toString().trim().ifEmpty { null }
        val slot = when (slotGroup.checkedRadioButtonId) {
            R.id.radio_morning -> "morning"
            R.id.radio_noon    -> "noon"
            R.id.radio_evening -> "evening"
            R.id.radio_night   -> "night"
            else               -> "now"
        }
        SampleWidgetPrefs.write(
            this,
            widgetId,
            SampleWidgetPrefs.Binding(
                substanceId = selected.id,
                substanceName = selected.name,
                amount = amount,
                slot = slot,
                colorHex = selected.colorHex,
            ),
        )
        val mgr = AppWidgetManager.getInstance(this)
        SampleWidgetProvider.updateAppWidget(this, mgr, widgetId)
        val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        setResult(RESULT_OK, result)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
