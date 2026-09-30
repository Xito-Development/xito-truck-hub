package com.xitodev.truckhub;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Botón «Parar» de la notificación del descanso
public class RestStopReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(RestTimer.NOTIF_ID);
        ctx.getSharedPreferences("xito_rest", Context.MODE_PRIVATE).edit().putBoolean("stopped", true).apply();
    }
}
