import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SketchApp } from '../sketch';
import { Shell } from '../shell/Shell';
import { Button } from '../ui';

/** 画板和真实工作台共用会话、缓存和组件；切换体验不卸载画板。 */
export function SketchWorkspace() {
  const [experience, setExperience] = useState<{ title: string; view: string } | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const openPage = (address: string, title: string) => {
    const url = new URL(address, location.origin);
    if (url.origin !== location.origin || url.pathname !== '/') return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    setExperience({ title, view: url.searchParams.get('view') ?? 'nodes' });
  };
  const close = () => {
    setExperience(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  };
  return (
    <div className="relative h-full">
      <div className="h-full" inert={!!experience} aria-hidden={!!experience}>
        <SketchApp openPage={openPage} />
      </div>
      {experience ? (
        <section
          role="region"
          aria-label="页面体验"
          className="absolute inset-0 z-40 flex flex-col bg-bg"
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' &&
              !event.defaultPrevented &&
              !(event.target as HTMLElement).closest('input,textarea,[role="dialog"]')
            )
              close();
          }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-line bg-side px-3 py-2">
            <Button onClick={close} autoFocus>
              <ArrowLeft size={16} />
              返回画板
            </Button>
            <span className="truncate text-ui">{experience.title}</span>
          </header>
          <div className="min-h-0 flex-1">
            <Shell initialView={experience.view} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
