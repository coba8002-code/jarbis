package com.jarvishybrid.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;
import java.util.Locale;

/**
 * 마이크 진단(2026-11-15, 토스 프론트). 화면을 건드리지 않고 adb로만 부른다:
 *   adb shell am broadcast -n com.jarvishybrid.app/.MicProbe [--ei seconds 1] [--es configs "1:44100:2,6:16000:1"] [--ez save true]
 * 녹음 소스·샘플레이트·채널을 바꿔 가며 잠깐 녹음하고, 채널별 소리 크기(RMS·피크·0인 샘플 비율)를 logcat(태그 JarvisMic)에 남긴다.
 * save=true면 앱 외부 파일 폴더(Android/data/com.jarvishybrid.app/files/micprobe/)에 WAV로 남긴다(지우기: 앱 데이터 삭제 또는 adb rm).
 * 앱 화면이 앞에 있을 때만 마이크가 열린다(Android 11 규칙). 녹음은 외부로 보내지 않는다.
 */
public class MicProbe extends BroadcastReceiver {
    static final String TAG = "JarvisMic";
    // 소스: 0 DEFAULT, 1 MIC, 5 CAMCORDER(WebView가 씀), 6 VOICE_RECOGNITION, 7 VOICE_COMMUNICATION, 9 UNPROCESSED
    static final String DEFAULT_CONFIGS = "0:44100:2,1:44100:2,5:44100:2,6:44100:2,7:44100:2,9:44100:2,1:48000:1,1:16000:1,6:16000:1";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context app = context.getApplicationContext();
        final int seconds = Math.max(1, Math.min(10, intent.getIntExtra("seconds", 1)));
        final String configs = intent.getStringExtra("configs") != null ? intent.getStringExtra("configs") : DEFAULT_CONFIGS;
        final boolean save = intent.getBooleanExtra("save", false);
        new Thread(() -> run(app, seconds, configs, save), "mic-probe").start();
    }

    static void run(Context c, int seconds, String configs, boolean save) {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        Log.i(TAG, "start seconds=" + seconds + " micMute=" + am.isMicrophoneMute() + " mode=" + am.getMode());
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            Log.i(TAG, "input id=" + d.getId() + " type=" + d.getType() + " name=" + d.getProductName()
                    + " rates=" + Arrays.toString(d.getSampleRates()) + " ch=" + Arrays.toString(d.getChannelCounts()));
        }
        for (String cfg : configs.split(",")) {
            String[] p = cfg.trim().split(":");
            if (p.length != 3) continue;
            try {
                probe(c, Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]), seconds, save);
            } catch (Throwable t) {
                Log.w(TAG, "cfg=" + cfg + " error=" + t);
            }
        }
        Log.i(TAG, "done");
    }

    static void probe(Context c, int source, int rate, int channels, int seconds, boolean save) throws Exception {
        int mask = channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO;
        int min = AudioRecord.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT);
        String id = "src=" + source + " rate=" + rate + " ch=" + channels;
        if (min <= 0) { Log.w(TAG, id + " unsupported minBuffer=" + min); return; }
        AudioRecord rec = new AudioRecord(source, rate, mask, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, rate * channels * 2 / 2));
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) { Log.w(TAG, id + " init failed"); rec.release(); return; }
        short[] all = new short[rate * channels * seconds];
        int got = 0;
        try {
            rec.startRecording();
            // 처음 0.3초는 버린다(장치가 켜지는 동안의 0·튀는 소리)
            short[] warm = new short[rate * channels * 3 / 10];
            int w = 0;
            while (w < warm.length) { int n = rec.read(warm, w, warm.length - w); if (n <= 0) break; w += n; }
            while (got < all.length) {
                int n = rec.read(all, got, all.length - got);
                if (n <= 0) { Log.w(TAG, id + " read=" + n); break; }
                got += n;
            }
            AudioDeviceInfo routed = rec.getRoutedDevice();
            StringBuilder sb = new StringBuilder(id).append(" samples=").append(got / channels)
                    .append(" routed=").append(routed == null ? "?" : routed.getType() + "/" + routed.getProductName());
            for (int ch = 0; ch < channels; ch++) {
                double sum = 0, mean = 0; int peak = 0, zeros = 0, n = 0;
                for (int i = ch; i < got; i += channels) { mean += all[i]; n++; }
                mean = n == 0 ? 0 : mean / n;
                for (int i = ch; i < got; i += channels) {
                    int v = all[i];
                    double dv = v - mean;
                    sum += dv * dv;
                    peak = Math.max(peak, Math.abs(v));
                    if (v == 0) zeros++;
                }
                double rms = n == 0 ? 0 : Math.sqrt(sum / n) / 32768.0;
                sb.append(String.format(Locale.ROOT, " | ch%d rms=%.5f (%.1f dBFS) peak=%d zeros=%.1f%% dc=%.1f",
                        ch, rms, rms > 0 ? 20 * Math.log10(rms) : -999.0, peak, n == 0 ? 0 : 100.0 * zeros / n, mean));
            }
            Log.i(TAG, sb.toString());
        } finally {
            try { rec.stop(); } catch (Exception ignored) { }
            rec.release();
        }
        if (save && got > 0) {
            File dir = new File(c.getExternalFilesDir(null), "micprobe");
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            File f = new File(dir, "src" + source + "-" + rate + "-" + channels + "ch.wav");
            writeWav(f, all, got, rate, channels);
            Log.i(TAG, id + " saved=" + f.getAbsolutePath());
        }
    }

    static void writeWav(File f, short[] data, int count, int rate, int channels) throws Exception {
        int bytes = count * 2;
        byte[] h = new byte[44];
        java.nio.ByteBuffer b = java.nio.ByteBuffer.wrap(h).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(36 + bytes).put("WAVE".getBytes()).put("fmt ".getBytes()).putInt(16)
                .putShort((short) 1).putShort((short) channels).putInt(rate).putInt(rate * channels * 2)
                .putShort((short) (channels * 2)).putShort((short) 16).put("data".getBytes()).putInt(bytes);
        java.nio.ByteBuffer body = java.nio.ByteBuffer.allocate(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < count; i++) body.putShort(data[i]);
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(h); o.write(body.array()); }
    }
}
