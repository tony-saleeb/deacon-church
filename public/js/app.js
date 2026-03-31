/**
 * Main App — Google Form Style Booking
 */
document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'deacon_form_data';

    const App = {
        step: 1,
        maxReached: 1,
        availability: [],
        selectedDay: null,
        selectedLoc: null,
        userChurchCount: 0,
        maxChurchPerDeacon: 2,

        els: {},

        init() {
            this.cache();
            this.bind();
            this.restoreForm();
            this.go(1);
        },

        cache() {
            this.els = {
                panels: document.querySelectorAll('.panel'),
                steps: document.querySelectorAll('.step-item'),
                lines: document.querySelectorAll('.step-line'),
                name: document.getElementById('f-name'),
                phone: document.getElementById('f-phone'),
                stage: document.getElementById('f-stage'),
                rank: document.getElementById('f-rank'),
                daysGrid: document.getElementById('days-grid'),
                locChurch: document.getElementById('loc-church'),
                locClub: document.getElementById('loc-club'),
                churchLimit: document.getElementById('church-limit'),
                suggest: document.getElementById('suggest'),
                summary: document.getElementById('summary'),
                doneDetails: document.getElementById('done-details'),
                toasts: document.getElementById('toasts'),
                loader: document.getElementById('loader'),

                // Tabs and Flows
                tabs: document.querySelectorAll('.app-tab'),
                flowBook: document.getElementById('flow-book'),
                flowMy: document.getElementById('flow-my-bookings'),
                
                // My Bookings
                myPhone: document.getElementById('my-phone'),
                btnLoadMy: document.getElementById('btn-load-my'),
                myList: document.getElementById('my-list')
            };
        },

        bind() {
            // Navigation buttons
            document.getElementById('go-2').addEventListener('click', () => this.validateAndGo(2));
            document.getElementById('go-3').addEventListener('click', () => {
                if (!this.selectedDay) { this.toast('يرجى اختيار يوم', 'warning'); return; }
                this.go(3);
            });
            document.getElementById('go-4').addEventListener('click', () => {
                if (!this.selectedLoc) { this.toast('يرجى اختيار المكان', 'warning'); return; }
                this.go(4);
            });
            document.getElementById('back-1').addEventListener('click', () => this.go(1));
            document.getElementById('back-2').addEventListener('click', () => this.go(2));
            document.getElementById('back-3').addEventListener('click', () => this.go(3));
            document.getElementById('submit-btn').addEventListener('click', () => this.submit());
            document.getElementById('new-booking-btn').addEventListener('click', () => this.resetForNewBooking());

            // Location cards
            this.els.locChurch.addEventListener('click', () => this.pickLoc('church'));
            this.els.locClub.addEventListener('click', () => this.pickLoc('club'));

            // Live validation
            V.live(this.els.name, V.name.bind(V));
            V.live(this.els.phone, V.phone.bind(V));

            // Clickable progress steps
            this.els.steps.forEach(s => {
                s.addEventListener('click', () => {
                    const target = parseInt(s.dataset.step);
                    if (target <= this.maxReached) this.go(target);
                });
            });

            // Tabs
            this.els.tabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    this.els.tabs.forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    const flow = e.target.dataset.flow;
                    if (flow === 'book') {
                        this.els.flowBook.style.display = 'block';
                        this.els.flowMy.style.display = 'none';
                    } else {
                        this.els.flowBook.style.display = 'none';
                        this.els.flowMy.style.display = 'block';
                        // Auto-fill phone and load if it exists
                        if (!this.els.myPhone.value && this.els.phone.value) {
                            this.els.myPhone.value = this.els.phone.value;
                        }
                        if (!this.els.myPhone.value) {
                            const p = localStorage.getItem('dc_phone');
                            if (p) this.els.myPhone.value = p;
                        }
                        
                        // Always auto-refresh list if we have a phone
                        if (this.els.myPhone.value) {
                            this.loadMyBookings();
                        }
                    }
                });
            });

            // My Bookings
            this.els.btnLoadMy.addEventListener('click', () => this.loadMyBookings());
        },

        // Save form data to localStorage
        saveForm() {
            const data = {
                name: this.els.name.value,
                phone: this.els.phone.value,
                stage: this.els.stage.value,
                rank: this.els.rank.value,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        },

        // Restore form data from localStorage
        restoreForm() {
            try {
                const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (data) {
                    this.els.name.value = data.name || '';
                    this.els.phone.value = data.phone || '';
                    this.els.stage.value = data.stage || '';
                    this.els.rank.value = data.rank || '';
                }
            } catch {}
        },

        go(step) {
            this.step = step;
            if (step > this.maxReached) this.maxReached = step;

            // Update progress bar
            this.els.steps.forEach(s => {
                const n = parseInt(s.dataset.step);
                s.classList.remove('active', 'completed');
                if (n === step) s.classList.add('active');
                else if (n < step) s.classList.add('completed');
            });
            this.els.lines.forEach(l => {
                const after = parseInt(l.dataset.after);
                l.classList.toggle('filled', after < step);
            });

            // Show panel
            this.els.panels.forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(step <= 4 ? `panel-${step}` : 'panel-done');
            if (panel) {
                panel.classList.add('active');
                panel.style.animation = 'none';
                panel.offsetHeight;
                panel.style.animation = '';
            }

            // Load data for specific steps
            if (step === 2) this.loadDays();
            if (step === 3) this.updateLocView();
            if (step === 4) this.showSummary();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        // Step 1 validation
        validateAndGo(target) {
            const checks = [
                { fn: V.name(this.els.name.value), el: this.els.name, err: document.getElementById('err-name') },
                { fn: V.phone(this.els.phone.value), el: this.els.phone, err: document.getElementById('err-phone') },
                { fn: V.stage(this.els.stage.value), el: this.els.stage, err: document.getElementById('err-stage') },
                { fn: V.rank(this.els.rank.value), el: this.els.rank, err: document.getElementById('err-rank') },
            ];

            let valid = true;
            checks.forEach(c => {
                c.el.classList.toggle('err', !c.fn.ok);
                if (c.err) { c.err.textContent = c.fn.msg || ''; c.err.classList.toggle('show', !c.fn.ok); }
                if (!c.fn.ok) valid = false;
            });

            if (!valid) {
                this.toast('يرجى ملء جميع البيانات', 'warning');
                return;
            }

            // Save the data so it persists for next booking
            this.saveForm();
            this.go(target);
        },

        // Step 2: Load days (pass phone to check already-booked)
        async loadDays() {
            this.showLoader();
            const phone = this.els.phone.value.trim().replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
            const res = await api.availability(phone);
            this.hideLoader();

            if (res.ok && res.success) {
                this.availability = res.availability;
                this.userChurchCount = res.user_church_count || 0;
                this.maxChurchPerDeacon = res.max_church_per_deacon || 2;
                this.renderDays();
            } else {
                this.toast('خطأ في تحميل الأيام', 'error');
            }
        },

        renderDays() {
            const g = this.els.daysGrid;
            g.innerHTML = '';

            if (!this.availability.length) {
                g.innerHTML = '<div class="empty" style="grid-column:1/-1">لا توجد أيام متاحة حاليا</div>';
                return;
            }

            this.availability.forEach(day => {
                const isBooked = day.booked_by_user;
                const isSelected = this.selectedDay?.id === day.id;
                const card = document.createElement('div');
                card.className = `day-card${isSelected ? ' selected' : ''}${isBooked ? ' booked' : ''}`;

                let inner = `<div class="day-label">${day.label}</div><div class="day-date">${day.day_date}</div>`;
                if (isBooked) {
                    inner += '<div class="day-badge">تم الحجز</div>';
                }
                card.innerHTML = inner;

                if (!isBooked) {
                    card.addEventListener('click', () => {
                        g.querySelectorAll('.day-card').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        this.selectedDay = day;
                    });
                }
                g.appendChild(card);
            });
        },

        // Step 3: Location
        updateLocView() {
            if (!this.selectedDay) return;
            const d = this.selectedDay;

            // Disable church if day is full OR user already hit their max church bookings
            const userAtMax = this.userChurchCount >= this.maxChurchPerDeacon;
            const churchDisabled = d.church_full || userAtMax;
            this.els.locChurch.classList.toggle('disabled', churchDisabled);

            // Show appropriate message
            if (userAtMax && !d.church_full) {
                this.els.suggest.classList.remove('hidden');
                this.els.suggest.querySelector('span:nth-child(2)').textContent = `وصلت للحد الأقصى (${this.maxChurchPerDeacon}) للحجز في الكنيسة`;
            } else {
                this.els.suggest.classList.toggle('hidden', !d.church_full);
                if (d.church_full) {
                    this.els.suggest.querySelector('span:nth-child(2)').textContent = 'الكنيسة ممتلئة';
                }
            }
            this.els.churchLimit.classList.remove('show');

            if (churchDisabled && this.selectedLoc === 'church') this.selectedLoc = null;
            this.els.locChurch.classList.toggle('selected', this.selectedLoc === 'church');
            this.els.locClub.classList.toggle('selected', this.selectedLoc === 'club');
        },

        pickLoc(loc) {
            if (loc === 'church' && this.els.locChurch.classList.contains('disabled')) return;
            this.selectedLoc = loc;
            this.els.locChurch.classList.toggle('selected', loc === 'church');
            this.els.locClub.classList.toggle('selected', loc === 'club');
        },

        // Step 4: Summary
        showSummary() {
            const locName = this.selectedLoc === 'church' ? 'الكنيسة' : 'نادي القديسة مارينا';
            this.els.summary.innerHTML = `
                <li><span class="lbl">الاسم</span><span class="val">${this.els.name.value.trim()}</span></li>
                <li><span class="lbl">التليفون</span><span class="val" dir="ltr">${this.els.phone.value.trim()}</span></li>
                <li><span class="lbl">المرحلة</span><span class="val">${this.els.stage.value}</span></li>
                <li><span class="lbl">الرتبة</span><span class="val">${this.els.rank.value}</span></li>
                <li><span class="lbl">اليوم</span><span class="val">${this.selectedDay.label}</span></li>
                <li><span class="lbl">التاريخ</span><span class="val">${this.selectedDay.day_date}</span></li>
                <li><span class="lbl">المكان</span><span class="val">${locName}</span></li>
            `;
        },

        // Submit
        async submit() {
            this.showLoader();
            const phone = this.els.phone.value.trim().replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
            const res = await api.book({
                full_name: this.els.name.value.trim(),
                phone,
                stage: this.els.stage.value,
                diaconal_rank: this.els.rank.value,
                day_id: this.selectedDay.id,
                location: this.selectedLoc,
            });
            this.hideLoader();

            if (res.ok && res.success) {
                this.toast('تم الحجز بنجاح', 'success');
                const locName = this.selectedLoc === 'church' ? 'الكنيسة' : 'نادي القديسة مارينا';
                this.els.doneDetails.innerHTML = `
                    <div class="sd-row"><span class="sd-label">الاسم</span><span class="sd-value">${res.deacon?.full_name || this.els.name.value.trim()}</span></div>
                    <div class="sd-row"><span class="sd-label">اليوم</span><span class="sd-value">${res.day?.label || this.selectedDay.label}</span></div>
                    <div class="sd-row"><span class="sd-label">المكان</span><span class="sd-value">${locName}</span></div>
                `;

                // Save form data for next booking
                this.saveForm();

                // Show success panel
                this.els.panels.forEach(p => p.classList.remove('active'));
                document.getElementById('panel-done').classList.add('active');
                this.els.steps.forEach(s => s.classList.remove('active'));
                this.els.steps.forEach(s => s.classList.add('completed'));
                this.els.lines.forEach(l => l.classList.add('filled'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                this.toast(res.message || 'حدث خطأ', 'error');
                if (res.suggest_club) {
                    this.pickLoc('club');
                    this.go(3);
                }
            }
        },

        // ── My Bookings Module ──
        async loadMyBookings() {
            const phone = this.els.myPhone.value.trim().replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
            if (!phone) {
                this.toast('يرجى كتابة رقم التليفون للبحث', 'warning');
                return;
            }

            this.showLoader();
            const res = await api.myBookings(phone);
            this.hideLoader();

            if (res.ok && res.success) {
                this.renderMyBookings(res.bookings);
            } else {
                this.toast('حدث خطأ أثناء البحث عن החجوزات', 'error');
            }
        },

        renderMyBookings(bookings) {
            const list = this.els.myList;
            list.innerHTML = '';

            if (!bookings || bookings.length === 0) {
                list.innerHTML = '<div style="background:var(--bg-elevated);padding:24px;border-radius:var(--radius);text-align:center;color:var(--text-dim);border:1px solid var(--border);">لا توجد حجوزات مسجلة حاليا بهذا الرقم.</div>';
                return;
            }

            bookings.forEach(b => {
                const card = document.createElement('div');
                card.style.cssText = 'background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;';
                
                const locName = b.location === 'church' ? 'الكنيسة' : 'نادي القديسة مارينا';
                const dateStr = new Date(b.day_date).toLocaleDateString('ar-EG', { weekday: 'long', month: 'short', day: 'numeric' });
                
                card.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <span style="font-weight:600;font-size:1.1rem;color:var(--text);">${b.day_label}</span>
                        <span style="font-size:0.85rem;color:var(--text-dim);background:var(--bg);padding:4px 8px;border-radius:6px;border:1px solid var(--border);">${dateStr}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;color:var(--text);font-size:0.95rem;margin-bottom:16px;">
                        <span class="icon sm" style="color:var(--primary)"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
                        ${locName}
                    </div>
                    <button class="btn btn-ghost btn-cancel" data-id="${b.id}" style="color:var(--danger);border-color:var(--border);background:var(--danger-light);width:100%">إلغاء الحجز</button>
                `;
                
                const cancelBtn = card.querySelector('.btn-cancel');
                if (cancelBtn) {
                    let confirmMode = false;
                    cancelBtn.addEventListener('click', () => {
                        if (!confirmMode) {
                            confirmMode = true;
                            cancelBtn.textContent = 'متأكد؟ اضغط مرة أخرى للإلغاء';
                            cancelBtn.style.background = 'var(--danger)';
                            cancelBtn.style.color = 'white';
                            setTimeout(() => {
                                confirmMode = false;
                                cancelBtn.textContent = 'إلغاء الحجز';
                                cancelBtn.style.background = 'var(--danger-light)';
                                cancelBtn.style.color = 'var(--danger)';
                            }, 3000);
                        } else {
                            this.cancelBooking(b.id);
                        }
                    });
                }
                
                list.appendChild(card);
            });
        },

        async cancelBooking(id) {
            this.showLoader();
            const res = await api.cancelBooking(id);
            this.hideLoader();

            if (res.ok && res.success) {
                this.toast('تم إلغاء الحجز بنجاح', 'success');
                this.loadMyBookings(); // reload list
            } else {
                this.toast(res.message || 'حدث خطأ أثناء الإلغاء', 'error');
            }
        },

        // Reset for a NEW booking — keep personal data, clear day+location
        resetForNewBooking() {
            this.selectedDay = null;
            this.selectedLoc = null;
            this.maxReached = 1;
            // Keep the form data (name, phone, stage, rank) — don't clear
            // Clear validation errors
            [this.els.name, this.els.phone, this.els.stage, this.els.rank].forEach(el => {
                el.classList.remove('err');
                const err = el.closest('.form-row')?.querySelector('.form-err');
                if (err) err.classList.remove('show');
            });
            this.go(1);
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

    App.init();
    window.App = App;
});
