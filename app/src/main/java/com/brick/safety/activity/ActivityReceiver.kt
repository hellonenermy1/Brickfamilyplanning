package com.brick.safety.activity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

internal object ActivityModeFilter {
    private const val MIN_SAMPLE_CONFIDENCE = 60

    /**
     * Sampling may confirm the current mode at any confidence, but changing to a different mode
     * requires a meaningful confidence score. This prevents low-confidence activity flapping.
     */
    fun sampledMode(current: ActivityMode, candidate: ActivityMode, confidence: Int): ActivityMode? {
        return when {
            candidate == current -> candidate
            candidate == ActivityMode.UNKNOWN -> if (confidence >= MIN_SAMPLE_CONFIDENCE) candidate else null
            current == ActivityMode.UNKNOWN -> if (confidence >= MIN_SAMPLE_CONFIDENCE) candidate else null
            confidence >= MIN_SAMPLE_CONFIDENCE -> candidate
            else -> null
        }
    }

    /**
     * Activity Transition events do not carry confidence. A transition into a different mode is
     * therefore treated as evidence that the old classification is no longer trustworthy, not as
     * proof of the new mode. Publish UNKNOWN until the next sampled result confirms it.
     */
    fun transitionMode(current: ActivityMode, entered: ActivityMode): ActivityMode? {
        if (entered == current) return current
        return ActivityMode.UNKNOWN
    }
}

class ActivityReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (ActivityRecognitionResult.hasResult(intent)) {
            val result = ActivityRecognitionResult.extractResult(intent) ?: return
            val best = result.mostProbableActivity
            val mode = map(best.type)
            val current = ActivityState.read(context)
            val accepted = ActivityModeFilter.sampledMode(current.mode, mode, best.confidence) ?: return
            ActivityState.write(context, accepted, if (accepted == mode) best.confidence else 0)
            return
        }

        if (ActivityTransitionResult.hasResult(intent)) {
            val result = ActivityTransitionResult.extractResult(intent) ?: return
            val entered = result.transitionEvents.lastOrNull {
                it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
            } ?: return
            val mode = map(entered.activityType)
            val current = ActivityState.read(context)
            val accepted = ActivityModeFilter.transitionMode(current.mode, mode) ?: return
            // A transition carries no confidence. If it changes modes, expose UNKNOWN until the
            // next 10-second sample confirms the new transport class instead of guessing.
            ActivityState.write(context, accepted, if (accepted == current.mode) current.confidence else 0)
        }
    }

    private fun map(type: Int): ActivityMode = when (type) {
        DetectedActivity.STILL -> ActivityMode.STATIONARY
        DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> ActivityMode.WALKING
        DetectedActivity.RUNNING -> ActivityMode.RUNNING
        DetectedActivity.ON_BICYCLE -> ActivityMode.BICYCLE
        DetectedActivity.IN_VEHICLE -> ActivityMode.VEHICLE
        else -> ActivityMode.UNKNOWN
    }
}
