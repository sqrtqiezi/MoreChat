// ABOUTME: Lightbox component for viewing images with optional HD upgrade button
// ABOUTME: Uses yet-another-react-lightbox library for image viewing

import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  hasHd?: boolean;
  onUpgradeToHd?: () => void;
}

export function ImageLightbox({ isOpen, onClose, imageUrl, hasHd, onUpgradeToHd }: ImageLightboxProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (!onUpgradeToHd || isUpgrading) return;
    setIsUpgrading(true);
    try {
      await onUpgradeToHd();
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      slides={[{ src: imageUrl }]}
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
        slide: ({ slide }) => (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={slide.src}
              alt="查看图片"
              className="max-w-full max-h-full object-contain"
            />
            {hasHd && onUpgradeToHd && (
              <button
                onClick={handleUpgrade}
                disabled={isUpgrading}
                className="absolute bottom-8 right-8 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg shadow-lg transition-colors"
              >
                {isUpgrading ? '加载中...' : '升级到高清'}
              </button>
            )}
          </div>
        ),
      }}
    />
  );
}
