'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InteractiveBackground.module.css';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface MousePosition {
  x: number;
  y: number;
}

const PARTICLE_COUNT = 80;
const CONNECTION_DISTANCE = 120;
const MOUSE_INFLUENCE_RADIUS = 150;

export function InteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef<MousePosition>({ x: -1000, y: -1000 });
  const animationFrameRef = useRef<number>(0);
  const [isHovering, setIsHovering] = useState(false);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 2.5 + 1.5,
        opacity: Math.random() * 0.4 + 0.4,
      });
    }
    return particles;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const mouse = mouseRef.current;
    const particles = particlesRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get accent color
    const accentColor =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() ||
      '#4ecdc4';

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Mouse influence - smooth attraction/repulsion
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MOUSE_INFLUENCE_RADIUS && dist > 0) {
        const force = (MOUSE_INFLUENCE_RADIUS - dist) / MOUSE_INFLUENCE_RADIUS;
        const angle = Math.atan2(dy, dx);
        // Smooth repulsion from cursor
        p.vx -= Math.cos(angle) * force * 0.15;
        p.vy -= Math.sin(angle) * force * 0.15;
        // Increase opacity near cursor
        p.opacity = Math.min(0.9, p.opacity + force * 0.05);
      } else {
        // Gradually return to base opacity
        if (p.opacity > 0.5) {
          p.opacity -= 0.005;
        }
      }

      // Apply velocity with damping
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;

      // Add slight random drift
      p.vx += (Math.random() - 0.5) * 0.03;
      p.vy += (Math.random() - 0.5) * 0.03;

      // Soft boundary bounce
      if (p.x < 0) {
        p.x = 0;
        p.vx *= -0.5;
      }
      if (p.x > width) {
        p.x = width;
        p.vx *= -0.5;
      }
      if (p.y < 0) {
        p.y = 0;
        p.vy *= -0.5;
      }
      if (p.y > height) {
        p.y = height;
        p.vy *= -0.5;
      }

      // Draw particle as glowing dot
      ctx.save();
      ctx.globalAlpha = p.opacity;

      // Outer glow
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      gradient.addColorStop(0, accentColor);
      gradient.addColorStop(0.4, `${accentColor}80`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw connections between nearby particles
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DISTANCE) {
          const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.2;
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // Draw connections from mouse to nearby particles
    if (mouse.x > 0 && mouse.y > 0) {
      ctx.lineWidth = 1;
      for (const p of particles) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_INFLUENCE_RADIUS) {
          const opacity = (1 - dist / MOUSE_INFLUENCE_RADIUS) * 0.4;
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }

      // Draw cursor glow
      ctx.globalAlpha = 0.3;
      const cursorGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 30);
      cursorGradient.addColorStop(0, accentColor);
      cursorGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = cursorGradient;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        particlesRef.current = initParticles(canvas.width, canvas.height);
      }
    };

    // Track mouse globally so it works even when content is on top
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if mouse is within canvas bounds
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        mouseRef.current = { x, y };
        setIsHovering(true);
      } else {
        mouseRef.current = { x: -1000, y: -1000 };
        setIsHovering(false);
      }
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      mouseRef.current = { x: -1000, y: -1000 };
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    // Listen on document for global mouse tracking
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [animate, initParticles]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${isHovering ? styles.hovering : ''}`}
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Floating glow orbs */}
      <div className={styles.orb1} aria-hidden="true" />
      <div className={styles.orb2} aria-hidden="true" />
    </div>
  );
}
