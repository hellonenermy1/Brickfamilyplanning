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
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.brick.safety.BuildConfig
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.maintenance.PolicyLedger
import com.brick.safety.maintenance.WifiOneShotControl
import com.brick.safety.managed.DesiredLocationState
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.managed.ParentLocationStateStore
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Local-only Maintenance & Recovery Console. AndroidManifest keeps this activity non-exported and it
 * is opened only by MainActivity's exact hidden tap/wait state machine. No PIN, key, or backend is
 * involved in entry.
 */
class DiagnosticsActivity : AppCompatActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var stateView: TextView
    private lateinit var timelineView: TextView
    private lateinit var deepOffButton: Button
    private lateinit var deprovisionButton: Button
    @Volatile private var latestPrivacyReport = ""

    private val autoRefresh = object : Runnable {
        override fun run() {
            if (DeprovisionManager.isPostPurge(this@DiagnosticsActivity)) return
            refreshState()
            main.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (DeprovisionManager.isPostPurge(this)) {
            setContentView(buildPostPurgeUi())
            return
        }
        DiagnosticStore.init(this)
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "maintenance", "console_opened")
        setContentView(buildUi())
        refreshState()
    }

    override fun onResume() {
        super.onResume()
        main.removeCallbacks(autoRefresh)
        if (!DeprovisionManager.isPostPurge(this)) main.post(autoRefresh)
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

    private fun buildPostPurgeUi(): View {
        val invalidStage = DeprovisionManager.stage(this) == DeprovisionManager.Stage.INVALID
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(28))
        }
        root.addView(TextView(this).apply {
            text = if (invalidStage) "Brick recovery required" else "Brick removal"
            textSize = 23f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = if (invalidStage) {
                "Deprovision metadata is invalid. Brick stays stopped to protect your data and device policies. Purge/release state cannot be verified. An authorised repair is required before the deprovision flow can continue."
            } else {
                "Brick local state has been purged. Only the uninstall handoff remains. No tracking, diagnostics, recovery, evidence, keys, or other Brick runtime state will be recreated."
            }
            textSize = 14f
            setPadding(0, dp(10), 0, dp(18))
        })
        root.addView(TextView(this).apply {
            text = "Stage: ${DeprovisionManager.stage(this@DiagnosticsActivity)}"
            typeface = Typeface.MONOSPACE
            textSize = 13f
        })
        root.addView(Button(this).apply {
            text = if (invalidStage) "Deprovision repair required" else "Uninstall Brick"
            isEnabled = !invalidStage
            isAllCaps = false
            setOnClickListener {
                val result = DeprovisionManager.uninstall(applicationContext)
                toast(result.detail)
                if (!result.ok) {
                    text = "Retry uninstall"
                }
            }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(18)
        })
        return root
    }

    private fun enterPostPurgeUi() {
        main.removeCallbacks(autoRefresh)
        latestPrivacyReport = ""
        setContentView(buildPostPurgeUi())
    }

    private fun buildUi(): View {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        fun params(top: Int = 8) = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(top) }
        fun button(label: String, action: () -> Unit) = Button(this).apply {
            text = label
            isAllCaps = false
            setOnClickListener { action() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(28))
        }
        root.addView(TextView(this).apply {
            text = "Brick Maintenance & Recovery"
            textSize = 23f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = "Local-only recovery console · no backend secret · changes are one-shot/provenance-aware"
            textSize = 12f
            setPadding(0, dp(4), 0, dp(12))
        })

        stateView = TextView(this).apply {
            textSize = 13f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
        }
        root.addView(stateView)

        root.addView(section("ONE-SHOT MAINTENANCE", dp(18)))
        val locationRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        locationRow.addView(
            button("Location ON") { locationOneShot(true) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        locationRow.addView(
            button("Location OFF") { locationOneShot(false) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) }
        )
        root.addView(locationRow, params(4))

        val wifiRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        wifiRow.addView(
            button("Wi-Fi ON") { wifiOneShot(true) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        wifiRow.addView(
            button("Wi-Fi OFF") { wifiOneShot(false) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) }
        )
        root.addView(wifiRow, params(6))
        root.addView(TextView(this).apply {
            text = "Mobile data / SIM actuators: UNSUPPORTED — field verification required on each target OPPO before enablement."
            textSize = 12f
            setTextColor(Color.DKGRAY)
            setPadding(0, dp(6), 0, 0)
        })

        root.addView(section("DEEP OFF", dp(18)))
        deepOffButton = button("Deep Off") { toggleDeepOff() }
        root.addView(deepOffButton, params(4))
        root.addView(TextView(this).apply {
            text = "Deep Off durably quiesces Brick and survives reboot. Reactivation is explicit and does not restore radio choices Brick did not change."
            textSize = 12f
        })

        root.addView(section("ROLE / RE-PROVISION", dp(18)))
        root.addView(button("Provision this phone as parent/guardian") { askParentPortal() }, params(4))
        root.addView(button("Reset role for re-provisioning") { confirmResetRole() }, params(6))

        root.addView(section("FIVE-STAGE DEPROVISION", dp(18)))
        deprovisionButton = button("Advance deprovision") { confirmAdvanceDeprovision() }
        root.addView(deprovisionButton, params(4))
        root.addView(TextView(this).apply {
            text = "AUTHORISE/FREEZE → QUIESCE → UNDO DEVICE MANAGEMENT → PURGE BRICK → UNINSTALL. Policies are reversed before ownership release."
            textSize = 12f
        })

        root.addView(section("SYSTEM STATE TIMELINE", dp(18)))
        timelineView = TextView(this).apply {
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
        }
        root.addView(timelineView)

        root.addView(section("PRIVACY-REDUCED DIAGNOSTICS", dp(18)))
        val exportRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        exportRow.addView(
            button("Copy report") { copyReport() },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        exportRow.addView(
            button("Share report") { shareReport() },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) }
        )
        root.addView(exportRow, params(4))

        return ScrollView(this).apply { addView(root) }
    }

    private fun section(label: String, topPadding: Int) = TextView(this).apply {
        text = label
        textSize = 15f
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, topPadding, 0, 4)
    }

    private fun locationOneShot(enabled: Boolean) {
        if (DeepOffManager.isActive(this)) {
            toast("Reactivate Brick before a maintenance radio action")
            return
        }
        worker.execute {
            val now = System.currentTimeMillis()
            val id = "maintloc-${UUID.randomUUID()}"
            val stored = runCatching {
                ParentLocationStateStore.applyVerified(
                    applicationContext,
                    if (enabled) DesiredLocationState.ON else DesiredLocationState.OFF,
                    id,
                    UUID.randomUUID().toString(),
                    now,
                    now + 10 * 60_000L,
                    now
                )
            }.getOrDefault(false)
            if (stored) runCatching { ManagedPolicy.apply(applicationContext) }
            val result = ParentLocationStateStore.read(applicationContext)
            runOnUiThread {
                toast("Location ${if (enabled) "ON" else "OFF"}: ${result.status}${result.actualAfter?.let { " · actual=$it" } ?: ""}")
                refreshState()
            }
        }
    }

    private fun wifiOneShot(enabled: Boolean) {
        if (DeepOffManager.isActive(this)) {
            toast("Reactivate Brick before a maintenance radio action")
            return
        }
        worker.execute {
            val result = WifiOneShotControl.apply(applicationContext, enabled)
            DiagnosticStore.log(
                applicationContext,
                if (result.success) DiagnosticStore.Severity.INFO else DiagnosticStore.Severity.WARN,
                "maintenance",
                "wifi_one_shot",
                "target=$enabled actual=${result.actualEnabled} result=${result.detail}"
            )
            runOnUiThread {
                toast("Wi-Fi ${if (enabled) "ON" else "OFF"}: ${if (result.success) "confirmed" else result.detail}")
                refreshState()
            }
        }
    }

    private fun toggleDeepOff() {
        worker.execute {
            val active = DeepOffManager.isActive(applicationContext)
            val ok = if (active) DeepOffManager.reactivate(applicationContext) else DeepOffManager.enter(applicationContext)
            DiagnosticStore.log(
                applicationContext,
                if (ok) DiagnosticStore.Severity.INFO else DiagnosticStore.Severity.ERROR,
                "deep_off",
                if (active) "reactivation_requested" else "deep_off_entered",
                "ok=$ok"
            )
            runOnUiThread {
                toast(if (ok) { if (active) "Brick reactivated" else "Deep Off active" } else "Deep Off action failed")
                refreshState()
            }
        }
    }

    private fun askParentPortal() {
        val input = EditText(this).apply {
            hint = "https://your-brick-domain"
            setText(DeviceRoleStore.parentPortal(this@DiagnosticsActivity) ?: "")
        }
        AlertDialog.Builder(this)
            .setTitle("Provision parent/guardian role")
            .setMessage("This phone will stop child tracking and open the authenticated parent portal instead.")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("PROVISION") { _, _ ->
                val ok = DeviceRoleStore.provisionParentGuardian(this, input.text.toString())
                toast(if (ok) "Parent/guardian role provisioned" else "Secure HTTPS portal URL required")
                refreshState()
            }.show()
    }

    private fun confirmResetRole() {
        AlertDialog.Builder(this)
            .setTitle("Reset role for re-provisioning?")
            .setMessage("Tracking is quiesced and child pairing identity on this installation is cleared. History in the backend is not renamed or silently reassigned.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("RESET") { _, _ ->
                val ok = DeviceRoleStore.resetForReprovision(this)
                toast(if (ok) "Role reset" else "Role reset failed")
                refreshState()
            }.show()
    }

    private fun confirmAdvanceDeprovision() {
        val stage = DeprovisionManager.stage(this)
        val next = when (stage) {
            DeprovisionManager.Stage.INVALID -> "RECOVERY REQUIRED"
            DeprovisionManager.Stage.NONE -> "AUTHORISE/FREEZE"
            DeprovisionManager.Stage.AUTHORISE_FREEZE -> "QUIESCE"
            DeprovisionManager.Stage.QUIESCE -> "UNDO DEVICE MANAGEMENT"
            DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT -> "PURGE BRICK"
            DeprovisionManager.Stage.PURGE_BRICK -> "UNINSTALL"
            DeprovisionManager.Stage.UNINSTALL -> "UNINSTALL already requested"
        }
        AlertDialog.Builder(this)
            .setTitle("Advance to $next?")
            .setMessage("Deprovisioning is monotonic. Read the stage name carefully before continuing.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("CONTINUE") { _, _ ->
                worker.execute {
                    val result = when (stage) {
                        DeprovisionManager.Stage.INVALID -> DeprovisionManager.Result(stage, false, "deprovision state invalid; repair required")
                        DeprovisionManager.Stage.NONE -> DeprovisionManager.authoriseFreeze(applicationContext)
                        DeprovisionManager.Stage.AUTHORISE_FREEZE -> DeprovisionManager.quiesce(applicationContext)
                        DeprovisionManager.Stage.QUIESCE -> DeprovisionManager.undoDeviceManagement(applicationContext)
                        DeprovisionManager.Stage.UNDO_DEVICE_MANAGEMENT -> DeprovisionManager.purgeBrick(applicationContext)
                        DeprovisionManager.Stage.PURGE_BRICK,
                        DeprovisionManager.Stage.UNINSTALL -> DeprovisionManager.uninstall(applicationContext)
                    }
                    runOnUiThread {
                        toast("${result.stage}: ${result.detail}")
                        if (DeprovisionManager.isPostPurge(applicationContext)) enterPostPurgeUi()
                        else refreshState()
                    }
                }
            }.show()
    }

    private fun refreshState() {
        if (worker.isShutdown) return
        if (DeprovisionManager.isPostPurge(this)) {
            enterPostPurgeUi()
            return
        }
        worker.execute {
            val role = DeviceRoleStore.role(applicationContext)
            val deep = DeepOffManager.snapshot(applicationContext)
            val command = ParentLocationStateStore.read(applicationContext)
            val ledger = PolicyLedger.active(applicationContext)
            val deprov = DeprovisionManager.stage(applicationContext)
            val owner = ManagedPolicy.isDeviceOwner(applicationContext)
            val report = DiagnosticStore.fullReport(applicationContext)
            val events = DiagnosticStore.recentEvents(applicationContext, 40).takeLast(40)
            latestPrivacyReport = report
            val state = buildString {
                appendLine("Version: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                appendLine("Role: $role")
                appendLine("Deep Off: ${deep.active}${if (deep.enteredAtMs > 0) " · since ${deep.enteredAtMs}" else ""}")
                appendLine("Device Owner: $owner")
                appendLine("Policy Ledger active: ${ledger.size}")
                appendLine("Last Location command: ${command.status}${command.target?.let { " target=$it" } ?: ""}${command.actualAfter?.let { " actual=$it" } ?: ""}")
                appendLine("Deprovision: $deprov")
            }
            val timeline = buildString {
                if (events.isEmpty()) append("No maintenance/system events recorded yet.")
                events.forEach { e ->
                    appendLine("${e.wallMs} ${e.severity} ${e.component}/${e.event} ${e.detail.take(160)}")
                }
            }
            runOnUiThread {
                if (isFinishing || isDestroyed || DeprovisionManager.isPostPurge(applicationContext)) return@runOnUiThread
                stateView.text = state
                timelineView.text = timeline
                deepOffButton.text = if (deep.active) "Reactivate Brick" else "Enter Deep Off"
                deprovisionButton.text = "Advance deprovision · $deprov"
            }
        }
    }

    private fun copyReport() {
        if (DeprovisionManager.isPostPurge(this)) return
        val report = latestPrivacyReport.ifBlank { DiagnosticStore.fullReport(this) }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Brick privacy-reduced diagnostic report", report))
        toast("Privacy-reduced report copied")
    }

    private fun shareReport() {
        if (DeprovisionManager.isPostPurge(this)) return
        val report = latestPrivacyReport.ifBlank { DiagnosticStore.fullReport(this) }
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Brick privacy-reduced diagnostic report")
            putExtra(Intent.EXTRA_TEXT, report)
        }, "Share Brick diagnostic report"))
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
