import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import {
  buildAutomationScript,
  PDF_CAPTURE_INJECT,
  type AutomationCommand,
  type AutomationMessage,
} from './automation';
import { getLoga3BaseUrl } from './env';

type Props = {
  visible?: boolean;
  initialUrl?: string;
  onMessage?: (msg: AutomationMessage) => void;
  onReady?: () => void;
};

async function urlToPdfMessage(url: string, filename?: string): Promise<AutomationMessage> {
  try {
    // blob:/data: URLs are not readable from the RN side — only http(s) download URLs
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return {
        ok: false,
        type: 'pdfBlob',
        error: 'rn_cannot_fetch_blob_url',
        note: url.slice(0, 80),
      };
    }
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50) {
      // not %PDF — still return if content-type says pdf
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('pdf') && bytes.length < 64) {
        return { ok: false, type: 'pdfBlob', error: 'not_pdf_bytes', size: bytes.length };
      }
    }
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    if (typeof globalThis.btoa !== 'function') {
      return { ok: false, type: 'pdfBlob', error: 'btoa_unavailable' };
    }
    const base64 = globalThis.btoa(binary);
    return {
      ok: true,
      type: 'pdfBlob',
      base64,
      mime: res.headers.get('content-type') || 'application/pdf',
      size: bytes.length,
      filename: filename || '',
      note: 'rn-url-fetch',
    };
  } catch (e) {
    return {
      ok: false,
      type: 'pdfBlob',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const Loga3WebView = React.forwardRef<
  { run: (cmd: AutomationCommand) => void; reload: () => void },
  Props
>(function Loga3WebView({ initialUrl, onMessage, onReady }, ref) {
  const resolvedUrl = (initialUrl || getLoga3BaseUrl()).trim();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  React.useImperativeHandle(ref, () => ({
    run(cmd: AutomationCommand) {
      webRef.current?.injectJavaScript(buildAutomationScript(cmd));
    },
    reload() {
      webRef.current?.reload();
    },
  }));

  const emit = useCallback((msg: AutomationMessage) => {
    onMessageRef.current?.(msg);
  }, []);

  const onMsg = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as AutomationMessage;
        emit(msg);
      } catch {
        // ignore non-JSON
      }
    },
    [emit]
  );

  /** iOS onFileDownload / nav intercept — Android onFileDownload is a no-op in RN WebView. */
  const captureDownloadUrl = useCallback(
    async (url: string, filename?: string) => {
      if (!url) return;
      emit({ ok: true, type: 'pdfCaptureProbe', note: `native:${url.slice(0, 140)}` });
      const msg = await urlToPdfMessage(url, filename);
      emit(msg);
    },
    [emit]
  );

  const onFileDownload = useCallback(
    async (event: { nativeEvent: { downloadUrl: string } }) => {
      await captureDownloadUrl(event.nativeEvent.downloadUrl);
    },
    [captureDownloadUrl]
  );

  const onShouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest) => {
      const url = req.url || '';
      // Android: never block PDF/blob navigation — RN cannot read blob: URLs, and
      // blocking prevents Chromium PDF.js from loading (our scrape target).
      // Instead, ask the page to capture while allowing the load.
      if (Platform.OS === 'android') {
        if (
          url.startsWith('blob:') ||
          /\.pdf($|\?)/i.test(url) ||
          /export|download|zeitprotokoll|pdf|servlet|stream/i.test(url)
        ) {
          emit({ ok: true, type: 'pdfCaptureProbe', note: `android-nav:${url.slice(0, 140)}` });
          webRef.current?.injectJavaScript(
            `(function(){try{` +
              `if(window.__loga3ArmPdfCapture)window.__loga3ArmPdfCapture(120000);` +
              `var u=${JSON.stringify(url)};` +
              `if(window.fetch&&u.indexOf('blob:')!==0){` +
              `window.fetch(u,{credentials:'include'}).then(function(r){return r.blob()}).then(function(b){` +
              `var fr=new FileReader();fr.onloadend=function(){` +
              `var r=String(fr.result||'');var b64=r.indexOf(',')>=0?r.split(',')[1]:r;` +
              `if(b64&&b64.indexOf('JVBERi')===0&&window.ReactNativeWebView)` +
              `window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,type:'pdfBlob',base64:b64,mime:'application/pdf',size:b.size||0,filename:u,note:'android-nav-fetch'}));` +
              `};fr.readAsDataURL(b);}).catch(function(){});}` +
              `if(window.__loga3ScrapePdfViewer)window.__loga3ScrapePdfViewer();` +
              `}catch(e){}})();true;`
          );
        }
        return true;
      }
      if (url.startsWith('blob:') || /\.pdf($|\?)/i.test(url)) {
        void captureDownloadUrl(url);
        return false;
      }
      return true;
    },
    [captureDownloadUrl, emit]
  );

  const onOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl: string } }) => {
      const url = event.nativeEvent?.targetUrl || '';
      emit({ ok: true, type: 'pdfCaptureProbe', note: `openWindow:${url.slice(0, 140)}` });
      if (!url) return;
      if (url.startsWith('blob:') || /\.pdf($|\?)/i.test(url) || /export|download|zeitprotokoll|pdf/i.test(url)) {
        void captureDownloadUrl(url);
        return;
      }
      // Keep popup content in the same WebView (LOGA3 dialogs / reports)
      webRef.current?.injectJavaScript(
        `try{window.location.href=${JSON.stringify(url)};}catch(e){};true;`
      );
    },
    [captureDownloadUrl, emit]
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (/\.pdf($|\?)/i.test(url) || url.startsWith('blob:')) {
        void captureDownloadUrl(url);
      }
    });
    return () => sub.remove();
  }, [captureDownloadUrl]);

  return (
    <View style={styles.wrap}>
      {!resolvedUrl ? (
        <View style={styles.missing}>
          <Text style={styles.missingText}>
            LOGA3_BASE_URL fehlt. In Settings oder .env setzen, dann App neu starten.
          </Text>
        </View>
      ) : (
        <>
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator />
              <Text style={styles.loaderText}>WebView…</Text>
            </View>
          )}
          <WebView
            ref={webRef}
            source={{ uri: resolvedUrl }}
            onLoadEnd={() => {
              setLoading(false);
              // Re-install capture after navigation (all same-origin frames via inject script)
              webRef.current?.injectJavaScript(PDF_CAPTURE_INJECT);
              onReady?.();
            }}
            onMessage={onMsg}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onOpenWindow={onOpenWindow}
            {...(Platform.OS === 'ios'
              ? {
                  onFileDownload: onFileDownload as (e: {
                    nativeEvent: { downloadUrl: string };
                  }) => void,
                }
              : {})}
            // Critical: LOGA3 may download from iframes — hooks must install there too
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
            injectedJavaScriptForMainFrameOnly={false}
            javaScriptEnabled
            javaScriptCanOpenWindowsAutomatically
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows
            // LOGA3/GWT is a desktop SPA — mobile UA + 320px width breaks SmartThings actions
            userAgent="Mozilla/5.0 (Linux; X11; x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            scalesPageToFit={false}
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowingReadAccessToURL={resolvedUrl}
            mixedContentMode="always"
            originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={
              `(function(){try{var m=document.querySelector('meta[name=viewport]');` +
              `if(!m){m=document.createElement('meta');m.name='viewport';document.head&&document.head.appendChild(m);}` +
              `m.content='width=1280, initial-scale=0.4, maximum-scale=4, user-scalable=yes';}catch(e){}})();` +
              PDF_CAPTURE_INJECT
            }
            style={styles.web}
          />
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  web: { flex: 1, backgroundColor: '#fff' },
  missing: { flex: 1, padding: 16, justifyContent: 'center' },
  missingText: { color: '#b91c1c', fontSize: 14 },
  loader: {
    position: 'absolute',
    zIndex: 2,
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: { color: '#64748b', fontSize: 12 },
});
