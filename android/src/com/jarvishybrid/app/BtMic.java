package com.jarvishybrid.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

/**
 * 블루투스 헤드셋 마이크(2026-11-15 사용자 결정: 토스 프론트 내장 마이크가 거의 안 들려 BT 헤드셋 마이크를 쓴다).
 * 녹음을 시작할 때 BT SCO(통화용) 헤드셋이 연결돼 있으면 입력을 그쪽으로 돌리고, 끝나면 되돌린다. 없으면 내장 마이크.
 * - Android 12(API 31) 이상: setCommunicationDevice / clearCommunicationDevice (BLUETOOTH_CONNECT 권한 필요)
 * - Android 11 이하(토스 프론트): MODE_IN_COMMUNICATION + startBluetoothSco / stopBluetoothSco
 * 연결은 비동기라 화면은 state()가 "bt"가 될 때까지 잠깐(최대 몇 초) 기다린다.
 */
final class BtMic {
    static final String TAG = "JarvisBtMic";
    private final Context ctx;
    private final AudioManager am;
    private boolean active = false;
    private int savedMode = AudioManager.MODE_NORMAL;
    private volatile boolean scoConnected = false;  // SCO 실제 연결 여부. 브로드캐스트로만 확정(Android<=30)
    private BroadcastReceiver scoReceiver;

    BtMic(Context c) {
        ctx = c.getApplicationContext();
        am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    private boolean canConnect() {
        return Build.VERSION.SDK_INT < 31 || ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    /** 연결된 BT SCO 입력 장치(없으면 null) */
    private AudioDeviceInfo scoInput() {
        if (am == null || !canConnect()) return null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return d;
        }
        return null;
    }

    private static String name(AudioDeviceInfo d) {
        CharSequence n = d.getProductName();
        return n == null || n.length() == 0 ? "블루투스 헤드셋" : n.toString().replace('"', '\'');
    }

    /** 지금 쓸 수 있는 입력: "bt:<이름>" 또는 "builtin" (연결만 확인, 바꾸지 않음) */
    synchronized String available() {
        AudioDeviceInfo d = scoInput();
        return d == null ? "builtin" : "bt:" + name(d);
    }

    /** 녹음 시작: BT 헤드셋이 있으면 입력을 돌린다. 돌렸으면 "bt-wait:<이름>"(연결 중), 없으면 "builtin" */
    @SuppressWarnings("deprecation")
    synchronized String start() {
        AudioDeviceInfo d = scoInput();
        if (d == null) { Log.i(TAG, "start: no BT SCO headset -> builtin"); return "builtin"; }
        if (!active) savedMode = am.getMode();
        active = true;  // 먼저 켜 둬야 아래가 실패해도 stop()이 모드·리시버를 되돌린다
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo out = null;
                for (AudioDeviceInfo o : am.getAvailableCommunicationDevices()) if (o.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) { out = o; break; }
                boolean ok = out != null && am.setCommunicationDevice(out);
                Log.i(TAG, "start: setCommunicationDevice " + ok);
                if (!ok) { stop(); return "builtin"; }
            } else {
                scoConnected = false;
                registerScoReceiver();  // isBluetoothScoOn은 요청 즉시 참이라 못 믿는다. 실제 연결은 브로드캐스트로 확인
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
                Log.i(TAG, "start: startBluetoothSco");
            }
            return "bt-wait:" + name(d);
        } catch (Exception e) {
            Log.w(TAG, "start failed: " + e);
            stop();
            return "builtin";
        }
    }

    /** 지금 입력 상태: "bt:<이름>"(BT로 연결됨) / "bt-wait"(연결 중) / "builtin" */
    @SuppressWarnings("deprecation")
    synchronized String state() {
        if (!active) return "builtin";
        AudioDeviceInfo d = scoInput();
        if (d == null) return "builtin";
        boolean on;
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo c = am.getCommunicationDevice();
            on = c != null && c.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO;
        } else {
            on = scoConnected;  // SCO_AUDIO_STATE_CONNECTED 브로드캐스트가 와야 참
        }
        return on ? "bt:" + name(d) : "bt-wait";
    }

    /** 녹음 끝: 돌려 둔 입력과 오디오 모드를 되돌린다 */
    @SuppressWarnings("deprecation")
    synchronized void stop() {
        if (!active || am == null) return;
        active = false;
        scoConnected = false;
        try {
            if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
            else { am.setBluetoothScoOn(false); am.stopBluetoothSco(); }
            am.setMode(savedMode);
            Log.i(TAG, "stop: restored mode " + savedMode);
        } catch (Exception e) {
            Log.w(TAG, "stop failed: " + e);
        }
        unregisterScoReceiver();
    }

    /** SCO 연결·해제 브로드캐스트를 받아 scoConnected를 갱신(Android<=30). API33+는 export 플래그 필요 */
    @SuppressWarnings("deprecation")
    private void registerScoReceiver() {
        if (scoReceiver != null) return;
        scoReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                int s = i.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, AudioManager.SCO_AUDIO_STATE_ERROR);
                if (s == AudioManager.SCO_AUDIO_STATE_CONNECTED) scoConnected = true;
                else if (s == AudioManager.SCO_AUDIO_STATE_DISCONNECTED) scoConnected = false;
            }
        };
        IntentFilter f = new IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(scoReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        else ctx.registerReceiver(scoReceiver, f);
    }

    private void unregisterScoReceiver() {
        if (scoReceiver == null) return;
        try { ctx.unregisterReceiver(scoReceiver); } catch (Exception ignore) { }
        scoReceiver = null;
    }
}
