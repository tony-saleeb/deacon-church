const VALID_STAGES = [
    'خامسة و سادسة',
    'اعدادي',
    'ثانوي',
    'شباب',
    'خريجين'
];

const VALID_RANKS = [
    'ابصالتوس',
    'اغنسطس',
    'ايبوذياكون',
    'ذياكون',
    'ارشيذياكون'
];

const VALID_LOCATIONS = ['church', 'club'];

function validateFullName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, message: 'الاسم مطلوب' };
    }
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/);
    if (words.length !== 3) {
        return { valid: false, message: 'الاسم يجب أن يكون ثلاثي (3 كلمات)' };
    }
    for (const word of words) {
        if (word.length < 2) {
            return { valid: false, message: 'كل كلمة في الاسم يجب أن تكون حرفين على الأقل' };
        }
    }
    return { valid: true, value: trimmed };
}

function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return { valid: false, message: 'رقم التليفون مطلوب' };
    }
    const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
    const egyptPhone = /^(\+?2)?01[0125]\d{8}$/;
    if (!egyptPhone.test(cleaned)) {
        return { valid: false, message: 'رقم التليفون غير صحيح' };
    }
    const normalized = cleaned.replace(/^\+?2/, '');
    return { valid: true, value: normalized };
}

function validateStage(stage) {
    if (!stage || !VALID_STAGES.includes(stage)) {
        return { valid: false, message: 'المرحلة غير صحيحة' };
    }
    return { valid: true, value: stage };
}

function validateRank(rank) {
    if (!rank || !VALID_RANKS.includes(rank)) {
        return { valid: false, message: 'الرتبة الشماسية غير صحيحة' };
    }
    return { valid: true, value: rank };
}

function validateLocation(location) {
    if (!location || !VALID_LOCATIONS.includes(location)) {
        return { valid: false, message: 'المكان غير صحيح' };
    }
    return { valid: true, value: location };
}

function validateBookingInput(req, res, next) {
    const errors = [];

    const nameResult = validateFullName(req.body.full_name);
    if (!nameResult.valid) errors.push({ field: 'full_name', message: nameResult.message });
    else req.body.full_name = nameResult.value;

    const phoneResult = validatePhone(req.body.phone);
    if (!phoneResult.valid) errors.push({ field: 'phone', message: phoneResult.message });
    else req.body.phone = phoneResult.value;

    const stageResult = validateStage(req.body.stage);
    if (!stageResult.valid) errors.push({ field: 'stage', message: stageResult.message });

    const rankResult = validateRank(req.body.diaconal_rank);
    if (!rankResult.valid) errors.push({ field: 'diaconal_rank', message: rankResult.message });

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }
    next();
}

module.exports = {
    VALID_STAGES,
    VALID_RANKS,
    VALID_LOCATIONS,
    validateFullName,
    validatePhone,
    validateStage,
    validateRank,
    validateLocation,
    validateBookingInput
};
