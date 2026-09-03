import { Injectable } from '@nestjs/common';
import {
  REEL_CANVAS_WIDTH,
  REEL_SAFE_AREA,
  type AiInfluencerRenderSettings,
  type SubtitleCue,
} from './ai-influencer-render.types';
import type { ReelScenePlan } from './ai-influencer.types';

@Injectable()
export class AiInfluencerSubtitleService {
  buildCues(
    scenes: ReelScenePlan[],
    totalSec: number,
    hookText: string,
    spokenText?: string,
    settings?: AiInfluencerRenderSettings['subtitles'],
  ): SubtitleCue[] {
    const sub = settings ?? { maxLines: 2, fontSize: 52, maxWidthPercent: 85 } as const;
    const maxWidthPx = Math.round(REEL_CANVAS_WIDTH * (sub.maxWidthPercent / 100));
    const cues: SubtitleCue[] = [];

    const usable = scenes.length
      ? scenes
      : [{ start: 0, duration: totalSec, type: 'AVATAR_FULL' as const, text: hookText }];

    for (const scene of usable) {
      const raw = (scene.headline || scene.text || '').trim();
      if (!raw) continue;
      const start = scene.start ?? 0;
      const end = Math.min(totalSec, start + (scene.duration ?? 4));
      const segments = this.splitTimedSegments(raw, start, end, maxWidthPx, sub.fontSize, sub.maxLines);
      cues.push(...segments);
    }

    if (!cues.length && spokenText?.trim()) {
      cues.push(
        ...this.splitTimedSegments(spokenText.trim(), 0, totalSec, maxWidthPx, sub.fontSize, sub.maxLines),
      );
    }

    return this.deduplicateCues(cues);
  }

  buildAss(
    cues: SubtitleCue[],
    hookText: string,
    settings: AiInfluencerRenderSettings,
    durationSec: number,
  ): string {
    const sub = settings.subtitles;
    const hook = settings.hook;
    const marginL = REEL_SAFE_AREA.left;
    const marginR = REEL_SAFE_AREA.right;
    const marginV = sub.bottomMargin;
    const bold = sub.fontWeight === 'bold' ? -1 : 0;
    const outline = sub.outline ? 3 : 0;
    const shadow = sub.shadow ? 2 : 0;
    const backColour = sub.background ? '&H80000000' : '&H00000000';

    const lines: string[] = [
      '[Script Info]',
      'ScriptType: v4.00+',
      `PlayResX: ${REEL_CANVAS_WIDTH}`,
      `PlayResY: 1920`,
      'WrapStyle: 2',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      `Style: Sub,Arial,${sub.fontSize},&H00FFFFFF,&H000000FF,&H00000000,${backColour},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},2,${marginL},${marginR},${marginV},1`,
      `Style: Hook,Arial,${hook.fontSize},&H0000A5FF,&H000000FF,&H00000000,&H80000000,${bold},0,0,0,100,100,0,0,1,3,1,8,${marginL},${marginR},${hook.topMargin},1`,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];

    if (hook.enabled && hookText.trim()) {
      const wrapped = this.wrapText(hookText.trim(), hook.maxLines, maxWidthPx(hook.fontSize, 88));
      const hookEnd = Math.min(4, durationSec);
      lines.push(
        `Dialogue: 0,${this.toAssTime(0)},${this.toAssTime(hookEnd)},Hook,,0,0,0,,${this.escapeAss(wrapped)}`,
      );
    }

    if (sub.enabled) {
      for (const cue of cues) {
        if (cue.endSec <= cue.startSec) continue;
        lines.push(
          `Dialogue: 0,${this.toAssTime(cue.startSec)},${this.toAssTime(cue.endSec)},Sub,,0,0,0,,${this.escapeAss(cue.text)}`,
        );
      }
    }

    return lines.join('\n');
  }

  private splitTimedSegments(
    text: string,
    startSec: number,
    endSec: number,
    maxWidthPx: number,
    fontSize: number,
    maxLines: number,
  ): SubtitleCue[] {
    const sentences = text
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const chunks = sentences.length ? sentences : [text];
    const duration = Math.max(0.5, endSec - startSec);
    const perChunk = duration / chunks.length;
    const cues: SubtitleCue[] = [];

    chunks.forEach((chunk, i) => {
      const wrapped = this.wrapText(chunk, maxLines, maxWidthPx, fontSize);
      const segStart = startSec + i * perChunk;
      const segEnd = Math.min(endSec, segStart + perChunk);
      cues.push({ startSec: segStart, endSec: segEnd, text: wrapped });
    });

    return cues;
  }

  private wrapText(text: string, maxLines: number, maxWidthPx: number, fontSize = 52): string {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.estimateWidth(candidate, fontSize) <= maxWidthPx) {
        current = candidate;
      } else if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
        current = '';
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);

    return lines.slice(0, maxLines).join('\\N');
  }

  private estimateWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.52;
  }

  private deduplicateCues(cues: SubtitleCue[]): SubtitleCue[] {
    const seen = new Set<string>();
    return cues.filter((c) => {
      const key = `${c.startSec.toFixed(2)}|${c.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private toAssTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  private escapeAss(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }
}

function maxWidthPx(fontSize: number, percent: number): number {
  return Math.round(REEL_CANVAS_WIDTH * (percent / 100));
}
