export default function LightRays({ opacity = 1 }: { opacity?: number }) {
  const rays = [
    { left: "20%", op: 0.6, delay: "0s" },
    { left: "50%", op: 1.0, delay: "2s" },
    { left: "80%", op: 0.4, delay: "4s" },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity }}>
      {rays.map((ray, i) => (
        <div
          key={i}
          className="absolute animate-ray-drift"
          style={{
            left: ray.left,
            top: 0,
            width: 120,
            height: "100%",
            opacity: ray.op,
            background:
              "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.18) 40%, transparent 100%)",
            filter: "blur(30px)",
            borderRadius: "50%",
            animationDelay: ray.delay,
            transform: "translateX(-50%)",
          }}
        />
      ))}
    </div>
  );
}
