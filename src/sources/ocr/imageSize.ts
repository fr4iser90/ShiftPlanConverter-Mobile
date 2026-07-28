/**
 * Local image pixel size (file:// / content://).
 */
export function getLocalImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native') as {
      Image: {
        getSize: (
          u: string,
          ok: (w: number, h: number) => void,
          fail: (e: unknown) => void
        ) => void;
      };
    };
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else reject(new Error('image size unavailable'));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });
}
