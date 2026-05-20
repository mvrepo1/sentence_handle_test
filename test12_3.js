/**
 * =============================================================================
 * splitIntoSentences.js  v4.0 (Context-Aware Parser & Repair Engine)
 * =============================================================================
 */

const OPEN_QUOTES  = ['"', '\u201c', '\u300c', '\u300e'];
const CLOSE_QUOTES = ['"', '\u201d', '\u300d', '\u300f'];
const ALL_QUOTES   = [...OPEN_QUOTES, ...CLOSE_QUOTES];

const TERMINAL_PUNCT_RE     = /[.!?…\uFF01\uFF1F\u3002]/;
const ENDING_PUNCT_CLOSE_RE = /([.!?…\uFF01\uFF1F\u3002]+)\s*["'\u201c\u201d\u300d\u300f]+$/;

const ABBREVIATIONS = new Set([
    'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'St', 'Jr', 'Sr',
    'Rev', 'Lt', 'Capt', 'Col', 'Gen', 'Sgt', 'Cpl', 'Pvt', 'Gov',
    'GS', 'PGS', 'TS', 'ThS', 'BS', 'KS', 'LS', 'Tp', 'TP',
]);

// =============================================================================
// Context-Aware Helpers
// =============================================================================

const isUpperishStart = (str) => {
    const stripped = str.replace(/^["'\u201c\u300c\u300e\-\s]+/, '');
    return /^[\p{Lu}]/u.test(stripped);
};

const isUpperishStartAfterSpace = (str) =>
    /^["'\u201c\u300c\u300e\-]*\s+["'\u201c\u300c\u300e\-\s]*[\p{Lu}]/u.test(str);

const countWords = (str) => {
    const t = str.trim();
    return t ? t.split(/\s+/).length : 0;
};

const isAbbreviation = (buffer) => {
    if (!buffer) return false;
    const trimmed = buffer.trim().replace(/[.!?…\uFF01\uFF1F\u3002]+$/, '');
    const words   = trimmed.split(/[\s.]+/);
    const lastWord = words[words.length - 1];
    return lastWord ? ABBREVIATIONS.has(lastWord) : false;
};

/**
 * Phân loại ngoặc thẳng kép (") thành Đóng hoặc Mở dựa trên ngữ cảnh xung quanh
 */
const getStraightQuoteType = (text, i, quoteLevel) => {
    const prev = i > 0 ? text[i - 1] : ' ';
    const next = i < text.length - 1 ? text[i + 1] : ' ';
    
    const prevIsSpace = /[\s\-\[({]/.test(prev);
    const nextIsSpace = /[\s\-\.,;!?…\])}:]/.test(next);

    // 1. Dấu hiệu rõ ràng dựa trên khoảng trắng
    if (prevIsSpace && !nextIsSpace) return { isOpening: true, isClosing: false };
    if (!prevIsSpace && nextIsSpace) return { isOpening: false, isClosing: true };

    // 2. Ngữ cảnh hẹp (Ambiguous)
    const prevIsPunct = /[.!?…,'"\u201d\u300d\u300f]/.test(prev);
    const nextIsUpper = /^[\p{Lu}]/u.test(next);
    const prevIsLetter = /[\p{L}\p{N}]/u.test(prev);

    // Dấu câu ngay trước + Chữ hoa ngay sau -> (Ví dụ: ..."Tiêu Viêm) -> Chắc chắn là Mở ngoặc thoại mới
    if (prevIsPunct && nextIsUpper) return { isOpening: true, isClosing: false };
    
    // Nằm sát chữ (Ví dụ: đoạn"Nhìn) -> Thường là lỗi dính chữ
    if (prevIsLetter && !nextIsSpace) {
        return quoteLevel === 0 ? { isOpening: true, isClosing: false } : { isOpening: false, isClosing: true };
    }

    // 3. Fallback toggle state
    if (quoteLevel === 0) return { isOpening: true, isClosing: false };
    return { isOpening: false, isClosing: true };
};

// =============================================================================
// PHASE 1: Build Context & Analyze Risk
// =============================================================================

const buildQuoteContext = (text, config, isGloballyBalanced) => {
    const {
        maxWordsInsideQuote      = 35,
        weightMissingCloseQuote  = 75,
        weightOuterPunctCorrect  = -30,
        weightViolationStructure = 60,
        weightNewline            = 65,
    } = config;

    const openSet  = new Set(OPEN_QUOTES);
    const closeSet = new Set(CLOSE_QUOTES);
    const segmentRisk = new Float32Array(text.length).fill(0);
    
    let quoteLevel = 0, quoteOpenPos = -1, wordCountInQuote = 0, inWordChar = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        let isOpen = false, isClose = false;

        if (ch === '"') {
            const type = getStraightQuoteType(text, i, quoteLevel);
            isOpen = type.isOpening;
            isClose = type.isClosing;
        } else if (openSet.has(ch)) { 
            isOpen = true; 
        } else if (closeSet.has(ch)) { 
            isClose = true; 
        }

        if (isOpen) {
            quoteLevel++;
            if (quoteLevel === 1) { 
                quoteOpenPos = i; 
                wordCountInQuote = 0; 
                inWordChar = false; 
            }
        }

        if (quoteLevel > 0 && !isOpen) {
            const isWord = /[\p{L}\p{N}]/u.test(ch);
            if (isWord && !inWordChar) wordCountInQuote++;
            inWordChar = isWord;
        }

        if (quoteLevel > 0) {
            let risk = 0;
            if (wordCountInQuote > maxWordsInsideQuote) {
                risk += Math.min(60, (wordCountInQuote - maxWordsInsideQuote) * 2);
            }

            if (TERMINAL_PUNCT_RE.test(ch)) {
                let textAhead = text.slice(i + 1, i + 51).replace(/^["'\u201d\u300d\u300f]+/, '');
                if (isUpperishStart(textAhead))           risk += weightViolationStructure;
                else if (/^\s*[\p{Ll}]/u.test(textAhead)) risk += weightOuterPunctCorrect;
            }

            if (ch === '\n' || ch === '\r') risk += weightNewline;
            if (isOpen && quoteLevel > 1)   risk += weightMissingCloseQuote;

            if (risk > 0 && quoteOpenPos >= 0) {
                for (let j = quoteOpenPos; j <= i; j++) {
                    if (risk > segmentRisk[j]) segmentRisk[j] = risk;
                }
            }
        }

        if (isClose && quoteLevel > 0) {
            quoteLevel--;
            if (quoteLevel === 0) { 
                quoteOpenPos = -1; 
                wordCountInQuote = 0; 
                inWordChar = false; 
            }
        }
    }

    return segmentRisk;
};

// =============================================================================
// PHASE 2: Core Splitter
// =============================================================================

const splitIntoSentences = (text, config = {}) => {
    if (!text || typeof text !== 'string') return [];

    let processedText = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    processedText = processedText.replace(/\u201c([^"]*?)"/g, '\u201c$1\u201d');
    processedText = processedText.replace(/"([^"]*?)\u201d/g, '\u201c$1\u201d');

    const openSet  = new Set(OPEN_QUOTES);
    const closeSet = new Set(CLOSE_QUOTES);
    const allSet   = new Set(ALL_QUOTES);

    // Global Balance Check: Hạ threshold xuống nếu văn bản bị thiếu ngoặc
    let isGloballyBalanced = true;
    const unbalanced = {};
    const pairsCheck = [['\u201c', '\u201d'], ['\u300c', '\u300d'], ['\u300e', '\u300f']];
    for (const [openChar, closeChar] of pairsCheck) {
        let depth = 0;
        for (const ch of processedText) { 
            if (ch === openChar) depth++; 
            else if (ch === closeChar) depth--; 
        }
        if (depth !== 0) { 
            unbalanced[openChar] = true; 
            unbalanced[closeChar] = true;
            isGloballyBalanced = false;
        }
    }
    const sqCount = (processedText.match(/"/g) || []).length;
    if (sqCount % 2 !== 0) isGloballyBalanced = false;

    const baseThreshold = config.suspicionThreshold || 80;
    const activeSuspicionThreshold = isGloballyBalanced ? baseThreshold : 55; // Hung hãn hơn khi văn bản rác

    const segmentRisk = buildQuoteContext(processedText, config, isGloballyBalanced);

    const splitSegment = (seg, segOffset) => {
        const results = [];
        let current = '';
        let quoteLevel = 0;
        let hasOuterWords = false;
        let startedWithQuote = false;
        let currentQuoteText = '';
        let i = 0;

        while (i < seg.length) {
            const ch = seg[i];
            const absPos = segOffset + i;

            if (quoteLevel > 0) currentQuoteText += ch;

            // ── QUOTE HANDLING ────────────────────────────────────────────────
            if (allSet.has(ch)) {
                if (current.trim().replace(/^[\-\s]+/, '') === '') startedWithQuote = true;

                let isOpening = false, isClosing = false;
                if (ch === '"') {
                    const type = getStraightQuoteType(processedText, absPos, quoteLevel);
                    isOpening = type.isOpening;
                    isClosing = type.isClosing;
                } else if (openSet.has(ch)) { 
                    isOpening = true; 
                } else if (closeSet.has(ch)) { 
                    isClosing = true; 
                }

                // Repair Engine: Phát hiện mở ngoặc mới khi ngoặc cũ chưa đóng -> Cưỡng chế bẻ
                if (isOpening && quoteLevel > 0) {
                    const wordsInside = countWords(currentQuoteText);
                    const endsWithTerminal = TERMINAL_PUNCT_RE.test(currentQuoteText.trim().slice(-2));
                    if (endsWithTerminal || wordsInside > (config.maxWordsInsideQuote || 35)) {
                        quoteLevel = 0;
                        results.push(current.trim());
                        current = ''; currentQuoteText = '';
                        hasOuterWords = false; startedWithQuote = true;
                    }
                }

                if (isOpening)      quoteLevel++;
                else if (isClosing) quoteLevel = Math.max(0, quoteLevel - 1);

                current += ch;
                i++;

                if (quoteLevel === 0 && !unbalanced[ch]) {
                    currentQuoteText = '';
                    const rest = seg.slice(i);
                    const nextNonSpaceMatch = rest.match(/^\s*(.)/);

                    if (nextNonSpaceMatch) {
                        const nextChar = nextNonSpaceMatch[1];
                        const endingPunctMatch = current.trimEnd().match(ENDING_PUNCT_CLOSE_RE);

                        let canSplitQuote = !hasOuterWords || startedWithQuote;
                        
                        if (endingPunctMatch && !canSplitQuote && openSet.has(nextChar)) {
                            let isRealOpenQuote = true;
                            if (nextChar === '"') {
                                const nextQuoteAbsoluteIdx = segOffset + i + rest.indexOf('"');
                                const type = getStraightQuoteType(processedText, nextQuoteAbsoluteIdx, 0);
                                if (!type.isOpening) isRealOpenQuote = false;
                            }
                            if (isRealOpenQuote) canSplitQuote = true;
                        }

                        if (endingPunctMatch && canSplitQuote) {
                            const punct = endingPunctMatch[1];
                            const isJustEllipsis = /^(\.{2,}|…+)$/.test(punct);
                            const textInside = current
                                .replace(/^["'\u201c\u300c\u300e\-\s]+/, '')
                                .replace(/["'\u201d\u300d\u300f\s]+$/, '');
                            const hasInternal = /[.!?…\uFF01\uFF1F\u3002]+\s+/.test(textInside);

                            if ((!hasInternal || allSet.has(nextChar)) && !isAbbreviation(current)) {
                                let isAttachedQuote = closeSet.has(rest[0]);
                                if (rest[0] === '"') {
                                    const type = getStraightQuoteType(processedText, segOffset + i, 0);
                                    if (!type.isClosing) isAttachedQuote = false;
                                }
                                
                                const isAttachedWord = /^[\p{L}\p{N}]/u.test(rest) || isAttachedQuote;

                                if (!isAttachedWord && ((isUpperishStart(rest) && !isJustEllipsis) || openSet.has(nextChar))) {
                                    let shouldSplit = true;
                                    if (/^["'\u201c\u300c\u300e](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…\u3002]+["'\u201d\u300d\u300f]*$/.test(current.trim())) {
                                        shouldSplit = false;
                                    }
                                    if (shouldSplit && !openSet.has(nextChar)) {
                                        // FIX: Chỉ hủy cắt nếu DẤU CÂU ĐẦU TIÊN là phẩy/chấm phẩy
                                        const firstPunctMatch = rest.match(/([.,;:!?…，；：])/);
                                        if (firstPunctMatch && [',', ';', ':', '，', '；', '：'].includes(firstPunctMatch[1])) {
                                            shouldSplit = false;
                                        }
                                    }
                                    if (shouldSplit) {
                                        results.push(current.trim());
                                        current = ''; hasOuterWords = false; startedWithQuote = false;
                                    }
                                }
                            }
                        }
                    }
                }
                continue;
            }

            // ── TERMINAL PUNCTUATION HANDLING ────────────────────────────────
            if (TERMINAL_PUNCT_RE.test(ch)) {
                let punct = '';
                let tempI = i;
                while (tempI < seg.length && TERMINAL_PUNCT_RE.test(seg[tempI])) {
                    punct += seg[tempI++];
                }

                if (quoteLevel > 0) {
                    const precomputedRisk = segmentRisk[absPos] ?? 0;
                    let score = precomputedRisk;

                    const wordsInside = countWords(currentQuoteText);
                    const maxWords = config.maxWordsInsideQuote || 35;
                    if (wordsInside > maxWords) {
                        const extraRisk = Math.min(30, wordsInside - maxWords);
                        if (precomputedRisk < extraRisk) score += extraRisk - precomputedRisk;
                    }

                    if (score >= activeSuspicionThreshold) {
                        quoteLevel = 0; currentQuoteText = '';
                    }
                }

                if (quoteLevel === 0) {
                    i = tempI;
                    const tempCurrent = current + punct;

                    if (!isAbbreviation(tempCurrent)) {
                        let trailingQuotes = '';
                        while (i < seg.length) {
                            const nextCharLoop = seg[i];
                            const absolutePos  = segOffset + i;
                            
                            if (nextCharLoop === '"') {
                                const type = getStraightQuoteType(processedText, absolutePos, 0);
                                if (type.isOpening) break;
                            }
                            if (/["'\u201d\u300d\u300f]/.test(nextCharLoop)) { 
                                trailingQuotes += nextCharLoop; 
                                i++; 
                            } else {
                                break;
                            }
                        }

                        const fullCurrent = tempCurrent + trailingQuotes;
                        const finalRest   = seg.slice(i);

                        let canSplit = true;
                        if (trailingQuotes.length > 0) {
                            canSplit = !hasOuterWords || startedWithQuote;
                            const nextCharMatch = finalRest.match(/^\s*(.)/);
                            
                            if (!canSplit && nextCharMatch && openSet.has(nextCharMatch[1])) {
                                let isRealOpenQuote = true;
                                if (nextCharMatch[1] === '"') {
                                    const nextQuoteAbsIdx = segOffset + i + finalRest.indexOf('"');
                                    const type = getStraightQuoteType(processedText, nextQuoteAbsIdx, 0);
                                    if (!type.isOpening) isRealOpenQuote = false;
                                }
                                if (isRealOpenQuote) canSplit = true;
                            }

                            let isAttachedQuote = closeSet.has(finalRest[0]);
                            if (finalRest[0] === '"') {
                                const type = getStraightQuoteType(processedText, segOffset + i, 0);
                                if (!type.isClosing) isAttachedQuote = false;
                            }
                            
                            if (/^[\p{L}\p{N}]/u.test(finalRest) || isAttachedQuote) canSplit = false;

                            if (canSplit) {
                                const nextCharMatch = finalRest.match(/^\s*(.)/);
                                if (nextCharMatch && !allSet.has(nextCharMatch[1])) {
                                    // FIX: Tương tự như trên, chặn cắt sai ở đây
                                    const firstPunctMatch = finalRest.match(/([.,;:!?…，；：])/);
                                    if (firstPunctMatch && [',', ';', ':', '，', '；', '：'].includes(firstPunctMatch[1])) {
                                        canSplit = false;
                                    }
                                }
                            }
                        }

                        if (/^["'\u201c\u300c\u300e](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…\u3002]+["'\u201d\u300d\u300f]*$/.test(fullCurrent.trim())) canSplit = false;
                        if (/^["'\u201c\u300c\u300e\-\s.!?…\u3002]+$/.test(fullCurrent.trim())) canSplit = false;

                        const isUEllipsis = /^\u2026+$/.test(punct);
                        let isUpperNext = false;
                        if (isUEllipsis) {
                            if (isUpperishStartAfterSpace(finalRest)) {
                                isUpperNext = true;
                            } else if (isUpperishStart(finalRest) && !current.endsWith(' ')) {
                                isUpperNext = true;
                            }
                        } else {
                            isUpperNext = isUpperishStart(finalRest);
                        }

                        if (canSplit && (finalRest.trim().length === 0 || isUpperNext)) {
                            results.push(fullCurrent.trim());
                            current = ''; hasOuterWords = false; startedWithQuote = false;
                            continue;
                        }
                        current = fullCurrent;
                        continue;
                    }
                    current = tempCurrent;
                    continue;
                }
            }

            if (quoteLevel === 0 && /[\p{L}\p{N}]/u.test(ch)) hasOuterWords = true;
            current += ch;
            i++;
        }

        if (current.trim()) results.push(current.trim());
        return results;
    };

    return splitSegment(processedText, 0)
        .map(s => s.trim())
        .filter(s => s.replace(/["'\u201c\u201d\u300c\u300d\u300e\u300f.,!?…\-\s]/g, '').length > 0);
};

module.exports = {
    splitIntoSentences
};

const tests = [
    { label: 'Test 1', input: 'chúng sinh bị nạn.Sau khi hủy! Trời đất run rẩy? Không ai biết......Đêm khuya.', expected: ['chúng sinh bị nạn.', 'Sau khi hủy!', 'Trời đất run rẩy?', 'Không ai biết......', 'Đêm khuya.'] },
    { label: 'Test 2', input: 'Hắn nhìn nàng', expected: ['Hắn nhìn nàng'] },
    { label: 'Test 3', input: '- Thiên Mệnh, cứu ta! Lý Thiên Mệnh đau đầu.', expected: ['- Thiên Mệnh, cứu ta!', 'Lý Thiên Mệnh đau đầu.'] },
    { label: 'Test 4', input: 'Hắn do dự...... Rồi bước đi.', expected: ['Hắn do dự......', 'Rồi bước đi.'] },
    { label: 'Test 5', input: '"Ngươi là ai?" Hắn hỏi. "Ta không biết!" Nàng đáp.', expected: ['"Ngươi là ai?"', 'Hắn hỏi.', '"Ta không biết!"', 'Nàng đáp.'] },
    {
        label: 'Test 6',
        input: 'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, "Thiên tài" và "Thiên tài 2" này một năm rồi vẫn dậm chân tại chỗ a!"! Abc "Câu tiếp theo" câu tiếp theo của câu thiếu. Abc "Câu tiếp theo!" câu tiếp theo của câu thiếu... Abc "Câu tiếp theo?" câu tiếp theo của câu thiếu. Abc "Câu tiếp theo." câu tiếp theo của câu thiếu? Abc "Câu tiếp theo."',
        expected: [
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, "Thiên tài" và "Thiên tài 2" này một năm rồi vẫn dậm chân tại chỗ a!"!',
            'Abc "Câu tiếp theo" câu tiếp theo của câu thiếu.',
            'Abc "Câu tiếp theo!" câu tiếp theo của câu thiếu...',
            'Abc "Câu tiếp theo?" câu tiếp theo của câu thiếu.',
            'Abc "Câu tiếp theo." câu tiếp theo của câu thiếu?',
            'Abc "Câu tiếp theo."'
        ]
    },
    {
        label: 'Test 7',
        input: '"Đấu lực, ba đoạn" Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi… "Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!". Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, ngữ khí hờ hững công bố… Trung niên nam tử vừa nói xong, đám người nổi lên trận châm chọc',
        expected: [
            '"Đấu lực, ba đoạn" Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi…',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, đám người nổi lên trận châm chọc'
        ]
    },
    {
        label: 'Test 8',
        input: '“Sắc mặt hơi đổi, Tiêu Chiến thu liễm nụ cười, Vân Lam tông tông chủ Vân Vận chính là Gia Mã đế quốc đại nhân vật, hắn nho nhỏ một cái tộc trưởng, nửa điểm đều không thể đắc tội. Bằng thế lực và thực lực của hắn, có việc gì lại cần Tiêu gia hỗ trợ? Cát Diệp nói cùng Nạp Lan chất nữ có quan hệ, chẳng lẽ?',
        expected: [
            '“Sắc mặt hơi đổi, Tiêu Chiến thu liễm nụ cười, Vân Lam tông tông chủ Vân Vận chính là Gia Mã đế quốc đại nhân vật, hắn nho nhỏ một cái tộc trưởng, nửa điểm đều không thể đắc tội.',
            'Bằng thế lực và thực lực của hắn, có việc gì lại cần Tiêu gia hỗ trợ?',
            'Cát Diệp nói cùng Nạp Lan chất nữ có quan hệ, chẳng lẽ?'
        ]
    },
    {
        label: 'Test 9',
        input: '"Sắc mặt hơi đổi, Tiêu Chiến thu liễm nụ cười, Vân Lam tông tông chủ Vân Vận chính là Gia Mã đế quốc đại nhân vật, hắn nho nhỏ một cái tộc trưởng, nửa điểm đều không thể đắc tội. Bằng thế lực và thực lực của hắn, có việc gì lại cần Tiêu gia hỗ trợ? Cát Diệp nói cùng Nạp Lan chất nữ có quan hệ, chẳng lẽ?',
        expected: [
            '"Sắc mặt hơi đổi, Tiêu Chiến thu liễm nụ cười, Vân Lam tông tông chủ Vân Vận chính là Gia Mã đế quốc đại nhân vật, hắn nho nhỏ một cái tộc trưởng, nửa điểm đều không thể đắc tội.',
            'Bằng thế lực và thực lực của hắn, có việc gì lại cần Tiêu gia hỗ trợ?',
            'Cát Diệp nói cùng Nạp Lan chất nữ có quan hệ, chẳng lẽ?'
        ]
    }, {
        label: 'Test 10',
        input: 'Abc "Ngoặc kép." abc. Abc "Ngoặc kép2." Abc edf! Abc "Ngoặc kép3!" Abc edf? Abc "Ngoặc kép4?" Abc edf,',
        expected: [
            'Abc "Ngoặc kép." abc.',
            'Abc "Ngoặc kép2." Abc edf!',
            'Abc "Ngoặc kép3!" Abc edf?',
            'Abc "Ngoặc kép4?" Abc edf,'
        ]
    },
    {
        label: 'Test 30',
        input: '“Tiêu Viêm. Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.',
        expected: [
            '“Tiêu Viêm. Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.'
        ]
    },
    {
        label: 'Test 31',
        input: '“Tiêu Viêm... Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.',
        expected: [
            '“Tiêu Viêm... Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.'
        ]
    },
    {
        label: 'Test 32',
        input: '“Tiêu Viêm? Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.',
        expected: [
            '“Tiêu Viêm? Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.'
        ]
    },
    {
        label: 'Test 33',
        input: '“Tiêu Viêm! Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.',
        expected: [
            '“Tiêu Viêm! Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao?” Tiếp theo.'
        ]
    },
    {
        label: 'Test 34',
        input: '“Tiêu Viêm! ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao? “Tiêu Viêm!”” Tiếp theo.',
        expected: [
            '“Tiêu Viêm! ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao? “Tiêu Viêm!”” Tiếp theo.',
        ]
    },
    {
        label: 'Test 35',
        input: '“Tiêu Viêm!..., Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao? “Tiêu Viêm!”...” Tiếp theo.',
        expected: [
            '“Tiêu Viêm!..., Ngươi vậy mà lại chạy thoát khỏi sự truy sát của Hồn Diệt Sinh sao? “Tiêu Viêm!”...” Tiếp theo.',
        ]
    },
    {
        label: 'Test 36',
        input: '"Hello." "Bye." He left.',
        expected: ['"Hello."', '"Bye."', 'He left.']
    },
    {
        label: 'Test 37',
        input: 'Mr. Smith went. He arrived.',
        expected: ['Mr. Smith went.', 'He arrived.']
    },
    {
        label: 'Test 38',
        input: 'PGS. Vũ Tuấn công bố "Điều này là hợp lý!" Ông khẳng định đanh thép.',
        expected: ['PGS. Vũ Tuấn công bố "Điều này là hợp lý!" Ông khẳng định đanh thép.']
    },
    {
        label: 'Test 39',
        input: `I shouldn't do this "stupid thing!" Fuck`,
        expected: [`I shouldn't do this "stupid thing!" Fuck`]
    },
    {
        label: 'Test 40',
        input: `"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm, theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được."`,
        expected: [
            '"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm, theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được."'
        ]
    },
    {
        label: 'Test 41',
        input: `Học Tiêu Viêm nhún vai mấy cái, Huân Nhi cười khẽ nói: "Nhàm chán quá mà." Ánh mắt chuyển hướng thiếu niên, ẩn ước có chút u oán: "Từ sau lần đó, Tiêu Viêm ca ca cả nửa tháng không đến tìm Huân Nhi rồi, chẳng lẽ là sợ Huân Nhi`,
        expected: [
            'Học Tiêu Viêm nhún vai mấy cái, Huân Nhi cười khẽ nói: "Nhàm chán quá mà." Ánh mắt chuyển hướng thiếu niên, ẩn ước có chút u oán: "Từ sau lần đó, Tiêu Viêm ca ca cả nửa tháng không đến tìm Huân Nhi rồi, chẳng lẽ là sợ Huân Nhi'
        ]
    },
    {
        label: 'Test 42',
        input: `Thất đoạn …Viêm nhi ngươi thực làm được!" Hai mắt nhìn vào tấm hắc thạch, lại nhìn hắc sam thiếu niên, trong mắt Tiêu Chiến thoáng có chút ướt át, hắn trong lòng biết rằng, để đạt được thành tựu này, thiếu niên đã phải nỗ lực, cố gắng thế nào …`,
        expected: [
            'Thất đoạn …Viêm nhi ngươi thực làm được!" Hai mắt nhìn vào tấm hắc thạch, lại nhìn hắc sam thiếu niên, trong mắt Tiêu Chiến thoáng có chút ướt át, hắn trong lòng biết rằng, để đạt được thành tựu này, thiếu niên đã phải nỗ lực, cố gắng thế nào …'
        ]
    },
    {
        label: 'Test 43',
        input: `Ngồi trên Tiêu Chiến, ba vị trưởng lão thần tình đích không thể tin được, này một năm trước mới là tam đoạn đấu khí, hiện tại biến thành thất đoạn? Loại tốc độ này …Làm cho người ta sợ hãi!`,
        expected: [
            'Ngồi trên Tiêu Chiến, ba vị trưởng lão thần tình đích không thể tin được, này một năm trước mới là tam đoạn đấu khí, hiện tại biến thành thất đoạn?',
            'Loại tốc độ này …Làm cho người ta sợ hãi!'
        ]
    },
    {
        label: 'Test 44',
        input: `Một năm thời gian, tăng lên tứ đoạn đấu khí, loại tốc độ tu luyên này …Quả thực khiến cho người nghe hãi nhân`,
        expected: [
            'Một năm thời gian, tăng lên tứ đoạn đấu khí, loại tốc độ tu luyên này …Quả thực khiến cho người nghe hãi nhân'
        ]
    },
    {
        label: 'Test 45',
        input: `" Đinh!"Thoe một tiếng kêu thanh thúy vang lên, Thân thể Tiêu viêm nhất thời bạo thối, ở phía mặt đất hiện ra mười mấy dẫu chân chả Tiêu viêm, sau đó mới từ từ đem kinh khủng kình khí hóa giải.`,
        expected: [
            '" Đinh!"Thoe một tiếng kêu thanh thúy vang lên, Thân thể Tiêu viêm nhất thời bạo thối, ở phía mặt đất hiện ra mười mấy dẫu chân chả Tiêu viêm, sau đó mới từ từ đem kinh khủng kình khí hóa giải.'
        ]
    },
    {
        label: 'Test 46',
        input: `"Muốn gặp nữ vương bệ hạ?"Nghe vậy,Nguyệt Mị đôi mắt đẹp liền ánh lên vẻ xinh đẹp mà đầy nguy hiểm, cười lạnh nói:"Chúng ta cùng loài người các ngươi chém giết nhiều năm, trên tay đều dính đầy máu đối phương, còn có thể có chuyện gì để nói chuyện nữa chứ?Mấy vị nếu thức thời, xin khuyên các ngươi hãy rời đi, nếu không một khi xà nhân bát đại thủ lĩnh tề tụ thì dù có là Gia Mã đế quốc cường giả chỉ sợ cũng gặp khó phải lui thôi."`,
        expected: [
            '"Muốn gặp nữ vương bệ hạ?"Nghe vậy,Nguyệt Mị đôi mắt đẹp liền ánh lên vẻ xinh đẹp mà đầy nguy hiểm, cười lạnh nói:"Chúng ta cùng loài người các ngươi chém giết nhiều năm, trên tay đều dính đầy máu đối phương, còn có thể có chuyện gì để nói chuyện nữa chứ?Mấy vị nếu thức thời, xin khuyên các ngươi hãy rời đi, nếu không một khi xà nhân bát đại thủ lĩnh tề tụ thì dù có là Gia Mã đế quốc cường giả chỉ sợ cũng gặp khó phải lui thôi."'
        ]
    },
    {
        label: 'Test 46',
        input: `"Cũng nhờ phúc của ngươi!Mặc dù độc tố đã được giải bất quá cũng tương đương với tàn phế một cánh tay."Đại hán nhàn nhạt nói, liếc nhìn nhãn đồng của Nguyệt Mị.Trong mắt hắn thoáng hiện 1 nét hàn quang.`,
        expected: [
            '"Cũng nhờ phúc của ngươi!Mặc dù độc tố đã được giải bất quá cũng tương đương với tàn phế một cánh tay."Đại hán nhàn nhạt nói, liếc nhìn nhãn đồng của Nguyệt Mị.',
            'Trong mắt hắn thoáng hiện 1 nét hàn quang.'
        ]
    },
    {
        label: 'Test 47',
        input: `" Bất quá." Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi. Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.`,
        expected: [
            '" Bất quá." Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..',
            'Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi.',
            'Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.'
        ]
    },
    {
        label: 'Test 48',
        input: `" Bất quá. Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi. Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.`,
        expected: [
            '" Bất quá. Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..',
            'Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi.',
            'Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.'
        ]
    },
    {
        label: 'Test 49',
        input: `"...Bất quá... Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi. Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.`,
        expected: [
            '"...Bất quá... Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..',
            'Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi.',
            'Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.'
        ]
    },
    {
        label: 'Test 50',
        input: `"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm, theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được.`,
        expected: [
            '"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm, theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được.'
        ]
    },
    {
        label: 'Test 51',
        input: `"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm. Theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được."`,
        expected: [
            '"Ai, tuy đấu kĩ là huyền giai, nhưng đấu khí, lại quá yếu, căn bản không phát huy được bao nhiêu uy lưc." Nhìn phá hư lực mà mình tạo thành, Tiêu Viêm bĩu môi, bất đắc dĩ nhẹ giọng lẩm bẩm.',
            'Theo hiệu quả này, muốn hút được một người, ít nhất cần thất đoạn đấu khí mới có thể làm được."'
        ]
    },
    {
        label: 'Test 52',
        input: `"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!" "Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!" "Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!" "Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta.`,
        expected: [
            '"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!"',
            '"Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!"',
            '"Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!"',
            '"Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta.'
        ]
    },
    {
        label: 'Test 53',
        input: `"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!" "Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!" "Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!"`,
        expected: [
            '"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!"',
            '"Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!"',
            '"Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!"',
        ]
    },
    {
        label: 'Test 54',
        input: `"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!" "Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!" "Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!" Ma đầu, ba trăm năm trước ngươi vũ nhục ta.`,
        expected: [
            '"Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!"',
            '"Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!"',
            '"Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!" Ma đầu, ba trăm năm trước ngươi vũ nhục ta.',
        ]
    },
    {
        label: 'Test 55',
        input: `Thiếu niên nghiến răng, run rẩy, miệng phun ra máu nhưng vẫn sống chết gằn giọng thốt lên hai cái tên này. Tí tách, tí tách… Dưới cơn mưa tầm tã, chớp nổ sấm rền, xuất hiện một cơn bão cuồn cuộn tung trời, lao xuống như muốn nuốt chửng mặt đất. Gió bão thét gào, nước mưa táp xuống đất dữ dội. Tần Ninh ngẩng đầu, ngước nhìn lên trời cao."Ông trời ơi, đến cả ông cũng thấy bất công thay Tần Ninh ta sao?", Tần Ninh thì thào nói, mưa đổ ướt sũng người."Ta không phục, Tần Ninh ta sao có thể chết ở chỗ này, sao có thể khuất phục cha con Lăng Thế Thành được!"Tần Ninh cắn răng, gắng sức kéo lê người, để lại sau lưng một vệt máu dài, bị mưa lớn nhanh chóng rửa sạch.`,
        expected: [
            'Thiếu niên nghiến răng, run rẩy, miệng phun ra máu nhưng vẫn sống chết gằn giọng thốt lên hai cái tên này.',
            'Tí tách, tí tách…',
            'Dưới cơn mưa tầm tã, chớp nổ sấm rền, xuất hiện một cơn bão cuồn cuộn tung trời, lao xuống như muốn nuốt chửng mặt đất.',
            'Gió bão thét gào, nước mưa táp xuống đất dữ dội.',
            'Tần Ninh ngẩng đầu, ngước nhìn lên trời cao.',
            '"Ông trời ơi, đến cả ông cũng thấy bất công thay Tần Ninh ta sao?", Tần Ninh thì thào nói, mưa đổ ướt sũng người.',
            '"Ta không phục, Tần Ninh ta sao có thể chết ở chỗ này, sao có thể khuất phục cha con Lăng Thế Thành được!"Tần Ninh cắn răng, gắng sức kéo lê người, để lại sau lưng một vệt máu dài, bị mưa lớn nhanh chóng rửa sạch.'
        ]
    },
    {
        label: 'Test 57',
        input: '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…"Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất. Ầm ầm… Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ. Trêи đường cái, thân thể kia cũng dần lạnh lẽo.Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên. Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. … Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân."Hả?"Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường. Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch."Ta… không chết…"Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu."Không đúng, ta…',
        expected: [
            '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…"Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất.',
            'Ầm ầm…',
            'Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ.',
            'Trêи đường cái, thân thể kia cũng dần lạnh lẽo.',
            'Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên.',
            'Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. …',
            'Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân.',
            '"Hả?"Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường.',
            'Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch.',
            '"Ta… không chết…"Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu."Không đúng, ta…'
        ]
    },
    {
        label: 'Test 58',
        input: '"  "Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết. Rắc rắc… Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời. Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu."Lăng Thế Thành! ""Lăng Thiên!',
        expected: [
            '"  "Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết.',
            'Rắc rắc…',
            'Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời.',
            'Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu.',
            '"Lăng Thế Thành! ""Lăng Thiên!'
        ]
    },
    {
        label: 'Test 59',
        input: '""Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết. Rắc rắc… Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời. Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu."Lăng Thế Thành! ""Lăng Thiên!',
        expected: [
            '""Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết.',
            'Rắc rắc…',
            'Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời.',
            'Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu.',
            '"Lăng Thế Thành! ""Lăng Thiên!'
        ]
    },
    {
        label: 'Test 60',
        input: `“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”“Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta. Từ thời khắc đó, ta hận không thể ăn thịt ngươi, uống máu ngươi! Hôm nay, ta muốn cho ngươi sống không bằng chết!!”....Phương Nguyên mặc một bộ trường bào xanh biếc rách nát, tóc tai bù xù, cả người đẫm máu, ngắm nhìn bốn phía xung quanh.Gió núi thổi tấm áo đẫm máu phất phơ, như chiến kỳ phần phật tung bay.Dòng máu đỏ tươi từ trong mấy trăm vết thương trên người tuôn ra ngoài. Chỉ mới đứng một lúc, dưới chân Phương Nguyên đã tích tụ một vũng máu lớn.Kẻ địch bao vây, hắn đã không còn đường sống.Đại cục đã định, hôm nay hắn chắc chắn phải chết.Phương Nguyên thấy rõ thế cục, nhưng mặc cho cái chết đã đến gần, vẻ mặt hắn vẫn không thay đổi, gương mặt bình thản.Đôi mắt hắn sâu thẳm, vẫn giống như trước kia, giống như một cái giếng cổ sâu không thấy đáy.Quần hùng chính đạo vây công hắn, không phải đường đường là trưởng môn một phái thì cũng là thiếu niên hào kiệt vang danh khắp nơi. Những người bao vây Phương Nguyên lúc này, người thì đang gầm thét, người thì đang cười lạnh, người thì nheo mắt cảnh giác, người thì che vết thương, sợ hãi mà nhìn.Bọn họ không hề động thủ, cũng vì e ngại Phương Nguyên sắp chết phản công.Cứ căng thẳng giằng co như vậy đã qua ba canh giờ. Trời chiều ngả về tây, ánh chiều tà đốt sườn núi, trong chốc lát sườn núi đã rực chói như lửa.Phương Nguyên vẫn yên lặng như tượng, bỗng từ từ xoay người.Quần hùng lập tức xôn xao một trận, đồng loạt lùi về sau một khoảng lớn.Lúc này, núi đá màu xám trắng dưới chân Phương Nguyên đã sớm bị máu tươi nhuộm đỏ thắm. Gương mặt tái nhợt vì mất máu quá nhiều, được ánh nắng chiều chiếu rọi bỗng nhiên trở nên tươi sáng.Nhìn khung cảnh mặt trời khuất núi xanh ở nơi này, Phương Nguyên cười khẽ một tiếng: “Thanh sơn lạc nhật, Thu nguyệt xuân phong. Đương chân thị triều như thanh ty mộ thành tuyết, thị phi thành bại chuyển đầu không.” [Dịch: “Mặt trời lặn sau núi, gió xuân thổi ánh trăng. Quả thật là sáng sớm tóc đen chiều đã trắng, đúng sai thành bại hóa khói mây.” - Tác giả mượn một câu thơ trong bài “Lâm Giang Tiên” - Dương Thận.] Khi nói lời này, trước mắt hắn chợt hiện ra những việc của kiếp trước trên địa cầu.Hắn vốn là học sinh Hoa Hạ trên địa cầu, tình cờ có cơ hội chuyển kiếp đến thế giới này. Nổi trôi nghiêng ngả ba trăm năm, tung hoành thế gian hơn hai trăm năm. Quãng thời gian hơn năm trăm năm dài đằng đẵng, nhưng cũng chỉ trôi qua trong một cái chớp mắt.Rất nhiều ký ức chôn sâu trong đáy lòng vẫn còn vẹn nguyên như thuở đầu, sinh động như thật mà hiện về trước mắt.“Cuối cùng vẫn thất bại sao.” Phương Nguyên cảm thán, có hơi bùi ngùi nhưng lại không hối hận.Kết quả như vậy, hắn sớm đã đoán được, cũng đã chuẩn bị tâm lý khi lựa chọn như vậy.Cái gọi là ma đạo, chính là không tu thiện quả, giết người phóng hoả, trời đất không dung, người đời đều là kẻ địch, thỏa sức tung hoành.“Nếu như Xuân Thu Thiền vừa mới luyện thành có hiệu quả, vậy thì kiếp sau vẫn muốn làm ma!” Nghĩ như vậy, Phương Nguyên không kiềm được cất tiếng cười to.“Lão ma, ngươi cười cái gì?”“Mọi người cẩn thận, ma đầu này chết đến nơi còn muốn phản công!”“Mau giao Xuân Thu Thiền ra đây!!”Quần hùng dồn ép, cùng nhau vọt đến. Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!”Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng. Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.`,
        expected: [
            '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”',
            '“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”',
            '“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”',
            '“Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta. Từ thời khắc đó, ta hận không thể ăn thịt ngươi, uống máu ngươi! Hôm nay, ta muốn cho ngươi sống không bằng chết!!”....',
            'Phương Nguyên mặc một bộ trường bào xanh biếc rách nát, tóc tai bù xù, cả người đẫm máu, ngắm nhìn bốn phía xung quanh.',
            'Gió núi thổi tấm áo đẫm máu phất phơ, như chiến kỳ phần phật tung bay.',
            'Dòng máu đỏ tươi từ trong mấy trăm vết thương trên người tuôn ra ngoài.',
            'Chỉ mới đứng một lúc, dưới chân Phương Nguyên đã tích tụ một vũng máu lớn.',
            'Kẻ địch bao vây, hắn đã không còn đường sống.',
            'Đại cục đã định, hôm nay hắn chắc chắn phải chết.',
            'Phương Nguyên thấy rõ thế cục, nhưng mặc cho cái chết đã đến gần, vẻ mặt hắn vẫn không thay đổi, gương mặt bình thản.',
            'Đôi mắt hắn sâu thẳm, vẫn giống như trước kia, giống như một cái giếng cổ sâu không thấy đáy.',
            'Quần hùng chính đạo vây công hắn, không phải đường đường là trưởng môn một phái thì cũng là thiếu niên hào kiệt vang danh khắp nơi.',
            'Những người bao vây Phương Nguyên lúc này, người thì đang gầm thét, người thì đang cười lạnh, người thì nheo mắt cảnh giác, người thì che vết thương, sợ hãi mà nhìn.',
            'Bọn họ không hề động thủ, cũng vì e ngại Phương Nguyên sắp chết phản công.',
            'Cứ căng thẳng giằng co như vậy đã qua ba canh giờ.',
            'Trời chiều ngả về tây, ánh chiều tà đốt sườn núi, trong chốc lát sườn núi đã rực chói như lửa.',
            'Phương Nguyên vẫn yên lặng như tượng, bỗng từ từ xoay người.',
            'Quần hùng lập tức xôn xao một trận, đồng loạt lùi về sau một khoảng lớn.',
            'Lúc này, núi đá màu xám trắng dưới chân Phương Nguyên đã sớm bị máu tươi nhuộm đỏ thắm.',
            'Gương mặt tái nhợt vì mất máu quá nhiều, được ánh nắng chiều chiếu rọi bỗng nhiên trở nên tươi sáng.',
            'Nhìn khung cảnh mặt trời khuất núi xanh ở nơi này, Phương Nguyên cười khẽ một tiếng: “Thanh sơn lạc nhật, Thu nguyệt xuân phong. Đương chân thị triều như thanh ty mộ thành tuyết, thị phi thành bại chuyển đầu không.” [Dịch: “Mặt trời lặn sau núi, gió xuân thổi ánh trăng. Quả thật là sáng sớm tóc đen chiều đã trắng, đúng sai thành bại hóa khói mây.” - Tác giả mượn một câu thơ trong bài “Lâm Giang Tiên” - Dương Thận.] Khi nói lời này, trước mắt hắn chợt hiện ra những việc của kiếp trước trên địa cầu.',
            'Hắn vốn là học sinh Hoa Hạ trên địa cầu, tình cờ có cơ hội chuyển kiếp đến thế giới này.',
            'Nổi trôi nghiêng ngả ba trăm năm, tung hoành thế gian hơn hai trăm năm.',
            'Quãng thời gian hơn năm trăm năm dài đằng đẵng, nhưng cũng chỉ trôi qua trong một cái chớp mắt.',
            'Rất nhiều ký ức chôn sâu trong đáy lòng vẫn còn vẹn nguyên như thuở đầu, sinh động như thật mà hiện về trước mắt.',
            '“Cuối cùng vẫn thất bại sao.” Phương Nguyên cảm thán, có hơi bùi ngùi nhưng lại không hối hận.',
            'Kết quả như vậy, hắn sớm đã đoán được, cũng đã chuẩn bị tâm lý khi lựa chọn như vậy.',
            'Cái gọi là ma đạo, chính là không tu thiện quả, giết người phóng hoả, trời đất không dung, người đời đều là kẻ địch, thỏa sức tung hoành.',
            '“Nếu như Xuân Thu Thiền vừa mới luyện thành có hiệu quả, vậy thì kiếp sau vẫn muốn làm ma!” Nghĩ như vậy, Phương Nguyên không kiềm được cất tiếng cười to.',
            '“Lão ma, ngươi cười cái gì?”',
            '“Mọi người cẩn thận, ma đầu này chết đến nơi còn muốn phản công!”',
            '“Mau giao Xuân Thu Thiền ra đây!!”Quần hùng dồn ép, cùng nhau vọt đến.',
            'Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....',
            'Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.',
            'Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.',
            'Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.',
            'Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.',
            'Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.',
            'Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.',
            '“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!”Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng.',
            'Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.'
        ]
    },
    {
        label: 'Test 61',
        input: `“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”“Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta. Từ thời khắc đó, ta hận không thể ăn thịt ngươi, uống máu ngươi! Hôm nay, ta muốn cho ngươi sống không bằng chết!!”....Phương Nguyên mặc một bộ trường bào xanh biếc rách nát, tóc tai bù xù, cả người đẫm máu, ngắm nhìn bốn phía xung quanh.Gió núi thổi tấm áo đẫm máu phất phơ, như chiến kỳ phần phật tung bay.Dòng máu đỏ tươi từ trong mấy trăm vết thương trên người tuôn ra ngoài. Chỉ mới đứng một lúc, dưới chân Phương Nguyên đã tích tụ một vũng máu lớn.Kẻ địch bao vây, hắn đã không còn đường sống.Đại cục đã định, hôm nay hắn chắc chắn phải chết.Phương Nguyên thấy rõ thế cục, nhưng mặc cho cái chết đã đến gần, vẻ mặt hắn vẫn không thay đổi, gương mặt bình thản.Đôi mắt hắn sâu thẳm, vẫn giống như trước kia, giống như một cái giếng cổ sâu không thấy đáy.Quần hùng chính đạo vây công hắn, không phải đường đường là trưởng môn một phái thì cũng là thiếu niên hào kiệt vang danh khắp nơi. Những người bao vây Phương Nguyên lúc này, người thì đang gầm thét, người thì đang cười lạnh, người thì nheo mắt cảnh giác, người thì che vết thương, sợ hãi mà nhìn.Bọn họ không hề động thủ, cũng vì e ngại Phương Nguyên sắp chết phản công.Cứ căng thẳng giằng co như vậy đã qua ba canh giờ. Trời chiều ngả về tây, ánh chiều tà đốt sườn núi, trong chốc lát sườn núi đã rực chói như lửa.Phương Nguyên vẫn yên lặng như tượng, bỗng từ từ xoay người.Quần hùng lập tức xôn xao một trận, đồng loạt lùi về sau một khoảng lớn.Lúc này, núi đá màu xám trắng dưới chân Phương Nguyên đã sớm bị máu tươi nhuộm đỏ thắm. Gương mặt tái nhợt vì mất máu quá nhiều, được ánh nắng chiều chiếu rọi bỗng nhiên trở nên tươi sáng.Nhìn khung cảnh mặt trời khuất núi xanh ở nơi này, Phương Nguyên cười khẽ một tiếng: “Thanh sơn lạc nhật, Thu nguyệt xuân phong. Đương chân thị triều như thanh ty mộ thành tuyết, thị phi thành bại chuyển đầu không.”\[Dịch: “Mặt trời lặn sau núi, gió xuân thổi ánh trăng. Quả thật là sáng sớm tóc đen chiều đã trắng, đúng sai thành bại hóa khói mây.” - Tác giả mượn một câu thơ trong bài “Lâm Giang Tiên” - Dương Thận.\]Khi nói lời này, trước mắt hắn chợt hiện ra những việc của kiếp trước trên địa cầu.Hắn vốn là học sinh Hoa Hạ trên địa cầu, tình cờ có cơ hội chuyển kiếp đến thế giới này. Nổi trôi nghiêng ngả ba trăm năm, tung hoành thế gian hơn hai trăm năm. Quãng thời gian hơn năm trăm năm dài đằng đẵng, nhưng cũng chỉ trôi qua trong một cái chớp mắt.Rất nhiều ký ức chôn sâu trong đáy lòng vẫn còn vẹn nguyên như thuở đầu, sinh động như thật mà hiện về trước mắt.“Cuối cùng vẫn thất bại sao.” Phương Nguyên cảm thán, có hơi bùi ngùi nhưng lại không hối hận.Kết quả như vậy, hắn sớm đã đoán được, cũng đã chuẩn bị tâm lý khi lựa chọn như vậy.Cái gọi là ma đạo, chính là không tu thiện quả, giết người phóng hoả, trời đất không dung, người đời đều là kẻ địch, thỏa sức tung hoành.“Nếu như Xuân Thu Thiền vừa mới luyện thành có hiệu quả, vậy thì kiếp sau vẫn muốn làm ma!” Nghĩ như vậy, Phương Nguyên không kiềm được cất tiếng cười to.“Lão ma, ngươi cười cái gì?”“Mọi người cẩn thận, ma đầu này chết đến nơi còn muốn phản công!”“Mau giao Xuân Thu Thiền ra đây!!”Quần hùng dồn ép, cùng nhau vọt đến. Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!”Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng. Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.`,
        expected: [
            '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”',
            '“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”',
            '“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”',
            '“Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta. Từ thời khắc đó, ta hận không thể ăn thịt ngươi, uống máu ngươi! Hôm nay, ta muốn cho ngươi sống không bằng chết!!”....',
            'Phương Nguyên mặc một bộ trường bào xanh biếc rách nát, tóc tai bù xù, cả người đẫm máu, ngắm nhìn bốn phía xung quanh.',
            'Gió núi thổi tấm áo đẫm máu phất phơ, như chiến kỳ phần phật tung bay.',
            'Dòng máu đỏ tươi từ trong mấy trăm vết thương trên người tuôn ra ngoài.',
            'Chỉ mới đứng một lúc, dưới chân Phương Nguyên đã tích tụ một vũng máu lớn.',
            'Kẻ địch bao vây, hắn đã không còn đường sống.',
            'Đại cục đã định, hôm nay hắn chắc chắn phải chết.',
            'Phương Nguyên thấy rõ thế cục, nhưng mặc cho cái chết đã đến gần, vẻ mặt hắn vẫn không thay đổi, gương mặt bình thản.',
            'Đôi mắt hắn sâu thẳm, vẫn giống như trước kia, giống như một cái giếng cổ sâu không thấy đáy.',
            'Quần hùng chính đạo vây công hắn, không phải đường đường là trưởng môn một phái thì cũng là thiếu niên hào kiệt vang danh khắp nơi.',
            'Những người bao vây Phương Nguyên lúc này, người thì đang gầm thét, người thì đang cười lạnh, người thì nheo mắt cảnh giác, người thì che vết thương, sợ hãi mà nhìn.',
            'Bọn họ không hề động thủ, cũng vì e ngại Phương Nguyên sắp chết phản công.',
            'Cứ căng thẳng giằng co như vậy đã qua ba canh giờ.',
            'Trời chiều ngả về tây, ánh chiều tà đốt sườn núi, trong chốc lát sườn núi đã rực chói như lửa.',
            'Phương Nguyên vẫn yên lặng như tượng, bỗng từ từ xoay người.',
            'Quần hùng lập tức xôn xao một trận, đồng loạt lùi về sau một khoảng lớn.',
            'Lúc này, núi đá màu xám trắng dưới chân Phương Nguyên đã sớm bị máu tươi nhuộm đỏ thắm.',
            'Gương mặt tái nhợt vì mất máu quá nhiều, được ánh nắng chiều chiếu rọi bỗng nhiên trở nên tươi sáng.',
            'Nhìn khung cảnh mặt trời khuất núi xanh ở nơi này, Phương Nguyên cười khẽ một tiếng: “Thanh sơn lạc nhật, Thu nguyệt xuân phong. Đương chân thị triều như thanh ty mộ thành tuyết, thị phi thành bại chuyển đầu không.”[Dịch: “Mặt trời lặn sau núi, gió xuân thổi ánh trăng. Quả thật là sáng sớm tóc đen chiều đã trắng, đúng sai thành bại hóa khói mây.” - Tác giả mượn một câu thơ trong bài “Lâm Giang Tiên” - Dương Thận.]Khi nói lời này, trước mắt hắn chợt hiện ra những việc của kiếp trước trên địa cầu.',
            'Hắn vốn là học sinh Hoa Hạ trên địa cầu, tình cờ có cơ hội chuyển kiếp đến thế giới này.',
            'Nổi trôi nghiêng ngả ba trăm năm, tung hoành thế gian hơn hai trăm năm.',
            'Quãng thời gian hơn năm trăm năm dài đằng đẵng, nhưng cũng chỉ trôi qua trong một cái chớp mắt.',
            'Rất nhiều ký ức chôn sâu trong đáy lòng vẫn còn vẹn nguyên như thuở đầu, sinh động như thật mà hiện về trước mắt.',
            '“Cuối cùng vẫn thất bại sao.” Phương Nguyên cảm thán, có hơi bùi ngùi nhưng lại không hối hận.',
            'Kết quả như vậy, hắn sớm đã đoán được, cũng đã chuẩn bị tâm lý khi lựa chọn như vậy.',
            'Cái gọi là ma đạo, chính là không tu thiện quả, giết người phóng hoả, trời đất không dung, người đời đều là kẻ địch, thỏa sức tung hoành.',
            '“Nếu như Xuân Thu Thiền vừa mới luyện thành có hiệu quả, vậy thì kiếp sau vẫn muốn làm ma!” Nghĩ như vậy, Phương Nguyên không kiềm được cất tiếng cười to.',
            '“Lão ma, ngươi cười cái gì?”',
            '“Mọi người cẩn thận, ma đầu này chết đến nơi còn muốn phản công!”',
            '“Mau giao Xuân Thu Thiền ra đây!!”Quần hùng dồn ép, cùng nhau vọt đến.',
            'Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....',
            'Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.',
            'Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.',
            'Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.',
            'Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.',
            'Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.',
            'Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.',
            '“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!”Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng.',
            'Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.'
        ]
    },
    {
        label: 'Test 62',
        input: '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng! ” “Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ! ” “Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ! ”',
        expected: [
            '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng! ”',
            '“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ! ”',
            '“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ! ”'
        ]
    },
    {
        label: 'Test 63',
        input: `"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn..."Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!""Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc.""Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không.""Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?""Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.`,
        expected: [
            '"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn...',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!"',
            '"Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc."',
            '"Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không."',
            '"Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?"',
            '"Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.'
        ]
    },
    {
        label: 'Test 64',
        input: `"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn..."Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!""Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc.""Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không.""Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?""Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót."Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng."Người tiếp theo, Tiêu Mị"Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…"Đấu khí: Bảy đoạn!"`,
        expected: [
            '"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn...',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!"',
            '"Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc."',
            '"Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không."',
            '"Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?"',
            '"Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.',
            'Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót.',
            '"Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng.',
            '"Người tiếp theo, Tiêu Mị"Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…',
            'Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…',
            'Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…',
            'Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…',
            '"Đấu khí: Bảy đoạn!"'
        ]
    },
    {
        label: 'Test 65',
        input: `Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn..."Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!""Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc.""Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không.""Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?""Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót."Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng."Người tiếp theo, Tiêu Mị"Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…"Đấu khí: Bảy đoạn!"`,
        expected: [
            'Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn...',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!"',
            '"Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc."',
            '"Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không."',
            '"Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?"',
            '"Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.',
            'Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót.',
            '"Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng.',
            '"Người tiếp theo, Tiêu Mị"Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…',
            'Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…',
            'Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…',
            'Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…',
            '"Đấu khí: Bảy đoạn!"'
        ]
    }
];

tests.forEach(t => {
    const result = splitIntoSentences(t.input);
    const pass = JSON.stringify(result) === JSON.stringify(t.expected);
    console.log(`${pass ? '✅' : '❌'} ${t.label}`);
    if (!pass) {
        console.log('  Got:     ', result);
        console.log('  Expected:', t.expected);
    }
});