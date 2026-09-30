package com.xitodev.truckhub;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// Notificación fija del temporizador de descanso: cuenta atrás en directo con diseño propio
@CapacitorPlugin(name = "RestTimer")
public class RestTimer extends Plugin {
    public static final int NOTIF_ID = 4242;
    private static final String CHANNEL = "xito_rest";

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Temporizador de descanso", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Cuenta atrás del descanso mientras dura");
            ch.setShowBadge(false);
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        long endAt = call.getLong("endAt", System.currentTimeMillis() + 15 * 60000L);
        long remaining = Math.max(1000, endAt - System.currentTimeMillis());
        ensureChannel(ctx);
        ctx.getSharedPreferences("xito_rest", Context.MODE_PRIVATE).edit().putBoolean("stopped", false).apply();

        String ends = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(endAt));
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.notif_rest);
        rv.setTextViewText(R.id.rest_title, "Descanso en curso");
        rv.setTextViewText(R.id.rest_sub, "Termina a las " + ends);
        rv.setChronometer(R.id.rest_chrono, SystemClock.elapsedRealtime() + remaining, null, true);
        if (Build.VERSION.SDK_INT >= 24) rv.setChronometerCountDown(R.id.rest_chrono, true);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent piOpen = open != null ? PendingIntent.getActivity(ctx, 1, open, flags) : null;
        PendingIntent piStop = PendingIntent.getBroadcast(ctx, 2, new Intent(ctx, RestStopReceiver.class), flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_rest)
            .setColor(0xFFFFB547)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(rv)
            .setCustomBigContentView(rv)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setTimeoutAfter(remaining)
            .addAction(0, "Parar", piStop);
        if (piOpen != null) b.setContentIntent(piOpen);
        try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, b.build()); } catch (SecurityException e) { call.reject("Sin permiso de notificaciones"); return; }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIF_ID);
        call.resolve();
    }

    // ¿Se ha pulsado «Parar» en la notificación? (se consulta al volver a la app)
    @PluginMethod
    public void consumeStopped(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences("xito_rest", Context.MODE_PRIVATE);
        boolean s = p.getBoolean("stopped", false);
        if (s) p.edit().putBoolean("stopped", false).apply();
        JSObject r = new JSObject(); r.put("stopped", s);
        call.resolve(r);
    }
}
