package com.brick.safety.activity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

class ActivityReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (ActivityRecognitionResult.hasResult(intent)) {
            val result = ActivityRecognitionResult.extractResult(intent) ?: return
            val best = result.mostProbableActivity
            val mode = map(best.type)
            // Sampling gives the confidence. Require a meaningful result before replacing a
            // previously stable state; this avoids low-confidence flapping.
            val current = ActivityState.read(context)
            if (best.confidence >= 60 || current.mode == ActivityMode.UNKNOWN || mode == current.mode) {
                ActivityState.write(context, mode, best.confidence)
            }
            return
        }

        if (ActivityTransitionResult.hasResult(intent)) {
            val result = ActivityTransitionResult.extractResult(intent) ?: return
            val entered = result.transitionEvents.lastOrNull {
                it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
            } ?: return
            val mode = map(entered.activityType)
            val current = ActivityState.read(context)
            // Transition API is the stable activity boundary; confidence remains from the most
            // recent sampling result if it agrees, otherwise 0 until a sample confirms it.
            ActivityState.write(context, mode, if (current.mode == mode) current.confidence else 0)
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
