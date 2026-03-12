import { useCallback, useEffect, useState } from "react";
import type { EmblaCarouselType } from "embla-carousel";

interface CarouselDotsProps {
  api: EmblaCarouselType | undefined;
}

export default function CarouselDots({ api }: CarouselDotsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const onSelect = useCallback(() => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    setScrollSnaps(api.scrollSnapList());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  if (!scrollSnaps.length) return null;

  return (
    <div className="flex justify-center gap-2 mt-6">
      {scrollSnaps.map((_, i) => (
        <button
          key={i}
          onClick={() => api?.scrollTo(i)}
          className="w-2 h-2 rounded-full transition-all duration-200"
          style={{
            background: i === selectedIndex ? "hsl(228 100% 62%)" : "hsl(228 100% 62% / 0.2)",
            transform: i === selectedIndex ? "scale(1.3)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}
