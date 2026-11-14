package com.jarvishybrid.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 기기가 켜지면 JARVIS 화면을 연다(설정 화면의 "자동으로 열기"가 켜져 있을 때만).
 * Android 10 이상은 뒤에서 화면을 여는 것을 막으므로, 토스 기기에서는
 * `adb shell appops set com.jarvishybrid.app SYSTEM_ALERT_WINDOW allow`로 한 번 허용해 둔다.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a)) return;
        if (!context.getSharedPreferences("jarvis", Context.MODE_PRIVATE).getBoolean("autostart", true)) return;
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(open);
    }
}
