import { useState, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ViewerImage {
  url: string;
  label: string;
}

interface Annotation {
  type: string;
  bbox: { x: number; y: number; width: number; height: number };
  description: string;
}

interface ScanPhotoViewerProps {
  images: ViewerImage[];
  initialIndex: number;
  annotations?: Annotation[];
  onClose: () => void;
}

export function ScanPhotoViewer({ images, initialIndex, annotations, onClose }: ScanPhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastTouchRef = useRef<{ dist: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  const current = images[currentIndex];

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goTo = (idx: number) => {
    setCurrentIndex(idx);
    resetTransform();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchRef.current = { dist: Math.hypot(dx, dy), x: 0, y: 0 };
    } else if (e.touches.length === 1 && scale > 1) {
      dragRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTx: translate.x,
        startTy: translate.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / lastTouchRef.current.dist;
      setScale((s) => Math.max(1, Math.min(5, s * ratio)));
      lastTouchRef.current.dist = newDist;
    } else if (e.touches.length === 1 && dragRef.current && scale > 1) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setTranslate({ x: dragRef.current.startTx + dx, y: dragRef.current.startTy + dy });
    }
  };

  const handleTouchEnd = () => {
    lastTouchRef.current = null;
    dragRef.current = null;
  };

  const handleDoubleClick = () => {
    if (scale > 1) resetTransform();
    else setScale(2.5);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm z-10">
        <span className="mono-label text-white/70">{current.label}</span>
        <span className="mono-label text-white/50">{currentIndex + 1} / {images.length}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image */}
      <div
        className="flex-1 relative overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
      >
        {current.url ? (
          <img
            src={current.url}
            alt={current.label}
            className="absolute inset-0 w-full h-full object-contain transition-transform duration-100"
            style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
            draggable={false}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <span className="mono-label text-white/50">No image</span>
          </div>
        )}

        {/* Nav arrows */}
        {currentIndex > 0 && (
          <button
            onClick={() => goTo(currentIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {currentIndex < images.length - 1 && (
          <button
            onClick={() => goTo(currentIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 py-4 bg-black/80">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`w-2 h-2 rounded-full transition ${i === currentIndex ? "bg-white" : "bg-white/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
