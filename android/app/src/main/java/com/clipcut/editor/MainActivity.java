package com.clipcut.editor;

import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's process died, almost always because the phone ran out of memory
                // (a long or 4K export). Unhandled, Android closes the whole app. Instead start
                // the screen again: projects are autosaved, and the page tells the user what happened.
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
