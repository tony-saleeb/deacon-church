/**
 * Admin Dashboard
 */
document.addEventListener('DOMContentLoaded', () => {
    const A = {
        token: localStorage.getItem('admin_token') || '',
        els: {},

        async init() {
            this.cache();
            this.bindTabs();
            this.bindActions();
            // Always bootstrap token from session cookie
            try {
                const r = await fetch('/api/admin/token').then(r => r.json());
                if (r.success) {
                    this.token = r.token;
                    localStorage.setItem('admin_token', this.token);
                }
            } catch {}
            this.loadAll();
        },

        cache() {
            this.els = {
                toasts: document.getElementById('toasts'),
                loader: document.getElementById('loader'),
                stats: { d: document.getElementById('s-deacons'), b: document.getElementById('s-bookings'), c: document.getElementById('s-church'), u: document.getElementById('s-club') },
                cards: document.getElementById('cards-container'),
                countLabel: document.getElementById('count-label'),
                fDay: document.getElementById('flt-day'),
                fLoc: document.getElementById('flt-loc'),
                fStage: document.getElementById('flt-stage'),
                fRank: document.getElementById('flt-rank'),
                daysList: document.getElementById('days-list'),
                newDayDate: document.getElementById('new-day-date'),
                newDayLabel: document.getElementById('new-day-label'),
                cfgCap: document.getElementById('cfg-cap'),
                cfgMax: document.getElementById('cfg-max'),
                cfgPw: document.getElementById('cfg-pw'),
                clearBtn: document.getElementById('clear-btn'),
            };
        },

        bindTabs() {
            document.querySelectorAll('.admin-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(tab.dataset.tab).classList.add('active');
                });
            });
        },

        bindActions() {
            [this.els.fDay, this.els.fLoc, this.els.fStage, this.els.fRank].forEach(f => f.addEventListener('change', () => this.loadBookings()));
            document.getElementById('export-btn').addEventListener('click', () => this.exportCSV());
            document.getElementById('add-day-btn').addEventListener('click', () => this.addDay());
            document.getElementById('save-cfg-btn').addEventListener('click', () => this.saveSettings());
            this.els.clearBtn.addEventListener('click', (e) => this.handleClear(e.currentTarget));
        },

        async loadAll() {
            this.showLoader();
            // Load settings first to get admin token
            await this.loadSettings();
            await Promise.all([this.loadStats(), this.loadBookings(), this.loadDays()]);
            this.hideLoader();
        },

        async loadStats() {
            const r = await api.adminStats(this.token);
            if (r.ok && r.success) {
                const s = r.stats;
                this.els.stats.d.textContent = s.total_deacons || 0;
                this.els.stats.b.textContent = s.total_bookings || 0;
                this.els.stats.c.textContent = s.church_bookings || 0;
                this.els.stats.u.textContent = s.club_bookings || 0;
            }
        },

        async loadBookings() {
            const r = await api.adminBookings({
                day_id: this.els.fDay.value,
                location: this.els.fLoc.value,
                stage: this.els.fStage.value,
                diaconal_rank: this.els.fRank.value,
            }, this.token);

            if (!r.ok || !r.success) return;

            const bookings = r.bookings || [];
            // Populate day filter if empty
            if (this.els.fDay.options.length <= 1 && r.all_days) {
                r.all_days.forEach(d => {
                    const o = document.createElement('option');
                    o.value = d.id; o.textContent = d.label;
                    this.els.fDay.appendChild(o);
                });
            }

            // Group by deacon
            const map = new Map();
            bookings.forEach(b => {
                const key = b.deacon_id;
                if (!map.has(key)) map.set(key, { deacon: b, bookings: [] });
                map.get(key).bookings.push(b);
            });

            const c = this.els.cards;
            c.innerHTML = '';

            if (!map.size) {
                c.innerHTML = '<div class="empty">لا توجد حجوزات</div>';
                this.els.countLabel.textContent = '0 حجز — 0 شماس';
                return;
            }

            let idx = 0;
            map.forEach(({ deacon, bookings }) => {
                idx++;
                const card = document.createElement('div');
                card.className = 'deacon-card';
                const bHtml = bookings.map(b => `
                    <div class="dc-row">
                        <span class="dc-day">${b.day_label}</span>
                        <span class="dc-date">${b.day_date}</span>
                        <span class="badge ${b.location === 'church' ? 'badge-church' : 'badge-club'}">${b.location === 'church' ? 'الكنيسة' : 'النادي'}</span>
                    </div>`).join('');

                card.innerHTML = `
                    <div class="dc-header">
                        <div class="dc-num">${idx}</div>
                        <div class="dc-info"><div class="dc-name">${deacon.full_name}</div><div class="dc-meta">${deacon.diaconal_rank} · ${deacon.stage} · ${deacon.phone}</div></div>
                        <span class="dc-count">${bookings.length} حجز</span>
                    </div>
                    <div class="dc-bookings">${bHtml}</div>`;
                c.appendChild(card);
            });

            this.els.countLabel.textContent = `${bookings.length} حجز — ${map.size} شماس`;
        },

        async loadDays() {
            const r = await api.adminDays(this.token);
            if (!r.ok || !r.success) return;

            const dl = this.els.daysList;
            dl.innerHTML = '';
            (r.days || []).forEach(d => {
                const li = document.createElement('div');
                li.className = 'list-item';
                li.innerHTML = `
                    <div class="li-info"><div class="li-title">${d.label}</div><div class="li-sub">${d.day_date} · ${d.is_active ? 'مفعل' : 'معطل'}</div></div>
                    <div class="li-actions">
                        <button class="btn btn-sm btn-ghost" onclick="A.toggleDay(${d.id}, ${d.is_active ? 0 : 1})">${d.is_active ? 'تعطيل' : 'تفعيل'}</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="A.deleteDay(${d.id})">حذف</button>
                    </div>`;
                dl.appendChild(li);
            });
        },

        async addDay() {
            const date = this.els.newDayDate.value;
            const label = this.els.newDayLabel.value.trim();
            if (!date || !label) { this.toast('أدخل التاريخ والوصف', 'warning'); return; }
            const r = await api.adminAddDay({ day_date: date, label }, this.token);
            if (r.ok && r.success) { this.toast('تمت الإضافة', 'success'); this.loadDays(); this.els.newDayDate.value = ''; this.els.newDayLabel.value = ''; }
            else this.toast(r.message || 'خطأ', 'error');
        },

        async toggleDay(id, active) {
            await api.adminUpdateDay(id, { is_active: active }, this.token);
            this.loadDays();
        },

        async deleteDay(id) {
            const r = await api.adminDeleteDay(id, this.token);
            if (r.ok && r.success) { this.toast('تم الحذف', 'success'); this.loadDays(); }
            else this.toast(r.message || 'خطأ', 'error');
        },

        async loadSettings() {
            const r = await api.adminSettings(this.token);
            if (r.ok && r.success) {
                const s = r.settings;
                this.els.cfgCap.value = s.church_capacity || 90;
                this.els.cfgMax.value = s.max_church_per_deacon || 2;
                this.els.cfgPw.value = s.admin_password || '';
                this.token = s.admin_password;
                localStorage.setItem('admin_token', this.token);
            }
        },

        async saveSettings() {
            this.showLoader();
            await Promise.all([
                api.adminUpdateSetting('church_capacity', this.els.cfgCap.value, this.token),
                api.adminUpdateSetting('max_church_per_deacon', this.els.cfgMax.value, this.token),
                api.adminUpdateSetting('admin_password', this.els.cfgPw.value, this.token),
            ]);
            const newPw = this.els.cfgPw.value;
            if (newPw && newPw !== this.token) { this.token = newPw; localStorage.setItem('admin_token', this.token); }
            this.hideLoader();
            this.toast('تم حفظ الإعدادات', 'success');
        },

        handleClear(btn) {
            if (!btn.classList.contains('confirming')) {
                btn.classList.add('confirming');
                btn.textContent = 'اضغط مرة أخرى للتأكيد';
                btn.classList.remove('btn-outline-danger');
                btn.classList.add('btn-danger');
                btn._t = setTimeout(() => {
                    btn.classList.remove('confirming', 'btn-danger');
                    btn.classList.add('btn-outline-danger');
                    btn.textContent = 'مسح جميع البيانات';
                }, 4000);
                return;
            }
            clearTimeout(btn._t);
            btn.classList.remove('confirming');
            this.showLoader();
            api.adminClearAll(this.token).then(r => {
                this.hideLoader();
                if (r.ok && r.success) {
                    this.toast(r.message, 'success');
                    this.loadAll();
                } else {
                    this.toast(r.message || 'خطأ', 'error');
                }
                btn.classList.remove('btn-danger');
                btn.classList.add('btn-outline-danger');
                btn.textContent = 'مسح جميع البيانات';
            });
        },

        exportCSV() {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/admin/export', true);
            xhr.setRequestHeader('x-admin-token', this.token);
            xhr.responseType = 'blob';
            xhr.onload = () => {
                if (xhr.status !== 200) return;
                const a = document.createElement('a');
                a.href = URL.createObjectURL(xhr.response);
                a.download = `bookings_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
            };
            xhr.send();
        },

        toast(msg, type = 'info') {
            const t = document.createElement('div');
            t.className = `toast ${type}`;
            t.textContent = msg;
            this.els.toasts.appendChild(t);
            setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 3000);
        },

        showLoader() { this.els.loader.style.display = 'flex'; },
        hideLoader() { this.els.loader.style.display = 'none'; },
    };

    // Make global for inline onclick handlers
    window.A = A;
    A.init();
});
