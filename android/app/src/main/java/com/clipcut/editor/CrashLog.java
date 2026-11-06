package com.clipcut.editor;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * The Android half of the blackbox: crashes and other events the page cannot see itself (a Java
 * crash, the WebView page process dying, the foreground service failing) are written to a small
 * file. The page reads and empties it on the next start (KeepAlivePlugin.blackbox).
 */
final class CrashLog {
    private static final String FILE = "blackbox-native.txt";
    private static final long MAX = 64 * 1024;

    private CrashLog() {}

    static synchronized void append(Context context, String text) {
        try {
            File f = new File(context.getFilesDir(), FILE);
            if (f.length() > MAX) f.delete();
            String stamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
            try (FileOutputStream out = new FileOutputStream(f, true)) {
                out.write(("[" + stamp + "] " + text + "\n").getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
            // never let the recorder itself crash the app
        }
    }

    static synchronized String readAndClear(Context context) {
        File f = new File(context.getFilesDir(), FILE);
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] data = new byte[(int) Math.min(f.length(), MAX * 2)];
            int n = 0;
            while (n < data.length) {
                int r = in.read(data, n, data.length - n);
                if (r < 0) break;
                n += r;
            }
            return new String(data, 0, n, StandardCharsets.UTF_8);
        } catch (Throwable e) {
            return "";
        } finally {
            f.delete();
        }
    }

    /** Names for ApplicationExitInfo reasons (numbers, so this compiles the same on every SDK). */
    static String reasonName(int reason) {
        switch (reason) {
            case 1: return "EXIT_SELF";
            case 2: return "SIGNALED (killed by the system)";
            case 3: return "LOW_MEMORY (phone ran out of memory)";
            case 4: return "CRASH (Java)";
            case 5: return "CRASH_NATIVE";
            case 6: return "ANR (app not responding)";
            case 7: return "INITIALIZATION_FAILURE";
            case 8: return "PERMISSION_CHANGE";
            case 9: return "EXCESSIVE_RESOURCE_USAGE";
            case 10: return "USER_REQUESTED";
            case 11: return "USER_STOPPED";
            case 12: return "DEPENDENCY_DIED";
            case 13: return "OTHER";
            case 14: return "FREEZER";
            case 15: return "PACKAGE_STATE_CHANGE";
            case 16: return "PACKAGE_UPDATED";
            default: return "UNKNOWN";
        }
    }
}
