package com.brick.safety.privileged

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit

/**
 * Single-call lane that can be rotated after an untrusted/remote invocation wedges its worker.
 * Threads are daemon threads so an abandoned Binder call cannot keep the app process alive.
 */
internal class RecoverableExecutorLane(private val threadName: String) {
    @Volatile private var executor: ExecutorService = newExecutor()

    private fun newExecutor(): ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, threadName).apply { isDaemon = true }
    }

    fun <T> submit(action: () -> T): Future<T> {
        val current = executor
        return try {
            current.submit<T> { action() }
        } catch (_: RejectedExecutionException) {
            // A concurrent timeout may have rotated the lane between the read and submit. Retry once
            // on the replacement lane rather than surfacing an artificial provider failure.
            executor.submit<T> { action() }
        }
    }

    fun <T> call(timeoutMs: Long, action: () -> T): Result<T> {
        val future = runCatching { submit(action) }.getOrElse { return Result.failure(it) }
        return try {
            Result.success(future.get(timeoutMs.coerceAtLeast(1L), TimeUnit.MILLISECONDS))
        } catch (t: Throwable) {
            future.cancel(true)
            Result.failure(t)
        }
    }

    /**
     * Abandons the current lane and immediately provides a fresh worker for later calls. shutdownNow
     * is best-effort only: a Binder/native call may ignore interruption, which is why replacement is
     * the recovery boundary rather than waiting for the old worker to exit.
     */
    @Synchronized
    fun rotate() {
        val old = executor
        executor = newExecutor()
        old.shutdownNow()
    }

    @Synchronized
    fun shutdown() {
        executor.shutdownNow()
    }
}
