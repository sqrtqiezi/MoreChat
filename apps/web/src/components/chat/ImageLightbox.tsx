// ABOUTME: Lightbox component for viewing images with optional HD upgrade button
// ABOUTME: Uses yet-another-react-lightbox library for image viewing

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
                onClick={onUpgradeToHd}
                className="absolute bottom-8 right-8 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg transition-colors"
              >
                升级到高清
              </button>
            )}
          </div>
        ),
      }}
    />
  );
}
