package app.mediary.widget

import android.content.Context
import android.webkit.CookieManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Winziger OkHttp-Wrapper für die zwei Endpunkte, die das Widget braucht:
 *
 *  - `GET  /api/substances` (offen, kein Auth) — füllt den Spinner der
 *    Config-Activity.
 *  - `POST /api/intakes` (offen, kein CF-Access-Auth) — legt eine
 *    einzelne Einnahme an. Server-seitig greifen DEFAULTS (Menge/Notiz
 *    falls leer) und `Mit:`-Begleitsubstanzen werden automatisch
 *    miterfasst, genauso wie der in-app `submitInstant`-Button.
 *
 * Cloudflare-Access: Der `CF_Authorization`-Cookie aus dem WebView-
 * CookieManager wird sowohl als `Cookie`-Header als auch (kanonisch) als
 * `Cf-Access-Jwt-Assertion`-Header mitgeschickt. Für lokale Deployments
 * (`CF_ACCESS_DISABLED=true` serverseitig) ist beides nicht nötig.
 */
object ApiClient {

    private val JSON = "application/json; charset=utf-8".toMediaType()

    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
    }

    data class Result(
        val ok: Boolean,
        val status: Int,
        val message: String,
    )

    data class Substance(
        val id: Long,
        val name: String,
        val defaultDose: String?,
        val colorHex: String?,
    )

    /**
     * Hängt den Cookie-Header der API-Origin an den Request. Liest den
     * `CF_Authorization`-Cookie aus dem WebView-CookieManager und
     * spiegelt ihn zusätzlich in den kanonischen
     * `Cf-Access-Jwt-Assertion`-Header.
     */
    fun attachCookie(req: Request.Builder, apiBase: String) {
        val raw = CookieManager.getInstance().getCookie(apiBase)
        if (!raw.isNullOrBlank()) {
            req.header("Cookie", raw)
            val cf = raw.split(";")
                .map { it.trim() }
                .firstOrNull { it.startsWith("CF_Authorization=") }
                ?.removePrefix("CF_Authorization=")
            if (!cf.isNullOrBlank()) {
                req.header("Cf-Access-Jwt-Assertion", cf)
            }
        }
    }

    fun listSubstances(apiBase: String): List<Substance> {
        if (apiBase.isBlank()) return emptyList()
        val req = Request.Builder()
            .url("$apiBase/api/substances")
            .header("Accept", "application/json")
            .apply { attachCookie(this, apiBase) }
            .get()
            .build()
        return try {
            client.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) return emptyList()
                val arr = org.json.JSONArray(body)
                (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    Substance(
                        id = o.optLong("id"),
                        name = o.optString("name"),
                        defaultDose = o.optStringOrNull("defaultDose"),
                        colorHex = o.optStringOrNull("color"),
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Sendet `POST /api/intakes` mit `substanceId`/`amount`/`takenAt`.
     *
     * `slot`:
     *  - "morning" → heute 08:00
     *  - "noon"    → heute 13:00
     *  - "evening" → heute 19:00
     *  - "night"   → heute 22:30
     *  - "now" (oder unbekannt) → aktuelle Wanduhrzeit
     *
     * `amount` darf `null` sein — dann greift die DEFAULTS-Standarddosis
     * serverseitig. `Mit:`-Begleitsubstanzen werden wie bei `POST /`
     * automatisch miterfasst (Server-Default `companions: true`).
     */
    fun sendIntake(
        ctx: Context,
        substanceId: Long,
        substanceName: String,
        amount: String?,
        slot: String,
    ): Result {
        val apiBase = SampleWidgetPrefs.apiBase(ctx)
            ?: return Result(false, 0, "no-api-base")
        if (substanceId <= 0) {
            // Fallback: substanzName statt ID (Server akzeptiert beides).
            if (substanceName.isBlank()) return Result(false, 0, "no-substance")
        }
        val takenAt = computeTakenAt(slot)
        val payload = JSONObject().apply {
            if (substanceId > 0) put("substanceId", substanceId) else put("substanceName", substanceName)
            put("amount", amount ?: JSONObject.NULL)
            put("takenAt", takenAt)
        }
        val req = Request.Builder()
            .url("$apiBase/api/intakes")
            .post(payload.toString().toRequestBody(JSON))
            .header("Accept", "application/json")
            .apply { attachCookie(this, apiBase) }
            .build()
        return try {
            client.newCall(req).execute().use { res ->
                val raw = res.body?.string().orEmpty()
                if (res.isSuccessful) Result(true, res.code, "ok")
                else Result(false, res.code, parseError(raw) ?: "HTTP ${res.code}")
            }
        } catch (e: Exception) {
            Result(false, 0, e.message ?: "Netzwerkfehler")
        }
    }

    private fun computeTakenAt(slot: String): String {
        val cal = Calendar.getInstance()
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        when (slot) {
            "morning" -> { cal.set(Calendar.HOUR_OF_DAY, 8); cal.set(Calendar.MINUTE, 0) }
            "noon"    -> { cal.set(Calendar.HOUR_OF_DAY, 13); cal.set(Calendar.MINUTE, 0) }
            "evening" -> { cal.set(Calendar.HOUR_OF_DAY, 19); cal.set(Calendar.MINUTE, 0) }
            "night"   -> { cal.set(Calendar.HOUR_OF_DAY, 22); cal.set(Calendar.MINUTE, 30) }
            else      -> { /* now */ }
        }
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.GERMAN)
        return sdf.format(cal.time)
    }

    private fun parseError(raw: String): String? = try {
        JSONObject(raw).optString("error").takeIf { it.isNotBlank() }
    } catch (_: Exception) {
        null
    }

    private fun JSONObject.optStringOrNull(key: String): String? {
        if (isNull(key)) return null
        val v = optString(key, "").trim()
        return v.takeIf { it.isNotEmpty() }
    }
}
