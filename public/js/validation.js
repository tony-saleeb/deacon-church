/**
 * Client-side Validation
 */
const V = {
    STAGES: ['خامسة و سادسة', 'اعدادي', 'ثانوي', 'شباب', 'خريجين'],
    RANKS: ['ابصالتوس', 'اغنسطس', 'ايبوذياكون', 'ذياكون', 'ارشيذياكون'],

    name(v) {
        if (!v || !v.trim()) return { ok: false, msg: 'الاسم مطلوب' };
        const w = v.trim().split(/\s+/);
        if (w.length < 4) return { ok: false, msg: `يجب أن يكون الاسم رباعي (${w.length}/4)` };
        for (const x of w) if (x.length < 2) return { ok: false, msg: 'كل كلمة حرفين على الأقل' };
        return { ok: true };
    },

    phone(v) {
        if (!v || !v.trim()) return { ok: false, msg: 'رقم التليفون مطلوب' };
        const c = v.trim().replace(/[\s\-\(\)]/g, '');
        if (!/^(\+?2)?01[0125]\d{8}$/.test(c)) return { ok: false, msg: 'رقم تليفون غير صحيح' };
        return { ok: true };
    },

    stage(v) {
        if (!v) return { ok: false, msg: 'اختر المرحلة' };
        return this.STAGES.includes(v) ? { ok: true } : { ok: false, msg: 'المرحلة غير صحيحة' };
    },

    rank(v) {
        if (!v) return { ok: false, msg: 'اختر الرتبة' };
        return this.RANKS.includes(v) ? { ok: true } : { ok: false, msg: 'الرتبة غير صحيحة' };
    },

    dob(v) {
        if (!v) return { ok: false, msg: 'تاريخ الميلاد مطلوب' };
        const birthDate = new Date(v);
        const today = new Date();
        if (isNaN(birthDate.getTime())) return { ok: false, msg: 'تاريخ الميلاد غير صالح' };
        if (birthDate > today) return { ok: false, msg: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل' };
        
        const age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        const calculatedAge = m < 0 || (m === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
        
        if (calculatedAge > 100) return { ok: false, msg: 'تاريخ الميلاد يجب أن لا يتجاوز 100 عام' };
        return { ok: true };
    },

    live(input, fn) {
        const errEl = input.closest('.form-row')?.querySelector('.form-err');
        const check = () => {
            const r = fn(input.value);
            input.classList.toggle('err', !r.ok);
            if (errEl) { errEl.textContent = r.msg || ''; errEl.classList.toggle('show', !r.ok); }
            return r.ok;
        };
        input.addEventListener('blur', check);
        input.addEventListener('input', () => { if (input.classList.contains('err')) check(); });
        return check;
    }
};
