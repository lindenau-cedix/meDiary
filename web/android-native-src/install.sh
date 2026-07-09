#!/usr/bin/env bash
# install.sh — kopiert die meDiary-Sample-Widget-Quellen aus
# web/android-native-src/ in das vom Capacitor-Scaffold angelegte
# web/android/-Projekt.
#
# Voraussetzungen:
#   1. `npm install` in web/ wurde ausgeführt
#   2. `npx cap add android` (oder `npm run cap:android`) wurde
#      ausgeführt — web/android/app/src/main/ existiert
#   3. ANDROID_HOME ist gesetzt (für späteres gradlew assembleDebug)
#
# Dieses Skript ist idempotent: es kann gefahrlos mehrfach laufen.

set -euo pipefail

# vom Skript-Verzeichnis aus auflösen
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
ANDROID_MAIN="$WEB/android/app/src/main"

# --- Sanity-Checks --------------------------------------------------

if [ ! -d "$ANDROID_MAIN" ]; then
  cat <<EOF >&2
[widget-install] FEHLER: $ANDROID_MAIN existiert nicht.

Bitte zuerst die Android-Plattform anlegen:

    cd $WEB
    npm install
    npx cap add android          # oder: npm run cap:android
    npx cap sync android

Danach dieses Skript erneut laufen lassen.
EOF
  exit 1
fi

MANIFEST="$ANDROID_MAIN/AndroidManifest.xml"
if [ ! -f "$MANIFEST" ]; then
  echo "[widget-install] FEHLER: $MANIFEST fehlt." >&2
  exit 1
fi

# --- 1. Kotlin- und Bridge-Plugin-Quellen kopieren ------------------

WIDGET_SRC="$HERE/app/src/main/java/app/mediary/widget"
BRIDGE_SRC="$HERE/app/src/main/java/app/mediary/bridge"
DST="$ANDROID_MAIN/java/app/mediary"

mkdir -p "$DST/widget" "$DST/bridge"
cp -v "$WIDGET_SRC"/*.kt "$DST/widget/"
cp -v "$BRIDGE_SRC"/*.kt "$DST/bridge/"

# --- 2. XML-Ressourcen kopieren -------------------------------------

cp -v "$HERE/app/src/main/res/xml/sample_widget_info.xml" \
      "$ANDROID_MAIN/res/xml/"

cp -v "$HERE/app/src/main/res/layout/widget_sample.xml" \
      "$ANDROID_MAIN/res/layout/"
cp -v "$HERE/app/src/main/res/layout/activity_widget_config.xml" \
      "$ANDROID_MAIN/res/layout/"

cp -v "$HERE/app/src/main/res/drawable/widget_background.xml" \
      "$ANDROID_MAIN/res/drawable/"
cp -v "$HERE/app/src/main/res/drawable/widget_preview.xml" \
      "$ANDROID_MAIN/res/drawable/"

# --- 3. strings.xml / colors.xml mergen -----------------------------

# strings.xml: alle <string name="widget_*"> Einträge aus unserer Datei
# in die bestehende strings.xml übernehmen. Wir parsen nur die
# <string>-Knoten und schreiben sie ans Ende des Wurzel-<resources>-Tags
# der Zieldatei — robust gegen Mehrfachausführung, da wir die Namen
# filtern.

SRC_STRINGS="$HERE/app/src/main/res/values/strings.xml"
DST_STRINGS="$ANDROID_MAIN/res/values/strings.xml"

if [ -f "$DST_STRINGS" ]; then
  python3 - "$SRC_STRINGS" "$DST_STRINGS" <<'PYEOF'
import sys, re, pathlib
src, dst = sys.argv[1], sys.argv[2]
src_doc = pathlib.Path(src).read_text(encoding="utf-8")
dst_doc = pathlib.Path(dst).read_text(encoding="utf-8")
# Bestehende widget_*-Namen rauswerfen, damit wir nicht duplizieren.
existing = set(re.findall(r'<string\s+name="(widget_[^"]+)"', dst_doc))
new_lines = []
for m in re.finditer(r'<string\s+name="(widget_[^"]+)"[^>]*>.*?</string>', src_doc, re.S):
    name = m.group(1)
    if name in existing: continue
    new_lines.append("    " + m.group(0).replace("\n", " ").strip())
if new_lines:
    insertion = "\n".join(new_lines) + "\n"
    if "</resources>" in dst_doc:
        dst_doc = dst_doc.replace("</resources>", insertion + "</resources>")
    else:
        dst_doc += "\n" + insertion
    pathlib.Path(dst).write_text(dst_doc, encoding="utf-8")
    print(f"[widget-install] strings.xml: {len(new_lines)} widget_*-Strings ergänzt")
else:
    print("[widget-install] strings.xml: nichts zu tun")
PYEOF
else
  echo "[widget-install] FEHLER: $DST_STRINGS fehlt — wurde Capacitor-Scaffold korrekt generiert?" >&2
  exit 1
fi

# colors.xml: gleiche Logik.
SRC_COLORS="$HERE/app/src/main/res/values/colors.xml"
DST_COLORS="$ANDROID_MAIN/res/values/colors.xml"

if [ -f "$DST_COLORS" ]; then
  python3 - "$SRC_COLORS" "$DST_COLORS" <<'PYEOF'
import sys, re, pathlib
src, dst = sys.argv[1], sys.argv[2]
src_doc = pathlib.Path(src).read_text(encoding="utf-8")
dst_doc = pathlib.Path(dst).read_text(encoding="utf-8")
existing = set(re.findall(r'<color\s+name="(widget_[^"]+)"', dst_doc))
new_lines = []
for m in re.finditer(r'<color\s+name="(widget_[^"]+)"[^>]*>.*?</color>', src_doc, re.S):
    name = m.group(1)
    if name in existing: continue
    new_lines.append("    " + m.group(0).replace("\n", " ").strip())
if new_lines:
    insertion = "\n".join(new_lines) + "\n"
    if "</resources>" in dst_doc:
        dst_doc = dst_doc.replace("</resources>", insertion + "</resources>")
    else:
        dst_doc += "\n" + insertion
    pathlib.Path(dst).write_text(dst_doc, encoding="utf-8")
    print(f"[widget-install] colors.xml: {len(new_lines)} widget_*-Farben ergänzt")
else:
    print("[widget-install] colors.xml: nichts zu tun")
PYEOF
else
  echo "[widget-install] FEHLER: $DST_COLORS fehlt." >&2
  exit 1
fi

# --- 4. AndroidManifest.xml: Widget-Entries mergen ------------------

python3 - "$MANIFEST" <<'PYEOF'
import sys, re, pathlib
manifest = sys.argv[1]
doc = pathlib.Path(manifest).read_text(encoding="utf-8")

activity = (
    '    <activity\n'
    '        android:name="app.mediary.widget.SampleWidgetConfigActivity"\n'
    '        android:exported="true"\n'
    '        android:label="@string/widget_config_label"\n'
    '        android:theme="@style/Theme.AppCompat.Light.DarkActionBar" />\n'
)
receiver = (
    '    <receiver\n'
    '        android:name="app.mediary.widget.SampleWidgetProvider"\n'
    '        android:exported="true"\n'
    '        android:label="@string/widget_label">\n'
    '        <intent-filter>\n'
    '            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n'
    '            <action android:name="app.mediary.widget.ACTION_SEND_SAMPLE" />\n'
    '        </intent-filter>\n'
    '        <meta-data\n'
    '            android:name="android.appwidget.provider"\n'
    '            android:resource="@xml/sample_widget_info" />\n'
    '    </receiver>\n'
)

changed = False
if 'app.mediary.widget.SampleWidgetConfigActivity' not in doc:
    # Einfügen direkt vor </application>. Wenn ein </activity> der
    # MainActivity direkt davor steht, dazwischen ein Leerzeile.
    doc = doc.replace("</application>", activity + receiver + "</application>", 1)
    changed = True

if changed:
    pathlib.Path(manifest).write_text(doc, encoding="utf-8")
    print("[widget-install] AndroidManifest.xml: Config-Activity + Provider-Receiver eingefügt")
else:
    print("[widget-install] AndroidManifest.xml: nichts zu tun (bereits gemergt)")
PYEOF

# --- 5. build.gradle: androidx.appcompat + OkHttp prüfen ------------

BUILD_GRADLE="$ANDROID_MAIN/../build.gradle"
if [ ! -f "$BUILD_GRADLE" ]; then
  BUILD_GRADLE="$ANDROID_MAIN/build.gradle"
fi
if [ -f "$BUILD_GRADLE" ]; then
  python3 - "$BUILD_GRADLE" <<'PYEOF'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
doc = p.read_text(encoding="utf-8")
changes = []

if "androidx.appcompat:appcompat" not in doc:
    insertion = '    implementation "androidx.appcompat:appcompat:1.7.0"\n'
    if "dependencies {" in doc:
        doc = doc.replace("dependencies {", "dependencies {\n" + insertion, 1)
    else:
        # Fallback: einfach ans Ende hängen.
        doc = doc.rstrip() + "\n\ndependencies {\n" + insertion + "}\n"
    changes.append("androidx.appcompat")

if "com.squareup.okhttp3:okhttp" not in doc:
    insertion = '    implementation "com.squareup.okhttp3:okhttp:4.12.0"\n'
    if "dependencies {" in doc:
        doc = doc.replace("dependencies {", "dependencies {\n" + insertion, 1)
    else:
        doc = doc.rstrip() + "\n\ndependencies {\n" + insertion + "}\n"
    changes.append("okhttp")

if changes:
    p.write_text(doc, encoding="utf-8")
    print(f"[widget-install] build.gradle: {', '.join(changes)} ergänzt")
else:
    print("[widget-install] build.gradle: nichts zu tun")
PYEOF
fi

cat <<'EOF'

[widget-install] Fertig. Nächste Schritte:

    cd web
    npm run build            # tsc --noEmit + vite build
    npm run cap:sync         # kopiert dist/ + Plugin-Mapping nach android/
    cd android
    ANDROID_HOME=/path/to/Sdk ./gradlew assembleDebug
    adb install -r app/build/outputs/apk/debug/app-debug.apk

Auf dem Gerät: App einmal öffnen (API-Base in den Einstellungen setzen),
dann Home-Screen → Widgets → „meDiary" → 1×1-Kachel auf den Homescreen
ziehen, Substanz + Menge + Slot wählen, speichern, tippen → Toast.
EOF
