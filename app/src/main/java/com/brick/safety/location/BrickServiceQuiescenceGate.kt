package com.brick.safety.location

import android.os.Looper
import android.os.SystemClock
import java.util.concurrent.ExecutorService
import java.util.concurrent.TimeUnit

/**
 * In-process location-service writer drain. Android stopService() and Executor.shutdownNow()
 * are asynchronous requests; neither by itself proves that an in-flight storage write ended.
 *
 * Retain an active instance until every owned executor has ACTUALLY terminated. Deprovision
 * must fail closed on timeout rather than delete stores out from under a live writer.
 */
object BrickServiceQuiescenceGate {
    private val monitor = Object()
    private var activeInstances = 0

    fun serviceStarted() {
        synchronized(monitor) {
            activeInstances++
            monitor.notifyAll()
        }
    }

    fun serviceShutdownRequested(executors: List<ExecutorService>) {
        Thread({
            // An uninterruptible Binder/HTTP operation can ignore interrupt. This daemon
            // intentionally waits as long as that old writer exists; purge uses a bounded wait.
            try {
                for (executor in executors) {
                    while (!executor.isTerminated) {
                        try {
                            executor.awaitTermination(1L, TimeUnit.SECONDS)
                        } catch (_: InterruptedException) {
                            // Continue observing; a stopped thread cannot be certified by a
                            // cancelled await. The process dying kills all its writers.
                        }
                    }
                }
            } finally {
                synchronized(monitor) {
                    if (activeInstances > 0) activeInstances--
                    monitor.notifyAll()
                }
            }
        }, "brick-service-drain").apply {
            isDaemon = true
            start()
        }
    }

    /**
     * Call from DeprovisionManager's background worker, not Android's main thread. No service
     * active means no local tracking writer. Never block the main Looper awaiting onDestroy().
     */
    fun awaitQuiescent(timeoutMs: Long): Boolean {
        require(timeoutMs in 1L..60_000L)
        synchronized(monitor) {
            if (activeInstances == 0) return true
            if (Looper.myLooper() == Looper.getMainLooper()) return false
            val deadline = SystemClock.elapsedRealtime() + timeoutMs
            while (activeInstances > 0) {
                val remaining = deadline - SystemClock.elapsedRealtime()
                if (remaining <= 0L) return false
                try {
                    monitor.wait(remaining)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return false
                }
            }
            return true
        }
    }
}
