'use client';

import { useState } from 'react';
import { imageDetailLabel, imageMediaTypeError, readImageBase64 } from '../../lib/runtime/image-file';
import type { StageImage } from '../../lib/runtime/llm-client';

export interface VerifyImageMeta {
  name: string;
  detail: string;
}

export function IncidentImageInput({
  image,
  meta,
  onReplace,
  onRestore,
}: {
  image: StageImage;
  meta: VerifyImageMeta;
  onReplace: (image: StageImage, meta: VerifyImageMeta) => void;
  onRestore: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function readFile(file: File) {
    const invalid = imageMediaTypeError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setReading(true);
    try {
      const data = await readImageBase64(file);
      onReplace(
        { mediaType: file.type as StageImage['mediaType'], data, source: 'uploaded' },
        { name: file.name, detail: imageDetailLabel(file.type as StageImage['mediaType'], file.size) },
      );
    } catch {
      setError('图片读取失败，请重试。');
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="verify-image-input">
      {/* base64 数据 URI 缩略图，next/image 优化不适用 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="verify-image-thumb" src={`data:${image.mediaType};base64,${image.data}`} alt="核验图片缩略图" />
      <div className="verify-image-meta">
        <strong title={meta.name}>{meta.name}</strong>
        <span>{meta.detail}</span>
        <div className="verify-image-actions">
          <label className="verify-image-upload">
            替换核验图片
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = '';
              }}
            />
          </label>
          {image.source === 'uploaded' ? (
            <button type="button" className="verify-image-restore" onClick={onRestore}>恢复内置截图</button>
          ) : (
            <small className="verify-image-hint">核验将向模型发送此截图。</small>
          )}
        </div>
        {reading && <small className="verify-image-hint">正在读取图片…</small>}
        {error && <small className="verify-image-error" role="alert">{error}</small>}
      </div>
    </div>
  );
}
