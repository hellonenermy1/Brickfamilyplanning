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
import androidx.appcompat.app.AppCompatActivity
import java.util.concurrent.Executors

class DiagnosticsActivity : AppCompatActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var sessionText: TextView
    private lateinit var errorBanner: TextView
    private lateinit var reportView: TextView
    private lateinit var sessionButton: Button
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
            text = "BRICK 6C BETA DIAGNOSTICS"
            textSize = 23f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = "OPPO field-test black box • no coordinates in diagnostic logs"
            textSize = 12f
            setPadding(0, dp(4), 0, dp(12))
        })

        sessionText = TextView(this).apply {
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(sessionText)

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
            }
        }
    }

    private fun copyReport() {
        val report = latestReport.ifBlank { DiagnosticStore.fullReport(this) }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Brick 6C diagnostic report", report))
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "ui", "report_copied", "chars=${report.length}")
        toast("Full report copied")
    }

    private fun shareReport() {
        val report = latestReport.ifBlank { DiagnosticStore.fullReport(this) }
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "ui", "report_shared", "chars=${report.length}")
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Brick Phase 6C Beta diagnostic report")
            putExtra(Intent.EXTRA_TEXT, report)
        }, "Share Brick diagnostic report"))
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
