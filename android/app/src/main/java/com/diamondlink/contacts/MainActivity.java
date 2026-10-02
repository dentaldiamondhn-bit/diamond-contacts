package com.diamondlink.contacts;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeContactsBridge.class);
        super.onCreate(savedInstanceState);

        // Intercept custom URL schemes (whatsapp://, tel:, sms:, intent:) that the
        // WebView cannot load and hand them to the Android OS as intents instead of
        // letting the WebView surface net::ERR_UNKNOWN_URL_SCHEME. Delegate every
        // other URL (https, app scheme, plugins) to Capacitor's default client.
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if (url != null && isExternalScheme(url)) {
                        return launchExternal(url);
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }

    private static boolean isExternalScheme(Uri url) {
        String scheme = url.getScheme();
        if (scheme == null) return false;
        scheme = scheme.toLowerCase();
        return scheme.equals("whatsapp")
            || scheme.equals("tel")
            || scheme.equals("sms")
            || scheme.equals("intent");
    }

    private boolean launchExternal(Uri url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, url);
            startActivity(intent);
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
}