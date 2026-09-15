import { useMemo } from 'react';
import type { DocSettings, HandwritingProfile } from '../engine/types';
import { layoutPages } from '../engine/layout';
import { renderPageToSvg } from '../engine/render';
import { cn } from '../utils/cn';

interface Props {
  text: string;
  profile: HandwritingProfile;
  settings: DocSettings;
  pageIndex: number;
  onPageCount?: (n: number) => void;
  customPaperDataUrl?: string;
  darkInk?: boolean;
  className?: string;
}


export default function PageViewer({ text, profile, settings, pageIndex, onPageCount, customPaperDataUrl, darkInk, className }: Props) {
  const { svg, total } = useMemo(() => {
    const pages = layoutPages(text || ' ', profile, settings);
    const totalPages = pages.length;
    onPageCount?.(totalPages);
    const idx = Math.min(pageIndex, totalPages - 1);
    const transparent = !!settings.transparentBg;
    const svgStr = renderPageToSvg(pages[idx], profile, settings, idx, totalPages, {
      withPaper: !transparent,
      customPaperDataUrl,
      inkColor: transparent && darkInk ? '#e8edf5' : settings.inkColor || '#1c2742',
    });
    return { svg: svgStr, total: totalPages };

  }, [text, profile, settings, pageIndex, customPaperDataUrl, darkInk]);

  void total;
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700', className)}>
      <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}


export function buildAllPageSvgs(
  text: string,
  profile: HandwritingProfile,
  settings: DocSettings,
  customPaperDataUrl: string | undefined,
  opts?: { transparent?: boolean; inkColor?: string },
): string[] {
  const pages = layoutPages(text || ' ', profile, settings);
  return pages.map((p, i) =>
    renderPageToSvg(p, profile, settings, i, pages.length, {
      withPaper: !(opts?.transparent ?? settings.transparentBg),
      customPaperDataUrl,
      inkColor: opts?.inkColor ?? settings.inkColor ?? '#1c2742',
    }),
  );
}
