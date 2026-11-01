package com.brick.safety.fusion

import android.content.Context
import com.brick.safety.activity.ActivityMode

/** Optional process-local bridge so the pure fusion selector does not own Android persistence. */
object Phase5HypothesisRuntime {
    @Volatile private var recorder: Phase5HypothesisRecorder? = null

    @Synchronized
    fun initialize(context: Context) {
        if (recorder == null) recorder = Phase5HypothesisRecorder(context.applicationContext)
    }

    fun record(selection: Phase5FusionSelection): Boolean =
        runCatching { recorder?.record(selection, ActivityMode.UNKNOWN) ?: false }.getOrDefault(false)
}
