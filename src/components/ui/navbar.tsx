'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LazyMotion, m, MotionConfig } from 'framer-motion';

const loadFeatures = () => import('framer-motion').then((mod) => mod.domMax);
import * as React from 'react';

export type IMenu = {
  id: number;
  title: string;
  url: string;
  dropdown?: boolean;
  items?: IMenu[];
};

type MenuProps = {
  list: IMenu[];
};

const Menu = ({ list }: MenuProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const pathname = usePathname();

  const isActive = (url: string) => {
    if (url === '/') return pathname === '/';
    return pathname === url || pathname.startsWith(url + '/');
  };

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig transition={{ bounce: 0, type: 'tween' }}>
        <nav className={'relative'}>
          <ul className={'flex items-center'}>
            {list?.map((item) => {
              const active = isActive(item.url);
              return (
                <li key={item.id} className={'relative'}>
                  <Link
                    className={`
                    relative flex items-center justify-center rounded px-5 py-2 text-sm transition-all
                    hover:bg-foreground/5
                    ${active ? 'text-primary font-medium' : 'text-body hover:text-primary'}
                  `}
                    onMouseEnter={() => setHovered(item.id)}
                    onMouseLeave={() => setHovered(null)}
                    href={item?.url}
                  >
                    {item?.title}
                  </Link>
                  {(hovered === item?.id || active) && !item?.dropdown && (
                    <m.div
                      layout
                      layoutId={`cursor`}
                      className={'absolute bottom-0 h-0.5 w-full bg-primary'}
                    />
                  )}
                  {item?.dropdown && hovered === item?.id && (
                    <div
                      className='absolute left-0 top-full z-50'
                      onMouseEnter={() => setHovered(item.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <m.div
                        layout
                        transition={{ bounce: 0 }}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 10, opacity: 0 }}
                        style={{
                          borderRadius: '8px',
                        }}
                        className='mt-2 flex w-56 flex-col rounded bg-background border p-1 shadow-sm'
                        layoutId={'cursor'}
                      >
                        {item?.items?.map((nav) => {
                          return (
                            <Link
                              key={`link-${nav?.id}`}
                              href={`${nav?.url}`}
                              className={'w-full rounded px-4 py-2.5 text-sm transition-colors hover:bg-muted'}
                            >
                              {nav?.title}
                            </Link>
                          );
                        })}
                      </m.div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </MotionConfig>
    </LazyMotion>
  );
};

export default Menu;
