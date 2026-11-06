package com.clipcut.editor;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * Keeps a long job (export, compress) going when the user switches to another app or the screen
 * turns off: a foreground service with a "Saving video" notification so Android does not stop
 * the app, plus keep-screen-on while the app is visible.
 */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Saving your video");
        String text = call.getString("text", "Apna Editor keeps working in the background");
        boolean running = false;
        try {
            KeepAliveService.start(getContext(), title, text);
            running = true;
        } catch (Exception e) {
            // not allowed right now (e.g. started from the background): the job still runs while the app is open
            CrashLog.append(getContext(), "Background service not started: " + e);
        }
        getActivity().runOnUiThread(() -> getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        JSObject ret = new JSObject();
        ret.put("background", running);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        KeepAliveService.stop(getContext());
        getActivity().runOnUiThread(() -> getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        call.resolve();
    }

    /**
     * For the blackbox: crash notes written by the app (CrashLog) and, on Android 11+, why the
     * system ended the app the last few times (out of memory, crash, not responding...).
     */
    @PluginMethod
    public void blackbox(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", CrashLog.readAndClear(getContext()));
        JSArray exits = new JSArray();
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
                List<ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(getContext().getPackageName(), 0, 5);
                for (ApplicationExitInfo x : list) {
                    JSObject o = new JSObject();
                    o.put("at", x.getTimestamp());
                    o.put("reason", CrashLog.reasonName(x.getReason()));
                    String desc = x.getDescription();
                    o.put("detail", "process " + x.getProcessName()
                        + ", importance " + x.getImportance()
                        + ", memory pss " + (x.getPss() / 1024) + " MB, rss " + (x.getRss() / 1024) + " MB"
                        + (desc != null ? ", " + desc : ""));
                    exits.put(o);
                }
            } catch (Exception e) {
                // not available on this phone
            }
        }
        ret.put("exits", exits);
        call.resolve(ret);
    }
}
