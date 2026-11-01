# Brick Phase 6 release hardening.
# Shizuku instantiates the UserService reflectively, including the Context constructor on v13+.
# Keep only that entry point; the rest of the app remains eligible for R8 optimization/obfuscation.
-keep class com.brick.safety.privileged.BrickShizukuUserService {
    public <init>();
    public <init>(android.content.Context);
}
