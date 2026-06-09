const imageCache = new Map<string, HTMLImageElement>();
const imageLoadPromises = new Map<string, Promise<HTMLImageElement>>();

export function getCachedImage(src?: string) {
  return src ? imageCache.get(src) ?? null : null;
}

export function loadCachedImage(src: string) {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);

  const pending = imageLoadPromises.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      imageCache.set(src, image);
      imageLoadPromises.delete(src);
      resolve(image);
    };
    image.onerror = () => {
      imageLoadPromises.delete(src);
      reject(new Error("画像を読み込めませんでした"));
    };
    image.src = src;
  });
  imageLoadPromises.set(src, promise);
  return promise;
}
