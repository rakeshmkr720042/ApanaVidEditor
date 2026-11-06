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
    /**
     * Android closes the whole app if a service started with startForegroundService() is stopped
     * before it called startForeground() ("did not then call startForeground"). That happened when
     * an export ended (or failed) a moment after it began. So stop() only asks; the service stops
     * itself right after it has become a foreground service.
     */
    private static volatile boolean stopWanted = false;
    private static volatile boolean inForeground = false;

    public static void start(Context context, String title, String text) {
        stopWanted = false;
        Intent i = new Intent(context, KeepAliveService.class);
        i.putExtra("title", title);
        i.putExtra("text", text);
        ContextCompat.startForegroundService(context, i);
    }

    public static void stop(Context context) {
        stopWanted = true;
        if (inForeground) context.stopService(new Intent(context, KeepAliveService.class));
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
        try {
            ServiceCompat.startForeground(this, ID, n, type);
        } catch (Exception e) {
            // e.g. the media processing time for today is used up: try the other declared type once
            CrashLog.append(this, "Foreground service type " + type + " refused: " + e);
            try {
                int other = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
                ServiceCompat.startForeground(this, ID, n, other);
            } catch (Exception e2) {
                CrashLog.append(this, "Foreground service not possible: " + e2);
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        inForeground = true;
        if (stopWanted) {
            // the job already ended while the service was starting
            stopSelf();
            return START_NOT_STICKY;
        }
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
        CrashLog.append(this, "Foreground service time limit reached (type " + fgsType + ")");
        stopSelf();
    }

    @Override
    public void onDestroy() {
        inForeground = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
