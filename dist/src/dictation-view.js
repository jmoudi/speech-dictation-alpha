import { dictationCoverage, gapExecution } from './evidence.js';
import { escapeHtml as e, time } from './store.js';
import { icon } from './icons.js';
export function dictationSummary(s) {
  const c = dictationCoverage(s, s.dictationId), percent = n => c.duration ? Math.round(n / c.duration * 100) : 0;
  const active = c.jobs.filter(j => ['Running', 'Queued', 'Paused'].includes(j.state)).length;
  const failed = c.jobs.filter(j => j.state === 'Failed').length;
  return `<section class="dictation-processing" aria-label="Dictation processing summary"><div class="dictation-coverage-metrics"><div><span>Recognition evidence</span><strong>${percent(c.evidence)}% <small>${time(c.evidence)} / ${time(c.duration)}</small></strong><div class="coverage-meter evidence"><i style="width:${percent(c.evidence)}%"></i></div></div><div><span>Text in document</span><strong>${percent(c.document)}% <small>${time(c.document)} / ${time(c.duration)}</small></strong><div class="coverage-meter document"><i style="width:${percent(c.document)}%"></i></div></div></div><div class="dictation-processing-bottom"><span>${c.jobs.length} jobs · ${active} active${failed ? ` · <span class="error-text">${failed} failed</span>` : ''} · primer v${s.primer.version}</span><button data-action="dictation-jobs">Inspect jobs ${icon('chevron')}</button></div></section>`;
}
export function documentGaps(s) {
  return dictationCoverage(s, s.dictationId).documentGaps.map(range => {
    const result = gapExecution(s, s.dictationId, range);
    return { start: range[0], gap: true, html: `<section class="document-gap ${result.state === 'Recognition failed' ? 'failed-gap' : result.state === 'Evidence ready' ? 'ready-gap' : ''}"><div class="gap-time">${time(range[0])}–${time(range[1])}</div><div><strong>${e(result.state)}</strong><span>${result.state === 'Evidence ready' ? 'Recognition result available; not inserted into the document.' : 'This audio interval has no document text yet.'}</span></div><button class="button small-button" data-action="inspect-gap" data-start="${range[0]}" data-end="${range[1]}">${result.attempt ? 'Inspect' : 'Dictation tools'}${icon('chevron')}</button></section>` };
  });
}
