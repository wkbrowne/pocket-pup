package com.pocketpup.game;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Full-screen shell around the game page bundled in assets. Saves live in the WebView's local storage. */
public class MainActivity extends Activity {
    private WebView web;
    private long lastBack;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

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
        s.setAllowFileAccess(true);
        // The reading voice's files are served from the app's own assets under a made-up address,
        // because a page opened from a file cannot fetch other files directly.
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest rq) {
                android.net.Uri u = rq.getUrl();
                if (u == null || !"populationpup.local".equals(u.getHost())) return null;
                String path = u.getPath() == null ? "" : u.getPath().replaceFirst("^/+", "");
                Map<String, String> h = new HashMap<String, String>();
                h.put("Access-Control-Allow-Origin", "*");
                if (path.contains("..") || !path.startsWith("tts/")) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
                String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : "application/octet-stream";
                try { return new WebResourceResponse(mime, null, 200, "OK", h, getAssets().open(path)); }
                catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0])); }
            }
        });
        web.addJavascriptInterface(new Speech(), "PupSpeech");   // listening questions are read aloud by the tablet's own voice
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS) return;
                int lang = tts.setLanguage(Locale.US);
                if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) return;
                tts.setSpeechRate(0.9f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { speechDone(true); }
                    @Override public void onError(String id) { speechDone(false); }
                });
                ttsReady = true;
            }
        });
        web.setBackgroundColor(0xFF2B2350);

        if (state == null) web.loadUrl("file:///android_asset/index.html");
        else web.restoreState(state);
        hideSystemBars();
    }

    private void speechDone(final boolean ok) {
        runOnUiThread(new Runnable() {
            @Override public void run() { web.evaluateJavascript("window.pupSpeechDone && window.pupSpeechDone(" + ok + ")", null); }
        });
    }

    /** Called from the game page. With no working voice, ok() is false and the page shows the words instead. */
    private class Speech {
        @JavascriptInterface public boolean ok() { return ttsReady; }
        @JavascriptInterface public void speak(String text) {
            if (!ttsReady) { speechDone(false); return; }
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pup") != TextToSpeech.SUCCESS) speechDone(false);
        }
        @JavascriptInterface public void stop() { if (ttsReady) tts.stop(); }
        /** English voices that work offline, as JSON: name, language tag and the engine's own quality score. */
        @JavascriptInterface public String voices() {
            StringBuilder sb = new StringBuilder("[");
            try {
                if (ttsReady && tts.getVoices() != null) for (Voice v : tts.getVoices()) {
                    if (v == null || v.getLocale() == null || !"en".equals(v.getLocale().getLanguage())) continue;
                    if (v.isNetworkConnectionRequired()) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    if (sb.length() > 1) sb.append(',');
                    sb.append("{\"name\":\"").append(v.getName().replace("\"", "")).append("\",\"lang\":\"").append(v.getLocale().toLanguageTag()).append("\",\"q\":").append(v.getQuality()).append('}');
                }
            } catch (Exception e) { }
            return sb.append(']').toString();
        }
        @JavascriptInterface public void setup(String name, float rate, float pitch) {
            if (!ttsReady) return;
            try {
                tts.setSpeechRate(rate); tts.setPitch(pitch);
                if (name != null && name.length() > 0 && tts.getVoices() != null) for (Voice v : tts.getVoices()) if (v != null && name.equals(v.getName())) { tts.setVoice(v); break; }
            } catch (Exception e) { }
        }
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
        if (ttsReady) tts.stop();
        super.onPause();
        web.onPause();
    }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (tts != null) tts.shutdown(); super.onDestroy(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    // A stray tap on Back should not end the game: ask for a second press.
    @Override public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); return; }
        lastBack = now;
        Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT).show();
    }
}
