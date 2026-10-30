package com.brick.safety.data

import android.location.Location
import java.nio.ByteBuffer
import java.nio.ByteOrder

object Protocol {
    const val VERSION: Byte = 1

    fun encodeLive(epoch: Int, sequence: Long, location: Location, batteryPct: Int, charging: Boolean): ByteArray {
        val b = ByteBuffer.allocate(43).order(ByteOrder.BIG_ENDIAN)
        b.put(VERSION)
        b.putInt(epoch)
        b.putLong(sequence)
        b.putLong(location.elapsedRealtimeNanos / 1_000_000L)
        b.putLong(location.time)
        b.putInt((location.latitude * 1e7).toInt())
        b.putInt((location.longitude * 1e7).toInt())
        b.putInt((location.accuracy * 100).toInt().coerceAtLeast(0))
        b.put(batteryPct.coerceIn(0, 100).toByte())
        b.put((if (charging) 1 else 0).toByte())
        return b.array()
    }
}
