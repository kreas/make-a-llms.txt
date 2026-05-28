'use client';

import { motion } from 'framer-motion';
import { ElementType, ReactNode } from 'react';

type ScrollAnimateProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  as?: ElementType;
  yOffset?: number;
};

export function ScrollAnimate({
  children,
  className,
  delay = 0,
  duration = 0.6,
  as = 'div',
  yOffset = 16,
}: ScrollAnimateProps) {
  const Component = (motion as any)[as as string] || motion.div;

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{
        duration,
        ease: [0.16, 1, 0.3, 1],
        delay,
      }}
    >
      {children}
    </Component>
  );
}
