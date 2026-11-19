import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy, Check, Download, ChevronLeft, ChevronRight, Calendar, Linkedin, Filter,
  CheckCircle, Clock, AlertTriangle, ExternalLink, PauseCircle, SkipForward,
} from 'lucide-react';
import './LinkedInQueue.css';

// Same base the axios client uses (utils/api.js).
const API_BASE = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/api` : '/api';
const TYPE_LABEL = { theory: 'Theory + myths', code_puzzle: 'Code puzzle', concept: 'Concept question' };

const fmt = (iso, timeZone) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)) + ({ 'Asia/Kolkata': ' IST', 'Asia/Tokyo': ' JST' }[timeZone] || '');
  } catch {
    return iso;
  }
};

const CopyButton = ({ text, label }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard blocked: the text is still selectable */ }
  };
  return (
    <button className="lq-btn" onClick={copy} disabled={!text}>
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Copied' : label}
    </button>
  );
};

const Carousel = ({ chapter, slides, v }) => {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const go = (d) => ref.current && ref.current.scrollBy({ left: d * ref.current.clientWidth, behavior: 'smooth' });
  return (
    <div className="lq-carousel">
      <span className="lq-count">{idx + 1} / {slides.length}</span>
      <div className="lq-slides" ref={ref}
        onScroll={(e) => setIdx(Math.round(e.target.scrollLeft / e.target.clientWidth))}>
        {slides.map((s) => (
          <div className="lq-slide" key={s}>
            <img src={`${API_BASE}/linkedin/file/${chapter}/${s}?v=${v}`} alt="" loading="lazy" />
          </div>
        ))}
      </div>
      <button className="lq-nav prev" onClick={() => go(-1)} aria-label="Previous slide"><ChevronLeft size={20} /></button>
      <button className="lq-nav next" onClick={() => go(1)} aria-label="Next slide"><ChevronRight size={20} /></button>
    </div>
  );
};

const StatusBadge = ({ p, tz }) => {
  if (p.status === 'posted') {
    return (
      <span className="lq-status s-posted">
        <CheckCircle size={14} /> Posted {fmt(p.posted_at, tz)}
        {p.post_url && !p.post_url.includes('SIMULATED') && (
          <a href={p.post_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> View</a>
        )}
        {p.comment_ok === false && <em> · first comment missing</em>}
      </span>
    );
  }
  if (p.status === 'skipped') return <span className="lq-status s-skipped"><SkipForward size={14} /> Skipped</span>;
  if (p.status === 'next') return <span className="lq-status s-next"><Clock size={14} /> NEXT · {fmt(p.planned_at, tz)}</span>;
  return <span className="lq-status s-scheduled"><Calendar size={14} /> Planned {fmt(p.planned_at, tz)}</span>;
};

const PostCard = ({ p, tz }) => {
  const [open, setOpen] = useState(false);
  return (
    <article className={`lq-post st-${p.status}`} id={`post-${p.id}`}>
      <header className="lq-post-head">
        <div className="lq-when"><b>#{p.seq}</b> <StatusBadge p={p} tz={tz} /></div>
        <div className="lq-tags">
          <span className={`lq-type t-${p.type}`}>{TYPE_LABEL[p.type] || p.type}</span>
          {p.format === 'video' && <span className="lq-type t-video">30 s video</span>}
          <span className="lq-topic">{p.chapter_title} · T{p.topic_no} {p.topic_short}</span>
          <span className="lq-id">{p.id}</span>
        </div>
      </header>
      <div className="lq-grid">
        {p.format === 'video' && p.video ? (
          <video className="lq-video" controls muted playsInline preload="metadata"
            src={`${API_BASE}/linkedin/file/${p.chapter_name}/${p.video}?v=${p.rendered_at}`} />
        ) : (
          <Carousel chapter={p.chapter_name} slides={p.slides} v={p.rendered_at} />
        )}
        <div className="lq-text">
          <div className="lq-label">Post text <small>({p.post_text.length} chars)</small></div>
          <div className="lq-postbody">
            <span>{p.hook}</span>
            {!open && <button className="lq-more" onClick={() => setOpen(true)}>...see more</button>}
            {open && <span>{'\n\n'}{p.body}{'\n\n'}<span className="lq-hash">{p.hashtags.map((h) => `#${h}`).join(' ')}</span></span>}
          </div>
          <div className="lq-label">First comment (posted by the bot)</div>
          <div className="lq-comment">{p.first_comment}</div>
          <div className="lq-actions">
            <CopyButton text={p.post_text} label="Copy post" />
            <CopyButton text={p.first_comment} label="Copy comment" />
            {p.format === 'video' && p.video ? (
              <a className="lq-btn" href={`${API_BASE}/linkedin/file/${p.chapter_name}/${p.video}?v=${p.rendered_at}`} download={`${p.id}.mp4`}>
                <Download size={15} /> Video (MP4)
              </a>
            ) : (
              <a className="lq-btn" href={`${API_BASE}/linkedin/file/${p.chapter_name}/${p.pdf}?v=${p.rendered_at}`} download={`${p.id}.pdf`}>
                <Download size={15} /> PDF ({p.slide_count} slides)
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const LinkedInQueue = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [chapter, setChapter] = useState('all');
  // ?status=posted|upcoming|skipped|all (bookmarkable)
  const [status, setStatus] = useState(
    () => new URLSearchParams(window.location.search).get('status') || 'upcoming');

  useEffect(() => {
    fetch(`${API_BASE}/linkedin/series`).then((r) => r.json()).then((j) => {
      if (j.error) setError(j.error); else setData(j);
    }).catch(() => setError('Could not reach the backend.'));
  }, []);

  const chapters = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.posts.forEach((p) => m.set(p.chapter_name, p.chapter_title));
    return [...m.entries()];
  }, [data]);

  const visible = useMemo(() => (data ? data.posts.filter((p) =>
    (type === 'all' || p.type === type)
    && (chapter === 'all' || p.chapter_name === chapter)
    && (status === 'all'
      || (status === 'upcoming' && (p.status === 'next' || p.status === 'scheduled'))
      || (status === 'posted' && p.status === 'posted')
      || (status === 'skipped' && p.status === 'skipped'))) : []), [data, type, chapter, status]);

  if (error) return <div className="lq-page"><div className="lq-empty">{error}</div></div>;
  if (!data) return <div className="lq-page"><div className="lq-empty">Loading posts...</div></div>;

  const s = data.summary;
  const tz = s.timezone;
  const next = data.posts.find((p) => p.id === s.next_id);
  const tokenDays = s.token_expires_on
    ? Math.ceil((new Date(s.token_expires_on) - new Date()) / 86400000) : null;

  return (
    <div className="lq-page">
      <div className="lq-hero">
        <h1><Linkedin size={26} /> LinkedIn Posts</h1>
        {s.paused && <div className="lq-alert warn"><PauseCircle size={16} /> Posting is paused (series.json).</div>}
        {s.low_buffer && !s.paused && (
          <div className="lq-alert warn"><AlertTriangle size={16} /> Only {s.days_left} day(s) of posts left. Add the next chapter to series.json.</div>
        )}
        {tokenDays !== null && tokenDays <= 7 && (
          <div className="lq-alert bad"><AlertTriangle size={16} /> LinkedIn token expires in {tokenDays} day(s) ({s.token_expires_on}).</div>
        )}
        {tokenDays === null && (
          <div className="lq-alert info"><AlertTriangle size={16} /> Token expiry date not set: add token_expires_on to series.json after renewing.</div>
        )}
        <div className="lq-stats">
          <div><b>{s.posted}</b><span>posted</span></div>
          <div><b>{s.remaining}</b><span>remaining</span></div>
          <div><b>{s.days_left}</b><span>days left</span></div>
          <div><b>{s.total}</b><span>total posts</span></div>
          <div><b>{s.by_type.code_puzzle}</b><span>code puzzles</span></div>
          <div><b>{s.by_type.concept}</b><span>concept questions</span></div>
          <div><b>{s.by_type.theory}</b><span>theory + myths</span></div>
          <div><b>{s.total_slides}</b><span>slides</span></div>
        </div>
        <p className="lq-sub">
          <Calendar size={15} />
          {next ? <>Next: <a href={`#post-${next.id}`}>{next.id}</a> · {fmt(next.planned_at, tz)}</> : 'Nothing scheduled'}
          {s.last_planned_at && <> · last planned post {fmt(s.last_planned_at, tz)}</>}
          {' · '}{s.slots.length} posts a day ({s.slots.join(', ')}) · posted automatically by GitHub Actions
        </p>
      </div>
      <div className="lq-filters">
        <Filter size={16} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="upcoming">Upcoming</option>
          <option value="posted">Posted</option>
          <option value="skipped">Skipped</option>
          <option value="all">All</option>
        </select>
        <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
          <option value="all">All chapters</option>
          {chapters.map(([n, title]) => <option key={n} value={n}>{title}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="lq-shown">{visible.length} shown</span>
      </div>
      {visible.length === 0 && <div className="lq-empty">No posts match these filters.</div>}
      {visible.map((p) => <PostCard key={p.id} p={p} tz={tz} />)}
    </div>
  );
};

export default LinkedInQueue;
