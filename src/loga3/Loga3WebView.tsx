import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  buildAutomationScript,
  LOGA3_LOGIN_URL,
  PDF_CAPTURE_INJECT,
  type AutomationCommand,
  type AutomationMessage,
} from './automation';

type Props = {
  visible?: boolean;
  initialUrl?: string;
  onMessage?: (msg: AutomationMessage) => void;
  onReady?: () => void;
};

async function urlToPdfMessage(url: string, filename?: string): Promise<AutomationMessage> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(binary)
        : // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('buffer').Buffer.from(bytes).toString('base64');
    return {
      ok: true,
      type: 'pdfBlob',
      base64,
      mime: res.headers.get('content-type') || 'application/pdf',
      size: bytes.length,
      filename: filename || '',
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
>(function Loga3WebView({ initialUrl = LOGA3_LOGIN_URL, onMessage, onReady }, ref) {
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

  const onFileDownload = useCallback(
    async (event: { nativeEvent: { downloadUrl: string } }) => {
      const url = event.nativeEvent.downloadUrl;
      if (!url) return;
      const msg = await urlToPdfMessage(url);
      emit(msg);
    },
    [emit]
  );

  return (
    <View style={styles.wrap}>
      {!initialUrl ? (
        <View style={styles.missing}>
          <Text style={styles.missingText}>
            EXPO_PUBLIC_LOGA3_URL fehlt. In .env setzen (siehe .env.example), dann App neu starten.
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
        source={{ uri: initialUrl }}
        onLoadEnd={() => {
          setLoading(false);
          webRef.current?.injectJavaScript(PDF_CAPTURE_INJECT);
          onReady?.();
        }}
        onMessage={onMsg}
        {...(Platform.OS === 'android'
          ? { onFileDownload: onFileDownload as (e: { nativeEvent: { downloadUrl: string } }) => void }
          : {})}
        injectedJavaScriptBeforeContentLoaded={PDF_CAPTURE_INJECT}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={initialUrl}
        mixedContentMode="always"
        originWhitelist={['*']}
        style={styles.web}
      />
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 280, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1' },
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
