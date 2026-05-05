// ===== HygieSense Upgraded Logic =====
(function () {
    'use strict';

    const state = {
        restrooms: [
            { id: 'A', name: 'Restroom A', clean: 0, dirty: 0, status: 'clean', lastUpdated: null },
            { id: 'B', name: 'Restroom B', clean: 0, dirty: 0, status: 'clean', lastUpdated: null },
            { id: 'C', name: 'Restroom C', clean: 0, dirty: 0, status: 'clean', lastUpdated: null },
        ],
        staff: [
            { id: 1, name: 'John D.', status: 'available' },
            { id: 2, name: 'Sarah M.', status: 'available' },
            { id: 3, name: 'Mike R.', status: 'available' },
            { id: 4, name: 'Elena G.', status: 'available' },
        ],
        threshold: 3,
        history: [],
        dispatches: [],
        notifications: [],
        refreshInterval: 5,
        countdownTimer: null,
        demoMode: false,
        demoTimer: null,
        darkMode: localStorage.getItem('theme') === 'dark',
        kpi: { total: 0, clean: 0, dirty: 0, dispatches: 0 }
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function init() {
        if (state.darkMode) document.body.setAttribute('data-theme', 'dark');
        
        populateDropdowns();
        renderRestroomCards();
        renderStaff();
        initPeakHours();
        bindEvents();
        updateChart();
        startAutoRefresh();
        updateKPIs();
    }

    function bindEvents() {
        // Navigation
        $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
        
        // Dark Mode
        $('#darkToggle').addEventListener('click', () => {
            state.darkMode = !state.darkMode;
            document.body.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
            localStorage.setItem('theme', state.darkMode ? 'dark' : 'light');
            $('#toggleIcon').textContent = state.darkMode ? '☀️' : '🌙';
        });

        // Notifications
        $('#notifBell').addEventListener('click', (e) => {
            e.stopPropagation();
            $('#notifDropdown').style.display = $('#notifDropdown').style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', () => $('#notifDropdown').style.display = 'none');
        $('#notifDropdown').addEventListener('click', e => e.stopPropagation());
        $('#notifClearAll').addEventListener('click', () => { state.notifications = []; updateNotifications(); });

        // Simulation Control
        $('#btnReportClean').addEventListener('click', () => reportFeedback($('#simLocation').value, 'clean'));
        $('#btnReportIssue').addEventListener('click', () => reportFeedback($('#simLocation').value, 'dirty'));
        $('#thresholdUp').addEventListener('click', () => { state.threshold = Math.min(state.threshold + 1, 10); $('#thresholdValue').textContent = state.threshold; });
        $('#thresholdDown').addEventListener('click', () => { state.threshold = Math.max(state.threshold - 1, 1); $('#thresholdValue').textContent = state.threshold; });

        // Auto Demo
        $('#btnToggleDemo').addEventListener('click', toggleDemoMode);

        // Kiosk
        $('#kioskClean').addEventListener('click', () => handleKioskFeedback('clean'));
        $('#kioskDirty').addEventListener('click', () => handleKioskFeedback('dirty'));

        // Modals / Alerts
        $('#alertClose').addEventListener('click', () => $('#alertBanner').style.display = 'none');
        $('#modalDismiss').addEventListener('click', () => { $('#dispatchModal').style.display = 'none'; });
        $('#modalResolve').addEventListener('click', () => {
            if (state._modalRestroomId) resolveRestroom(state._modalRestroomId);
            $('#dispatchModal').style.display = 'none';
        });

        // History filters & export
        $('#historyFilterLocation').addEventListener('change', renderHistory);
        $('#historyFilterType').addEventListener('change', renderHistory);
        $('#btnClearHistory').addEventListener('click', clearHistory);
        $('#btnExportCSV').addEventListener('click', exportCSV);

        // Window resize
        window.addEventListener('resize', updateChart);
    }

    function switchView(view) {
        $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        $$('.view').forEach(v => v.classList.remove('active'));
        
        let viewId = view === 'live' ? 'viewLive' : view === 'kiosk' ? 'viewKiosk' : 'viewHistory';
        $(`#${viewId}`).classList.add('active');
        
        if (view === 'live') updateChart();
        if (view === 'history') renderHistory();
    }

    function populateDropdowns() {
        const locs = state.restrooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        $('#simLocation').innerHTML = locs;
        $('#kioskLocation').innerHTML = locs;
        $('#historyFilterLocation').innerHTML = '<option value="all">All</option>' + locs;
    }

    function updateKPIs() {
        const score = state.kpi.total === 0 ? 100 : Math.round((state.kpi.clean / state.kpi.total) * 100);
        $('#kpiTotalReports').textContent = state.kpi.total;
        $('#kpiCleanScore').textContent = `${score}%`;
        
        // Avg Response mock logic
        if(state.kpi.dispatches > 0) {
            let mockTime = Math.max(2, Math.round(15 - (score / 10)));
            $('#kpiAvgResponse').textContent = `${mockTime} min`;
        }
        
        const activeStaff = state.staff.filter(s => s.status === 'available').length;
        $('#kpiActiveStaff').textContent = `${activeStaff} / ${state.staff.length}`;
    }

    function reportFeedback(id, type) {
        const restroom = state.restrooms.find(r => r.id === id);
        if (!restroom) return;
        
        const now = new Date();
        restroom.lastUpdated = now;
        state.kpi.total++;

        if (type === 'clean') {
            restroom.clean++;
            state.kpi.clean++;
            restroom.status = 'clean';
            restroom.dirty = 0;
            logActivity(restroom.name, 'Clean report received', 'clean');
            showToast(`${restroom.name} is clean ✓`, 'success');
        } else {
            restroom.dirty++;
            state.kpi.dirty++;
            logActivity(restroom.name, `Issue reported (${restroom.dirty}/${state.threshold})`, 'dirty');
            
            if (restroom.dirty >= state.threshold) {
                restroom.status = 'dirty';
                triggerDispatch(restroom);
            } else if (restroom.dirty > 0) {
                restroom.status = 'dirty';
            }
        }
        
        addHistory(now, restroom.name, type, `User reported via ${state.currentKiosk ? 'Kiosk' : 'Simulation'}`);
        renderRestroomCards();
        updateChart();
        updateKPIs();
        checkAlerts();
    }

    function handleKioskFeedback(type) {
        state.currentKiosk = true;
        reportFeedback($('#kioskLocation').value, type);
        state.currentKiosk = false;

        const btns = $('.kiosk-buttons');
        const ty = $('#kioskThankYou');
        btns.style.display = 'none';
        ty.style.display = 'block';
        
        setTimeout(() => {
            ty.style.display = 'none';
            btns.style.display = 'flex';
        }, 3000);
    }

    function renderRestroomCards() {
        $('#restroomCards').innerHTML = state.restrooms.map(r => {
            const isClean = r.status === 'clean';
            return `
                <div class="card restroom-card ${!isClean ? 'needs-attention' : ''}">
                    <div class="card-header">
                        <h3>${r.name}</h3>
                        <span class="status-badge ${isClean ? 'clean' : 'dirty'}">${isClean ? '✓ Clean' : '⚠ Action Needed'}</span>
                    </div>
                    <div class="card-updated">Updated ${r.lastUpdated ? r.lastUpdated.toLocaleTimeString() : 'Never'}</div>
                    <div class="card-stats">
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);font-weight:bold;">CLEAN</div>
                            <div class="stat-value green">${r.clean}</div>
                        </div>
                        <div>
                            <div style="font-size:11px;color:var(--text-muted);font-weight:bold;">ISSUES</div>
                            <div class="stat-value red">${r.dirty}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    function triggerDispatch(restroom) {
        if (state.dispatches.some(d => d.restroomId === restroom.id && !d.resolved)) return;
        
        const availableStaff = state.staff.find(s => s.status === 'available');
        const staffName = availableStaff ? availableStaff.name : 'Unassigned (Waiting)';
        if(availableStaff) availableStaff.status = 'busy';

        state.kpi.dispatches++;
        state.dispatches.push({ id: Date.now(), restroomId: restroom.id, name: restroom.name, staff: staffName, resolved: false });
        
        addNotification(`Cleaning staff dispatched to ${restroom.name}`);
        logActivity(restroom.name, `Staff ${staffName} dispatched`, 'dispatch');
        addHistory(new Date(), restroom.name, 'dispatch', `Auto-dispatch triggered. Staff: ${staffName}`);

        // Modal
        state._modalRestroomId = restroom.id;
        $('#modalMessage').textContent = `Threshold of ${state.threshold} reached for ${restroom.name}.`;
        $('#modalDetails').innerHTML = `Location: <strong>${restroom.name}</strong><br>Assigned to: <strong>${staffName}</strong>`;
        $('#dispatchModal').style.display = 'flex';

        renderStaff();
        updateDispatches();
        updateKPIs();
    }

    function resolveRestroom(id) {
        const r = state.restrooms.find(x => x.id === id);
        if(!r) return;

        r.status = 'clean';
        r.dirty = 0;
        
        state.dispatches.filter(d => d.restroomId === id && !d.resolved).forEach(d => {
            d.resolved = true;
            const staff = state.staff.find(s => s.name === d.staff);
            if(staff) staff.status = 'available';
        });

        logActivity(r.name, `Issue resolved, staff available`, 'clean');
        addHistory(new Date(), r.name, 'resolved', 'Staff marked location as resolved.');
        
        renderRestroomCards();
        renderStaff();
        updateDispatches();
        updateChart();
        checkAlerts();
        updateKPIs();
    }

    function updateDispatches() {
        const active = state.dispatches.filter(d => !d.resolved);
        const section = $('#dispatchSection');
        
        if (active.length === 0) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';
            $('#dispatchList').innerHTML = active.map(d => `
                <div class="dispatch-item">
                    <div>
                        <strong>🧹 ${d.name}</strong>
                        <div style="font-size:12px;color:var(--text-secondary)">Assigned: ${d.staff}</div>
                    </div>
                    <button class="dispatch-resolve-btn" onclick="window._resolve('${d.restroomId}')">✓ Resolve</button>
                </div>
            `).join('');
        }
    }
    window._resolve = resolveRestroom;

    function renderStaff() {
        $('#staffList').innerHTML = state.staff.map(s => `
            <div class="staff-item">
                <div class="staff-avatar">${s.name.charAt(0)}</div>
                <div class="staff-info">
                    <span class="staff-name">${s.name}</span>
                    <span class="staff-status ${s.status === 'busy' ? 'busy' : ''}">${s.status === 'available' ? '🟢 Available' : '🟠 Busy'}</span>
                </div>
            </div>
        `).join('');
    }

    function logActivity(loc, action, type) {
        const feed = $('#activityFeed');
        const item = document.createElement('div');
        item.className = `activity-item ${type}`;
        item.innerHTML = `<strong>${loc}</strong>: ${action}<span class="activity-time">${new Date().toLocaleTimeString()}</span>`;
        
        if($('.activity-empty')) $('.activity-empty').remove();
        feed.prepend(item);
        if (feed.children.length > 20) feed.removeChild(feed.lastChild);
    }

    function addNotification(msg) {
        state.notifications.unshift({ msg, time: new Date() });
        updateNotifications();
    }

    function updateNotifications() {
        const badge = $('#notifBadge');
        if (state.notifications.length > 0) {
            badge.style.display = 'flex';
            badge.textContent = state.notifications.length;
            $('#notifList').innerHTML = state.notifications.map(n => `
                <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;">
                    <div style="font-weight:600;">${n.msg}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${n.time.toLocaleTimeString()}</div>
                </div>
            `).join('');
        } else {
            badge.style.display = 'none';
            $('#notifList').innerHTML = '<p class="notif-empty">No new notifications</p>';
        }
    }

    function checkAlerts() {
        const dirtyCount = state.restrooms.filter(r => r.status === 'dirty').length;
        if (dirtyCount > 0) {
            $('#alertBanner').style.display = 'flex';
            $('#alertTitle').textContent = `${dirtyCount} Restroom(s) Require Attention`;
        } else {
            $('#alertBanner').style.display = 'none';
        }
    }

    function startAutoRefresh() {
        let count = state.refreshInterval;
        setInterval(() => {
            count--;
            if (count <= 0) {
                count = state.refreshInterval;
                renderRestroomCards(); // Visual update without logic changes
            }
            $('#refreshCountdown').textContent = count;
        }, 1000);
    }

    function toggleDemoMode() {
        state.demoMode = !state.demoMode;
        const btn = $('#btnToggleDemo');
        if (state.demoMode) {
            btn.innerHTML = '⏸ Stop Demo';
            btn.style.background = '#ef4444';
            state.demoTimer = setInterval(() => {
                const rIds = ['A', 'B', 'C'];
                const randomId = rIds[Math.floor(Math.random() * rIds.length)];
                // 70% clean, 30% dirty
                const isClean = Math.random() > 0.3;
                reportFeedback(randomId, isClean ? 'clean' : 'dirty');
            }, 3000);
        } else {
            btn.innerHTML = '▶ Start Demo';
            btn.style.background = 'white';
            clearInterval(state.demoTimer);
        }
    }

    // Chart.js-like simple canvas rendering
    function updateChart() {
        const cvs = $('#feedbackChart');
        if(!cvs) return;
        const ctx = cvs.getContext('2d');
        const p = cvs.parentElement;
        
        cvs.width = p.clientWidth * 2;
        cvs.height = p.clientHeight * 2;
        cvs.style.width = p.clientWidth + 'px';
        cvs.style.height = p.clientHeight + 'px';
        ctx.scale(2, 2);

        const w = p.clientWidth, h = p.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const max = Math.max(5, ...state.restrooms.map(r => Math.max(r.clean, r.dirty)));
        const padding = { t: 20, b: 30, l: 30, r: 20 };
        const cW = w - padding.l - padding.r;
        const cH = h - padding.t - padding.b;

        // Grid
        ctx.strokeStyle = state.darkMode ? '#374151' : '#e5e7eb';
        ctx.fillStyle = state.darkMode ? '#9ca3af' : '#6b7280';
        ctx.font = '10px Inter, sans-serif';
        for(let i=0; i<=5; i++) {
            let y = padding.t + cH - (i/5)*cH;
            ctx.beginPath(); ctx.moveTo(padding.l, y); ctx.lineTo(w - padding.r, y); ctx.stroke();
            ctx.fillText(Math.round((i/5)*max), 5, y + 4);
        }

        // Bars
        const groupW = cW / 3;
        const barW = Math.min(30, groupW * 0.3);
        
        state.restrooms.forEach((r, i) => {
            const x = padding.l + i*groupW + groupW/2;
            
            // Clean
            ctx.fillStyle = '#22c55e';
            let clnH = (r.clean/max)*cH;
            if(clnH > 0) ctx.fillRect(x - barW - 2, padding.t + cH - clnH, barW, clnH);
            
            // Dirty
            ctx.fillStyle = '#ef4444';
            let drtH = (r.dirty/max)*cH;
            if(drtH > 0) ctx.fillRect(x + 2, padding.t + cH - drtH, barW, drtH);

            ctx.fillStyle = state.darkMode ? '#f9fafb' : '#111827';
            ctx.textAlign = 'center';
            ctx.fillText(r.name, x, h - 10);
        });
    }

    function initPeakHours() {
        const grid = $('#peakGrid');
        let html = '';
        for(let i=6; i<18; i++) { // 6am to 6pm
            let val = Math.floor(Math.random() * 20); // Mock usage
            let opacity = Math.min(1, val/20 + 0.1);
            let timeStr = i > 12 ? (i-12)+'PM' : i+'AM';
            html += `<div class="peak-cell" data-time="${timeStr}" data-val="${val}" style="background: rgba(239, 68, 68, ${opacity})"></div>`;
        }
        grid.innerHTML = html;
    }

    // History
    function addHistory(time, location, type, details) {
        state.history.unshift({ time, location, type, details });
    }
    
    function renderHistory() {
        const fLoc = $('#historyFilterLocation').value;
        const fType = $('#historyFilterType').value;
        let data = state.history;

        if(fLoc !== 'all') {
            const r = state.restrooms.find(x => x.id === fLoc);
            if(r) data = data.filter(d => d.location === r.name);
        }
        if(fType !== 'all') data = data.filter(d => d.type === fType);

        const tbody = $('#historyBody');
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No records found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td>${d.time.toLocaleTimeString()}</td>
                <td>${d.location}</td>
                <td><span class="status-badge ${d.type === 'clean' ? 'clean' : 'dirty'}">${d.type}</span></td>
                <td>${d.type === 'clean' || d.type === 'resolved' ? '✅' : '⚠️'}</td>
                <td>${d.details}</td>
            </tr>
        `).join('');
    }

    function clearHistory() {
        state.history = [];
        renderHistory();
        showToast('History cleared', 'success');
    }

    function exportCSV() {
        let csv = 'Time,Location,Event,Details\n';
        state.history.forEach(d => {
            csv += `${d.time.toISOString()},${d.location},${d.type},"${d.details}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HygieSense_Export_${new Date().getTime()}.csv`;
        a.click();
        showToast('CSV Exported', 'success');
    }

    function showToast(msg, type='success') {
        const container = $('#toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fadeOut');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
