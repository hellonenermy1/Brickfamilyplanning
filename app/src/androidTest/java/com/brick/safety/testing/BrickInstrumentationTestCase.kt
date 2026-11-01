package com.brick.safety.testing

import androidx.test.platform.app.InstrumentationRegistry
import junit.framework.TestCase

/**
 * Maintained AndroidX-backed replacement for the deprecated framework
 * android.test.InstrumentationTestCase. Brick's existing JUnit3-style test methods keep their
 * semantics while the actual instrumentation runner/lifecycle comes from AndroidX Test.
 */
open class BrickInstrumentationTestCase : TestCase() {
    protected val instrumentation
        get() = InstrumentationRegistry.getInstrumentation()
}
