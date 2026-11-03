package com.brick.safety.maintenance

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.RecoveryWorker
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.concurrent.TimeUnit

@Suppress("DEPRECATION")
class Phase8WorkManagerDrainInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val TEST_OWNED_NAME = "brick-soon-recovery"
    }

    private lateinit var context: Context
    private lateinit var workManager: WorkManager

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteSharedPreferences("brick_deprovision_v1")
        workManager = WorkManager.getInstance(context)
        workManager.cancelUniqueWork(TEST_OWNED_NAME).result.get(10, TimeUnit.SECONDS)
        workManager.pruneWork().result.get(10, TimeUnit.SECONDS)
    }

    override fun tearDown() {
        runCatching { workManager.cancelUniqueWork(TEST_OWNED_NAME).result.get(10, TimeUnit.SECONDS) }
        runCatching { workManager.pruneWork().result.get(10, TimeUnit.SECONDS) }
        context.deleteSharedPreferences("brick_deprovision_v1")
        super.tearDown()
    }

    fun testPendingBrickWorkIsCancelledPrunedAndVerifiedAbsent() {
        val request = OneTimeWorkRequestBuilder<RecoveryWorker>()
            .setInitialDelay(1, TimeUnit.HOURS)
            .build()
        workManager.enqueueUniqueWork(TEST_OWNED_NAME, ExistingWorkPolicy.REPLACE, request)
            .result.get(10, TimeUnit.SECONDS)

        val before = workManager.getWorkInfosForUniqueWork(TEST_OWNED_NAME).get(10, TimeUnit.SECONDS)
        assertTrue("expected pending Brick work before deprovision barrier", before.isNotEmpty())
        assertTrue(before.any { !it.state.isFinished })

        assertTrue(RecoveryScheduler.cancelAllAndAwaitForDeprovision(context, 15_000L))

        val after = workManager.getWorkInfosForUniqueWork(TEST_OWNED_NAME).get(10, TimeUnit.SECONDS)
        assertTrue("Brick WorkInfo survived cancel+prune barrier: $after", after.isEmpty())
    }
}
