import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Download, ChevronLeft, ChevronRight, Calendar, Linkedin, Filter } from 'lucide-react';
import './LinkedInQueue.css';

// Same base the axios client uses (utils/api.js).
const API_BASE = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/api` : '/api';
const TYPE_LABEL = { theory: 'Theory + myths', code_puzzle: 'Code puzzle', concept: 'Concept question' };
const POSTED_KEY = 'linkedin-posted-v1';

const loadPosted = () => {
  try { return JSON.parse(localStorage.getItem(POSTED_KEY) || '{}'); } catch { return {}; }
};

const CopyButton = ({ text, label }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard blocked: user can still select the text */ }
  };
  return (
    <button className="lq-btn" onClick={copy} disabled={!text}>
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Copied' : label}
    </button>
  );
};

const Carousel = ({ chapter, slides }) => {
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
            <img src={`${API_BASE}/linkedin/${chapter}/file/${s}`} alt="" loading="lazy" />
          </div>
        ))}
      </div>
      <button className="lq-nav prev" onClick={() => go(-1)} aria-label="Previous slide"><ChevronLeft size={20} /></button>
      <button className="lq-nav next" onClick={() => go(1)} aria-label="Next slide"><ChevronRight size={20} /></button>
    </div>
  );
};

const PostCard = ({ chapter, p, posted, onTogglePosted }) => {
  const [open, setOpen] = useState(false);
  return (
    <article className={`lq-post ${posted ? 'is-posted' : ''}`}>
      <header className="lq-post-head">
        <div className="lq-when">
          <b>#{p.seq}</b> · Day {p.day} · {p.weekday} {p.date} · {p.slot} ({p.time})
        </div>
        <div className="lq-tags">
          <span className={`lq-type t-${p.type}`}>{TYPE_LABEL[p.type] || p.type}</span>
          <span className="lq-topic">T{p.topic_no} {p.topic_short}</span>
          <span className="lq-id">{p.id}</span>
        </div>
      </header>
      <div className="lq-grid">
        <Carousel chapter={chapter} slides={p.slides} />
        <div className="lq-text">
          <div className="lq-label">Post text <small>({p.post_text.length} chars)</small></div>
          <div className={`lq-postbody ${open ? 'open' : ''}`}>
            <span>{p.hook}</span>
            {!open && <button className="lq-more" onClick={() => setOpen(true)}>...see more</button>}
            {open && <span>{'\n\n'}{p.body}{'\n\n'}<span className="lq-hash">{p.hashtags.map((h) => `#${h}`).join(' ')}</span></span>}
          </div>
          <div className="lq-label">First comment</div>
          <div className="lq-comment">{p.first_comment}</div>
          {p.bonus_answer && (
            <details className="lq-bonus">
              <summary>Bonus answer (reply next day)</summary>
              <div>{p.bonus_answer}</div>
            </details>
          )}
          <div className="lq-actions">
            <CopyButton text={p.post_text} label="Copy post" />
            <CopyButton text={p.first_comment} label="Copy comment" />
            <a className="lq-btn" href={`${API_BASE}/linkedin/${chapter}/file/${p.pdf}`} download={`${p.id}.pdf`}>
              <Download size={15} /> PDF ({p.slide_count} slides)
            </a>
            <label className="lq-posted">
              <input type="checkbox" checked={!!posted} onChange={onTogglePosted} /> Posted
            </label>
          </div>
        </div>
      </div>
    </article>
  );
};

const LinkedInQueue = () => {
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');
  const [topic, setTopic] = useState('all');
  const [posted, setPosted] = useState(loadPosted);

  useEffect(() => {
    fetch(`${API_BASE}/linkedin/chapters`).then((r) => r.json()).then((j) => {
      setChapters(j.chapters || []);
      if (j.chapters && j.chapters.length) setChapter(j.chapters[0].chapter);
      else setError('No rendered post queue found. Run linkedin_tasks/generator/build_queue.py.');
    }).catch(() => setError('Could not reach the backend.'));
  }, []);

  useEffect(() => {
    if (!chapter) return;
    setData(null);
    fetch(`${API_BASE}/linkedin/${chapter}/queue`).then((r) => r.json()).then(setData)
      .catch(() => setError('Could not load the queue.'));
  }, [chapter]);

  const togglePosted = (id) => {
    const next = { ...posted, [id]: !posted[id] };
    setPosted(next);
    try { localStorage.setItem(POSTED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const topics = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.posts.forEach((p) => m.set(p.topic_no, p.topic_short));
    return [...m.entries()];
  }, [data]);

  const visible = useMemo(() => (data ? data.posts.filter((p) =>
    (type === 'all' || p.type === type) && (topic === 'all' || String(p.topic_no) === topic)) : []), [data, type, topic]);

  if (error) return <div className="lq-page"><div className="lq-empty">{error}</div></div>;
  if (!data) return <div className="lq-page"><div className="lq-empty">Loading posts...</div></div>;

  const s = data.summary;
  const postedCount = data.posts.filter((p) => posted[p.id]).length;
  return (
    <div className="lq-page">
      <div className="lq-hero">
        <h1><Linkedin size={26} /> LinkedIn Posts</h1>
        {chapters.length > 1 && (
          <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
            {chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
          </select>
        )}
        <div className="lq-stats">
          <div><b>{s.total_posts}</b><span>posts</span></div>
          <div><b>{s.by_type.code_puzzle}</b><span>code puzzles</span></div>
          <div><b>{s.by_type.concept}</b><span>concept questions</span></div>
          <div><b>{s.by_type.theory}</b><span>theory + myths</span></div>
          <div><b>{s.total_slides}</b><span>slides</span></div>
          <div><b>{s.days}</b><span>days</span></div>
          <div><b>{postedCount}</b><span>posted</span></div>
        </div>
        <p className="lq-sub"><Calendar size={15} /> {s.first_date} to {s.last_date} · 2 posts a day ·
          upload the PDF as a LinkedIn document post, paste the post text, then add the first comment.</p>
      </div>
      <div className="lq-filters">
        <Filter size={16} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="all">All topics</option>
          {topics.map(([n, name]) => <option key={n} value={String(n)}>T{n} {name}</option>)}
        </select>
        <span className="lq-shown">{visible.length} shown</span>
      </div>
      {visible.map((p) => (
        <PostCard key={p.id} chapter={chapter} p={p} posted={posted[p.id]} onTogglePosted={() => togglePosted(p.id)} />
      ))}
    </div>
  );
};

export default LinkedInQueue;
