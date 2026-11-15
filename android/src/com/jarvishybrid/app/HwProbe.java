package com.jarvishybrid.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.util.Size;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * 하드웨어 점검(2026-11-15, 토스 프론트). adb로만 부른다(DUMP 권한 = adb shell 전용):
 *   adb shell am broadcast -n com.jarvishybrid.app/.HwProbe --es what camera|sensors|speaker [--ez save true] [--ei seconds 3]
 * camera: 카메라마다 프레임 몇 장을 받아 밝기(Y 평균·표준편차)를 logcat(태그 JarvisHw)에 남긴다. save=true면 JPEG를 앱 폴더에 남긴다.
 * sensors: 모든 센서를 seconds초 동안 읽어 축별 최소·최대와 이벤트 수를 남긴다(값이 실제로 변하는지).
 * speaker: 무음(0) PCM을 1초 재생해 출력 장치·재생 위치가 진행되는지만 본다(소리는 나지 않는다). tone=true면 작은 440Hz 소리를 0.5초 낸다.
 * play: --es file <앱 폴더 안 WAV 이름> 을 스피커로 한 번 튼다(16비트 PCM WAV, 마이크 자체 시험용).
 * 화면이 앞에 있을 때 카메라가 열린다. 결과는 기기 밖으로 보내지 않는다.
 */
public class HwProbe extends BroadcastReceiver {
    static final String TAG = "JarvisHw";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context app = context.getApplicationContext();
        final String what = String.valueOf(intent.getStringExtra("what"));
        final boolean save = intent.getBooleanExtra("save", false);
        final boolean tone = intent.getBooleanExtra("tone", false);
        final Intent in = intent;
        final int seconds = Math.max(1, Math.min(10, intent.getIntExtra("seconds", 3)));
        new Thread(() -> {
            try {
                if (what.equals("camera")) camera(app, save);
                else if (what.equals("sensors")) sensors(app, seconds);
                else if (what.equals("speaker")) speaker(app, tone);
                else if (what.equals("play")) play(app, String.valueOf(in.getStringExtra("file")));
                else Log.w(TAG, "unknown what=" + what);
            } catch (Throwable t) {
                Log.w(TAG, what + " error=" + t);
            }
            Log.i(TAG, what + " done");
        }, "hw-probe").start();
    }

    // ---- camera ----
    static void camera(Context c, boolean save) throws Exception {
        CameraManager cm = (CameraManager) c.getSystemService(Context.CAMERA_SERVICE);
        String[] ids = cm.getCameraIdList();
        Log.i(TAG, "camera count=" + ids.length + " ids=" + Arrays.toString(ids));
        for (String id : ids) {
            try { oneCamera(c, cm, id, save); } catch (Throwable t) { Log.w(TAG, "camera " + id + " error=" + t); }
        }
    }

    static void oneCamera(Context c, CameraManager cm, String id, boolean save) throws Exception {
        CameraCharacteristics ch = cm.getCameraCharacteristics(id);
        StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map.getOutputSizes(ImageFormat.YUV_420_888);
        Size pick = sizes[0];
        for (Size s : sizes) if (Math.abs(s.getWidth() - 640) + Math.abs(s.getHeight() - 480) < Math.abs(pick.getWidth() - 640) + Math.abs(pick.getHeight() - 480)) pick = s;
        Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
        Size max = sizes[0];
        for (Size s : sizes) if ((long) s.getWidth() * s.getHeight() > (long) max.getWidth() * max.getHeight()) max = s;
        Log.i(TAG, "camera " + id + " facing=" + facing + " max=" + max + " use=" + pick
                + " level=" + ch.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)
                + " orient=" + ch.get(CameraCharacteristics.SENSOR_ORIENTATION));
        HandlerThread ht = new HandlerThread("cam" + id); ht.start();
        Handler h = new Handler(ht.getLooper());
        ImageReader reader = ImageReader.newInstance(pick.getWidth(), pick.getHeight(), ImageFormat.YUV_420_888, 3);
        final CountDownLatch opened = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(1);
        final CameraDevice[] dev = new CameraDevice[1];
        final int[] frames = {0};
        final String[] err = {null};
        final boolean[] saved = {false};
        reader.setOnImageAvailableListener(r -> {
            Image img = r.acquireLatestImage();
            if (img == null) return;
            try {
                frames[0]++;
                if (frames[0] == 15) { // 노출이 자리 잡은 뒤의 한 장
                    Image.Plane y = img.getPlanes()[0];
                    ByteBuffer b = y.getBuffer();
                    int w = img.getWidth(), hh = img.getHeight(), rs = y.getRowStride(), ps = y.getPixelStride();
                    double sum = 0, sq = 0; int n = 0, mn = 255, mx = 0;
                    for (int yy = 0; yy < hh; yy += 4) for (int xx = 0; xx < w; xx += 4) {
                        int v = b.get(yy * rs + xx * ps) & 0xff; sum += v; sq += v * v; n++; mn = Math.min(mn, v); mx = Math.max(mx, v);
                    }
                    double mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
                    Log.i(TAG, String.format(Locale.ROOT, "camera %s frame=%d size=%dx%d Y mean=%.1f sd=%.1f min=%d max=%d", id, frames[0], w, hh, mean, sd, mn, mx));
                    if (save) { saveJpeg(c, img, "cam" + id + ".jpg"); saved[0] = true; }
                    done.countDown();
                }
            } catch (Throwable t) { err[0] = String.valueOf(t); done.countDown(); }
            finally { img.close(); }
        }, h);
        long t0 = System.currentTimeMillis();
        cm.openCamera(id, new CameraDevice.StateCallback() {
            @Override public void onOpened(CameraDevice d) {
                dev[0] = d; opened.countDown();
                try {
                    d.createCaptureSession(Collections.singletonList(reader.getSurface()), new CameraCaptureSession.StateCallback() {
                        @Override public void onConfigured(CameraCaptureSession s) {
                            try {
                                CaptureRequest.Builder rb = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                rb.addTarget(reader.getSurface());
                                s.setRepeatingRequest(rb.build(), null, h);
                            } catch (Exception e) { err[0] = "request " + e; done.countDown(); }
                        }
                        @Override public void onConfigureFailed(CameraCaptureSession s) { err[0] = "configure failed"; done.countDown(); }
                    }, h);
                } catch (Exception e) { err[0] = "session " + e; done.countDown(); }
            }
            @Override public void onDisconnected(CameraDevice d) { err[0] = "disconnected"; d.close(); opened.countDown(); done.countDown(); }
            @Override public void onError(CameraDevice d, int e) { err[0] = "error " + e; d.close(); opened.countDown(); done.countDown(); }
        }, h);
        boolean ok = done.await(8, TimeUnit.SECONDS);
        Log.i(TAG, "camera " + id + " result=" + (ok && err[0] == null ? "frames" : "fail") + " frames=" + frames[0]
                + " ms=" + (System.currentTimeMillis() - t0) + (err[0] != null ? " err=" + err[0] : "") + (saved[0] ? " saved" : ""));
        if (dev[0] != null) dev[0].close();
        reader.close();
        ht.quitSafely();
        Thread.sleep(500);
    }

    static void saveJpeg(Context c, Image img, String name) throws Exception {
        int w = img.getWidth(), h = img.getHeight();
        byte[] nv21 = new byte[w * h * 3 / 2];
        Image.Plane[] p = img.getPlanes();
        ByteBuffer yb = p[0].getBuffer(), ub = p[1].getBuffer(), vb = p[2].getBuffer();
        int yr = p[0].getRowStride(), yp = p[0].getPixelStride(), ur = p[1].getRowStride(), up = p[1].getPixelStride();
        int o = 0;
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) nv21[o++] = yb.get(y * yr + x * yp);
        for (int y = 0; y < h / 2; y++) for (int x = 0; x < w / 2; x++) {
            nv21[o++] = vb.get(y * ur + x * up);
            nv21[o++] = ub.get(y * ur + x * up);
        }
        File dir = new File(c.getExternalFilesDir(null), "hwprobe");
        if (!dir.isDirectory() && !dir.mkdirs()) return;
        try (FileOutputStream out = new FileOutputStream(new File(dir, name))) {
            new YuvImage(nv21, ImageFormat.NV21, w, h, null).compressToJpeg(new Rect(0, 0, w, h), 70, out);
        }
    }

    // ---- sensors ----
    static void sensors(Context c, int seconds) throws Exception {
        SensorManager sm = (SensorManager) c.getSystemService(Context.SENSOR_SERVICE);
        java.util.List<Sensor> list = sm.getSensorList(Sensor.TYPE_ALL);
        Log.i(TAG, "sensors count=" + list.size());
        HandlerThread ht = new HandlerThread("sensors"); ht.start();
        Handler h = new Handler(ht.getLooper());
        for (Sensor s : list) {
            final float[] mn = new float[6], mx = new float[6];
            Arrays.fill(mn, Float.MAX_VALUE); Arrays.fill(mx, -Float.MAX_VALUE);
            final int[] n = {0};
            final float[][] last = {null};
            SensorEventListener l = new SensorEventListener() {
                @Override public void onSensorChanged(SensorEvent e) {
                    n[0]++;
                    for (int i = 0; i < Math.min(6, e.values.length); i++) { mn[i] = Math.min(mn[i], e.values[i]); mx[i] = Math.max(mx[i], e.values[i]); }
                    last[0] = e.values.clone();
                }
                @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
            };
            boolean reg = sm.registerListener(l, s, SensorManager.SENSOR_DELAY_GAME, h);
            Thread.sleep(seconds * 1000L);
            sm.unregisterListener(l);
            StringBuilder sb = new StringBuilder("sensor type=" + s.getType() + " name=" + s.getName() + " vendor=" + s.getVendor() + " reg=" + reg + " events=" + n[0]);
            if (last[0] != null) {
                for (int i = 0; i < Math.min(3, last[0].length); i++) sb.append(String.format(Locale.ROOT, " | v%d last=%.3f min=%.3f max=%.3f", i, last[0][i], mn[i], mx[i]));
            }
            Log.i(TAG, sb.toString());
        }
        ht.quitSafely();
    }

    // ---- speaker ----
    static void speaker(Context c, boolean tone) throws Exception {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            Log.i(TAG, "output id=" + d.getId() + " type=" + d.getType() + " name=" + d.getProductName());
        }
        Log.i(TAG, "music volume=" + am.getStreamVolume(AudioManager.STREAM_MUSIC) + "/" + am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                + " muted=" + am.isStreamMute(AudioManager.STREAM_MUSIC));
        int rate = 44100;
        int frames = tone ? rate / 2 : rate;
        short[] pcm = new short[frames * 2];
        if (tone) for (int i = 0; i < frames; i++) { short v = (short) (3000 * Math.sin(2 * Math.PI * 440 * i / rate)); pcm[2 * i] = v; pcm[2 * i + 1] = v; }
        AudioTrack t = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
                .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(pcm.length * 2).build();
        t.write(pcm, 0, pcm.length);
        t.play();
        Thread.sleep(tone ? 700 : 1200);
        AudioDeviceInfo r = t.getRoutedDevice();
        Log.i(TAG, "speaker tone=" + tone + " state=" + t.getPlayState() + " head=" + t.getPlaybackHeadPosition() + "/" + frames
                + " routed=" + (r == null ? "?" : r.getType() + "/" + r.getProductName()));
        t.stop(); t.release();
    }

    // ---- play a WAV (16-bit PCM) from the app's external files dir ----
    static void play(Context c, String name) throws Exception {
        File f = new File(c.getExternalFilesDir(null), new File(name).getName());
        byte[] all = java.nio.file.Files.readAllBytes(f.toPath());
        ByteBuffer b = ByteBuffer.wrap(all).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        int off = 12, rate = 16000, ch = 1, dataOff = -1, dataLen = 0;
        while (off + 8 <= all.length) {
            String id = new String(all, off, 4, "US-ASCII"); int size = b.getInt(off + 4);
            if (id.equals("fmt ")) { ch = b.getShort(off + 10); rate = b.getInt(off + 12); }
            if (id.equals("data")) { dataOff = off + 8; dataLen = Math.min(size, all.length - dataOff); break; }
            off += 8 + size + (size & 1);
        }
        if (dataOff < 0) { Log.w(TAG, "play no data " + f); return; }
        AudioTrack t = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(ch == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(dataLen).build();
        t.write(all, dataOff, dataLen);
        t.play();
        long ms = 1000L * dataLen / (rate * ch * 2);
        Thread.sleep(ms + 300);
        Log.i(TAG, "play " + f.getName() + " ms=" + ms + " head=" + t.getPlaybackHeadPosition());
        t.stop(); t.release();
    }
}
