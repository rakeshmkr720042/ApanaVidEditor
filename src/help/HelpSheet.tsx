import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { getLang, tIn } from '../lib/i18n'
import { useBack } from '../lib/back'
import { findTopic, searchHelp, SECTIONS, TOPICS } from './index'
import { KEYS, MOUSE } from './shortcuts'
import { findTarget, spotlight } from './spotlight'
import type { HelpFind, HelpLang, HelpSection, HelpTopic, Platform } from './types'

/** The guide's own words, in both languages (the guide can be read in either, whatever the app's language). */
const UI = {
  en: {
    guide: 'User guide', search: 'Search the guide… (e.g. speed, captions, export)', contents: 'Contents', home: 'Start here',
    welcome: 'Everything Apna Editor can do, step by step. Pick a topic, or search. "Show me" points at the real button in the app.',
    where: 'Where', showMe: 'Show me', steps: 'Steps', tips: 'Good to know', related: 'See also', prev: 'Previous', next: 'Next',
    results: 'results', noResults: 'Nothing found. Try another word, in English or Hindi.', topics: 'topics', isNew: 'New', pro: 'Pro',
    keyboard: 'Keyboard', mouse: 'Mouse', back: 'Back', close: 'Close', quick: 'Quick start',
    only: 'Only in', web: 'Website', android: 'Android app', windows: 'Windows app',
    needs: {
      project: 'Open or create a project first; this is in the editor.',
      clip: 'Tap a clip on the main video row of the timeline first, then this tool shows in the toolbar.',
      item: 'Tap an item on the timeline first, then this tool shows in the toolbar.',
      overlay: 'Tap an overlay (a video or photo on its own row) on the timeline first.',
      text: 'Tap a text or caption on the timeline first.',
      audio: 'Tap a music or voice item on the timeline first.',
      nothing: 'Tap Back at the left of the toolbar so nothing is selected; this tool is in the main toolbar. Scroll the toolbar if you do not see it.',
      home: 'This is on the Home screen (the list of projects). Go back from the editor to see it.',
      none: 'This is not on the screen right now.',
    },
  },
  hi: {
    guide: 'उपयोगकर्ता गाइड', search: 'गाइड में खोजें… (जैसे स्पीड, कैप्शन, एक्सपोर्ट)', contents: 'विषय-सूची', home: 'यहाँ से शुरू करें',
    welcome: 'Apna Editor की हर सुविधा, स्टेप बाय स्टेप। कोई विषय चुनें या खोजें। "दिखाओ" दबाने पर ऐप में असली बटन चमकता है।',
    where: 'कहाँ मिलेगा', showMe: 'दिखाओ', steps: 'स्टेप', tips: 'ध्यान रखें', related: 'यह भी देखें', prev: 'पिछला', next: 'अगला',
    results: 'नतीजे', noResults: 'कुछ नहीं मिला। कोई दूसरा शब्द, हिंदी या अंग्रेज़ी में आज़माएँ।', topics: 'विषय', isNew: 'नया', pro: 'Pro',
    keyboard: 'कीबोर्ड', mouse: 'माउस', back: 'वापस', close: 'बंद करें', quick: 'जल्दी शुरुआत',
    only: 'सिर्फ़', web: 'वेबसाइट', android: 'Android ऐप', windows: 'Windows ऐप',
    needs: {
      project: 'पहले कोई प्रोजेक्ट खोलें या नया बनाएँ; यह एडिटर में है।',
      clip: 'पहले टाइमलाइन की मुख्य वीडियो लाइन पर किसी क्लिप को दबाएँ, फिर यह टूल नीचे टूलबार में दिखेगा।',
      item: 'पहले टाइमलाइन पर किसी आइटम को दबाएँ, फिर यह टूल टूलबार में दिखेगा।',
      overlay: 'पहले टाइमलाइन पर किसी ओवरले (अपनी अलग लाइन पर रखी वीडियो या फ़ोटो) को दबाएँ।',
      text: 'पहले टाइमलाइन पर किसी टेक्स्ट या कैप्शन को दबाएँ।',
      audio: 'पहले टाइमलाइन पर किसी म्यूज़िक या आवाज़ वाले आइटम को दबाएँ।',
      nothing: 'टूलबार में सबसे बाएँ "वापस" दबाएँ ताकि कुछ भी चुना न रहे; यह टूल मुख्य टूलबार में है। न दिखे तो टूलबार को खिसकाएँ।',
      home: 'यह होम स्क्रीन (प्रोजेक्ट की सूची) पर है। एडिटर से वापस जाकर देखें।',
      none: 'यह अभी स्क्रीन पर नहीं है।',
    },
  },
}

type View = { kind: 'home' } | { kind: 'topic'; id: string }

const LANG_KEY = 'help-lang'
const startLang = (): HelpLang => { try { const l = localStorage.getItem(LANG_KEY); if (l === 'en' || l === 'hi') return l } catch { /* private mode */ } return getLang() }

/** Topics for the "Quick start" list on the first page. */
const QUICK = ['first-video', 'timeline-basics', 'split-trim', 'add-text', 'add-music', 'auto-captions', 'export-video', 'shortcuts']

export default function HelpSheet({ start, onClose, onAside }: { start: string | null; onClose: () => void; onAside: (topic: string) => void }) {
  const [lang, setLangState] = useState<HelpLang>(startLang)
  const [stack, setStack] = useState<View[]>(() => [start && findTopic(start) ? { kind: 'topic', id: start } : { kind: 'home' }])
  const [query, setQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const pageRef = useRef<HTMLElement>(null)
  const ui = UI[lang]
  const view = stack[stack.length - 1]

  const setLang = (l: HelpLang) => { setLangState(l); try { localStorage.setItem(LANG_KEY, l) } catch { /* private mode */ } }
  const go = (v: View) => { setQuery(''); setHint(null); setStack((s) => [...s, v]) }
  const back = () => { setHint(null); if (query) setQuery(''); else if (stack.length > 1) setStack((s) => s.slice(0, -1)); else onClose() }
  // the phone's Back button and Esc step back inside the guide first
  useBack(true, back)

  useEffect(() => { pageRef.current?.scrollTo({ top: 0 }) }, [view, query])

  const results = useMemo(() => (query.trim() ? searchHelp(query, lang) : null), [query, lang])
  const ref = view.kind === 'topic' ? findTopic(view.id) : null

  const showMe = (topic: HelpTopic) => {
    const f = topic.find as HelpFind
    const el = findTarget(f)
    if (!el) {
      const inEditor = !!document.querySelector('.app.editor')
      const need = !inEditor && f.needs !== 'home' ? 'project' : f.needs ?? 'none'
      setHint(ui.needs[need])
      return
    }
    onAside(topic.id)
    // after the guide has closed, so the ring is drawn on the real screen
    requestAnimationFrame(() => spotlight(el, topic[lang].title))
  }

  const topicLink = (t: HelpTopic, small?: boolean) => (
    <button key={t.id} className={`help-link${small ? ' small' : ''}${view.kind === 'topic' && view.id === t.id ? ' on' : ''}`} onClick={() => go({ kind: 'topic', id: t.id })}>
      {t[lang].title}
      {t.isNew && <span className="help-badge new">{ui.isNew}</span>}
      {t.pro && <span className="help-badge pro"><Icon name="crown" size={11} /></span>}
    </button>
  )

  const badges = (t: HelpTopic) => (
    <span className="help-badges">
      {t.isNew && <span className="help-badge new">{ui.isNew}</span>}
      {t.pro && <span className="help-badge pro"><Icon name="crown" size={11} /> {ui.pro}</span>}
      {t.platforms && <span className="help-badge plat">{ui.only}: {t.platforms.map((p: Platform) => ui[p]).join(', ')}</span>}
    </span>
  )

  const keysTable = (rows: [string, string][]) => (
    <dl className="keys-list help-keys">
      {rows.map(([k, v]) => <Fragment key={k}><dt><kbd>{tIn(k, lang)}</kbd></dt><dd>{tIn(v, lang)}</dd></Fragment>)}
    </dl>
  )

  const topicPage = (section: HelpSection, topic: HelpTopic) => {
    const x = topic[lang]
    const i = TOPICS.findIndex((r) => r.topic.id === topic.id)
    const prev = TOPICS[i - 1]?.topic, next = TOPICS[i + 1]?.topic
    return (
      <div className="help-topic" data-testid="help-topic" data-topic={topic.id}>
        <button className="help-crumb" onClick={() => go({ kind: 'home' })}><Icon name={section.icon} size={14} /> {section.title[lang]}</button>
        <h2>{x.title}</h2>
        {badges(topic)}
        <p className="help-what">{x.what}</p>
        {(x.where || topic.find) && (
          <div className="help-where">
            {x.where && <span><b>{ui.where}:</b> {x.where}</span>}
            {topic.find && <button className="btn small primary" onClick={() => showMe(topic)} data-testid="help-show-me"><Icon name="eye" size={16} /> {ui.showMe}</button>}
          </div>
        )}
        {hint && <p className="help-hint" data-testid="help-hint">{hint}</p>}
        <h3>{ui.steps}</h3>
        <ol className="help-steps">{x.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
        {topic.extra === 'shortcuts' && (
          <>
            <h3>{ui.keyboard}</h3>{keysTable(KEYS)}
            <h3>{ui.mouse}</h3>{keysTable(MOUSE)}
          </>
        )}
        {!!x.tips?.length && (
          <>
            <h3>{ui.tips}</h3>
            <ul className="help-tips">{x.tips.map((s, k) => <li key={k}>{s}</li>)}</ul>
          </>
        )}
        {!!topic.related?.length && (
          <div className="help-related">
            <b>{ui.related}:</b> {topic.related.map((id) => findTopic(id)).filter(Boolean).map((r) => topicLink(r!.topic, true))}
          </div>
        )}
        <div className="help-pager">
          {prev ? <button className="btn small" onClick={() => go({ kind: 'topic', id: prev.id })}>‹ {prev[lang].title}</button> : <span />}
          {next ? <button className="btn small" onClick={() => go({ kind: 'topic', id: next.id })}>{next[lang].title} ›</button> : <span />}
        </div>
      </div>
    )
  }

  const homePage = (
    <div className="help-home">
      <h2><Icon name="book" size={22} /> {ui.guide}</h2>
      <p className="muted">{ui.welcome}</p>
      <h3>{ui.quick}</h3>
      <div className="help-quick">{QUICK.map((id) => findTopic(id)).filter(Boolean).map((r) => topicLink(r!.topic))}</div>
      <h3>{ui.contents}</h3>
      <div className="help-cards">
        {SECTIONS.map((s) => (
          <section key={s.id} className="help-card">
            <h4><Icon name={s.icon} size={18} /> {s.title[lang]} <span className="muted small">{s.topics.length} {ui.topics}</span></h4>
            {s.intro && <p className="muted small">{s.intro[lang]}</p>}
            <div className="help-card-links">{s.topics.map((t) => topicLink(t, true))}</div>
          </section>
        ))}
      </div>
    </div>
  )

  const searchPage = results && (
    <div className="help-results" data-testid="help-results">
      <p className="muted small">{results.length} {ui.results}</p>
      {!results.length && <p>{ui.noResults}</p>}
      {results.map(({ section, topic }) => (
        <button key={topic.id} className="help-result" onClick={() => go({ kind: 'topic', id: topic.id })}>
          <b>{topic[lang].title}</b>
          <span className="muted small"><Icon name={section.icon} size={12} /> {section.title[lang]}</span>
          <span className="small">{topic[lang].what}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help-window" role="dialog" aria-label={ui.guide} lang={lang} onClick={(e) => e.stopPropagation()} data-testid="help">
        <header className="help-head">
          {(stack.length > 1 || query) && <button className="icon-btn" onClick={back} aria-label={ui.back} title={ui.back}><Icon name="back" size={20} /></button>}
          <b className="help-title" onClick={() => go({ kind: 'home' })}><Icon name="book" size={18} /> {ui.guide}</b>
          <div className="help-lang" role="group">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} data-testid="help-en">English</button>
            <button className={lang === 'hi' ? 'on' : ''} onClick={() => setLang('hi')} data-testid="help-hi">हिंदी</button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={ui.close} title={ui.close}><Icon name="close" size={20} /></button>
        </header>
        <label className="help-search">
          <Icon name="search" size={18} />
          <input type="search" value={query} placeholder={ui.search} onChange={(e) => setQuery(e.target.value)} data-testid="help-search" />
        </label>
        <div className="help-body">
          <nav className="help-toc" aria-label={ui.contents}>
            <button className={`help-link${view.kind === 'home' && !query ? ' on' : ''}`} onClick={() => go({ kind: 'home' })}><Icon name="book" size={14} /> {ui.home}</button>
            {SECTIONS.map((s) => (
              <div key={s.id} className="help-toc-sec">
                <b><Icon name={s.icon} size={14} /> {s.title[lang]}</b>
                {s.topics.map((t) => topicLink(t, true))}
              </div>
            ))}
          </nav>
          <article className="help-page" ref={pageRef}>
            {searchPage ?? (ref ? topicPage(ref.section, ref.topic) : homePage)}
          </article>
        </div>
      </div>
    </div>
  )
}
