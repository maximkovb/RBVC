// ─── STATE ───
let currentUser = null;
let currentPage = 'home';

// ─── API HELPERS ───
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── NAVIGATION ───
function navigate(page, data) {
  currentPage = page;
  window.scrollTo(0, 0);
  render(data);
}

// ─── RENDER NAV AUTH ───
function renderNav() {
  const el = document.getElementById('nav-auth');
  if (currentUser) {
    el.innerHTML = `
      <a href="#" onclick="navigate('dashboard')">${currentUser.role === 'developer' ? 'My Pitches' : 'My Investments'}</a>
      <span style="color:var(--text-dim)">Hi, <strong>${esc(currentUser.display_name)}</strong></span>
      <button class="btn btn-sm btn-secondary" onclick="logout()">Logout</button>
    `;
  } else {
    el.innerHTML = `
      <a href="#" onclick="navigate('login')">Login</a>
      <button class="btn btn-sm btn-primary" onclick="navigate('register')">Sign Up</button>
    `;
  }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ─── MAIN RENDER ───
async function render(data) {
  renderNav();
  const app = document.getElementById('app');

  switch (currentPage) {
    case 'home': return renderHome(app);
    case 'explore': return renderExplore(app);
    case 'login': return renderLogin(app);
    case 'register': return renderRegister(app);
    case 'pitch': return renderPitchDetail(app, data);
    case 'create-pitch': return renderCreatePitch(app);
    case 'dashboard': return renderDashboard(app);
    default: return renderHome(app);
  }
}

// ─── HOME PAGE ───
async function renderHome(app) {
  let stats = { totalPitches: 0, totalFunded: 0, totalRaised: 0, totalInvestors: 0 };
  try { stats = await api('/api/stats'); } catch(e) {}

  let pitches = [];
  try { pitches = await api('/api/pitches?sort=recent'); } catch(e) {}

  app.innerHTML = `
    <section class="hero">
      <h1>Fund the Next Big<br><span>Roblox Game</span></h1>
      <p>Where Roblox developers pitch their game ideas and connect with investors who fund their advertising campaigns.</p>
      <div class="hero-buttons">
        <button class="btn btn-primary btn-lg" onclick="navigate('${currentUser?.role === 'developer' ? 'create-pitch' : 'register'}')">
          ${currentUser?.role === 'developer' ? 'Submit a Pitch' : 'Start as Developer'}
        </button>
        <button class="btn btn-secondary btn-lg" onclick="navigate('explore')">
          Browse Pitches
        </button>
      </div>
    </section>

    <div class="container">
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${stats.totalPitches}</div>
          <div class="stat-label">Active Pitches</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalFunded}</div>
          <div class="stat-label">Fully Funded</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatMoney(stats.totalRaised)}</div>
          <div class="stat-label">Total Raised</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalInvestors}</div>
          <div class="stat-label">Active Investors</div>
        </div>
      </div>

      ${pitches.length > 0 ? `
        <div class="page-header">
          <h1>Latest Pitches</h1>
          <p>Fresh game ideas looking for advertising capital</p>
        </div>
        <div class="grid-3">
          ${pitches.slice(0, 6).map(pitchCard).join('')}
        </div>
        <div style="text-align:center;margin-top:32px">
          <button class="btn btn-secondary" onclick="navigate('explore')">View All Pitches</button>
        </div>
      ` : `
        <div class="empty-state">
          <div class="icon">&#127918;</div>
          <h3>No pitches yet</h3>
          <p>Be the first developer to pitch your Roblox game idea!</p>
        </div>
      `}
    </div>
  `;
}

// ─── PITCH CARD ───
function pitchCard(p) {
  const pct = p.funding_goal > 0 ? Math.min(100, (p.funding_raised / p.funding_goal) * 100) : 0;
  return `
    <div class="card" onclick="navigate('pitch', ${p.id})" style="cursor:pointer">
      <div class="card-thumb">
        ${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="${esc(p.title)}">` : '&#127918;'}
      </div>
      <div class="card-body">
        <h3>${esc(p.title)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <div class="card-meta">
          <span class="genre-tag">${esc(p.genre)}</span>
          <span>by ${esc(p.developer_name)}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-text">
          <span class="raised">${formatMoney(p.funding_raised)} raised</span>
          <span class="goal">of ${formatMoney(p.funding_goal)}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── EXPLORE PAGE ───
async function renderExplore(app) {
  app.innerHTML = `
    <div class="container">
      <div class="page-header">
        <h1>Explore Pitches</h1>
        <p>Discover Roblox game ideas seeking advertising funding</p>
      </div>
      <div class="filter-bar">
        <input type="text" id="search-input" placeholder="Search pitches..." oninput="applyFilters()">
        <select id="genre-filter" onchange="applyFilters()">
          <option value="all">All Genres</option>
          <option value="RPG">RPG</option>
          <option value="Simulator">Simulator</option>
          <option value="Obby">Obby</option>
          <option value="Tycoon">Tycoon</option>
          <option value="FPS">FPS</option>
          <option value="Horror">Horror</option>
          <option value="Social">Social</option>
          <option value="Adventure">Adventure</option>
          <option value="Racing">Racing</option>
          <option value="Fighting">Fighting</option>
          <option value="Other">Other</option>
        </select>
        <select id="sort-filter" onchange="applyFilters()">
          <option value="recent">Most Recent</option>
          <option value="funded">Most Funded</option>
          <option value="goal">Lowest Goal</option>
        </select>
      </div>
      <div id="pitches-grid" class="grid-3"></div>
    </div>
  `;
  applyFilters();
}

async function applyFilters() {
  const search = document.getElementById('search-input')?.value || '';
  const genre = document.getElementById('genre-filter')?.value || 'all';
  const sort = document.getElementById('sort-filter')?.value || 'recent';
  const grid = document.getElementById('pitches-grid');
  if (!grid) return;

  try {
    const pitches = await api(`/api/pitches?search=${encodeURIComponent(search)}&genre=${genre}&sort=${sort}&status=all`);
    if (pitches.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">&#128269;</div>
          <h3>No pitches found</h3>
          <p>Try adjusting your filters or search terms</p>
        </div>`;
    } else {
      grid.innerHTML = pitches.map(pitchCard).join('');
    }
  } catch(e) {
    grid.innerHTML = `<p style="color:var(--danger)">Error loading pitches</p>`;
  }
}

// ─── PITCH DETAIL ───
async function renderPitchDetail(app, pitchId) {
  try {
    const p = await api(`/api/pitches/${pitchId}`);
    const pct = p.funding_goal > 0 ? Math.min(100, (p.funding_raised / p.funding_goal) * 100) : 0;
    const isVC = currentUser?.role === 'vc';
    const isOwner = currentUser?.id === p.developer_id;

    app.innerHTML = `
      <div class="container pitch-detail">
        <div class="pitch-hero">
          ${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="${esc(p.title)}">` : '&#127918;'}
        </div>

        <div class="grid-2">
          <div class="pitch-info">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              <span class="status-badge ${p.status}">${p.status}</span>
              <span class="genre-tag">${esc(p.genre)}</span>
            </div>
            <h1>${esc(p.title)}</h1>
            <p class="tagline">${esc(p.tagline)}</p>

            <div class="pitch-meta-grid">
              <div class="meta-item">
                <div class="meta-label">Developer</div>
                <div class="meta-value">${esc(p.developer_name)}</div>
              </div>
              ${p.developer_roblox ? `
              <div class="meta-item">
                <div class="meta-label">Roblox User</div>
                <div class="meta-value">${esc(p.developer_roblox)}</div>
              </div>` : ''}
              ${p.target_audience ? `
              <div class="meta-item">
                <div class="meta-label">Target Audience</div>
                <div class="meta-value">${esc(p.target_audience)}</div>
              </div>` : ''}
              <div class="meta-item">
                <div class="meta-label">Posted</div>
                <div class="meta-value">${timeAgo(p.created_at)}</div>
              </div>
            </div>

            <h3 style="margin-bottom:12px">About This Game</h3>
            <div class="description">${esc(p.description)}</div>

            ${p.roblox_link ? `<p><a href="${esc(p.roblox_link)}" target="_blank" rel="noopener">View on Roblox &#8599;</a></p>` : ''}

            <!-- Comments Section -->
            <div style="margin-top:40px">
              <h3>Discussion (${p.comments.length})</h3>
              ${currentUser ? `
              <div style="margin:16px 0">
                <textarea id="comment-input" placeholder="Share your thoughts..." style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;min-height:80px;resize:vertical"></textarea>
                <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="postComment(${p.id})">Post Comment</button>
              </div>` : `<p style="color:var(--text-dim);margin:16px 0"><a href="#" onclick="navigate('login')">Log in</a> to join the discussion</p>`}
              <div id="comments-list">
                ${p.comments.length === 0 ? '<p style="color:var(--text-dim);padding:16px 0">No comments yet. Be the first!</p>' :
                  p.comments.map(c => `
                    <div class="comment">
                      <div class="comment-header">
                        <span class="comment-author">${esc(c.author_name)}</span>
                        <span class="comment-role ${c.author_role}">${c.author_role}</span>
                        <span class="comment-time">${timeAgo(c.created_at)}</span>
                      </div>
                      <div class="comment-body">${esc(c.content)}</div>
                    </div>
                  `).join('')}
              </div>
            </div>
          </div>

          <!-- SIDEBAR -->
          <div>
            <div class="sidebar-card">
              <h3>Funding Progress</h3>
              <div style="margin:16px 0">
                <div class="progress-bar" style="height:12px"><div class="progress-fill" style="width:${pct}%"></div></div>
                <div class="progress-text" style="font-size:1rem;margin-top:8px">
                  <span class="raised">${formatMoney(p.funding_raised)}</span>
                  <span class="goal">of ${formatMoney(p.funding_goal)}</span>
                </div>
                <p style="color:var(--text-dim);font-size:0.85rem;margin-top:8px">${Math.round(pct)}% funded</p>
              </div>

              ${isVC && p.status === 'active' ? `
              <div style="margin-top:20px">
                <h4 style="margin-bottom:8px">Invest in This Game</h4>
                <div class="fund-input-row">
                  <input type="number" id="invest-amount" placeholder="Amount ($)" min="1" style="padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
                </div>
                <textarea id="invest-message" placeholder="Message to developer (optional)" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;min-height:60px;resize:vertical;margin-bottom:8px"></textarea>
                <button class="btn btn-accent" style="width:100%;justify-content:center" onclick="invest(${p.id})">Fund This Game</button>
              </div>` : ''}

              ${!currentUser && p.status === 'active' ? `
              <p style="color:var(--text-dim);margin-top:16px;text-align:center">
                <a href="#" onclick="navigate('register')">Sign up as an investor</a> to fund this game
              </p>` : ''}

              ${p.status === 'funded' ? '<p style="color:var(--accent);font-weight:700;text-align:center;margin-top:16px">This game is fully funded!</p>' : ''}
            </div>

            ${p.investments.length > 0 ? `
            <div class="sidebar-card">
              <h3>Recent Investors (${p.investments.length})</h3>
              ${p.investments.slice(0, 10).map(i => `
                <div class="investment-item">
                  <div>
                    <div style="font-weight:600">${esc(i.vc_name)}</div>
                    <div style="font-size:0.8rem;color:var(--text-dim)">${timeAgo(i.created_at)}</div>
                  </div>
                  <div class="investment-amount">${formatMoney(i.amount)}</div>
                </div>
              `).join('')}
            </div>` : ''}

            ${isOwner ? `
            <div class="sidebar-card">
              <h3>Manage Pitch</h3>
              <select id="pitch-status" style="width:100%;padding:10px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);margin-bottom:12px">
                <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="closed" ${p.status === 'closed' ? 'selected' : ''}>Closed</option>
              </select>
              <button class="btn btn-secondary" style="width:100%;justify-content:center" onclick="updatePitchStatus(${p.id})">Update Status</button>
            </div>` : ''}
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    app.innerHTML = `<div class="container"><div class="empty-state"><h3>Pitch not found</h3><p>${esc(e.message)}</p></div></div>`;
  }
}

async function invest(pitchId) {
  const amount = document.getElementById('invest-amount')?.value;
  const message = document.getElementById('invest-message')?.value || '';
  if (!amount || parseFloat(amount) <= 0) return toast('Enter a valid amount', 'error');

  try {
    await api(`/api/pitches/${pitchId}/invest`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), message })
    });
    toast('Investment successful!');
    navigate('pitch', pitchId);
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function postComment(pitchId) {
  const input = document.getElementById('comment-input');
  if (!input?.value.trim()) return toast('Write a comment first', 'error');

  try {
    await api(`/api/pitches/${pitchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: input.value.trim() })
    });
    toast('Comment posted!');
    navigate('pitch', pitchId);
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function updatePitchStatus(pitchId) {
  const status = document.getElementById('pitch-status')?.value;
  try {
    await api(`/api/pitches/${pitchId}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    toast('Status updated!');
    navigate('pitch', pitchId);
  } catch(e) {
    toast(e.message, 'error');
  }
}

// ─── CREATE PITCH ───
function renderCreatePitch(app) {
  if (!currentUser || currentUser.role !== 'developer') {
    return navigate('login');
  }

  app.innerHTML = `
    <div class="container" style="max-width:700px">
      <div class="page-header">
        <h1>Submit Your Pitch</h1>
        <p>Tell investors about your Roblox game and how advertising funding will help it grow</p>
      </div>

      <form id="pitch-form" class="card" style="padding:32px">
        <div class="form-group">
          <label>Game Title *</label>
          <input type="text" name="title" required placeholder="e.g. Super Obby Adventure">
        </div>
        <div class="form-group">
          <label>Tagline *</label>
          <input type="text" name="tagline" required placeholder="One-line description of your game" maxlength="120">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Genre *</label>
            <select name="genre" required>
              <option value="">Select genre...</option>
              <option value="RPG">RPG</option>
              <option value="Simulator">Simulator</option>
              <option value="Obby">Obby</option>
              <option value="Tycoon">Tycoon</option>
              <option value="FPS">FPS</option>
              <option value="Horror">Horror</option>
              <option value="Social">Social</option>
              <option value="Adventure">Adventure</option>
              <option value="Racing">Racing</option>
              <option value="Fighting">Fighting</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Funding Goal (USD) *</label>
            <input type="number" name="funding_goal" required min="1" placeholder="e.g. 5000">
          </div>
        </div>
        <div class="form-group">
          <label>Target Audience</label>
          <input type="text" name="target_audience" placeholder="e.g. Ages 8-14, casual gamers">
        </div>
        <div class="form-group">
          <label>Game Description *</label>
          <textarea name="description" required placeholder="Describe your game, its unique features, current state of development, and how you plan to use the advertising funds..."></textarea>
        </div>
        <div class="form-group">
          <label>Roblox Game Link</label>
          <input type="url" name="roblox_link" placeholder="https://www.roblox.com/games/...">
        </div>
        <div class="form-group">
          <label>Thumbnail Image</label>
          <input type="file" name="thumbnail" accept="image/*" style="padding:8px">
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width:100%;justify-content:center;margin-top:12px">Submit Pitch</button>
      </form>
    </div>
  `;

  document.getElementById('pitch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await apiForm('/api/pitches', fd);
      toast('Pitch submitted!');
      navigate('pitch', res.id);
    } catch(err) {
      toast(err.message, 'error');
    }
  });
}

// ─── DASHBOARD ───
async function renderDashboard(app) {
  if (!currentUser) return navigate('login');

  if (currentUser.role === 'developer') {
    try {
      const data = await api('/api/dashboard/developer');
      app.innerHTML = `
        <div class="container">
          <div class="dashboard-header">
            <div>
              <h1>My Pitches</h1>
              <p style="color:var(--text-dim)">Total raised: <strong style="color:var(--primary)">${formatMoney(data.totalRaised)}</strong></p>
            </div>
            <button class="btn btn-primary" onclick="navigate('create-pitch')">+ New Pitch</button>
          </div>
          ${data.pitches.length === 0 ? `
            <div class="empty-state">
              <div class="icon">&#128640;</div>
              <h3>No pitches yet</h3>
              <p>Submit your first game pitch to get started</p>
              <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('create-pitch')">Create Pitch</button>
            </div>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Game</th><th>Status</th><th>Raised</th><th>Goal</th><th>Investors</th><th>Created</th></tr>
                </thead>
                <tbody>
                  ${data.pitches.map(p => `
                    <tr style="cursor:pointer" onclick="navigate('pitch', ${p.id})">
                      <td><strong>${esc(p.title)}</strong></td>
                      <td><span class="status-badge ${p.status}">${p.status}</span></td>
                      <td style="color:var(--primary);font-weight:700">${formatMoney(p.funding_raised)}</td>
                      <td>${formatMoney(p.funding_goal)}</td>
                      <td>${p.investor_count}</td>
                      <td style="color:var(--text-dim)">${timeAgo(p.created_at)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch(e) {
      app.innerHTML = `<div class="container"><p style="color:var(--danger)">${esc(e.message)}</p></div>`;
    }
  } else {
    try {
      const data = await api('/api/dashboard/vc');
      app.innerHTML = `
        <div class="container">
          <div class="dashboard-header">
            <div>
              <h1>My Investments</h1>
              <p style="color:var(--text-dim)">Total invested: <strong style="color:var(--primary)">${formatMoney(data.totalInvested)}</strong></p>
            </div>
            <button class="btn btn-primary" onclick="navigate('explore')">Find Pitches</button>
          </div>
          ${data.investments.length === 0 ? `
            <div class="empty-state">
              <div class="icon">&#128176;</div>
              <h3>No investments yet</h3>
              <p>Browse pitches and fund the next big Roblox game</p>
              <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('explore')">Explore Pitches</button>
            </div>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Game</th><th>Developer</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  ${data.investments.map(i => `
                    <tr style="cursor:pointer" onclick="navigate('pitch', ${i.pitch_id})">
                      <td><strong>${esc(i.pitch_title)}</strong></td>
                      <td>${esc(i.developer_name)}</td>
                      <td style="color:var(--primary);font-weight:700">${formatMoney(i.amount)}</td>
                      <td><span class="status-badge ${i.pitch_status}">${i.pitch_status}</span></td>
                      <td style="color:var(--text-dim)">${timeAgo(i.created_at)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch(e) {
      app.innerHTML = `<div class="container"><p style="color:var(--danger)">${esc(e.message)}</p></div>`;
    }
  }
}

// ─── AUTH PAGES ───
function renderLogin(app) {
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h2>Welcome Back</h2>
        <p class="subtitle">Log in to your RBVC account</p>
        <form id="login-form">
          <div class="form-group">
            <label>Username</label>
            <input type="text" name="username" required autofocus>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required>
          </div>
          <div id="login-error" class="form-error" style="margin-bottom:12px"></div>
          <button type="submit" class="btn btn-primary btn-lg">Log In</button>
        </form>
        <p class="auth-switch">Don't have an account? <a href="#" onclick="navigate('register')">Sign up</a></p>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      currentUser = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') })
      });
      toast('Welcome back!');
      navigate('home');
    } catch(err) {
      document.getElementById('login-error').textContent = err.message;
    }
  });
}

function renderRegister(app) {
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card" style="max-width:540px">
        <h2>Join RBVC</h2>
        <p class="subtitle">Create your account to get started</p>
        <form id="register-form">
          <div class="form-group">
            <label>I am a...</label>
            <div class="role-selector">
              <div class="role-option" onclick="selectRole(this, 'developer')">
                <h3>&#127918; Developer</h3>
                <p>I want to pitch my Roblox game</p>
              </div>
              <div class="role-option" onclick="selectRole(this, 'vc')">
                <h3>&#128176; Investor</h3>
                <p>I want to fund game advertising</p>
              </div>
            </div>
            <input type="hidden" name="role" id="role-input" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username *</label>
              <input type="text" name="username" required>
            </div>
            <div class="form-group">
              <label>Display Name</label>
              <input type="text" name="display_name">
            </div>
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Roblox Username</label>
            <input type="text" name="roblox_username" placeholder="Your Roblox username">
          </div>
          <div class="form-group">
            <label>Password *</label>
            <input type="password" name="password" required minlength="6">
          </div>
          <div id="register-error" class="form-error" style="margin-bottom:12px"></div>
          <button type="submit" class="btn btn-primary btn-lg">Create Account</button>
        </form>
        <p class="auth-switch">Already have an account? <a href="#" onclick="navigate('login')">Log in</a></p>
      </div>
    </div>
  `;

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('role')) {
      document.getElementById('register-error').textContent = 'Please select a role';
      return;
    }
    try {
      currentUser = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          username: fd.get('username'),
          email: fd.get('email'),
          password: fd.get('password'),
          role: fd.get('role'),
          display_name: fd.get('display_name') || fd.get('username'),
          roblox_username: fd.get('roblox_username')
        })
      });
      toast('Account created!');
      navigate('home');
    } catch(err) {
      document.getElementById('register-error').textContent = err.message;
    }
  });
}

function selectRole(el, role) {
  document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('role-input').value = role;
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  currentUser = null;
  toast('Logged out');
  navigate('home');
}

// ─── INIT ───
(async () => {
  try {
    currentUser = await api('/api/me');
  } catch(e) {}
  render();
})();
