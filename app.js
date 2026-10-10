/**
 * CIVIC PROOF — Shared Data & Utilities (app.js)
 * All pages import this for demo data, sidebar logic, and helpers.
 */

/* ── Demo Data ────────────────────────────────────────── */
const CP = (() => {

  const DEFAULT_COMPLAINTS = [
    { id:"CP-2024-0891", title:"Broken Streetlight on MG Road", category:"Infrastructure", ward:"Ward 14", location:"MG Road, Sector 5", status:"open",     priority:"high",     date:"2024-10-08", reporter:"Arjun Mehta",       dept:"Public Works",        description:"Three consecutive streetlights near the MG Road overpass have been non-functional for over two weeks, creating a safety hazard for night-time commuters." },
    { id:"CP-2024-0890", title:"Garbage Pile-up Near Anand Nagar", category:"Sanitation", ward:"Ward 7",  location:"Anand Nagar, Block C", status:"progress", priority:"critical", date:"2024-10-07", reporter:"Priya Sharma",      dept:"Sanitation Dept.",    description:"Uncollected garbage has been accumulating for 5 days. The pile is now blocking part of the footpath and causing health concerns." },
    { id:"CP-2024-0887", title:"Pothole on NH-48 Service Road",    category:"Roads",         ward:"Ward 3",  location:"NH-48 Service Rd, Km 12", status:"progress", priority:"high", date:"2024-10-06", reporter:"Suresh Iyer",      dept:"Roads & Bridges",     description:"A large pothole approximately 2 feet wide has formed on the service road, damaging vehicles daily." },
    { id:"CP-2024-0885", title:"Water Supply Disruption – Block D", category:"Water",    ward:"Ward 11", location:"Green Colony, Block D",   status:"resolved", priority:"medium",  date:"2024-10-05", reporter:"Kavitha Nair",     dept:"Water Authority",     description:"Residents of Block D reported no water supply for 48 hours. Pipe burst traced and repaired." },
    { id:"CP-2024-0882", title:"Illegal Construction Blocking Lane", category:"Buildings", ward:"Ward 9",  location:"Shastri Nagar, Lane 3",  status:"open",     priority:"medium",  date:"2024-10-04", reporter:"Ratan Gupta",      dept:"Building Dept.",      description:"An unlicensed extension is being constructed that protrudes into the public lane, making it impassable for emergency vehicles." },
    { id:"CP-2024-0880", title:"Park Lights Non-functional",       category:"Parks",         ward:"Ward 6",  location:"Nehru Park, Sector 2",   status:"open",     priority:"low",     date:"2024-10-03", reporter:"Meera Joshi",      dept:"Parks & Recreation",  description:"All park perimeter lighting has been off for 10 days, making the park unsafe after 7 PM." },
    { id:"CP-2024-0877", title:"Sewage Overflow on Main Street",   category:"Sanitation", ward:"Ward 2",  location:"Main St, Opp. Post Office", status:"resolved", priority:"critical", date:"2024-10-02", reporter:"Dinesh Kaur",   dept:"Sanitation Dept.",    description:"Raw sewage was overflowing onto the main street due to a blocked drain. Issue has been resolved." },
    { id:"CP-2024-0875", title:"Encroachment on Footpath",         category:"Infrastructure", ward:"Ward 17", location:"Rajaji Nagar, 4th Cross", status:"closed",   priority:"low",     date:"2024-10-01", reporter:"Anita Pillai",     dept:"Town Planning",       description:"Vendors have encroached upon the footpath making it inaccessible for pedestrians. Case closed after clearing drive." },
    { id:"CP-2024-0872", title:"Faulty Traffic Signal at Junction", category:"Roads",       ward:"Ward 5",  location:"Liberty Circle Junction", status:"progress", priority:"high",    date:"2024-09-30", reporter:"Vikram Shetty",    dept:"Traffic Dept.",       description:"Traffic signal at the Liberty Circle is stuck on red on all sides, causing major traffic jams during peak hours." },
    { id:"CP-2024-0869", title:"Noise Pollution from Construction", category:"Environment", ward:"Ward 12", location:"IT Park Road, Phase 2",   status:"open",     priority:"medium",  date:"2024-09-29", reporter:"Lalitha Rao",      dept:"Environment Cell",    description:"Construction activity is happening past 10 PM in violation of noise pollution norms, disturbing residents." },
    { id:"CP-2024-0865", title:"Dog Menace Near School",           category:"Animal Control", ward:"Ward 8", location:"St. Francis School Rd",  status:"resolved", priority:"high",   date:"2024-09-28", reporter:"Sanjay Verma",    dept:"Animal Control",      description:"A pack of stray dogs have been attacking children near the school gate. Animal Control has intervened." },
    { id:"CP-2024-0861", title:"Damaged Road Divider",             category:"Roads",         ward:"Ward 4",  location:"100 Feet Road, Km 3",    status:"closed",   priority:"medium",  date:"2024-09-27", reporter:"Pooja Krishnan",   dept:"Roads & Bridges",     description:"Multiple divider sections are broken, creating accident risk. The department repaired and closed the issue." },
    { id:"CP-2024-0858", title:"Drinking Water Quality Complaint", category:"Water",         ward:"Ward 10", location:"Vasanth Nagar, Block A", status:"open",     priority:"high",    date:"2024-09-26", reporter:"Mukesh Agarwal",   dept:"Water Authority",     description:"Tap water smells bad and appears discolored. Multiple households have reported stomach ailments." },
    { id:"CP-2024-0853", title:"Electric Pole Leaning Dangerously", category:"Electricity", ward:"Ward 15", location:"Near Bus Stop, Sector 9", status:"progress", priority:"critical", date:"2024-09-25", reporter:"Sunita Bhat",    dept:"BESCOM",              description:"An electric pole is tilting at a dangerous angle after heavy rains. Kids frequently pass by. Urgent attention required." },
    { id:"CP-2024-0849", title:"Broken Playground Equipment",      category:"Parks",         ward:"Ward 6",  location:"Children's Park, Sector 4", status:"resolved", priority:"low", date:"2024-09-24", reporter:"Rohit Das",       dept:"Parks & Recreation",  description:"Swings and slides are broken with sharp edges exposed. Repaired after parent complaints." },
  ];
  
  let COMPLAINTS = JSON.parse(localStorage.getItem('cp_complaints'));
  if (!COMPLAINTS) {
    COMPLAINTS = [...DEFAULT_COMPLAINTS];
    localStorage.setItem('cp_complaints', JSON.stringify(COMPLAINTS));
  }

  const CATEGORIES = [
    { name:"Infrastructure", count:42, color:"#2d8653" },
    { name:"Sanitation",     count:38, color:"#3aad6a" },
    { name:"Roads",          count:31, color:"#d4a017" },
    { name:"Water",          count:24, color:"#4a90d9" },
    { name:"Parks",          count:18, color:"#8e5ea2" },
    { name:"Electricity",    count:15, color:"#e65c2e" },
    { name:"Environment",    count:12, color:"#5aa67b" },
    { name:"Buildings",      count:9,  color:"#a0522d" },
    { name:"Animal Control", count:7,  color:"#c0392b" },
  ];

  const DEFAULT_STATS = {
    total: 347,
    open: 89,
    inProgress: 124,
    resolved: 102,
    closed: 32,
    avgResolutionDays: 4.7,
    satisfactionRate: 78,
    thisMonth: 63,
  };
  
  let STATS = JSON.parse(localStorage.getItem('cp_stats'));
  if (!STATS) {
    STATS = {...DEFAULT_STATS};
    localStorage.setItem('cp_stats', JSON.stringify(STATS));
  }
  
  function addComplaint(complaint) {
    COMPLAINTS.unshift(complaint);
    localStorage.setItem('cp_complaints', JSON.stringify(COMPLAINTS));
    
    STATS.total++;
    STATS.open++;
    STATS.thisMonth++;
    localStorage.setItem('cp_stats', JSON.stringify(STATS));
  }
  
  function updateComplaintStatus(id, newStatus, message = "") {
    const c = COMPLAINTS.find(x => x.id === id);
    if (!c) return false;
    
    // Update stats
    if (c.status === 'open') STATS.open--;
    else if (c.status === 'progress') STATS.inProgress--;
    else if (c.status === 'resolved') STATS.resolved--;
    else if (c.status === 'closed') STATS.closed--;
    
    c.status = newStatus;
    
    if (c.status === 'open' || c.status === 'acknowledged') STATS.open++;
    else if (c.status === 'progress') STATS.inProgress++;
    else if (c.status === 'resolved') STATS.resolved++;
    else if (c.status === 'closed') STATS.closed++;
    
    if (!c.history) {
      c.history = [
        { status: 'open', timestamp: new Date(c.date).toISOString(), message: "Complaint submitted." }
      ];
    }
    
    c.history.push({ status: newStatus, timestamp: new Date().toISOString(), message: message });
    
    localStorage.setItem('cp_complaints', JSON.stringify(COMPLAINTS));
    localStorage.setItem('cp_stats', JSON.stringify(STATS));
    return true;
  }

  const WEEKLY_TREND = [12, 18, 9, 24, 16, 21, 14]; // Sun–Sat

  const DEPARTMENTS = [
    { name:"Roads & Bridges",   resolved:48, open:14, progress:22 },
    { name:"Sanitation Dept.",  resolved:35, open:23, progress:18 },
    { name:"Water Authority",   resolved:28, open:12, progress:11 },
    { name:"Public Works",      resolved:22, open:19, progress:16 },
    { name:"Parks & Recreation",resolved:19, open:8,  progress:10 },
    { name:"BESCOM",            resolved:14, open:7,  progress:9  },
  ];

  /* ── Helpers ──────────────────────────────────────────── */
  function statusPill(status) {
    const labels = { open:'Open', progress:'In Progress', resolved:'Resolved', closed:'Closed' };
    return `<span class="status-pill status-${status}">${labels[status] || status}</span>`;
  }

  function priorityChip(p) {
    const labels = { critical:'Critical', high:'High', medium:'Medium', low:'Low' };
    return `<span class="priority-chip priority-${p}">${labels[p] || p}</span>`;
  }

  function relativeDate(dateStr) {
    const d = new Date(dateStr), now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return `${diff} days ago`;
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  }

  /* ── Sidebar init ─────────────────────────────────────── */
  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('mainContent');
    const btn     = document.getElementById('collapseBtn');
    const colIcon = document.getElementById('collapseIcon');
    const colText = document.getElementById('collapseText');
    if (!sidebar) return;

    const saved = localStorage.getItem('cp_sidebar_collapsed');
    if (saved === 'true') {
      sidebar.classList.add('collapsed');
      main.classList.add('expanded');
    }

    function toggle() {
      const c = sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded', c);
      localStorage.setItem('cp_sidebar_collapsed', c);
      if (colIcon) colIcon.style.transform = c ? 'rotate(180deg)' : '';
    }
    if (btn) btn.addEventListener('click', toggle);

    // Mark active nav item
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
      if (el.getAttribute('href') === page) el.classList.add('active');
    });
  }

  /* ── Search handler ─────────────────────────────────── */
  function initSearch(inputId, onResult) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const q = el.value.toLowerCase().trim();
      const results = q ? COMPLAINTS.filter(c =>
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.reporter.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      ) : COMPLAINTS;
      if (onResult) onResult(results, q);
    });
  }

  /* ── Toast ────────────────────────────────────────────── */
  function toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `alert-banner alert-${type} fade-in-up`;
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;min-width:280px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.15)';
    t.innerHTML = `<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="${type==='success'?'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z':'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'}"/></svg> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /* ── Modal helpers ────────────────────────────────────── */
  function openModal(id) {
    document.getElementById(id)?.classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  return { COMPLAINTS, CATEGORIES, STATS, WEEKLY_TREND, DEPARTMENTS,
           statusPill, priorityChip, relativeDate, addComplaint, updateComplaintStatus,
           initSidebar, initSearch, toast, openModal, closeModal };
})();
