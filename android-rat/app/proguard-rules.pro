# ==================== R8 DEFENSIVO (release) ====================
# Substitui o bloco -dontobfuscate anterior. Ajuste com -keep pontual se runtime falhar.

-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
-dontoptimize
-allowaccessmodification

# LSParanoid string encryption runtime
-keep class org.lsposed.lsparanoid.** { *; }

# Manifest entry points
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application

# Accessibility framework callbacks
-keep public class * extends android.accessibilityservice.AccessibilityService {
    protected void onServiceConnected();
    public void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent);
    public void onInterrupt();
}

# Accessibility shell (broadcast Intent strings — no @Obfuscate)
-keepnames class com.seguranca.protecao.UiAssistBridge

# Component id helper (Settings API)
-keep class com.seguranca.protecao.AppComponents { *; }

# Gson / OkHttp
-keep class com.google.gson.** { *; }
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**

# Room (dependency present)
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class *

# ViewBinding
-keep class * implements androidx.viewbinding.ViewBinding {
    public static ** bind(android.view.View);
    public static ** inflate(...);
}

# Suppress noise
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
