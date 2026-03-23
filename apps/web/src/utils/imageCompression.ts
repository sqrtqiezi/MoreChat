// ABOUTME: 图片压缩和验证工具函数
// ABOUTME: 提供自动压缩大于 2MB 的图片和验证图片格式大小的功能
import imageCompression from 'browser-image-compression'

export async function compressImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) {
    return file
  }

  return await imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  })
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: '只支持 JPEG、PNG、GIF、WebP 格式的图片' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: '图片大小不能超过 10MB' }
  }

  return { valid: true }
}
