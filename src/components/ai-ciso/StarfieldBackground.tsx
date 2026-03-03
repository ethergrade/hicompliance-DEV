import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

interface Comet {
  x: number;
  y: number;
  angle: number;
  speed: number;
  tailLength: number;
  life: number;
  maxLife: number;
  opacity: number;
}

export const StarfieldBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Star[] = [];
    let comets: Comet[] = [];
    let lastCometTime = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      const count = Math.floor((canvas.width * canvas.height) / 3000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.15 + 0.02,
        opacity: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
      }));
    };

    const spawnComet = () => {
      const side = Math.random();
      let x: number, y: number, angle: number;
      if (side < 0.5) {
        x = Math.random() * canvas.width;
        y = -10;
        angle = Math.PI * 0.3 + Math.random() * 0.4;
      } else {
        x = -10;
        y = Math.random() * canvas.height * 0.5;
        angle = Math.PI * 0.1 + Math.random() * 0.3;
      }
      comets.push({
        x, y, angle,
        speed: 3 + Math.random() * 4,
        tailLength: 80 + Math.random() * 120,
        life: 0,
        maxLife: 120 + Math.random() * 60,
        opacity: 0.7 + Math.random() * 0.3,
      });
    };

    const drawConstellations = (time: number) => {
      const constellationRadius = 120;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < Math.min(i + 5, stars.length); j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < constellationRadius && stars[i].size > 0.8 && stars[j].size > 0.8) {
            const lineOpacity = (1 - dist / constellationRadius) * 0.08;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 210, 255, ${lineOpacity})`;
            ctx.lineWidth = 0.3;
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw constellation lines
      drawConstellations(time);

      // Draw stars
      for (const star of stars) {
        star.y += star.speed;
        star.twinklePhase += star.twinkleSpeed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
        const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
        const alpha = star.opacity * twinkle;
        ctx.beginPath();
        ctx.fillStyle = `rgba(180, 220, 255, ${alpha})`;
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn comets
      if (time - lastCometTime > 12000 + Math.random() * 8000) {
        spawnComet();
        lastCometTime = time;
      }

      // Draw comets
      comets = comets.filter(c => {
        c.life++;
        c.x += Math.cos(c.angle) * c.speed;
        c.y += Math.sin(c.angle) * c.speed;
        const lifeRatio = c.life / c.maxLife;
        const fadeOpacity = lifeRatio > 0.7 ? (1 - lifeRatio) / 0.3 : 1;
        const currentOpacity = c.opacity * fadeOpacity;

        // Tail
        const gradient = ctx.createLinearGradient(
          c.x, c.y,
          c.x - Math.cos(c.angle) * c.tailLength,
          c.y - Math.sin(c.angle) * c.tailLength
        );
        gradient.addColorStop(0, `rgba(120, 220, 255, ${currentOpacity * 0.8})`);
        gradient.addColorStop(0.3, `rgba(80, 180, 220, ${currentOpacity * 0.3})`);
        gradient.addColorStop(1, `rgba(60, 140, 200, 0)`);
        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(
          c.x - Math.cos(c.angle) * c.tailLength,
          c.y - Math.sin(c.angle) * c.tailLength
        );
        ctx.stroke();

        // Head glow
        const headGlow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 4);
        headGlow.addColorStop(0, `rgba(200, 240, 255, ${currentOpacity})`);
        headGlow.addColorStop(1, `rgba(100, 200, 255, 0)`);
        ctx.beginPath();
        ctx.fillStyle = headGlow;
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fill();

        return c.life < c.maxLife;
      });

      animationId = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};
