package com.xitodev.truckhub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import android.content.Context;
import android.graphics.Color;
import android.view.Window;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Descarga el APK de la nueva versión con progreso y abre el instalador de Android
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdater extends Plugin {

    private File apkFile() { return new File(getContext().getCacheDir(), "xito-update.apk"); }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Dirección no válida"); return; }
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                String current = url;
                // Sigue las redirecciones de GitHub a su servidor de descargas
                for (int i = 0; i < 6; i++) {
                    con = (HttpURLConnection) new URL(current).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000); con.setReadTimeout(30000);
                    con.setRequestProperty("User-Agent", "XitoTruckHub-Android");
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) { current = con.getHeaderField("Location"); con.disconnect(); continue; }
                    if (code != 200) throw new Exception("La descarga respondió " + code);
                    break;
                }
                long total = con.getContentLengthLong();
                File out = apkFile();
                try (InputStream in = con.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long got = 0; int n; int lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        fos.write(buf, 0, n); got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : 0;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject(); p.put("pct", pct); p.put("got", got); p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (out.length() < 1_000_000) throw new Exception("El archivo descargado no es válido");
                JSObject ret = new JSObject(); ret.put("size", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Error de descarga" : e.getMessage());
            } finally { if (con != null) con.disconnect(); }
        }).start();
    }

    // Pinta la barra de estado y la de navegación del color del tema de la app (en todas las versiones de Android)
    @PluginMethod
    public void setBarsColor(PluginCall call) {
        final String hex = call.getString("color", "#0E1522");
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        Activity act = getActivity();
        if (act == null) { call.resolve(); return; }
        act.runOnUiThread(() -> {
            try {
                int c = Color.parseColor(hex);
                Window w = act.getWindow();
                w.getDecorView().setBackgroundColor(c);
                w.setStatusBarColor(c);
                w.setNavigationBarColor(c);
                WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(w, w.getDecorView());
                ctl.setAppearanceLightStatusBars(light);
                ctl.setAppearanceLightNavigationBars(light);
            } catch (Exception ignored) { }
            call.resolve();
        });
    }

    // Pantalla completa de borde a borde: la app se dibuja debajo de las barras (transparentes)
    // y devuelve cuánto ocupan para que el contenido no quede tapado
    @PluginMethod
    public void edgeToEdge(PluginCall call) {
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        Activity act = getActivity();
        if (act == null) { call.resolve(); return; }
        act.runOnUiThread(() -> {
            JSObject r = new JSObject();
            try {
                Window w = act.getWindow();
                WindowCompat.setDecorFitsSystemWindows(w, false);
                w.setStatusBarColor(Color.TRANSPARENT);
                w.setNavigationBarColor(Color.TRANSPARENT);
                if (Build.VERSION.SDK_INT >= 29) { w.setStatusBarContrastEnforced(false); w.setNavigationBarContrastEnforced(false); }
                WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(w, w.getDecorView());
                ctl.setAppearanceLightStatusBars(light);
                ctl.setAppearanceLightNavigationBars(light);
                float d = act.getResources().getDisplayMetrics().density;
                WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(w.getDecorView());
                if (ins != null) {
                    Insets b = ins.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                    r.put("top", Math.round(b.top / d)); r.put("bottom", Math.round(b.bottom / d));
                }
            } catch (Exception ignored) { }
            call.resolve(r);
        });
    }

    // Descarga una dirección con un navegador interno invisible (el mismo motor que Chrome).
    // Sirve para servicios protegidos por Cloudflare que rechazan las peticiones «de app».
    private WebView ghost;
    private boolean ghostBusy = false;
    private final java.util.ArrayDeque<PluginCall> ghostQueue = new java.util.ArrayDeque<>();

    @PluginMethod
    public void webGet(PluginCall call) {
        call.setKeepAlive(true);
        getActivity().runOnUiThread(() -> { ghostQueue.add(call); nextGhost(); });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void nextGhost() {
        if (ghostBusy || ghostQueue.isEmpty()) return;
        final PluginCall call = ghostQueue.poll();
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Dirección no válida"); nextGhost(); return; }
        ghostBusy = true;
        if (ghost == null) {
            ghost = new WebView(getContext());
            WebSettings ws = ghost.getSettings();
            ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true);
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(ghost, true);
        }
        final Handler h = new Handler(Looper.getMainLooper());
        final boolean[] done = { false };
        final Runnable finish = () -> { done[0] = true; ghostBusy = false; ghost.stopLoading(); nextGhost(); };
        final Runnable timeout = () -> { if (!done[0]) { call.reject("El servicio no responde"); call.release(getBridge()); finish.run(); } };
        h.postDelayed(timeout, 25000);
        ghost.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String u) {
                if (done[0]) return;
                // Tras la comprobación de Cloudflare la página se recarga sola: se espera a que sea JSON
                view.evaluateJavascript("(function(){var t=document.body?document.body.innerText:'';return t;})()", (res) -> {
                    if (done[0] || res == null) return;
                    String txt;
                    try { txt = new org.json.JSONArray("[" + res + "]").getString(0); } catch (Exception e) { txt = ""; }
                    String tt = txt.trim();
                    if (tt.startsWith("{") || tt.startsWith("[")) {
                        h.removeCallbacks(timeout);
                        JSObject r = new JSObject(); r.put("body", tt);
                        call.resolve(r); call.release(getBridge());
                        finish.run();
                    }
                });
            }
        });
        ghost.loadUrl(url);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        File f = apkFile();
        if (!f.exists()) { call.reject("Primero hay que descargar la actualización"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            // Android pide permiso para instalar apps desde esta app (solo la primera vez)
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            JSObject r = new JSObject(); r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        JSObject r = new JSObject(); r.put("started", true);
        call.resolve(r);
    }
}
