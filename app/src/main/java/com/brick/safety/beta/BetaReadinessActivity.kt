package com.brick.safety.beta

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.brick.safety.BuildConfig
import com.brick.safety.maintenance.DeprovisionManager
import java.util.concurrent.Executors

/** Private local maintenance surface; no launcher, deep link or remote destructive trigger. */
class BetaReadinessActivity : AppCompatActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var output: TextView
    private lateinit var actions: LinearLayout
    private var busy = false
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 28, 24, 28) }
        root.addView(TextView(this).apply { text = "Brick Beta Readiness & 72h"; textSize = 22f })
        root.addView(TextView(this).apply { text = "${BuildConfig.VERSION_NAME} · ${BuildConfig.BRICK_RELEASE_ID}\nSource: ${BuildConfig.BRICK_SOURCE_SHA}\nNo automatic expiry. Readiness is scoped; actual OPPO/endurance results require review."; textSize = 12f })
        actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; root.addView(actions)
        output = TextView(this).apply { textSize = 12f; setTextIsSelectable(true) }; root.addView(output)
        setContentView(ScrollView(this).apply { addView(root) })
        if (DeprovisionManager.isPostPurge(this)) {
            output.text = "Brick is quiesced for removal. Return to Maintenance to complete the Android uninstall handoff. No beta stores opened."
            return
        }
        button("Run readiness checks") { task { BetaDiagnostics.runChecks(this).toString(2) } }
        button("Refresh recorded results") { refresh() }
        button("Start controlled 72-hour run") {
            AlertDialog.Builder(this).setTitle("Start recorded beta run?")
                .setMessage("Only continue after all core checks pass and you have externally verified Device Owner release and uninstall on this device/build using a disposable installation. Pressing CONFIRM records YOUR escape-verification attestation, not an automated proof. Phase2 backend and portal must be ready. No destructive test runs during endurance.")
                .setNegativeButton("Cancel", null).setPositiveButton("CONFIRM") { _, _ -> task { BetaDiagnostics.startRun(this, true); BetaDiagnostics.summary(this).toString(2) } }.show()
        }
        button("Stop run — review required") { task { BetaDiagnostics.stopRun(this); BetaDiagnostics.summary(this).toString(2) } }
        button("Record a manual intervention") {
            val reasons = arrayOf("PLANNED_NETWORK_TEST", "PLANNED_DEVICE_REBOOT", "UNPLANNED_RECOVERY", "OTHER_USER_ACTION")
            AlertDialog.Builder(this).setTitle("Classify intervention honestly").setItems(reasons) { _, index -> task { BetaDiagnostics.recordIntervention(this, reasons[index]); "Recorded ${reasons[index]}; qualification remains review required" } }.show()
        }
        button("Export private beta evidence") {
            @Suppress("DEPRECATION")
            startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE); type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "Brick-beta-evidence.json")
            }, 721)
        }
        button("Reset exported, stopped beta run") {
            AlertDialog.Builder(this).setTitle("Reset beta evidence only?")
                .setMessage("The run must be stopped and exported first. This removes the local beta run/results only; ordinary Brick tracking history and pairing stay intact.")
                .setNegativeButton("Cancel", null).setPositiveButton("RESET BETA RUN") { _, _ -> task { BetaDiagnostics.resetRun(this); "Beta run reset; run readiness again before a new segment" } }.show()
        }
        button("Self-destruct / remove Brick") { confirmRemoval() }
        refresh()
    }
    private fun button(text: String, action: () -> Unit) {
        actions.addView(Button(this).apply { this.text = text; isAllCaps = false; setOnClickListener { if (!busy) action() } })
    }
    private fun task(action: () -> String) {
        if (busy || worker.isShutdown) return
        busy = true; for (i in 0 until actions.childCount) actions.getChildAt(i).isEnabled = false
        output.text = "Working…"
        worker.execute {
            val text = try { action() } catch (e: Exception) { "PENDING / FAILED: ${e.message?.takeIf { it.matches(Regex("[a-zA-Z0-9_ .;-]{1,160}")) } ?: e.javaClass.simpleName}\nNo readiness/qualification is inferred." }
            runOnUiThread {
                if (!isDestroyed) { output.text = text; busy = false
                    for (i in 0 until actions.childCount) actions.getChildAt(i).isEnabled = !DeprovisionManager.isPostPurge(this)
                }
            }
        }
    }
    private fun refresh() = task { BetaDiagnostics.summary(this).toString(2) }
    private fun confirmRemoval() {
        AlertDialog.Builder(this).setTitle("Permanently remove Brick?")
            .setMessage("This stops Brick, reverses its policies, releases and verifies Device Owner/admin, purges local Brick data/keys and requests uninstall. Cloud history is retained. This is irreversible. Android may still require uninstall confirmation; completion needs external verification.")
            .setNegativeButton("Cancel", null).setPositiveButton("REMOVE BRICK") { _, _ ->
                task {
                    val result = DeprovisionManager.runAuthorisedRemoval(applicationContext) { progress ->
                        runOnUiThread { if (!isDestroyed) output.text = "${progress.stage}: ${progress.detail}" }
                    }
                    "${result.stage}: ${result.detail}\nUninstall handoff is not proof of package removal. If blocked, use the existing maintenance escape path."
                }
            }.show()
    }
    @Deprecated("Uses platform document picker for an explicit private export")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 721) return
        if (resultCode == RESULT_OK && data?.data != null) {
            val uri = data.data!!
            task {
                val exportedRun = contentResolver.openOutputStream(uri)?.use { BetaDiagnostics.export(this, it) } ?: error("export_destination_unavailable")
                val stoppedExport = BetaDiagnostics.markExported(this, exportedRun)
                "Export completed. No coordinates, radio IDs or credentials. Reset eligible=$stoppedExport; stop and export again if the run is active."
            }
        }
    }
    override fun onDestroy() { worker.shutdownNow(); super.onDestroy() }
}
