package com.clipcut.editor;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
