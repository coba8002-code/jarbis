package com.jarvishybrid.app;

import android.Manifest;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * JARVIS 앱(2026-11-14). PC의 JARVIS 서버 자비스 모드(/jarvis)를 화면 가득 연다.
 * - 보안: 정한 서버 주소(https)만 열고, 서버의 자체 서명 인증서는 PC 화면에 나온 SHA-256 지문과 같을 때만 믿는다.
 * - 권한: 그 서버 화면이 카메라·마이크를 달라고 할 때만 안드로이드 권한을 묻고 준다.
 * - 화면에 더해 주는 것(window.JarvisApp): 근접 센서, 기기 음성(TTS), 쉬는 화면일 때 밝기 낮추기, 연결 설정 다시 열기.
 */
public class MainActivity extends Activity implements SensorEventListener {
    private BtMic btMic;
    private static final String PREFS = "jarvis";
    private static final int REQ_MEDIA = 1;
    private static final int BG = Color.rgb(0xff, 0xfa, 0xf3);
    private static final int TEXT = Color.rgb(0x1f, 0x1a, 0x17);
    private static final int MUTED = Color.rgb(0x6b, 0x62, 0x5b);
    private static final int ACCENT = Color.rgb(0xc2, 0x41, 0x0c);
    private static final int BAD = Color.rgb(0xb9, 0x1c, 0x1c);

    private SharedPreferences prefs;
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    private SensorManager sensors;
    private Sensor proximity;
    private Boolean lastNear;
    private PermissionRequest pendingRequest;
    private String origin = "";
    private String pin = "";
    // 연결이 안 될 때(부팅 직후 와이파이·VPN 준비 전, PC 꺼짐) 저장된 설정으로 다시 해 보는 간격
    private static final long RETRY_MS = 15000;
    private final Runnable retry = () -> {
        String s = prefs.getString("server", "");
        if (web == null && validServer(s) && normalizePin(pin).length() == 64) showWeb(s);
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        btMic = new BtMic(this);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 키오스크: 잠금 화면 위에도 보이고, 부팅 때 화면을 켠다(토스 기기처럼 늘 켜 두는 화면용)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        proximity = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_PROXIMITY);
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(Locale.KOREAN);
            ttsReady = r >= TextToSpeech.LANG_AVAILABLE;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { emit("{\"type\":\"tts\",\"state\":\"start\"}"); }
                @Override public void onDone(String id) { emit("{\"type\":\"tts\",\"state\":\"end\"}"); }
                @Override public void onError(String id) { emit("{\"type\":\"tts\",\"state\":\"end\"}"); }
            });
        });
        String server = prefs.getString("server", "");
        pin = prefs.getString("pin", "");
        if (validServer(server) && normalizePin(pin).length() == 64) showWeb(server);
        else showSetup(null, false);
    }

    // ---------- 연결 설정 화면 ----------
    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private EditText field(String value, String hint) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        e.setMinHeight(dp(48));
        return e;
    }

    private void showSetup(String message, boolean autoRetry) {
        cancelRetry();
        if (web != null) { web.destroy(); web = null; }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(32), dp(24), dp(32));
        box.setBackgroundColor(BG);
        box.addView(text("JARVIS 연결", 24, TEXT, true));
        TextView about = text("PC에서 JARVIS를 --https로 켜면 나오는 주소와 인증서 지문(SHA-256)을 적어 주세요. 이 주소의 자비스 모드만 열고, 지문이 맞는 인증서만 믿어요.", 14, MUTED, false);
        about.setPadding(0, dp(8), 0, dp(24));
        box.addView(about);
        box.addView(text("PC 주소", 14, TEXT, true));
        EditText server = field(prefs.getString("server", ""), "예: https://192.168.0.53:47989");
        box.addView(server);
        TextView serverErr = text("", 14, BAD, false);
        box.addView(serverErr);
        TextView pinLabel = text("인증서 지문(SHA-256)", 14, TEXT, true);
        pinLabel.setPadding(0, dp(16), 0, 0);
        box.addView(pinLabel);
        EditText pinField = field(prefs.getString("pin", ""), "예: AB:CD:12:…(PC 화면에 나온 값)");
        pinField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        box.addView(pinField);
        TextView pinErr = text("", 14, BAD, false);
        box.addView(pinErr);
        if (message != null) {
            TextView m = text(autoRetry ? message + " " + (RETRY_MS / 1000) + "초마다 다시 연결해 볼게요(칸을 누르면 멈춤)." : message, 14, BAD, false);
            m.setPadding(0, dp(16), 0, 0);
            box.addView(m);
        }
        CheckBox boot = new CheckBox(this);
        boot.setText("기기가 켜지면 JARVIS 자동으로 열기");
        boot.setTextColor(TEXT);
        boot.setChecked(prefs.getBoolean("autostart", true));
        boot.setOnCheckedChangeListener((v, on) -> prefs.edit().putBoolean("autostart", on).apply());
        boot.setPadding(0, dp(16), 0, 0);
        box.addView(boot);
        Button go = new Button(this);
        go.setText("연결하기");
        go.setAllCaps(false);
        go.setTextColor(Color.WHITE);
        go.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable round = new GradientDrawable();
        round.setColor(ACCENT);
        round.setCornerRadius(dp(24));
        go.setBackground(round);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(24);
        go.setLayoutParams(lp);
        // 칸을 떠날 때 검사, 고치면 오류를 지움
        server.setOnFocusChangeListener((v, has) -> { if (has) cancelRetry(); else serverErr.setText(serverProblem(server.getText().toString())); });
        pinField.setOnFocusChangeListener((v, has) -> { if (has) cancelRetry(); else pinErr.setText(pinProblem(pinField.getText().toString())); });
        go.setOnClickListener(v -> {
            String s = server.getText().toString().trim();
            String p = pinField.getText().toString().trim();
            String se = serverProblem(s);
            String pe = pinProblem(p);
            serverErr.setText(se);
            pinErr.setText(pe);
            if (!se.isEmpty() || !pe.isEmpty()) return;
            prefs.edit().putString("server", s).putString("pin", p).apply();
            pin = p;
            showWeb(s);
        });
        box.addView(go);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.addView(box);
        setContentView(scroll);
        if (autoRetry) getWindow().getDecorView().postDelayed(retry, RETRY_MS);
    }

    private void cancelRetry() {
        getWindow().getDecorView().removeCallbacks(retry);
    }

    private static boolean validServer(String s) {
        try {
            Uri u = Uri.parse(s.trim());
            return "https".equals(u.getScheme()) && u.getHost() != null && !u.getHost().isEmpty();
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String serverProblem(String s) {
        if (s.trim().isEmpty()) return "PC 주소를 적어 주세요.";
        if (!validServer(s)) return "https://로 시작하는 주소를 적어 주세요. 예: https://192.168.0.53:47989";
        return "";
    }

    private static String normalizePin(String p) {
        return p == null ? "" : p.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    private static String pinProblem(String p) {
        if (p.trim().isEmpty()) return "인증서 지문을 적어 주세요.";
        if (normalizePin(p).length() != 64) return "지문은 0~9, A~F 글자 64개예요(쌍점은 있어도 돼요).";
        return "";
    }

    private static String originOf(String url) {
        Uri u = Uri.parse(url.trim());
        int port = u.getPort();
        return u.getScheme() + "://" + u.getHost().toLowerCase(Locale.ROOT) + (port > 0 ? ":" + port : "");
    }

    private boolean sameOrigin(String url) {
        try {
            return url != null && validServer(url) && originOf(url).equals(origin);
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ---------- 자비스 모드 화면 ----------
    private void showWeb(String server) {
        origin = originOf(server);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setGeolocationEnabled(false);
        web.addJavascriptInterface(new Bridge(), "JarvisApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                if (sameOrigin(error.getUrl()) && pinMatches(error.getCertificate())) {
                    handler.proceed();
                } else {
                    handler.cancel();
                    later(() -> showSetup("인증서 지문이 맞지 않아 연결하지 않았어요. PC 화면에 나온 지문과 같은지 확인해 주세요.", false));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !sameOrigin(request.getUrl().toString()); // 다른 사이트로는 가지 않음
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    later(() -> showSetup("PC의 JARVIS에 연결하지 못했어요. PC에서 JARVIS가 --https로 켜져 있는지, 같은 와이파이(또는 Tailscale)인지, 주소가 맞는지 확인해 주세요.", true));
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handlePermission(request));
            }
        });
        setContentView(web);
        web.loadUrl(origin + "/jarvis");
        startProximity();
    }

    // WebView 알림 안에서 바로 WebView를 지우지 않도록 다음 차례에 실행
    private void later(Runnable r) {
        getWindow().getDecorView().post(r);
    }

    private boolean pinMatches(SslCertificate cert) {
        if (cert == null) return false;
        try {
            byte[] der = null;
            if (Build.VERSION.SDK_INT >= 29) {
                X509Certificate x = cert.getX509Certificate();
                if (x != null) der = x.getEncoded();
            } else {
                Bundle b = SslCertificate.saveState(cert);
                if (b != null) der = b.getByteArray("x509-certificate");
            }
            if (der == null) return false;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(der);
            StringBuilder hex = new StringBuilder();
            for (byte d : digest) hex.append(String.format(Locale.ROOT, "%02X", d));
            return MessageDigest.isEqual(hex.toString().getBytes(), normalizePin(pin).getBytes());
        } catch (Exception e) {
            return false;
        }
    }

    // 카메라·마이크: 정한 서버 화면이 달라고 할 때만, 안드로이드 권한을 확인한 뒤 준다
    private void handlePermission(PermissionRequest request) {
        if (!sameOrigin(request.getOrigin().toString())) { request.deny(); return; }
        List<String> need = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) need.add(Manifest.permission.CAMERA);
            else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (need.isEmpty()) { request.deny(); return; }
        List<String> missing = new ArrayList<>();
        for (String p : need) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        // Android 12 이상은 블루투스 헤드셋 마이크를 쓰려면 BLUETOOTH_CONNECT도 필요(없어도 내장 마이크로는 녹음)
        if (Build.VERSION.SDK_INT >= 31 && need.contains(Manifest.permission.RECORD_AUDIO)
                && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.BLUETOOTH_CONNECT);
        if (missing.isEmpty()) { grantAllowed(request); return; }
        if (pendingRequest != null) pendingRequest.deny();
        pendingRequest = request;
        requestPermissions(missing.toArray(new String[0]), REQ_MEDIA);
    }

    private void grantAllowed(PermissionRequest request) {
        List<String> ok = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) ok.add(r);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) ok.add(r);
        }
        if (ok.isEmpty()) request.deny();
        else request.grant(ok.toArray(new String[0]));
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code != REQ_MEDIA || pendingRequest == null) return;
        PermissionRequest r = pendingRequest;
        pendingRequest = null;
        grantAllowed(r);
    }

    // ---------- 화면에 알리기 ----------
    private void emit(String json) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('jarvis-app',{detail:" + json + "}))", null);
        });
    }

    // ---------- 근접 센서(전력이 아주 적음) ----------
    private void startProximity() {
        if (proximity != null && sensors != null && web != null) sensors.registerListener(this, proximity, SensorManager.SENSOR_DELAY_NORMAL);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        boolean near = event.values[0] < Math.min(event.sensor.getMaximumRange(), 5f);
        if (lastNear != null && lastNear == near) return;
        lastNear = near;
        emit("{\"type\":\"proximity\",\"near\":" + near + "}");
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    protected void onResume() {
        super.onResume();
        immersive();
        if (web != null) { web.onResume(); startProximity(); }
    }

    // 키오스크처럼: 위 상태 줄·아래 단추 줄을 숨긴다(화면 끝에서 밀면 잠깐 보임)
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onPause() {
        if (sensors != null) sensors.unregisterListener(this);
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (btMic != null) btMic.stop();
        cancelRetry();
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** 자비스 모드 화면(window.JarvisApp)이 부르는 기능. 정한 서버 화면만 열리므로 그 화면만 쓸 수 있다. */
    private final class Bridge {
        @JavascriptInterface public boolean hasProximity() { return proximity != null; }

        @JavascriptInterface public boolean hasSpeech() { return ttsReady; }

        @JavascriptInterface public void speak(String words, float pitch) {
            if (!ttsReady || words == null) return;
            tts.setPitch(Math.max(0.5f, Math.min(2f, pitch)));
            tts.speak(words.length() > 2000 ? words.substring(0, 2000) : words, TextToSpeech.QUEUE_FLUSH, null, "jarvis");
        }

        @JavascriptInterface public void stopSpeaking() {
            if (tts != null) tts.stop();
            emit("{\"type\":\"tts\",\"state\":\"end\"}");
        }

        // 쉬는 화면이면 화면 밝기를 아주 낮게(전력·열 줄이기), 깨어나면 기기 설정대로
        @JavascriptInterface public void setDim(boolean dim) {
            runOnUiThread(() -> {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = dim ? 0.02f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                getWindow().setAttributes(lp);
            });
        }

        // 블루투스 헤드셋 마이크(BtMic): 녹음 시작·끝에 화면이 부른다. 값은 "bt:<이름>" / "bt-wait..." / "builtin"
        @JavascriptInterface public String micInput() { return btMic.available(); }
        @JavascriptInterface public String micRouteStart() { return btMic.start(); }
        @JavascriptInterface public String micRouteState() { return btMic.state(); }
        @JavascriptInterface public void micRouteStop() { btMic.stop(); }

        @JavascriptInterface public void openSetup() {
            later(() -> showSetup(null, false));
        }
    }
}
