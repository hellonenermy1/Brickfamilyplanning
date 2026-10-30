plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.brick.safety"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.brick.safety"
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-phase2"
    }

    buildFeatures { viewBinding = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("com.google.android.material:material:1.13.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}
