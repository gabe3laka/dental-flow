import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only on desktop with fine pointer
    if (window.matchMedia("(pointer: fine)").matches === false) return;

    const move = (e: MouseEvent) => {
      if (dot.current) {
        dot.current.style.transform = `translate(${e.clientX - 16}px, ${e.clientY - 16}px)`;
      }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Don't render on touch devices
  if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) {
    return null;
  }

  return (
    <div
      ref={dot}
      className="fixed top-0 left-0 pointer-events-none z-[9998]"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        border: "1.5px solid hsl(228 100% 62%)",
        background: "transparent",
        mixBlendMode: "multiply",
        transition: "transform 150ms ease",
        willChange: "transform",
      }}
    />
  );
}
