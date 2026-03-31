/**
 * API Client
 */
const API = '/api';

const api = {
    async req(path, opts = {}) {
        const { headers: h, ...rest } = opts;
        try {
            const res = await fetch(`${API}${path}`, {
                ...rest,
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', ...h }
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, ...data };
        } catch {
            return { ok: false, status: 0, success: false, message: 'خطأ في الاتصال' };
        }
    },

    availability(phone) {
        const q = phone ? `?phone=${encodeURIComponent(phone)}` : '';
        return this.req(`/bookings/availability${q}`);
    },

    book(data) { return this.req('/deacons/book', { method: 'POST', body: JSON.stringify(data) }); },
    myBookings(phone) { return this.req(`/deacons/my-bookings?phone=${encodeURIComponent(phone)}`); },
    cancelBooking(id) { return this.req(`/bookings/${id}`, { method: 'DELETE' }); },

    // Admin
    adminStats(t) { return this.req('/admin/stats', { headers: { 'x-admin-token': t } }); },
    adminBookings(filters, t) {
        const p = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
        const q = p.toString() ? `?${p}` : '';
        return this.req(`/admin/bookings${q}`, { headers: { 'x-admin-token': t } });
    },
    adminDays(t) { return this.req('/admin/days', { headers: { 'x-admin-token': t } }); },
    adminAddDay(d, t) { return this.req('/admin/days', { method: 'POST', body: JSON.stringify(d), headers: { 'x-admin-token': t } }); },
    adminUpdateDay(id, d, t) { return this.req(`/admin/days/${id}`, { method: 'PUT', body: JSON.stringify(d), headers: { 'x-admin-token': t } }); },
    adminDeleteDay(id, t) { return this.req(`/admin/days/${id}`, { method: 'DELETE', headers: { 'x-admin-token': t } }); },
    adminSettings(t) { return this.req('/admin/settings', { headers: { 'x-admin-token': t } }); },
    adminUpdateSetting(k, v, t) { return this.req('/admin/settings', { method: 'PUT', body: JSON.stringify({ key: k, value: v }), headers: { 'x-admin-token': t } }); },
    adminClearAll(t) { return this.req('/admin/clear-all', { method: 'DELETE', body: JSON.stringify({ confirm: true }), headers: { 'x-admin-token': t } }); },
};
