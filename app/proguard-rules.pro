# Brick Phase 6B release hardening.
# Keep this file intentionally small. Android Gradle Plugin/R8 receives manifest/component rules
# automatically and bundled libraries provide their own consumer rules. Add a keep rule here only
# when a verified runtime/reflection requirement proves it is necessary.

# Preserve source/line metadata in crash traces without disabling optimization or obfuscation.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
