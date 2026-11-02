import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

public final class BrickOwnerRecovery {
    private static final String PACKAGE = "com.brick.safety";

    private static Object invoke(Object target, String name, Class<?>[] parameterTypes, Object... args)
            throws Exception {
        Method method = target.getClass().getMethod(name, parameterTypes);
        method.setAccessible(true);
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            if (cause instanceof Error) throw (Error) cause;
            throw e;
        }
    }

    public static void main(String[] args) throws Exception {
        boolean clear = args.length == 1 && "--clear".equals(args[0]);
        if (args.length > 0 && !clear) {
            System.err.println("Usage: BrickOwnerRecovery [--clear]");
            System.exit(2);
        }

        Class<?> processClass = Class.forName("android.os.Process");
        int uid = ((Integer) processClass.getMethod("myUid").invoke(null)).intValue();
        System.out.println("uid=" + uid);

        Class<?> serviceManagerClass = Class.forName("android.os.ServiceManager");
        Method getService = serviceManagerClass.getDeclaredMethod("getService", String.class);
        getService.setAccessible(true);
        Object binder = getService.invoke(null, "device_policy");
        if (binder == null) throw new IllegalStateException("device_policy Binder service not found");

        Class<?> iBinderClass = Class.forName("android.os.IBinder");
        Class<?> stubClass = Class.forName("android.app.admin.IDevicePolicyManager$Stub");
        Method asInterface = stubClass.getDeclaredMethod("asInterface", iBinderClass);
        asInterface.setAccessible(true);
        Object dpm = asInterface.invoke(null, binder);
        if (dpm == null) throw new IllegalStateException("IDevicePolicyManager interface unavailable");

        boolean hasOwner = ((Boolean) invoke(dpm, "hasDeviceOwner", new Class<?>[0])).booleanValue();
        System.out.println("hasDeviceOwner=" + hasOwner);

        if (!clear) {
            System.out.println("dry_run=true");
            System.out.println("No policy was changed.");
            return;
        }

        if (!hasOwner) {
            throw new IllegalStateException("Brick UID is not recognized as Device Owner; refusing to clear.");
        }

        System.out.println("clear_requested=true");
        invoke(dpm, "clearDeviceOwner", new Class<?>[]{String.class}, PACKAGE);
        System.out.println("clearDeviceOwner returned without exception.");
        System.out.println("Verify with: adb shell cmd device_policy list-owners");
    }
}
