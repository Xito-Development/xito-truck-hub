package com.xitodev.truckhub;

import android.content.Context;
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
