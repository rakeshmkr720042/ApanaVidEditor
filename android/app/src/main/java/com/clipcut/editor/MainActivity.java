package com.clipcut.editor;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
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
        keepTextBoxesAboveKeyboard(bridge.getWebView());
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

    /**
     * Android 15+ draws every app edge to edge, and then the keyboard no longer makes the app smaller by itself:
     * it covered the text box being typed in (title text, captions, search). Capacitor only keeps the app clear
     * of the status and navigation bars, so this does the same and also keeps it above the keyboard.
     */
    private void keepTextBoxesAboveKeyboard(WebView web) {
        if (web == null || Build.VERSION.SDK_INT < 35) return;
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.LayoutParams lp = v.getLayoutParams();
            if (lp instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
                int bottom = Math.max(bars.bottom, ime.bottom);
                if (m.leftMargin != bars.left || m.topMargin != bars.top || m.rightMargin != bars.right || m.bottomMargin != bottom) {
                    m.leftMargin = bars.left;
                    m.topMargin = bars.top;
                    m.rightMargin = bars.right;
                    m.bottomMargin = bottom;
                    v.setLayoutParams(m);
                }
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(web);
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) KeepAliveService.stop(this);
        super.onDestroy();
    }
}
