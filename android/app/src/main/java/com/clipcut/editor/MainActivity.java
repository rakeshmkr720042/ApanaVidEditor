package com.clipcut.editor;

import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static boolean crashHandlerSet = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!crashHandlerSet) {
            // blackbox: a Java crash is written down before Android closes the app
            crashHandlerSet = true;
            final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
            final android.content.Context app = getApplicationContext();
            Thread.setDefaultUncaughtExceptionHandler((thread, e) -> {
                CrashLog.append(app, "App crashed in thread " + thread.getName() + ":\n" + Log.getStackTraceString(e));
                if (previous != null) previous.uncaughtException(thread, e);
            });
        }
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's process died, almost always because the phone ran out of memory
                // (a long or 4K export). Unhandled, Android closes the whole app. Instead start
                // the screen again: projects are autosaved, and the page tells the user what happened.
                CrashLog.append(MainActivity.this, "WebView page process ended: "
                    + (detail != null && detail.didCrash() ? "it crashed" : "killed by Android, usually out of memory")
                    + (detail != null ? " (priority at exit " + detail.rendererPriorityAtExit() + ")" : "")
                    + ". The screen was restarted.");
                KeepAliveService.stop(MainActivity.this);
                recreate();
                return true;
            }
        });
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) KeepAliveService.stop(this);
        super.onDestroy();
    }
}
