import type { StageImage } from './llm-client';

const allowedMediaTypes: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export const maxImageBytes = 4 * 1024 * 1024;

export function imageMediaTypeError(file: { type: string; size: number }): string | null {
  if (!allowedMediaTypes.includes(file.type)) return '仅支持 PNG、JPEG 或 WebP 图片。';
  if (file.size > maxImageBytes) return '图片超过 4 MB 限制。';
  return null;
}

export function readImageBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '';
      if (result) resolve(result);
      else reject(new Error('image_read_failed'));
    };
    reader.onerror = () => reject(new Error('image_read_failed'));
    reader.readAsDataURL(file);
  });
}

export function imageDetailLabel(mediaType: StageImage['mediaType'], sizeBytes: number): string {
  return `${mediaType.replace('image/', '').toUpperCase()} · ${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}
