/*
  =========================================
  NURSE PATIENT REVIEWS - APPLICATION LOGIC
  =========================================
  Manages reviews data state, filters, sorting,
  DOM rendering, statistics generation, forms,
  light/dark modes, and Admin responses.
*/

// --- Firebase Config & Initialization ---
// Provided by the user. If the apiKey is empty or contains placeholders, the app falls back to LocalStorage.
const firebaseConfig = {
  apiKey: "AIzaSyDONIemsLEIiQuGvy_3a3j47J162U4WOCs",
  authDomain: "nurse-cj.firebaseapp.com",
  projectId: "nurse-cj",
  storageBucket: "nurse-cj.firebasestorage.app",
  messagingSenderId: "38563892762",
  appId: "1:38563892762:web:5c43f60737202ba5488ba3",
  measurementId: "G-XQ9R0YRY82"
};

let db = null;
let isFirebaseEnabled = false;

function initFirebase() {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_")) {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      isFirebaseEnabled = true;
      console.log("[Firebase] Successfully initialized real-time cloud database.");
    } catch (error) {
      console.error("[Firebase] Initialization failed. Falling back to local storage.", error);
    }
  } else {
    console.log("[Firebase] API Key is missing or default placeholder. Running in Offline LocalStorage Mode.");
  }
}

// --- Core App State ---
const APP_STATE = {
  reviews: [],
  filters: {
    search: '',
    careUnit: 'all',
    rating: null, // null means all ratings
    sort: 'recent' // 'recent', 'highest', 'lowest'
  },
  currentSubmitRating: 0,
  selectedSubmitTags: new Set(),
  isAdminMode: false,
  theme: 'light'
};

// --- Mock / Initial Seed Data ---
const DEFAULT_REVIEWS = [
  {
    id: 'rev_1',
    name: 'Eleanor Vance',
    rating: 5,
    careUnit: 'Emergency Department',
    text: 'Nurse CJ was absolutely incredible with my 4-year-old son in the emergency room. He has this gentle, calming energy that instantly put him at ease. He took the time to explain every single procedure in a way he could understand and even drew silly faces on his bandages. Truly went above and beyond!',
    recommend: true,
    tags: ['Compassionate', 'Reassuring', 'Excellent Listener'],
    date: '2026-05-12',
    reply: {
      text: 'Thank you so much Eleanor! It was a pleasure looking after little Leo. He was such a brave boy, and the drawings on his bandages made my day too! Hope he is doing wonderfully at home.',
      date: '2026-05-13'
    },
    flagged: false
  },
  {
    id: 'rev_2',
    name: 'Anonymous Patient',
    rating: 5,
    careUnit: 'Emergency Department',
    text: 'During one of the most frightening nights of my life in the ER, this nurse was a steady anchor of strength and professionalism. Not only did he monitor my vitals with meticulous care, but he also comforted my anxious husband and made sure he had a place to rest. Words cannot express our gratitude.',
    recommend: true,
    tags: ['Thorough', 'Professional', 'Attentive'],
    date: '2026-05-24',
    reply: null,
    flagged: false
  },
  {
    id: 'rev_3',
    name: 'Marcus Brody',
    rating: 4,
    careUnit: 'Emergency Department',
    text: 'Super efficient and highly skilled. The emergency room was packed and chaotic, but he managed to keep everyone calm, organized, and cared for. He was extremely direct and clear about wait times and next steps, which I really appreciated. An absolute credit to the nursing profession.',
    recommend: true,
    tags: ['Professional', 'Punctual'],
    date: '2026-05-28',
    reply: null,
    flagged: false
  },
  {
    id: 'rev_4',
    name: 'Arthur Pendelton',
    rating: 5,
    careUnit: 'Home Health Care',
    text: 'Outstanding home care experience. He did not just administer medications; he actually listened to my concerns about my daily routine and worked alongside my family to adjust my care plan. He is an exceptional listener and a brilliant advocate for his patients.',
    recommend: true,
    tags: ['Compassionate', 'Excellent Listener', 'Thorough'],
    date: '2026-05-29',
    reply: null,
    flagged: false
  }
];

// --- Constants ---
const ADMIN_DEFAULT_PIN = '8466';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initTheme();
  loadData();
  setupEventListeners();
  renderApp();
});

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('nurse_reviews_theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  APP_STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nurse_reviews_theme', theme);
  
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.innerHTML = theme === 'dark' 
      ? '<i class="fas fa-sun"></i>' 
      : '<i class="fas fa-moon"></i>';
    themeBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
}

function toggleTheme() {
  setTheme(APP_STATE.theme === 'dark' ? 'light' : 'dark');
}

// --- Data Loading & Storage ---
function loadData() {
  if (isFirebaseEnabled) {
    console.log("[Firebase] Loading data from Firestore...");
    // Listen to real-time changes in Firestore
    db.collection('reviews')
      .onSnapshot((snapshot) => {
        if (snapshot.empty) {
          console.log("[Firebase] Firestore is empty. Seeding default patient reviews...");
          // Seed Firestore with default reviews
          const batch = db.batch();
          DEFAULT_REVIEWS.forEach(rev => {
            const docRef = db.collection('reviews').doc(rev.id);
            batch.set(docRef, rev);
          });
          batch.commit()
            .then(() => console.log("[Firebase] Seeding completed."))
            .catch(err => console.error("[Firebase] Error seeding default data:", err));
          return;
        }

        const loadedReviews = [];
        snapshot.forEach(doc => {
          loadedReviews.push(doc.data());
        });

        // Store loaded reviews in state
        APP_STATE.reviews = loadedReviews;
        renderApp();
      }, (error) => {
        console.error("[Firebase] Firestore listen failed, falling back to LocalStorage:", error);
        loadLocalFallback();
      });
  } else {
    loadLocalFallback();
  }
}

function loadLocalFallback() {
  const stored = localStorage.getItem('nurse_reviews_data');
  if (stored) {
    try {
      const loaded = JSON.parse(stored);
      const validUnits = ['Emergency Department', 'Home Health Care'];
      const hasLegacyUnits = loaded.some(r => !validUnits.includes(r.careUnit));
      
      if (hasLegacyUnits) {
        console.log('Outdated care units detected in local storage. Overwriting with fresh data.');
        APP_STATE.reviews = [...DEFAULT_REVIEWS];
        saveData();
      } else {
        APP_STATE.reviews = loaded;
      }
    } catch (e) {
      console.error('Failed to parse stored reviews, seeding default data.', e);
      APP_STATE.reviews = [...DEFAULT_REVIEWS];
      saveData();
    }
  } else {
    APP_STATE.reviews = [...DEFAULT_REVIEWS];
    saveData();
  }
}

function saveData() {
  localStorage.setItem('nurse_reviews_data', JSON.stringify(APP_STATE.reviews));
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Search Input
  const searchInput = document.getElementById('search-reviews');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      APP_STATE.filters.search = e.target.value.toLowerCase().trim();
      renderReviewsList();
    });
  }

  // Care Unit Filter
  const deptFilter = document.getElementById('filter-department');
  if (deptFilter) {
    deptFilter.addEventListener('change', (e) => {
      APP_STATE.filters.careUnit = e.target.value;
      renderReviewsList();
      updateFilterBadges();
    });
  }

  // Sort Order Filter
  const sortSelect = document.getElementById('sort-reviews');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      APP_STATE.filters.sort = e.target.value;
      renderReviewsList();
    });
  }

  // Write Review Trigger
  const writeReviewBtns = document.querySelectorAll('.trigger-write-review');
  writeReviewBtns.forEach(btn => {
    btn.addEventListener('click', openReviewModal);
  });

  // Modal Close
  const closeModalBtn = document.getElementById('close-review-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeReviewModal);
  }

  // Interactive Stars Selection in Form
  const starInputBtns = document.querySelectorAll('.interactive-stars .star-input-btn');
  starInputBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = parseInt(btn.getAttribute('data-value'));
      setSubmitFormRating(val);
    });
  });

  // Form Tags Selection
  const tagBtns = document.querySelectorAll('.tags-selector-grid .tag-select-btn');
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tagValue = btn.textContent.trim();
      if (APP_STATE.selectedSubmitTags.has(tagValue)) {
        APP_STATE.selectedSubmitTags.delete(tagValue);
        btn.classList.remove('active');
      } else {
        APP_STATE.selectedSubmitTags.add(tagValue);
        btn.classList.add('active');
      }
    });
  });

  // Anonymous Checkbox toggling Name input state
  const anonCheckbox = document.getElementById('review-anon');
  const nameInput = document.getElementById('review-name');
  if (anonCheckbox && nameInput) {
    anonCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        nameInput.value = 'Anonymous Patient';
        nameInput.disabled = true;
      } else {
        nameInput.value = '';
        nameInput.disabled = false;
      }
    });
  }

  // Submit Review Form
  const reviewForm = document.getElementById('patient-review-form');
  if (reviewForm) {
    reviewForm.addEventListener('submit', handleReviewSubmit);
  }

  // Admin Mode Footer Link
  const adminToggleLink = document.getElementById('admin-mode-toggle');
  if (adminToggleLink) {
    adminToggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (APP_STATE.isAdminMode) {
        setAdminMode(false);
      } else {
        openAdminPinDialog();
      }
    });
  }

  // Admin PIN Cancel
  const cancelPinBtn = document.getElementById('btn-cancel-pin');
  if (cancelPinBtn) {
    cancelPinBtn.addEventListener('click', closeAdminPinDialog);
  }

  // Admin PIN Form Submit
  const pinForm = document.getElementById('admin-pin-form');
  if (pinForm) {
    pinForm.addEventListener('submit', handlePinSubmit);
  }

  // Admin PIN inputs auto-focus jump
  const pinInputs = document.querySelectorAll('.pin-inputs .pin-digit');
  pinInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      if (e.target.value.length === 1 && index < pinInputs.length - 1) {
        pinInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
        pinInputs[index - 1].focus();
      }
    });
  });
}

// --- Ratings Aggregate & Stats calculations ---
function calculateStats() {
  const reviews = APP_STATE.reviews;
  const count = reviews.length;
  
  if (count === 0) {
    return {
      average: 0,
      recommendRate: 0,
      total: 0,
      starsCount: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };
  }

  let totalStars = 0;
  let recommendCount = 0;
  const starsCount = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  reviews.forEach(r => {
    totalStars += r.rating;
    if (r.recommend) {
      recommendCount++;
    }
    const roundedRating = Math.min(5, Math.max(1, Math.round(r.rating)));
    starsCount[roundedRating] = (starsCount[roundedRating] || 0) + 1;
  });

  const average = totalStars / count;
  const recommendRate = (recommendCount / count) * 100;

  return {
    average: parseFloat(average.toFixed(1)),
    recommendRate: Math.round(recommendRate),
    total: count,
    starsCount
  };
}

// --- App Dynamic Rendering ---
function renderApp() {
  renderStatsPanel();
  renderReviewsList();
  updateFilterBadges();
}

function renderStatsPanel() {
  const stats = calculateStats();
  
  // Aggregate Big Number
  const avgText = document.getElementById('agg-average');
  if (avgText) avgText.textContent = stats.average > 0 ? stats.average : '0.0';

  // Stars Aggregate Block
  const starsBlock = document.getElementById('agg-stars');
  if (starsBlock) {
    starsBlock.innerHTML = generateStarSVGMarkup(stats.average);
  }

  // Total Reviews Label
  const countText = document.getElementById('agg-total-count');
  if (countText) {
    countText.textContent = `Based on ${stats.total} patient review${stats.total !== 1 ? 's' : ''}`;
  }

  // Overall Recommendation Rate
  const recBanner = document.getElementById('agg-recommendation');
  if (recBanner) {
    if (stats.total > 0) {
      recBanner.style.display = 'flex';
      recBanner.innerHTML = `<i class="fas fa-heart animate-pulse"></i> <span><strong>${stats.recommendRate}%</strong> of patients recommend this nurse</span>`;
    } else {
      recBanner.style.display = 'none';
    }
  }

  // Histogram Rows Fill & Counts
  for (let i = 1; i <= 5; i++) {
    const barFill = document.getElementById(`bar-fill-${i}`);
    const countEl = document.getElementById(`bar-count-${i}`);
    
    if (barFill && countEl) {
      const starCount = stats.starsCount[i] || 0;
      const pct = stats.total > 0 ? (starCount / stats.total) * 100 : 0;
      
      barFill.style.width = `${pct}%`;
      countEl.textContent = starCount;
    }
  }
}

function renderReviewsList() {
  const listEl = document.getElementById('reviews-list');
  if (!listEl) return;

  // 1. Apply Filters
  let filtered = APP_STATE.reviews.filter(rev => {
    // Search match (name, care unit, feedback text, tags)
    const matchesSearch = !APP_STATE.filters.search || 
      rev.name.toLowerCase().includes(APP_STATE.filters.search) ||
      rev.careUnit.toLowerCase().includes(APP_STATE.filters.search) ||
      rev.text.toLowerCase().includes(APP_STATE.filters.search) ||
      rev.tags.some(tag => tag.toLowerCase().includes(APP_STATE.filters.search));

    // Care Department match
    const matchesDept = APP_STATE.filters.careUnit === 'all' || 
      rev.careUnit.toLowerCase() === APP_STATE.filters.careUnit.toLowerCase();

    // Rating star match
    const matchesRating = APP_STATE.filters.rating === null || 
      rev.rating === APP_STATE.filters.rating;

    return matchesSearch && matchesDept && matchesRating;
  });

  // 2. Apply Sorts
  filtered.sort((a, b) => {
    if (APP_STATE.filters.sort === 'highest') {
      return b.rating - a.rating;
    } else if (APP_STATE.filters.sort === 'lowest') {
      return a.rating - b.rating;
    } else {
      // default: recent (by date and id fallback)
      return new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id);
    }
  });

  // 3. Render DOM Cards
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="card empty-state">
        <i class="fas fa-comment-slash"></i>
        <h3>No matching reviews found</h3>
        <p>Try adjusting your search criteria, clearing your active filters, or write a new review to populate the list!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach((rev, idx) => {
    const cardEl = document.createElement('article');
    cardEl.className = `card review-card ${rev.flagged ? 'flagged-watermark' : ''}`;
    // Micro-delay stagger on grid entry
    cardEl.style.animationDelay = `${idx * 0.08}s`;

    // Calculate dynamic patient initials for avatar
    const initials = rev.name.toLowerCase().includes('anonymous') 
      ? 'AP' 
      : rev.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    // Verification label: Let's assume reviews are verified
    const isVerified = true;

    // Build sub elements for Nurse Reply if exists
    let replyMarkup = '';
    if (rev.reply) {
      replyMarkup = `
        <div class="nurse-reply-block">
          <img src="nurse_avatar.png" alt="CJ Balling, RN" class="nurse-reply-avatar">
          <div class="nurse-reply-content">
            <div class="nurse-reply-header">
              <span class="nurse-reply-name">CJ Balling, RN (Nurse Reply)</span>
              <span class="nurse-reply-date">${formatReviewDate(rev.reply.date)}</span>
            </div>
            <p class="nurse-reply-text">"${rev.reply.text}"</p>
          </div>
        </div>
      `;
    }

    // Build Admin Card Actions Panel
    let adminPanelMarkup = '';
    if (APP_STATE.isAdminMode) {
      adminPanelMarkup = `
        <div class="admin-card-actions">
          <button class="btn btn-secondary admin-btn-action btn-flagged" onclick="toggleFlagReview('${rev.id}')">
            <i class="fas fa-flag"></i> ${rev.flagged ? 'Unflag Review' : 'Flag for Follow-up'}
          </button>
          
          ${!rev.reply ? `
            <button class="btn btn-primary admin-btn-action" onclick="toggleReplyInputForm('${rev.id}')">
              <i class="fas fa-reply"></i> Add Response
            </button>
          ` : `
            <button class="btn btn-secondary admin-btn-action" onclick="deleteReply('${rev.id}')">
              <i class="fas fa-trash-alt"></i> Delete Response
            </button>
          `}
        </div>
        
        <div id="reply-form-container-${rev.id}" class="admin-card-actions" style="display:none; border-top:none; margin-top:0.5rem;">
          <div class="admin-input-group">
            <textarea id="reply-text-${rev.id}" class="admin-textarea" placeholder="Draft your official nursing response here..."></textarea>
            <div class="admin-reply-actions">
              <button class="btn btn-secondary admin-btn-action" onclick="toggleReplyInputForm('${rev.id}')">Cancel</button>
              <button class="btn btn-primary admin-btn-action" onclick="submitNurseReply('${rev.id}')">Submit Reply</button>
            </div>
          </div>
        </div>
      `;
    }

    // Render Review tags markup
    const tagsMarkup = rev.tags.map(tag => `<span class="quality-tag">${tag}</span>`).join('');

    cardEl.innerHTML = `
      <div class="review-header">
        <div class="patient-info">
          <div class="patient-initials">${initials}</div>
          <div class="patient-name-date">
            <span class="patient-name">
              ${rev.name}
              ${isVerified ? '<span class="verified-badge" title="Verified Patient Review"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
              ${rev.flagged ? '<span class="verified-badge btn-flagged" style="color:var(--error);background-color:hsla(355, 75%, 45%, 0.08);border-color:hsla(355, 75%, 45%, 0.15);"><i class="fas fa-exclamation-triangle"></i> Flagged</span>' : ''}
            </span>
            <span class="review-date">${formatReviewDate(rev.date)}</span>
          </div>
        </div>
        <div class="review-meta">
          <span class="department-tag">${rev.careUnit}</span>
        </div>
      </div>
      
      <div class="review-rating-block">
        <div class="stars-container">
          ${generateStarSVGMarkup(rev.rating)}
        </div>
        ${rev.recommend ? `
          <span class="review-recommend">
            <i class="fas fa-thumbs-up"></i> Recommends Care
          </span>
        ` : ''}
      </div>
      
      <p class="review-feedback">${rev.text}</p>
      
      ${tagsMarkup ? `<div class="review-tags">${tagsMarkup}</div>` : ''}
      
      ${replyMarkup}
      
      ${adminPanelMarkup}
    `;

    listEl.appendChild(cardEl);
  });
}

function updateFilterBadges() {
  const container = document.getElementById('active-filters-container');
  if (!container) return;

  container.innerHTML = '';
  
  // Rating filter active badge
  if (APP_STATE.filters.rating !== null) {
    const badge = createBadge(`${APP_STATE.filters.rating} Stars`, () => {
      setRatingFilter(null);
    });
    container.appendChild(badge);
  }

  // Department filter active badge
  if (APP_STATE.filters.careUnit !== 'all') {
    const badge = createBadge(`Unit: ${APP_STATE.filters.careUnit}`, () => {
      const deptFilter = document.getElementById('filter-department');
      if (deptFilter) deptFilter.value = 'all';
      APP_STATE.filters.careUnit = 'all';
      renderReviewsList();
      updateFilterBadges();
    });
    container.appendChild(badge);
  }

  // Clear All helper link
  if (APP_STATE.filters.rating !== null || APP_STATE.filters.careUnit !== 'all') {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'admin-mode-toggle-link';
    clearBtn.style.fontSize = '0.8rem';
    clearBtn.style.marginLeft = '0.5rem';
    clearBtn.innerHTML = 'Clear all filters';
    clearBtn.onclick = () => {
      const deptFilter = document.getElementById('filter-department');
      if (deptFilter) deptFilter.value = 'all';
      APP_STATE.filters.careUnit = 'all';
      setRatingFilter(null);
    };
    container.appendChild(clearBtn);
  }
}

function createBadge(text, onRemove) {
  const badge = document.createElement('span');
  badge.className = 'filter-badge';
  badge.innerHTML = `${text} <button aria-label="Remove filter">&times;</button>`;
  badge.querySelector('button').onclick = onRemove;
  return badge;
}

// --- Ratings Filtering Action ---
function setRatingFilter(rating) {
  // Toggle off if same clicked, otherwise set new
  if (APP_STATE.filters.rating === rating) {
    APP_STATE.filters.rating = null;
  } else {
    APP_STATE.filters.rating = rating;
  }

  // Update histogram row active states in UI
  for (let i = 1; i <= 5; i++) {
    const row = document.getElementById(`histogram-row-${i}`);
    if (row) {
      if (APP_STATE.filters.rating === i) {
        row.classList.add('active');
      } else {
        row.classList.remove('active');
      }
    }
  }

  renderReviewsList();
  updateFilterBadges();
}

// --- Modal Display Operations ---
function openReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden'; // Lock back scroll
    resetReviewForm();
  }
}

function closeReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = ''; // Release scroll
    
    // Quick delay before wiping modal body states back to input view
    setTimeout(() => {
      const body = document.getElementById('modal-inner-body');
      const footer = document.getElementById('modal-footer');
      if (body && footer) {
        body.style.display = 'block';
        footer.style.display = 'flex';
        
        const successEl = document.getElementById('modal-success-screen');
        if (successEl) successEl.remove();
      }
    }, 400);
  }
}

function setSubmitFormRating(val) {
  APP_STATE.currentSubmitRating = val;
  const starsContainer = document.querySelector('.interactive-stars');
  if (starsContainer) {
    starsContainer.setAttribute('data-value', val);
    starsContainer.classList.add('selected');
  }
  
  // Hide validation error if active
  const err = document.getElementById('error-rating');
  if (err) err.classList.remove('visible');
}

function resetReviewForm() {
  const form = document.getElementById('patient-review-form');
  if (form) form.reset();

  // Reset interactive stars
  APP_STATE.currentSubmitRating = 0;
  const starsContainer = document.querySelector('.interactive-stars');
  if (starsContainer) {
    starsContainer.removeAttribute('data-value');
    starsContainer.classList.remove('selected');
  }

  // Reset tag buttons
  APP_STATE.selectedSubmitTags.clear();
  const tagBtns = document.querySelectorAll('.tags-selector-grid .tag-select-btn');
  tagBtns.forEach(btn => btn.classList.remove('active'));

  // Reset disabled name input
  const nameInput = document.getElementById('review-name');
  if (nameInput) {
    nameInput.disabled = false;
  }

  // Clear error messages
  const errors = document.querySelectorAll('.error-msg');
  errors.forEach(e => e.classList.remove('visible'));
}

// --- Submit review event handler ---
function handleReviewSubmit(e) {
  e.preventDefault();

  const nameEl = document.getElementById('review-name');
  const deptEl = document.getElementById('review-department');
  const textEl = document.getElementById('review-text');
  const recommendEl = document.getElementById('review-recommend-check');

  let isValid = true;

  // Validate Star Rating
  if (APP_STATE.currentSubmitRating === 0) {
    document.getElementById('error-rating').classList.add('visible');
    isValid = false;
  }

  // Validate Name
  if (!nameEl.value.trim()) {
    document.getElementById('error-name').classList.add('visible');
    isValid = false;
  } else {
    document.getElementById('error-name').classList.remove('visible');
  }

  // Validate Department Selection
  if (!deptEl.value) {
    document.getElementById('error-dept').classList.add('visible');
    isValid = false;
  } else {
    document.getElementById('error-dept').classList.remove('visible');
  }

  // Validate Feedback Text
  if (!textEl.value.trim()) {
    document.getElementById('error-text').classList.add('visible');
    isValid = false;
  } else {
    document.getElementById('error-text').classList.remove('visible');
  }

  if (!isValid) return;

  // Build new Review Payload
  const newReview = {
    id: 'rev_' + Date.now(),
    name: nameEl.value.trim(),
    rating: APP_STATE.currentSubmitRating,
    careUnit: deptEl.options[deptEl.selectedIndex].text,
    text: textEl.value.trim(),
    recommend: recommendEl.checked,
    tags: Array.from(APP_STATE.selectedSubmitTags),
    date: new Date().toISOString().split('T')[0], // yyyy-mm-dd format
    reply: null,
    flagged: false
  };

  // Push, Save, and update
  if (isFirebaseEnabled) {
    db.collection('reviews').doc(newReview.id).set(newReview)
      .then(() => {
        console.log("[Firebase] Successfully added review to cloud.");
      })
      .catch(err => {
        console.error("[Firebase] Error saving review to Firebase:", err);
        // Direct local fallback in case of Firestore error
        APP_STATE.reviews.unshift(newReview);
        saveData();
        renderApp();
      });
  } else {
    APP_STATE.reviews.unshift(newReview);
    saveData();
    renderApp();
  }

  // Show dynamic Confetti/Success UI inside modal
  showFormSuccessScreen();
}

function showFormSuccessScreen() {
  const modalBody = document.getElementById('modal-inner-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalContainer = modalBody.parentNode;

  // Temporarily hide main input body & submit buttons
  modalBody.style.display = 'none';
  modalFooter.style.display = 'none';

  // Inject beautiful success visual
  const successEl = document.createElement('div');
  successEl.id = 'modal-success-screen';
  successEl.className = 'success-screen';
  successEl.innerHTML = `
    <div class="success-icon">
      <i class="fas fa-heartbeat"></i>
    </div>
    <h2>Thank You For Your Review!</h2>
    <p style="max-width:380px; margin: 0 auto; color: var(--text-muted);">
      Your generous feedback helps CJ Balling, RN continue delivering premium, dedicated, and compassionate healthcare to all patients.
    </p>
    <button class="btn btn-primary" onclick="closeReviewModal()" style="margin-top: 1rem;">Back to Dashboard</button>
  `;

  modalContainer.insertBefore(successEl, modalFooter);

  // Auto-close success modal after 3 seconds
  setTimeout(closeReviewModal, 3000);
}

// --- Admin Controls operations ---
function openAdminPinDialog() {
  const dialog = document.getElementById('admin-pin-dialog');
  if (dialog) {
    dialog.classList.add('open');
    // Clear and focus first input
    const pinInputs = document.querySelectorAll('.pin-inputs .pin-digit');
    pinInputs.forEach(i => i.value = '');
    pinInputs[0].focus();
  }
}

function closeAdminPinDialog() {
  const dialog = document.getElementById('admin-pin-dialog');
  if (dialog) {
    dialog.classList.remove('open');
  }
}

function handlePinSubmit(e) {
  e.preventDefault();
  
  const pinInputs = document.querySelectorAll('.pin-inputs .pin-digit');
  let enteredPin = '';
  pinInputs.forEach(i => enteredPin += i.value);

  if (enteredPin === ADMIN_DEFAULT_PIN) {
    closeAdminPinDialog();
    setAdminMode(true);
  } else {
    // Show flash error state
    pinInputs.forEach(i => {
      i.style.borderColor = 'var(--error)';
      i.classList.add('animate-shake');
    });
    setTimeout(() => {
      pinInputs.forEach(i => {
        i.style.borderColor = '';
        i.classList.remove('animate-shake');
        i.value = '';
      });
      pinInputs[0].focus();
    }, 800);
  }
}

function setAdminMode(active) {
  APP_STATE.isAdminMode = active;
  
  const toggleLink = document.getElementById('admin-mode-toggle');
  if (toggleLink) {
    if (active) {
      toggleLink.classList.add('active');
      toggleLink.innerHTML = '<i class="fas fa-user-shield"></i> Nurse Admin Active (Toggle Off)';
    } else {
      toggleLink.classList.remove('active');
      toggleLink.innerHTML = '<i class="fas fa-lock"></i> Staff Login';
    }
  }

  // Refresh reviews list to show/hide admin panels
  renderReviewsList();
}

// Exposed global actions for admin interactions
window.toggleFlagReview = function(id) {
  const idx = APP_STATE.reviews.findIndex(r => r.id === id);
  if (idx > -1) {
    const newFlaggedState = !APP_STATE.reviews[idx].flagged;
    if (isFirebaseEnabled) {
      db.collection('reviews').doc(id).update({ flagged: newFlaggedState })
        .then(() => console.log("[Firebase] Toggled flag state to " + newFlaggedState))
        .catch(err => console.error("[Firebase] Error toggling flag:", err));
    } else {
      APP_STATE.reviews[idx].flagged = newFlaggedState;
      saveData();
      renderReviewsList();
    }
  }
};

window.toggleReplyInputForm = function(id) {
  const formBlock = document.getElementById(`reply-form-container-${id}`);
  if (formBlock) {
    const isHidden = formBlock.style.display === 'none';
    formBlock.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      document.getElementById(`reply-text-${id}`).focus();
    }
  }
};

window.submitNurseReply = function(id) {
  const replyInput = document.getElementById(`reply-text-${id}`);
  if (!replyInput || !replyInput.value.trim()) return;

  const idx = APP_STATE.reviews.findIndex(r => r.id === id);
  if (idx > -1) {
    const replyData = {
      text: replyInput.value.trim(),
      date: new Date().toISOString().split('T')[0]
    };
    if (isFirebaseEnabled) {
      db.collection('reviews').doc(id).update({ reply: replyData })
        .then(() => console.log("[Firebase] Submitted nurse reply."))
        .catch(err => console.error("[Firebase] Error saving reply:", err));
    } else {
      APP_STATE.reviews[idx].reply = replyData;
      saveData();
      renderReviewsList();
    }
  }
};

window.deleteReply = function(id) {
  if (confirm('Are you sure you want to delete this reply response?')) {
    const idx = APP_STATE.reviews.findIndex(r => r.id === id);
    if (idx > -1) {
      if (isFirebaseEnabled) {
        db.collection('reviews').doc(id).update({ reply: null })
          .then(() => console.log("[Firebase] Deleted nurse reply."))
          .catch(err => console.error("[Firebase] Error deleting reply:", err));
      } else {
        APP_STATE.reviews[idx].reply = null;
        saveData();
        renderReviewsList();
      }
    }
  }
};

window.setRatingFilter = setRatingFilter;
window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;

// --- Helper Functions ---
function formatReviewDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00'); // enforce local time conversion
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function generateStarSVGMarkup(rating) {
  let stars = '';
  // Loop 1 to 5
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars += '<i class="fas fa-star"></i>'; // Full star
    } else if (rating >= i - 0.5) {
      stars += '<i class="fas fa-star-half-alt"></i>'; // Half star
    } else {
      stars += '<i class="far fa-star empty"></i>'; // Empty star
    }
  }
  return stars;
}
