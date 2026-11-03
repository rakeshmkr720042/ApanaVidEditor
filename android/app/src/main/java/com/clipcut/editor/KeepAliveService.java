package com.clipcut.editor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/** Foreground service that only exists so Android keeps the app alive while a video is being saved. */
public class KeepAliveService extends Service {

    private static final String CHANNEL = "long-jobs";
    private static final int ID = 4107;
    private PowerManager.WakeLock wakeLock;

    public static void start(Context context, String title, String text) {
        Intent i = new Intent(context, KeepAliveService.class);
        i.putExtra("title", title);
        i.putExtra("text", text);
        ContextCompat.startForegroundService(context, i);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, KeepAliveService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String text = intent != null ? intent.getStringExtra("text") : null;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Saving videos", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(title != null ? title : "Saving your video")
            .setContentText(text != null ? text : "Apna Editor keeps working in the background")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tap)
            .setProgress(0, 0, true)
            .build();
        int type = 0;
        if (Build.VERSION.SDK_INT >= 35) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING;
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        ServiceCompat.startForeground(this, ID, n, type);
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ApnaEditor:save");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(3 * 60 * 60 * 1000L); // never longer than 3 hours
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android 15+ limits media processing to 6 hours a day
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
