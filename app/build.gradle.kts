import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseKeystorePath = providers.environmentVariable("BRICK_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("BRICK_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("BRICK_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("BRICK_KEY_PASSWORD").orNull
val releaseSigningAvailable = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

dependencyLocking {
    lockAllConfigurations()
}

android {
    namespace = "com.brick.safety"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.brick.safety"
        minSdk = 29
        targetSdk = 35
        versionCode = 10
        versionName = "1.0.0-rc.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Production/release-candidate path. Disposable beta expiry is disabled here; test builds
        // may exercise BetaSafety explicitly, but normal V1 runtime must not self-expire.
        buildConfigField("boolean", "BRICK_BETA", "false")
        buildConfigField("long", "BRICK_BETA_EXPIRY_EPOCH_MS", "0L")
        buildConfigField("String", "BRICK_BETA_CHANNEL", "\"v1-release-candidate\"")
    }

    buildFeatures {
        viewBinding = true
        aidl = true
        buildConfig = true
    }

    signingConfigs {
        if (releaseSigningAvailable) {
            create("brickRelease") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (releaseSigningAvailable) signingConfig = signingConfigs.getByName("brickRelease")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("com.google.android.material:material:1.13.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
