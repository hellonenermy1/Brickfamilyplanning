package com.brick.safety.data

import com.brick.safety.location.PositionSample
import java.nio.ByteBuffer
import java.nio.ByteOrder

object Protocol {
    const val VERSION: Byte = 2
    const val LIVE_PACKET_BYTES = 90
    private const val MISSING = Int.MIN_VALUE

    // V2, big-endian, 90 bytes:
    // version, epoch, sequence, elapsed/wall time,
    // raw lat/lon/accuracy, trusted lat/lon/uncertainty,
    // speed + accuracy, bearing + accuracy, altitude + vertical accuracy,
    // battery, flags, activity/confidence, quality/source,
    // GNSS used/total/average C/N0, step delta.
    fun encodePosition(epoch: Int, sequence: Long, sample: PositionSample, batteryPct: Int, charging: Boolean): ByteArray {
        val b = ByteBuffer.allocate(LIVE_PACKET_BYTES).order(ByteOrder.BIG_ENDIAN)
        b.put(VERSION)
        b.putInt(epoch)
        b.putLong(sequence)
        b.putLong(sample.elapsedRealtimeMs)
        b.putLong(sample.wallTimeMs)
        b.putInt(sample.rawLat?.let(::degreesE7) ?: MISSING)
        b.putInt(sample.rawLon?.let(::degreesE7) ?: MISSING)
        b.putInt(sample.rawAccuracyM?.let(::centimeters) ?: MISSING)
        b.putInt(sample.trustedLat?.let(::degreesE7) ?: MISSING)
        b.putInt(sample.trustedLon?.let(::degreesE7) ?: MISSING)
        b.putInt(centimeters(sample.uncertaintyM))
        b.putInt(sample.speedMps?.let { (it * 100f).toInt().coerceAtLeast(0) } ?: MISSING)
        b.putInt(sample.speedAccuracyMps?.let { (it * 100f).toInt().coerceAtLeast(0) } ?: MISSING)
        b.putInt(sample.bearingDeg?.let { (it * 100f).toInt() } ?: MISSING)
        b.putInt(sample.bearingAccuracyDeg?.let { (it * 100f).toInt().coerceAtLeast(0) } ?: MISSING)
        b.putInt(sample.altitudeM?.let { (it * 100.0).toInt() } ?: MISSING)
        b.putInt(sample.verticalAccuracyM?.let(::centimeters) ?: MISSING)
        b.put(batteryPct.coerceIn(0, 100).toByte())

        var flags = 0
        if (charging) flags = flags or 0x01
        if (sample.rawAccepted) flags = flags or 0x02
        if (sample.rawMock) flags = flags or 0x04
        if (sample.speedMps != null) flags = flags or 0x08
        if (sample.bearingDeg != null) flags = flags or 0x10
        if (sample.altitudeM != null) flags = flags or 0x20
        if (sample.source.code != 1) flags = flags or 0x40
        b.putShort(flags.toShort())

        b.put(sample.activity.mode.code.toByte())
        b.put(sample.activity.confidence.coerceIn(0, 100).toByte())
        b.put(sample.quality.code.toByte())
        b.put(sample.source.code.toByte())
        b.put(sample.gnss.usedInFix.coerceIn(0, 255).toByte())
        b.put(sample.gnss.totalSatellites.coerceIn(0, 255).toByte())
        val cn0 = sample.gnss.averageCn0DbHz?.let { (it * 10f).toInt().coerceIn(0, 65_535) } ?: 0
        b.putShort(cn0.toShort())
        b.putShort(sample.stepDelta.coerceIn(0, 65_535).toShort())
        return b.array()
    }

    private fun degreesE7(v: Double): Int = (v * 1e7).roundToIntSafe()
    private fun centimeters(v: Float): Int = (v * 100f).toInt().coerceAtLeast(0)
    private fun Double.roundToIntSafe(): Int = when {
        this >= Int.MAX_VALUE -> Int.MAX_VALUE
        this <= Int.MIN_VALUE -> Int.MIN_VALUE
        else -> kotlin.math.round(this).toInt()
    }
}
