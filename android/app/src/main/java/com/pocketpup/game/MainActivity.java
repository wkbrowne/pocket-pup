package com.pocketpup.game;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Full-screen shell around the game page bundled in assets. Saves live in the WebView's local storage. */
public class MainActivity extends Activity {
    private WebView web;
    private long lastBack;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // the game saves to localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                              // ignore the system font-size setting so the layout holds
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {   // no text-selection menu on long press
            @Override public boolean onLongClick(View v) { return true; }
        });
        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(0xFF2B2350);

        if (state == null) web.loadUrl("file:///android_asset/index.html");
        else web.restoreState(state);
        hideSystemBars();
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Leaving the app (Home, Back, screen off) saves the game first.
    @Override protected void onPause() {
        web.evaluateJavascript("window.pocketSave && window.pocketSave()", null);
        super.onPause();
        web.onPause();
    }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    // A stray tap on Back should not end the game: ask for a second press.
    @Override public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); return; }
        lastBack = now;
        Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT).show();
    }
}
