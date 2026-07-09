# meDiary-Sample-Widget — native Android-Quelldateien

Dieses Verzeichnis enthält die nativen Quellen für das 1×1-Home-Screen-Widget
„meDiary-Sample". Bei Tap wird eine vorkonfigurierte Einnahme per
`POST /api/intakes` an die laufende meDiary-API geschickt und ein
Toast zeigt das Ergebnis.

**Wichtig:** Diese Dateien werden NICHT direkt von Capacitor verwendet.
Capacitor weiß nichts von einem Android-Widget — der Capacitor-Scaffold
besteht nur aus `MainActivity.java` und dem WebView-Setup. Die
Widget-Klassen müssen in `web/android/app/src/main/` ergänzt werden,
**nachdem** `cap add android` ausgeführt wurde.

## Was hier liegt

| Pfad | Zweck |
|---|---|
| `app/src/main/java/app/mediary/widget/SampleWidgetPrefs.kt` | SharedPreferences-Schema |
| `app/src/main/java/app/mediary/widget/ApiClient.kt` | OkHttp-Wrapper (POST /api/intakes, GET /api/substances) |
| `app/src/main/java/app/mediary/widget/SampleWidgetProvider.kt` | AppWidgetProvider (RemoteViews + Tap-PendingIntent) |
| `app/src/main/java/app/mediary/widget/SampleWidgetConfigActivity.kt` | Konfigurations-Dialog (Spinner, Menge, Slot) |
| `app/src/main/java/app/mediary/widget/SampleSendReceiver.kt` | BroadcastReceiver, der den POST macht + Toast zeigt |
| `app/src/main/java/app/mediary/bridge/WidgetBridgePlugin.kt` | Capacitor-Plugin, das die API-URL aus dem WebView in die Prefs spiegelt |
| `app/src/main/res/xml/sample_widget_info.xml` | AppWidgetProvider-Metadaten (1×1, Konfig-Activity) |
| `app/src/main/res/layout/widget_sample.xml` | RemoteViews-Layout (Substanzname + Menge) |
| `app/src/main/res/layout/activity_widget_config.xml` | Config-Activity-Layout (Spinner, EditText, RadioGroup) |
| `app/src/main/res/drawable/widget_background.xml` | Rounded-Background-Form (Farbe zur Laufzeit) |
| `app/src/main/res/drawable/widget_preview.xml` | Vektor-Vorschaubild für den Widget-Picker |
| `app/src/main/res/values/strings.xml` | Widget-Strings (Toasts, Labels, Slot-Namen) |
| `app/src/main/res/values/colors.xml` | Slot-Farben (morning/noon/evening/night/now) |
| `manifest-fragment.xml` | Dokumentation der AndroidManifest-Einträge |
| `install.sh` | Idempotentes Kopier- + Merge-Skript |

## Install-Schritte (einmalig pro Maschine, danach Sync)

```bash
# 1. Web-Deps installieren (falls noch nicht geschehen)
cd /var/lib/coding-dashboard/projects/mediary/web
npm install

# 2. Android-Plattform anlegen (einmalig pro Projekt)
npx cap add android                 # oder: npm run cap:android

# 3. Native Widget-Quellen ins Android-Projekt mergen
./android-native-src/install.sh     # idempotent — mehrfach laufen ok

# 4. Web bauen + synchronisieren
npm run build
npm run cap:sync                    # kopiert dist/ nach android/

# 5. APK bauen
cd android
ANDROID_HOME=/path/to/Android/Sdk ./gradlew assembleDebug

# 6. Installieren
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Das `install.sh` macht Folgendes (idempotent):

1. Kopiert die fünf Kotlin-Dateien nach `web/android/app/src/main/java/app/mediary/widget/`
   und das Bridge-Plugin nach `…/java/app/mediary/bridge/`.
2. Kopiert die XML-Ressourcen (`sample_widget_info.xml`,
   `widget_sample.xml`, `activity_widget_config.xml`,
   `widget_background.xml`, `widget_preview.xml`).
3. Merged `widget_*`-Einträge aus den mitgelieferten `strings.xml`/
   `colors.xml` in die vom Capacitor-Scaffold generierten Dateien
   (Duplikate werden herausgefiltert).
4. Fügt `<activity>` + `<receiver>` in `AndroidManifest.xml` ein —
   direkt vor `</application>`, **nach** dem bestehenden
   `<activity android:name=".MainActivity" …>`-Block.
5. Ergänzt `androidx.appcompat:appcompat:1.7.0` und
   `com.squareup.okhttp3:okhttp:4.12.0` in `app/build.gradle` (nur
   falls noch nicht vorhanden).

## JS-Bridge

Auf der Web-Seite liegt `web/src/lib/widgetBridge.ts`. Es registriert
das native Plugin `WidgetBridge` als Capacitor-Plugin und exportiert
`setApiBase(url)`. `web/src/lib/api.ts` ruft `setApiBase()` nach
jedem `getApiBase()`/`setApiBase(...)` auf, sodass die Widgets die
API-URL kennen, sobald die App einmal geöffnet wurde.

Im Browser (nicht-APK) ist `Capacitor.Plugins` undefined — die
Funktion no-op'd dann still. So funktioniert `npm run dev` ohne
Android-Emulator.

## Authentifizierung

`ApiClient.attachCookie()` liest `CookieManager.getInstance().getCookie(apiBase)`
und reicht den vollständigen `Cookie`-Header sowie den
`CF_Authorization`-Token im `Cf-Access-Jwt-Assertion`-Header durch.
Damit funktioniert das Widget sowohl:

- lokal mit `CF_ACCESS_DISABLED=true` (kein Cookie nötig — `POST
  /api/intakes` ist ohnehin offen), als auch
- hinter Cloudflare Access (Cookie aus dem WebView wird mitgeschickt).

Bei `401` öffnet das Widget die App (`MainActivity`), damit der
WebView den CF-Cookie erneuern kann. Lokale Deployments sehen diesen
Pfad nie.

## Endpoint-Wahl: `POST /api/intakes` (nicht `/text`)

Pro Widget wird genau **eine** Substanz gebunden — der `/text`-Endpunkt
löst mehrzeiliges Freitext-Parsing aus, das für Single-Substance-Taps
unnötig ist. Wichtiger: `POST /api/intakes` ist **nicht** hinter
`requireCloudflareAccess` (nur `/text` ist es). Der Server löst
`Mit:`-Begleitsubstanzen und DEFAULTS-Standarddosis genauso auf wie der
in-app `submitInstant`-Button.

## Bekannte Limitationen (v1)

- **Single-Substance pro Widget.** Multi-Substance-Zeilen
  (`Quetiapin 50 mg, Pregabalin 100 mg`) brauchen zwei Widgets
  nebeneinander. `POST /api/intakes/text` (mit CF-Access-Auth)
  bleibt für v2 reserviert.
- **App muss einmal offen gewesen sein**, damit das Widget die
  API-Base kennt. Vorher blockiert die Config-Activity das
  Speichern mit einem Hinweis.
- **Cookie-Expiry auf WebView-Destroy.** Bei niedrigem Speicher wird
  der WebView zerstört; nach Wiederherstellung muss die App einmal
  geöffnet werden, damit der `CF_Authorization`-Cookie neu gesetzt
  ist. Lokal-Deploys (`CF_ACCESS_DISABLED=true`) sind immun.
- **Kein Undo vom Widget aus.** Der in-app `Rückgängig`-Toast
  (`QuickEntryScreen.tsx`) ist die einzige Korrektur bei einem
  Mistap. Wird der verpasst, bleibt der Eintrag stehen (löschbar
  über die Verlauf-Liste).
