package com.jarvishybrid.app;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 저장된 서버 목록(2026-11-15 사용자 요청: 기기에서 서버를 쉽게 바꾸기).
 * 이름·주소(https)·인증서 지문을 앱 설정(prefs "servers", JSON)에 둔다. 최대 8개, 같은 주소는 하나로 합친다.
 * 지문은 공개 값이라 비밀이 아니다.
 */
final class ServerList {
    static final int MAX = 8;
    private static final String KEY = "servers";

    static final class Entry {
        final String name;
        final String server;
        final String pin;

        Entry(String name, String server, String pin) {
            this.name = name;
            this.server = server;
            this.pin = pin;
        }
    }

    private ServerList() { }

    static List<Entry> load(SharedPreferences prefs) {
        List<Entry> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString(KEY, "[]"));
            for (int i = 0; i < a.length() && out.size() < MAX; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                String server = o.optString("server", "").trim();
                String pin = o.optString("pin", "").trim();
                if (server.isEmpty() || pin.isEmpty()) continue;
                String name = o.optString("name", "").trim();
                out.add(new Entry(name.isEmpty() ? server : name, server, pin));
            }
        } catch (JSONException e) {
            return out;
        }
        return out;
    }

    private static void save(SharedPreferences prefs, List<Entry> list) {
        JSONArray a = new JSONArray();
        try {
            for (Entry e : list) {
                JSONObject o = new JSONObject();
                o.put("name", e.name);
                o.put("server", e.server);
                o.put("pin", e.pin);
                a.put(o);
            }
        } catch (JSONException e) {
            return;
        }
        prefs.edit().putString(KEY, a.toString()).commit();
    }

    /** 같은 주소가 있으면 바꾸고, 없으면 맨 앞에 넣는다(최대 8개). */
    static void upsert(SharedPreferences prefs, String name, String server, String pin) {
        List<Entry> list = load(prefs);
        List<Entry> next = new ArrayList<>();
        String n = name == null || name.trim().isEmpty() ? server : name.trim();
        if (n.length() > 30) n = n.substring(0, 30);
        next.add(new Entry(n, server.trim(), pin.trim()));
        for (Entry e : list) {
            if (!e.server.equalsIgnoreCase(server.trim()) && next.size() < MAX) next.add(e);
        }
        save(prefs, next);
    }

    static void remove(SharedPreferences prefs, String server) {
        List<Entry> next = new ArrayList<>();
        for (Entry e : load(prefs)) {
            if (!e.server.equalsIgnoreCase(server)) next.add(e);
        }
        save(prefs, next);
    }
}
