package com.jarvishybrid.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * 연결 설정을 adb로 넣는다(2026-11-15). 화면에서 주소·지문을 다시 칠 필요가 없게.
 *   adb shell am broadcast -n com.jarvishybrid.app/.ConfigReceiver --es server https://127.0.0.1:4780 --es pin AB:CD:...
 * DUMP 권한(adb shell 전용)으로 막아 다른 앱은 부를 수 없다. 저장 뒤 JARVIS 화면을 새로 띄운다.
 * 지문은 서버 인증서의 공개 SHA-256이라 비밀이 아니다(로그에는 앞 8자만 남긴다).
 */
public class ConfigReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String server = intent.getStringExtra("server");
        String pin = intent.getStringExtra("pin");
        server = server == null ? "" : server.trim();
        pin = pin == null ? "" : pin.trim();
        String hex = pin.replaceAll("[^0-9A-Fa-f]", "");
        if (!server.startsWith("https://") || hex.length() != 64) {
            Log.w("JarvisConfig", "rejected server=" + server + " pinHex=" + hex.length());
            setResultCode(2);
            return;
        }
        context.getSharedPreferences("jarvis", Context.MODE_PRIVATE).edit()
                .putString("server", server).putString("pin", pin).commit();
        Log.i("JarvisConfig", "saved server=" + server + " pin=" + hex.substring(0, 8) + "…");
        setResultCode(1);
        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        context.startActivity(open);
    }
}
