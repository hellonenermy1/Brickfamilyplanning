package com.brick.safety.diagnostics

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.brick.safety.BuildConfig
import com.brick.safety.beta.BetaSafety
import com.brick.safety.managed.ManagedPolicy
import java.time.Instant
import java.util.concurrent.Executors

class DiagnosticsActivity : AppCompatActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var sessionText: TextView
    private lateinit var betaSafetyText: TextView
    private lateinit var errorBanner: TextView
    private lateinit var reportView: TextView
    private lateinit var sessionButton: Button
    private lateinit var disarmButton: Button
    private lateinit var releaseButton: Button
    private lateinit var uninstallButton: Button
    @Volatile private var latestReport: String = ""

    private val autoRefresh = object : Runnable {
        override fun run() {
            refreshReport()
            main.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagnosticStore.init(this)
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "ui", "diagnostics_opened")
        setContentView(buildUi())
        renderSession()
        renderBetaSafety()
        refreshReport()
    }

    override fun onResume() {
        super.onResume()
        main.removeCallbacks(autoRefresh)
        main.post(autoRefresh)
    }

    override fun onPause() {
        main.removeCallbacks(autoRefresh)
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        worker.shutdownNow()
        super.onDestroy()
    }

    private fun buildUi(): View {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(24))
        }

        root.addView(TextView(this).apply {
            text = "BRICK PHASE 8 HARDENING BETA"
            textSize = 23f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = "Disposable Device Owner test build • testOnly=true • no phone wipe/factory reset"
            textSize = 12f
            setPadding(0, dp(4), 0, dp(12))
        })

        sessionText = TextView(this).apply {
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(sessionText)

        betaSafetyText = TextView(this).apply {
            textSize = 13f
            setPadding(0, dp(8), 0, dp(4))
        }
        root.addView(betaSafetyText)

        errorBanner = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(175, 35, 35))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            visibility = View.GONE
        }
        root.addView(errorBanner, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(10)
        })

        sessionButton = button("START TEST SESSION") {
            if (DiagnosticStore.activeSessionId() == null) {
                val id = DiagnosticStore.startSession(this)
                toast("Started $id")
            } else {
                val id = DiagnosticStore.endSession(this)
                toast("Ended ${id ?: "session"}")
            }
            renderSession()
            refreshReport()
        }
        root.addView(sessionButton, params(dp(12)))

        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_HORIZONTAL }
        controls.addView(button("MARK STEP") {
            val n = DiagnosticStore.addMarker(this)
            toast("Marker $n saved")
            refreshReport()
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        controls.addView(button("REFRESH") { refreshReport() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) })
        root.addView(controls, params(dp(8)))

        val export = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_HORIZONTAL }
        export.addView(button("COPY FULL REPORT") { copyReport() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        export.addView(button("SHARE REPORT") { shareReport() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) })
        root.addView(export, params(dp(8)))

        root.addView(TextView(this).apply {
            text = "PHASE 8 THREE-STAGE RETIREMENT"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(18), 0, dp(4))
        })

        disarmButton = button("STAGE 1 — DISARM BRICK") { confirmDisarm() }
        releaseButton = button("STAGE 2 — RELEASE DEVICE MANAGEMENT") { confirmReleaseStage() }
        uninstallButton = button("STAGE 3 — FINISH UNINSTALL") { confirmUninstall() }
        root.addView(disarmButton, params(dp(4)))
        root.addView(releaseButton, params(dp(6)))
        root.addView(uninstallButton, params(dp(6)))

        root.addView(TextView(this).apply {
            text = "Stage 1 is written durably first and stops Brick runtime. Stage 2 releases Device Owner/admin and verifies the result. Stage 3 only opens Android's uninstall screen after release is verified. Cancelling uninstall never reactivates Brick."
            textSize = 12f
            setPadding(0, dp(6), 0, dp(8))
        })

        root.addView(button("EMERGENCY RELEASE DEVICE OWNER") { confirmEmergencyReleaseOwner() }, params(dp(4)))
        root.addView(TextView(this).apply {
            text = "Emergency release is a separate local escape. It does not factory-reset or wipe the phone."
            textSize = 12f
            setPadding(0, dp(4), 0, dp(4))
        })

        reportView = TextView(this).apply {
            text = "Loading diagnostics…"
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
            setPadding(0, dp(16), 0, dp(16))
        }
        root.addView(reportView)
        return ScrollView(this).apply { addView(root) }
    }

    private fun button(label: String, click: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { click() }
    }

    private fun params(top: Int) = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = top
    }

    private fun renderSession() {
        val id = DiagnosticStore.activeSessionId()
        sessionText.text = if (id == null) "Test session: NOT RUNNING" else "Test session: $id"
        sessionButton.text = if (id == null) "START TEST SESSION" else "END TEST SESSION"
    }

    private fun renderBetaSafety() {
        val owner = ManagedPolicy.isDeviceOwner(this)
        val stage = BetaSafety.retirementStage(this)
        val expired = BetaSafety.isExpired()
        betaSafetyText.text = buildString {
            append("Build: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n")
            append("Channel: ${BuildConfig.BRICK_BETA_CHANNEL}\n")
            append("Auto-expiry: ${Instant.ofEpochMilli(BetaSafety.expiryEpochMs())}\n")
            append("Device Owner: $owner • retirement: ${stage.name} • expired: $expired")
        }
        disarmButton.isEnabled = stage == BetaSafety.RetirementStage.ACTIVE
        releaseButton.isEnabled = stage == BetaSafety.RetirementStage.DISARMED
        uninstallButton.isEnabled = stage == BetaSafety.RetirementStage.MANAGEMENT_RELEASED ||
            stage == BetaSafety.RetirementStage.UNINSTALL_REQUESTED
    }

    private fun refreshReport() {
        if (worker.isShutdown) return
        worker.execute {
            val report = runCatching { DiagnosticStore.fullReport(this) }
                .getOrElse { "DIAGNOSTIC REPORT FAILED\n${it.stackTraceToString()}" }
            val error = runCatching { DiagnosticStore.latestError(this) }.getOrNull()
            latestReport = report
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                reportView.text = report
                if (error == null) {
                    errorBanner.visibility = View.GONE
                } else {
                    errorBanner.visibility = View.VISIBLE
                    errorBanner.text = "LAST ERROR • ${error.component}/${error.event}\n${error.detail.take(500)}\nTap COPY FULL REPORT and send it if this looks relevant."
                }
                renderSession()
                renderBetaSafety()
            }
        }
    }

    private fun confirmDisarm() {
        AlertDialog.Builder(this)
            .setTitle("Stage 1 — Disarm Brick?")
            .setMessage("This permanently retires this installed beta. Brick will stop normal tracking/recovery and will not reactivate after reboot. It does NOT wipe or factory-reset the phone.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("DISARM") { _, _ ->
                worker.execute {
                    val ok = BetaSafety.beginRetirement(applicationContext, "manual_phase8_stage1")
                    runOnUiThread {
                        renderBetaSafety()
                        toast(if (ok) "Stage 1 complete: Brick disarmed" else "Stage 1 failed to persist — management was NOT released")
                    }
                }
            }
            .show()
    }

    private fun confirmReleaseStage() {
        AlertDialog.Builder(this)
            .setTitle("Stage 2 — Release device management?")
            .setMessage("Brick must already be disarmed. This releases Device Owner/admin and verifies Android no longer reports either role. No phone data is wiped.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("RELEASE") { _, _ ->
                worker.execute {
                    val result = BetaSafety.advanceManagementRelease(applicationContext)
                    runOnUiThread {
                        renderBetaSafety()
                        toast(if (result.released) "Stage 2 complete: management released" else "Release incomplete: ${result.error ?: "owner/admin still active"}")
                    }
                }
            }
            .show()
    }

    private fun confirmUninstall() {
        AlertDialog.Builder(this)
            .setTitle("Stage 3 — Finish uninstall?")
            .setMessage("Android's own uninstall screen will open only after Brick verifies Device Owner/admin are released. Cancelling uninstall leaves Brick retired, not tracking.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("OPEN UNINSTALL") { _, _ ->
                worker.execute {
                    val ok = BetaSafety.requestUninstall(applicationContext)
                    runOnUiThread {
                        renderBetaSafety()
                        if (!ok) toast("Uninstall blocked until management release is verified")
                    }
                }
            }
            .show()
    }

    private fun confirmEmergencyReleaseOwner() {
        AlertDialog.Builder(this)
            .setTitle("Emergency release Device Owner?")
            .setMessage("Local escape only. This releases Brick's Device Owner/admin role without wiping the phone. Prefer the three-stage retirement flow when possible.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("RELEASE") { _, _ ->
                worker.execute {
                    val result = BetaSafety.releaseDeviceOwner(applicationContext)
                    runOnUiThread {
                        renderBetaSafety()
                        toast(if (result.released) "Device Owner/admin released" else "Release incomplete: ${result.error ?: "still active"}")
                    }
                }
            }
            .show()
    }

    private fun copyReport() {
        val report = latestReport.ifBlank { DiagnosticStore.fullReport(this) }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Brick Phase 8 diagnostic report", report))
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "ui", "report_copied", "chars=${report.length}")
        toast("Full report copied")
    }

    private fun shareReport() {
        val report = latestReport.ifBlank { DiagnosticStore.fullReport(this) }
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "ui", "report_shared", "chars=${report.length}")
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Brick Phase 8 hardening beta diagnostic report")
            putExtra(Intent.EXTRA_TEXT, report)
        }, "Share Brick diagnostic report"))
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
