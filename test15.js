const splitIntoSentences = (text) => {
    if (!text || typeof text !== 'string') return [];
    text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

    // --- FIX LỖI THỪA NGOẶC KÉP (VD: "“ hoặc ”") ---
    // Xóa dấu " hoặc ' nếu nó dính sát ngay trước hoặc ngay sau các ngoặc thông minh
    text = text.replace(/["']([“「『”」』])/g, '$1');
    text = text.replace(/([“「『”」』])["']/g, '$1');

    // --- FIX 1: Giới hạn Regex sửa ngoặc để không "nuốt trọn" đoạn dài ---
    text = text.replace(/“([^”"“]*?)"/g, '“$1”');
    text = text.replace(/"([^“"”]*?)”/g, '“$1”');
    // ----------------------------------------------------------------------

    text = text.replace(/(?<=[\p{L}\p{N}.,;:!?…])(["”」』][.,;:!?…]+)([\p{L}\p{N}])/gu, '$1 $2');

    let normalizedText = '';
    let skipNextSpaces = false;
    let justAppendedClosingQuote = false;
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (/\s/.test(ch)) {
            if (skipNextSpaces) continue;
            normalizedText += ch;
            continue;
        }

        skipNextSpaces = false;

        let isOpening = false;
        let isClosing = false;
        let isQuote = false;

        if (['“', '「', '『'].includes(ch)) {
            isOpening = true;
            isQuote = true;
        } else if (['”', '」', '』'].includes(ch)) {
            isClosing = true;
            isQuote = true;
        } else if (ch === '"') {
            isQuote = true;
            let prev = i > 0 ? text[i - 1] : ' ';
            let next = i < text.length - 1 ? text[i + 1] : ' ';

            let isPrevAttached = /[\p{L}\p{N}.,;!?…\]\)]/u.test(prev);
            let isNextWord = /[\p{L}\p{N}]/u.test(next);

            let isMisplacedClosing = false;
            if (inQuote && /\s/.test(prev)) {
                let idx = i - 1;
                while (idx > 0 && /\s/.test(text[idx])) idx--;
                if (/[.!?……]/u.test(text[idx])) {
                    isMisplacedClosing = true;
                }
            }

            if (isMisplacedClosing) {
                isClosing = true;
            } else if (!isPrevAttached && isNextWord) {
                isOpening = true;
            } else if (isPrevAttached && !isNextWord) {
                isClosing = true;
            } else {
                if (inQuote) isClosing = true;
                else isOpening = true;
            }
        }

        if (isQuote) {
            if (isOpening) {
                inQuote = true;
                if (normalizedText.length > 0) {
                    const lastChar = normalizedText[normalizedText.length - 1];
                    if (/[\p{L}\p{N},:;.!?…]/u.test(lastChar) || justAppendedClosingQuote) {
                        normalizedText += ' ';
                    }
                }
                normalizedText += ch;
                skipNextSpaces = true;
                justAppendedClosingQuote = false;
            } else {
                inQuote = false;
                normalizedText = normalizedText.trimEnd();
                normalizedText += ch;
                justAppendedClosingQuote = true;
            }
        } else {
            if (justAppendedClosingQuote && /[\p{L}\p{N}]/u.test(ch)) {
                if (!normalizedText.endsWith(' ')) {
                    normalizedText += ' ';
                }
            }
            normalizedText += ch;
            justAppendedClosingQuote = false;
        }
    }
    text = normalizedText;

    const openQuotes = ['"', '“', '「', '『'];
    const closeQuotes = ['"', '”', '」', '』'];
    const allQuotes = [...openQuotes, ...closeQuotes];

    const abbreviations = [
        'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'St', 'Jr', 'Sr',
        'Rev', 'Lt', 'Capt', 'Col', 'Gen', 'Sgt', 'Cpl', 'Pvt', 'Gov',
        'GS', 'PGS', 'TS', 'ThS', 'BS', 'KS', 'LS', 'Tp', 'TP'
    ];

    const isUpperishStart = (str) =>
        /^["'“「『\-\s\u3164\u200B]*([\p{Lu}\p{N}]|[({\[<][\p{L}\p{N}]+[)}\]>])/u.test(str);
    const isUpperishStartAfterSpace = (str) =>
        /^["'“「『\-]*[\s\u3164\u200B]+["'“「『\-\s\u3164\u200B]*([\p{Lu}\p{N}]|[({\[<][\p{L}\p{N}]+[)}\]>])/u.test(str);
    const isAbbreviation = (buffer) => {
        const trimmed = buffer.trim().replace(/[.!?…]+$/, '');
        const words = trimmed.split(/[\s\.]+/);
        const lastWord = words[words.length - 1];
        return abbreviations.includes(lastWord);
    };
    const countChar = (str, char) => {
        let count = 0;
        for (let i = 0; i < str.length; i++) if (str[i] === char) count++;
        return count;
    };

    const specialPairs = { '“': '”', '「': '」', '『': '』' };
    const unbalanced = {};
    for (const [open, close] of Object.entries(specialPairs)) {
        if (countChar(text, open) !== countChar(text, close)) {
            unbalanced[open] = true;
            unbalanced[close] = true;
        }
    }

    const isParenthesisBalanced = countChar(text, '(') === countChar(text, ')');
    const isSquareBracketBalanced = countChar(text, '[') === countChar(text, ']');

    const splitSegment = (seg) => {
        const results = [];
        let current = '';
        let quoteLevel = 0;
        let parenthesisLevel = 0;
        let squareBracketLevel = 0;
        let hasOuterWords = false;
        let startedWithQuote = false;
        let i = 0;

        const openQuoteIndices = new Set();
        const closeQuoteIndices = new Set();
        const quoteRegex = /"[^"]*[^\s"][^"]*"/g;
        let mMatch;
        while ((mMatch = quoteRegex.exec(seg)) !== null) {
            openQuoteIndices.add(mMatch.index);
            closeQuoteIndices.add(mMatch.index + mMatch[0].length - 1);
        }

        while (i < seg.length) {
            const ch = seg[i];

            if (ch === '(' && isParenthesisBalanced) parenthesisLevel++;
            else if (ch === ')' && isParenthesisBalanced) parenthesisLevel = Math.max(0, parenthesisLevel - 1);
            else if (ch === '[' && isSquareBracketBalanced) squareBracketLevel++;
            else if (ch === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);

            if (allQuotes.includes(ch)) {
                if (current.trim().replace(/^[\-\s]+/, '') === '') startedWithQuote = true;

                if (ch === '"') {
                    if (openQuoteIndices.has(i)) {
                        quoteLevel++;
                    } else if (closeQuoteIndices.has(i)) {
                        quoteLevel = Math.max(0, quoteLevel - 1);
                    }
                }
                else if (openQuotes.includes(ch)) {
                    if (!unbalanced[ch]) quoteLevel++;
                } else if (closeQuotes.includes(ch)) {
                    if (!unbalanced[ch]) quoteLevel = Math.max(0, quoteLevel - 1);
                }

                current += ch;
                i++;
                if (quoteLevel === 0 && !unbalanced[ch]) {
                    const rest = seg.slice(i);
                    const nextNonSpaceMatch = rest.match(/^\s*(.)/);
                    if (nextNonSpaceMatch) {
                        const nextChar = nextNonSpaceMatch[1];
                        const endingPunctMatch = current.trimEnd().match(/([.!?…]+)\s*["”」』]+$/);

                        let canSplitQuote = (!hasOuterWords || startedWithQuote);
                        if (endingPunctMatch && !canSplitQuote && openQuotes.includes(nextChar)) {
                            let reallyOpen = true;
                            if (nextChar === '"') {
                                const nextCharIndex = i + rest.indexOf('"');
                                if (!openQuoteIndices.has(nextCharIndex)) reallyOpen = false;
                            }
                            if (reallyOpen) canSplitQuote = true;
                        }

                        if (endingPunctMatch && canSplitQuote) {
                            const punct = endingPunctMatch[1];
                            const isJustEllipsis = /^(\.{2,}|…+)$/.test(punct);
                            const textInsideQuote = current.replace(/^["'“「『\-\s]+/, '').replace(/["'”」』\s]+$/, '');
                            const hasInternalSentence = /[.!?…]+[\s]+/.test(textInsideQuote);
                            if ((!hasInternalSentence || allQuotes.includes(nextChar)) && !isAbbreviation(current)) {
                                let isAttachedCloseQuote = closeQuotes.includes(rest[0]);
                                if (rest[0] === '"' && openQuoteIndices.has(i)) {
                                    isAttachedCloseQuote = false;
                                }

                                // --- FIX 2: Đổi \p{L} thành \p{Ll} để cho phép bẻ câu nếu chữ dính liền là Chữ Hoa ---
                                const isAttachedWord = /^[\p{Ll}\p{N}]/u.test(rest) || isAttachedCloseQuote;

                                if (!isAttachedWord && ((isUpperishStart(rest) && !isJustEllipsis) || allQuotes.includes(nextChar))) {
                                    let shouldSplit = true;

                                    if (/^["'“「『](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(current.trim())) {
                                        shouldSplit = false;
                                    }

                                    if (shouldSplit && !allQuotes.includes(nextChar)) {
                                        if (/[\p{L}\p{N}]/u.test(nextChar)) {
                                            shouldSplit = false;
                                        } else {
                                            const match = rest.match(/([.,;:!?…，；：])/);
                                            if (match && [',', ';', ':', '，', '；', '：'].includes(match[1])) {
                                                shouldSplit = false;
                                            }
                                        }
                                    }

                                    if (shouldSplit && parenthesisLevel === 0 && squareBracketLevel === 0) {
                                        results.push(current.trim());
                                        current = '';
                                        hasOuterWords = false;
                                        startedWithQuote = false;
                                    }
                                }
                            }
                        }
                    }
                }
                continue;
            }

            if (quoteLevel === 0 && parenthesisLevel === 0 && squareBracketLevel === 0 && /[.!?…]/.test(ch)) {
                if (ch === '.' && i > 0 && i < seg.length - 1) {
                    const prevChar = seg[i - 1];
                    const nextChar = seg[i + 1];
                    if (/\p{N}/u.test(prevChar) && /\p{N}/u.test(nextChar)) {
                        current += ch;
                        i++;
                        continue;
                    }
                }

                let punct = '';
                while (i < seg.length && /[.!?…]/.test(seg[i])) {
                    punct += seg[i];
                    i++;
                }

                const tempCurrent = current + punct;
                if (!isAbbreviation(tempCurrent)) {
                    let trailingQuotes = '';
                    while (i < seg.length) {
                        const nextCh = seg[i];
                        if (nextCh === '"' && openQuoteIndices.has(i)) {
                            break;
                        }
                        if (nextCh === '"' && !closeQuoteIndices.has(i)) {
                            const afterQuote = seg.slice(i + 1);
                            if (/^[\p{L}\p{N}]/u.test(afterQuote)) {
                                break;
                            }
                        }
                        if (/["'”」』]/.test(nextCh)) {
                            trailingQuotes += nextCh;
                            i++;
                        } else {
                            break;
                        }
                    }

                    const fullCurrent = tempCurrent + trailingQuotes;
                    const rest = seg.slice(i);

                    let canSplit = true;
                    if (trailingQuotes.length > 0) {
                        canSplit = (!hasOuterWords || startedWithQuote);
                        const nextNonSpaceMatch = rest.match(/^\s*(.)/);
                        if (!canSplit && nextNonSpaceMatch) {
                            const nextChar = nextNonSpaceMatch[1];
                            if (openQuotes.includes(nextChar)) {
                                let reallyOpen = true;
                                if (nextChar === '"') {
                                    const nextCharIndex = i + rest.indexOf('"');
                                    if (!openQuoteIndices.has(nextCharIndex)) reallyOpen = false;
                                }
                                if (reallyOpen) canSplit = true;
                            }
                        }

                        let isAttachedCloseQuote = closeQuotes.includes(rest[0]);
                        if (rest[0] === '"' && openQuoteIndices.has(i)) {
                            isAttachedCloseQuote = false;
                        }

                        if (/^[\p{L}\p{N}]/u.test(rest) || isAttachedCloseQuote) {
                            canSplit = false;
                        }

                        if (canSplit) {
                            if (nextNonSpaceMatch && !allQuotes.includes(nextNonSpaceMatch[1])) {
                                const match = rest.match(/([.,;:!?…，；：])/);
                                if (match && [',', ';', ':', '，', '；', '：'].includes(match[1])) {
                                    canSplit = false;
                                }
                            }
                        }
                    }

                    if (/^["'“「『](?:\s+|…+|\.+)?[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(fullCurrent.trim())) {
                        canSplit = false;
                    }

                    if (/^["'“「『\-\s.!?…]+$/.test(fullCurrent.trim())) {
                        canSplit = false;
                    }

                    const isUnicodeEllipsisOnly = /^\u2026+$/.test(punct);
                    let upperCheck = false;

                    if (isUnicodeEllipsisOnly) {
                        if (isUpperishStartAfterSpace(rest)) {
                            upperCheck = true;
                        } else if (isUpperishStart(rest)) {
                            if (!current.endsWith(' ')) {
                                upperCheck = true;
                            }
                        }
                    } else {
                        upperCheck = isUpperishStart(rest);
                    }

                    // --- FIX 2: Đổi \p{L} thành \p{Ll} để cho phép bẻ câu nếu chữ dính liền là Chữ Hoa ---
                    if (/^[\p{Ll}\p{N}]/u.test(rest) && !isAttachedCloseQuote) {
                        canSplit = false;
                    }

                    if (canSplit && (rest.trim().length === 0 || upperCheck)) {
                        results.push(fullCurrent.trim());
                        current = '';
                        hasOuterWords = false;
                        startedWithQuote = false;
                        continue;
                    }
                    current = fullCurrent;
                    continue;
                }
                current = tempCurrent;
                continue;
            }

            if (quoteLevel === 0 && parenthesisLevel === 0 && squareBracketLevel === 0 && /[\p{L}\p{N}]/u.test(ch)) hasOuterWords = true;
            current += ch;
            i++;
        }

        if (current.trim()) results.push(current.trim());
        return results;
    };

    // --- ĐOẠN CODE HIỆN TẠI CỦA BẠN (Lấy mảng raw ban đầu) ---
    const rawSentences = splitSegment(text)
        .map(s => s.replace(/^[\s\u3164\u200B]+|[\s\u3164\u200B]+$/g, ''))
        .filter(s => s.replace(/["“”「」『』'.,!?…\-\s\u3164\u200B]/g, '').length > 0);

    // ========================================================
    // --- TẦNG LOOK-BACK TỐI ƯU SỬA LỖI ANOMALY (DÍNH CHỮ) ---
    // ========================================================

    const splitAnomaly = (anomalyText) => {
        let subResults = [];
        let current = '';
        let i = 0;

        let parenthesisLevel = 0;
        let squareBracketLevel = 0;

        // Hàm kiểm tra ký tự viết hoa (hỗ trợ chuẩn cả tiếng Việt có dấu)
        const isUpperish = (ch) => {
            if (!ch) return false;
            return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
        };

        while (i < anomalyText.length) {
            const ch = anomalyText[i];
            current += ch;

            // Theo dõi trạng thái đóng/mở của ngoặc tròn và ngoặc vuông
            if (ch === '(') parenthesisLevel++;
            else if (ch === ')') parenthesisLevel = Math.max(0, parenthesisLevel - 1);
            else if (ch === '[') squareBracketLevel++;
            else if (ch === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);

            // CHIẾN LƯỢC: Chỉ bẻ câu tại dấu chấm đơn '.' để không làm hỏng hội thoại (?/!)
            if (ch === '.') {
                let isEllipsis = false;
                if ((i > 0 && anomalyText[i - 1] === '.') || (i + 1 < anomalyText.length && anomalyText[i + 1] === '.')) {
                    isEllipsis = true;
                }

                if (!isEllipsis) {
                    // Nuốt các dấu ngoặc đóng đi liền sau dấu câu.
                    // Loại bỏ ']' khỏi danh sách nuốt để bảo vệ Test 60, 61.
                    while (i + 1 < anomalyText.length && /[”」』]/.test(anomalyText[i + 1])) {
                        i++;
                        const nextCh = anomalyText[i];
                        current += nextCh;
                        if (nextCh === ')') parenthesisLevel = Math.max(0, parenthesisLevel - 1);
                        else if (nextCh === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);
                    }

                    const rest = anomalyText.slice(i + 1);
                    const trimmedRest = rest.trim();

                    // ĐIỀU KIỆN TIÊN QUYẾT: Đang đứng ngoài cấu trúc ngoặc () và []
                    if (parenthesisLevel === 0 && squareBracketLevel === 0) {
                        let isStartOfNew = false;

                        if (trimmedRest.length > 0) {
                            const firstChar = trimmedRest[0];

                            // TRƯỜNG HỢP 1: Chữ hoa dính sát dấu câu (Không có khoảng trắng)
                            // VD: nóng.Hứa -> Bẻ câu! | phong. Đương -> Có khoảng trắng -> Không bẻ!
                            if (!/^\s/.test(rest) && isUpperish(firstChar)) {
                                isStartOfNew = true;
                            }
                            // TRƯỜNG HỢP 2: Dính ngoặc kép mở + chữ hoa 
                            // (Cho phép có khoảng trắng vì bộ normalizer ở đầu file có thể tự động thêm vào)
                            // VD: mở miệng. "Tại sao?"
                            else if (/^["'“「『]/.test(firstChar) && trimmedRest.length > 1 && isUpperish(trimmedRest[1])) {
                                isStartOfNew = true;
                            }
                        }

                        // Nếu thỏa mãn, tiến hành bẻ gãy khối văn bản
                        if (isStartOfNew) {
                            subResults.push(current.trim());
                            current = '';
                        }
                    }
                }
            }
            i++;
        }

        if (current.trim()) subResults.push(current.trim());
        return subResults;
    };

    // Duyệt qua mảng kết quả thô để tìm kiếm Anomaly
    const finalSentences = [];
    for (const s of rawSentences) {
        // Regex siêu chọn lọc: Chỉ quét các khối văn bản chứa dấu chấm đi kèm chữ viết hoa hoặc ngoặc kép dính chữ
        const hasInternalDotBoundary = /\.["'”」』]*(?:[\p{Lu}]|\s*["'“「『][\p{Lu}])/u.test(s);

        if (s.length > 250 && hasInternalDotBoundary) {
            const fixedSubSentences = splitAnomaly(s);
            finalSentences.push(...fixedSubSentences);
        } else {
            finalSentences.push(s);
        }
    }

    return finalSentences;
};

const tests = [
    { label: 'Test 1', input: 'chúng sinh bị nạn.Sau khi hủy! Trời đất run rẩy? Không ai biết......Đêm khuya.', expected: ['chúng sinh bị nạn.', 'Sau khi hủy!', 'Trời đất run rẩy?', 'Không ai biết......', 'Đêm khuya.'] },
    { label: 'Test 2', input: 'Hắn nhìn nàng', expected: ['Hắn nhìn nàng'] },
    { label: 'Test 3', input: '- Thiên Mệnh, cứu ta! Lý Thiên Mệnh đau đầu.', expected: ['- Thiên Mệnh, cứu ta!', 'Lý Thiên Mệnh đau đầu.'] },
    { label: 'Test 4', input: 'Hắn do dự...... Rồi bước đi.', expected: ['Hắn do dự......', 'Rồi bước đi.'] },
    { label: 'Test 5', input: '"Ngươi là ai?" Hắn hỏi. "Ta không biết!" Nàng đáp.', expected: ['"Ngươi là ai?" Hắn hỏi.', '"Ta không biết!" Nàng đáp.'] },
    {
        label: 'Test 6',
        input: 'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, "Thiên tài" và "Thiên tài 2" này một năm rồi vẫn dậm chân tại chỗ a!"! Abc "Câu tiếp theo" câu tiếp theo của câu thiếu. Abc "Câu tiếp theo!" câu tiếp theo của câu thiếu... Abc "Câu tiếp theo?" câu tiếp theo của câu thiếu. Abc "Câu tiếp theo." câu tiếp theo của câu thiếu? Abc "Câu tiếp theo."',
        expected: [
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động "Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, "Thiên tài" và "Thiên tài 2" này một năm rồi vẫn dậm chân tại chỗ a!"!',
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
        expected: ['"Hello."', '"Bye." He left.']
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
            '"Đinh!" Thoe một tiếng kêu thanh thúy vang lên, Thân thể Tiêu viêm nhất thời bạo thối, ở phía mặt đất hiện ra mười mấy dẫu chân chả Tiêu viêm, sau đó mới từ từ đem kinh khủng kình khí hóa giải.'
        ]
    },
    {
        label: 'Test 46',
        input: `"Muốn gặp nữ vương bệ hạ?"Nghe vậy,Nguyệt Mị đôi mắt đẹp liền ánh lên vẻ xinh đẹp mà đầy nguy hiểm, cười lạnh nói:"Chúng ta cùng loài người các ngươi chém giết nhiều năm, trên tay đều dính đầy máu đối phương, còn có thể có chuyện gì để nói chuyện nữa chứ?Mấy vị nếu thức thời, xin khuyên các ngươi hãy rời đi, nếu không một khi xà nhân bát đại thủ lĩnh tề tụ thì dù có là Gia Mã đế quốc cường giả chỉ sợ cũng gặp khó phải lui thôi."`,
        expected: [
            '"Muốn gặp nữ vương bệ hạ?" Nghe vậy,Nguyệt Mị đôi mắt đẹp liền ánh lên vẻ xinh đẹp mà đầy nguy hiểm, cười lạnh nói: "Chúng ta cùng loài người các ngươi chém giết nhiều năm, trên tay đều dính đầy máu đối phương, còn có thể có chuyện gì để nói chuyện nữa chứ?Mấy vị nếu thức thời, xin khuyên các ngươi hãy rời đi, nếu không một khi xà nhân bát đại thủ lĩnh tề tụ thì dù có là Gia Mã đế quốc cường giả chỉ sợ cũng gặp khó phải lui thôi."'
        ]
    },
    {
        label: 'Test 46',
        input: `"Cũng nhờ phúc của ngươi!Mặc dù độc tố đã được giải bất quá cũng tương đương với tàn phế một cánh tay."Đại hán nhàn nhạt nói, liếc nhìn nhãn đồng của Nguyệt Mị.Trong mắt hắn thoáng hiện 1 nét hàn quang.`,
        expected: [
            '"Cũng nhờ phúc của ngươi!Mặc dù độc tố đã được giải bất quá cũng tương đương với tàn phế một cánh tay." Đại hán nhàn nhạt nói, liếc nhìn nhãn đồng của Nguyệt Mị.',
            'Trong mắt hắn thoáng hiện 1 nét hàn quang.'
        ]
    },
    {
        label: 'Test 47',
        input: `" Bất quá." Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi. Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.`,
        expected: [
            '"Bất quá." Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..',
            'Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi.',
            'Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.'
        ]
    },
    {
        label: 'Test 48',
        input: `" Bất quá. Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..Lần trước chuẩn bị, đã dùng một thời gian, nhìn chỗ chứa nước trong giới chỉ, Tiêu Viêm thở dài một hơi. Ánh mắt đảo qua bản đồ, Cuối cùng dừng lại một cái Ốc đảo gần phía mình nhất.`,
        expected: [
            '"Bất quá. Khi tiến vào sa mạc, Hắn đã tích trữ nguồn nước,..',
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
            '"Ta không phục, Tần Ninh ta sao có thể chết ở chỗ này, sao có thể khuất phục cha con Lăng Thế Thành được!" Tần Ninh cắn răng, gắng sức kéo lê người, để lại sau lưng một vệt máu dài, bị mưa lớn nhanh chóng rửa sạch.'
        ]
    },
    {
        label: 'Test 57',
        input: '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…"Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất. Ầm ầm… Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ. Trêи đường cái, thân thể kia cũng dần lạnh lẽo.Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên. Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. … Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân."Hả?"Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường. Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch."Ta… không chết…"Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu."Không đúng, ta…',
        expected: [
            '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…" Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất.',
            'Ầm ầm…',
            'Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ.',
            'Trêи đường cái, thân thể kia cũng dần lạnh lẽo.',
            'Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên.',
            'Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. …',
            'Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân.',
            '"Hả?" Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường.',
            'Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch.',
            '"Ta… không chết…" Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu.',
            '"Không đúng, ta…'
        ]
    },
    {
        label: 'Test 58',
        input: '"  "Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết. Rắc rắc… Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời. Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu."Lăng Thế Thành! "Lăng Thiên!',
        expected: [
            '""Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…" Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết.',
            'Rắc rắc…',
            'Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời.',
            'Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu.',
            '"Lăng Thế Thành!" Lăng Thiên!'
        ]
    },
    {
        label: 'Test 59',
        input: '""Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…"Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết. Rắc rắc… Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời. Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu."Lăng Thế Thành! ""Lăng Thiên!',
        expected: [
            '""Chắc là tới ngày mai, tin tức này sẽ lan truyền khắp nơi, đến lúc đó cứ đợi chuyện cười là được rồi, ha ha…" Lúc này, hai tên hộ vệ không kiêng nể gì mà bàn luận, chẳng hề để ý tới thiếu niên đang chảy máu đầm đìa trêи mặt đất kia là sống hay đã chết.',
            'Rắc rắc…',
            'Tiếng sấm cuồn cuộn, chớp nổ kinh hoàng, gió giật bão cuốn đám lá rụng tung bay khắp đất trời.',
            'Giờ phút này, thiếu niên đã nằm rạp trêи mặt đất, khuôn mặt trắng trẻo, sạch sẽ đã ướt đẫm máu tươi, thân thể run rẩy không ngừng, chỗ nào cũng đang chảy máu.',
            '"Lăng Thế Thành!"',
            '"Lăng Thiên!'
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
            '“Mau giao Xuân Thu Thiền ra đây!!” Quần hùng dồn ép, cùng nhau vọt đến.',
            'Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....',
            'Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.',
            'Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.',
            'Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.',
            'Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.',
            'Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.',
            'Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.',
            '“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!” Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng.',
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
            '“Mau giao Xuân Thu Thiền ra đây!!” Quần hùng dồn ép, cùng nhau vọt đến.',
            'Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....',
            'Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.',
            'Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.',
            'Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.',
            'Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.',
            'Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.',
            'Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.',
            '“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!” Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng.',
            'Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.'
        ]
    },
    {
        label: 'Test 62',
        input: '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng! ” “Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ! ” “Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ! ”',
        expected: [
            '“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”',
            '“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”',
            '“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”'
        ]
    },
    {
        label: 'Test 63',
        input: `"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn..."Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!""Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc.""Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không.""Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?""Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.`,
        expected: [
            '"Đấu lực, ba đoạn" Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn...',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động "Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta," "Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!"',
            '"Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc."',
            '"Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không."',
            '"Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?"',
            '"Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…" Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.'
        ]
    },
    {
        label: 'Test 64',
        input: `"Đấu lực, ba đoạn"Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn..."Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động"Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta, ""Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!""Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc.""Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không.""Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?""Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…"Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót."Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng."Người tiếp theo, Tiêu Mị"Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…"Đấu khí: Bảy đoạn!"`,
        expected: [
            '"Đấu lực, ba đoạn" Nhìn năm chữ to lớn có chút chói mắt trên trắc nghiệm ma thạch, thiếu niên mặt không chút thay đổi, thần sắc tự giễu, nắm chặt tay, bởi vì dùng lực quá mạnh làm móng tay đâm thật sâu vào trong lòng bàn tay, mang đến từng trận trận đau đớn trong tâm hồn...',
            '"Tiêu Viêm, đấu lực, ba đoạn! Cấp bậc: Cấp thấp!".',
            'Bên cạnh trắc nghiệm ma thạch, một vị trung niên nam tử, thoáng nhìn tin tức trên bia, ngữ khí hờ hững công bố…',
            'Trung niên nam tử vừa nói xong, không có gì ngoài ý muốn, đám người trên quảng trường lại nổi lên trận trận châm chọc tao động "Ba đoạn? Hắc hắc, quả nhiên không ngoài dự đoán của ta," "Thiên tài" này một năm rồi vẫn dậm chân tại chỗ a!"',
            '"Ai, phế vật này thật sự làm mất hết cả mặt mũi gia tộc."',
            '"Nếu tộc trưởng không phải phụ thân của hắn. Loại phế vật này sớm đã bị đuổi khỏi gia tộc, tự sinh tự diệt rồi, làm gì còn có cơ hội ở gia tộc ăn không uống không."',
            '"Ai..., thiên tài thiếu niên năm đó của Văn Ô Thản thành, tại sao hôm nay lại lạc phách thành bộ dáng này cơ chứ?"',
            '"Ai mà biết được? Có lẽ do làm việc gì đó trái với lương tâm, làm thần linh nổi giận đó mà…" Chung quanh truyền đến cười nhạo cùng thanh âm tiếc hận, dừng ở trong tai của thiếu niên, tựa như một chiếc dao nhọn hung hăng đâm vào tim hắn, khiến hô hấp của thiếu niên trở nên có chút dồn dập.',
            'Thiếu niên chậm rãi ngẩng đầu, lộ ra khuôn mặt thanh tú non nớt, con ngươi đen nhánh nhẹ nhàng đảo qua đám bạn cùng lứa tuổi đang trào phúng chung quanh, khóe miệng thiếu niên tự giễu, tựa hồ trở nên càng thêm chua xót.',
            '"Những người này, đều thừa hơi như vậy sao? Có lẽ vì ba năm trước bọn họ từng trước mặt mình lộ ra bộ mặt tươi cười nhún nhường, cho nên hiện tại muốn đòi trở về đây mà…" Mỉm cười chua xót, Tiêu Viêm chán nản xoay người, im lặng đi tới cuối hàng, thân ảnh cô đơn cùng thế giới xung quanh trở nên có chút lạc lõng.',
            '"Người tiếp theo, Tiêu Mị" Nghe người tiến hành trắc nghiệm gọi tên, một thiếu nữ rất nhanh từ trong đám người đi ra, tiếng nghị luận ở xung quanh trở nên nhỏ đi rất nhiều, từng đạo ánh mắt nóng bỏng tập trung lên trên khuôn mặt của thiếu nữ…',
            'Thiếu nữ tuổi không quá mười bốn, dù chưa thể coi là tuyệt sắc, nhưng khuôn mặt non nớt kia cũng ẩn chứa trong đó một tia vũ mị nhàn nhạt, thanh thuần cùng vũ mị, một tập hợp mâu thuẫn, càng khiến nàng trở thành tiêu điểm của toàn trường…',
            'Thiếu nữ nhanh chóng đi lên, tay vuốt ve ma thạch bi quen thuộc, sau đó chậm rãi nhắm mắt…',
            'Tại lúc thiếu nữ nhắm mắt, ma thạch bi đen nhánh lại hiện lên quang mang…',
            '"Đấu khí: Bảy đoạn!"'
        ]
    },
    {
        label: 'Test 65',
        input: `Tiếng mưa phùn đập vào trên cửa sổ vang bên tai, hắn từ từ nhắm mắt lại, sau một lúc lâu mới mở ra, thở dài một hơi: “Trải qua năm trăm năm, tưởng chừng là giấc mộng.”Nhưng hắn lại biết rõ, đây tuyệt đối không phải là giấc mộng.ㅤ(1) [Loại Giáp: loại A, hạng nhất.](2) [Loại Ất: loại B, kém hơn loại Giáp 1 bậc.](3) [Thiền: ve sầu | Xuân Thu: thời gian (Đôi khi Xuân Thu được dùng để chỉ thời gian).]`,
        expected: [
            'Tiếng mưa phùn đập vào trên cửa sổ vang bên tai, hắn từ từ nhắm mắt lại, sau một lúc lâu mới mở ra, thở dài một hơi: “Trải qua năm trăm năm, tưởng chừng là giấc mộng.” Nhưng hắn lại biết rõ, đây tuyệt đối không phải là giấc mộng.',
            '(1) [Loại Giáp: loại A, hạng nhất.](2) [Loại Ất: loại B, kém hơn loại Giáp 1 bậc.](3) [Thiền: ve sầu | Xuân Thu: thời gian (Đôi khi Xuân Thu được dùng để chỉ thời gian).]'
        ]
    },
    {
        label: 'Test 66',
        input: `Tiếng mưa phùn đập vào trên cửa sổ vang bên tai, hắn từ từ nhắm mắt lại, sau một lúc lâu mới mở ra, thở dài một hơi: “Trải qua năm trăm năm, tưởng chừng là giấc mộng.”Nhưng hắn lại biết rõ, đây tuyệt đối không phải là giấc mộng. (1) [Loại Giáp: loại A, hạng nhất.](2) [Loại Ất: loại B, kém hơn loại Giáp 1 bậc.](3) [Thiền: ve sầu | Xuân Thu: thời gian (Đôi khi Xuân Thu được dùng để chỉ thời gian).]`,
        expected: [
            'Tiếng mưa phùn đập vào trên cửa sổ vang bên tai, hắn từ từ nhắm mắt lại, sau một lúc lâu mới mở ra, thở dài một hơi: “Trải qua năm trăm năm, tưởng chừng là giấc mộng.” Nhưng hắn lại biết rõ, đây tuyệt đối không phải là giấc mộng.',
            '(1) [Loại Giáp: loại A, hạng nhất.](2) [Loại Ất: loại B, kém hơn loại Giáp 1 bậc.](3) [Thiền: ve sầu | Xuân Thu: thời gian (Đôi khi Xuân Thu được dùng để chỉ thời gian).]'
        ]
    },
    {
        label: 'Test 67',
        input: `Trong nháy mắt, xung quanh yên tĩnh, vô số ánh mắt nhìn về phía hắn.“Thực sự là càng ngày càng đặc sắc.” Phương Nguyên cười cười trong lòng. Dưới ánh mắt mọi người, hắn đi qua sông, bước lên bờ bên kia.Ngay lập tức, hắn cảm nhận được áp lực.Áp lực này đến từ linh tuyền ở sâu trong biển hoa. Linh tuyền sản sinh ra nguyên khí, nguyên khí quá đậm đặc, dư thừa thì sẽ mang đến áp lực.Thế nhưng, rất nhanh, từ khóm hoa bên chân Phương Nguyên, một chùm điểm sáng bay lên.Điểm sáng trôi nổi, bao phủ toàn thân Phương Nguyên, cuối cùng tất cả đi vào trong cơ thể hắn.“Đây là Hy Vọng cổ.” Phương Nguyên lẩm nhẩm trong lòng.`,
        expected: [
            'Trong nháy mắt, xung quanh yên tĩnh, vô số ánh mắt nhìn về phía hắn.',
            '“Thực sự là càng ngày càng đặc sắc.” Phương Nguyên cười cười trong lòng.',
            'Dưới ánh mắt mọi người, hắn đi qua sông, bước lên bờ bên kia.',
            'Ngay lập tức, hắn cảm nhận được áp lực.',
            'Áp lực này đến từ linh tuyền ở sâu trong biển hoa.',
            'Linh tuyền sản sinh ra nguyên khí, nguyên khí quá đậm đặc, dư thừa thì sẽ mang đến áp lực.',
            'Thế nhưng, rất nhanh, từ khóm hoa bên chân Phương Nguyên, một chùm điểm sáng bay lên.',
            'Điểm sáng trôi nổi, bao phủ toàn thân Phương Nguyên, cuối cùng tất cả đi vào trong cơ thể hắn.',
            '“Đây là Hy Vọng cổ.” Phương Nguyên lẩm nhẩm trong lòng.'
        ]
    },
    {
        label: 'Test 68',
        input: `(1)Một thạch gạo = 59.2kg gạo. 192.168.1.1.`,
        expected: [
            '(1)Một thạch gạo = 59.2kg gạo.',
            '192.168.1.1.'
        ]
    },
    {
        label: 'Test 69',
        input: `(1) [Chuẩn vàng: lấy vàng làm chuẩn để tính giá trị các vật khác. Tương tự, chuẩn nguyên thạch nghĩa là lấy nguyên thạch làm chuẩn.](2) [Một trời một vực: khác nhau quá xa, quá rõ rệt và ai nhìn vào cũng nhận thấy được.]`,
        expected: [
            `(1) [Chuẩn vàng: lấy vàng làm chuẩn để tính giá trị các vật khác. Tương tự, chuẩn nguyên thạch nghĩa là lấy nguyên thạch làm chuẩn.](2) [Một trời một vực: khác nhau quá xa, quá rõ rệt và ai nhìn vào cũng nhận thấy được.]`,
        ]
    },
    {
        label: 'Test 70',
        input: `(1) (Chuẩn vàng: lấy vàng làm chuẩn để tính giá trị các vật khác. Tương tự, chuẩn nguyên thạch nghĩa là lấy nguyên thạch làm chuẩn.)(2) [Một trời một vực: khác nhau quá xa, quá rõ rệt và ai nhìn vào cũng nhận thấy được.]`,
        expected: [
            `(1) (Chuẩn vàng: lấy vàng làm chuẩn để tính giá trị các vật khác. Tương tự, chuẩn nguyên thạch nghĩa là lấy nguyên thạch làm chuẩn.)(2) [Một trời một vực: khác nhau quá xa, quá rõ rệt và ai nhìn vào cũng nhận thấy được.]`,
        ]
    },
    {
        label: 'Test 71',
        input: `Lôi Đội xoay ngươi lại, đi về phía lều."Ngươi thích ăn gì?" "“Ta?” Lôi Đội đứng bên cạnh lều trại suy nghĩ một chút."Rắn đi, thứ kia có hương vị không tệ.” Nói xong, hắn đi vào lều trại.Hứa Thanh cầm túi ngủ, nhìn về phía lều trại Lôi Đội hồi lâu, nặng nề gật gật đầu, chui vào trong túi ngủ nhắm mắt lại.Nhưng hắn không lập tức ngủ, mà nhắm mắt yên lặng vận chuyển Hải Sơn Quyết, điều này đã trở thành thói quen của hắn.Mặc dù lúc tu hành băng hàn vô cùng, nhưng hắn vân không từ bỏ, nắm chặt hết thảy thời gian cố gắng tu luyện.Nhất là hôm nay Lôi Đội nói trước mười lăm tuổi Trúc Cơ, mặc dù hắn không thể so sánh với thiên kiêu trong lời kia, nhưng đáy lòng vẫn có một chút ý tưởng."Ta năm nay mười bốn..." Hứa Thanh lẩm bẩm, tiếp tục tu luyện.Cứ như vậy, thời gian dần dần trôi qua, rất nhanh năm ngày trôi qua.Hứa Thanh đi theo những Thập Hoang giả này, vượt qua núi non, đi qua thảo nguyên.Trên đường có ba người nửa đường rời đi, điều này cũng chứng minh lời phán đoán lúc trước của Hứa Thanh, nhóm người bọn họ, là tổ hợp tạm thời ở cùng một chỗ.Cho đến ngày thứ bảy, hai Thập Hoang giả cầm đao cũng rời đi, chỉ còn lại hai người Hứa Thanh cùng Lôi Đội.Đêm hôm đó, dưới một ngọn núi, bên cạnh lửa trại, lão giả Lôi Đội nhìn Hứa Thanh đang ăn bánh bao, còn cẩn thận thu lại một nửa, chậm rãi mở miệng."Tiểu hài tử, trưa mai, chúng ta có thể đến đích, đó là nơi ta sinh sống, là một doanh trại nơi Thập Hoang giả tụ tập.” Hứa Thanh ngẩng đầu, nhìn về phía lão giả.Lão giả nhìn xa xa, tiếp tục mở miệng."Doanh địa của Thập Hoang giả, thường thường đều được thành lập bên cạnh cấm khu, cho nên bên ngoài doanh trại ở bên kia núi, cũng là một cấm khu.`,
        expected: [
            'Lôi Đội xoay ngươi lại, đi về phía lều.',
            '"Ngươi thích ăn gì?"',
            '“Ta?” Lôi Đội đứng bên cạnh lều trại suy nghĩ một chút.',
            '“Rắn đi, thứ kia có hương vị không tệ.” Nói xong, hắn đi vào lều trại.',
            'Hứa Thanh cầm túi ngủ, nhìn về phía lều trại Lôi Đội hồi lâu, nặng nề gật gật đầu, chui vào trong túi ngủ nhắm mắt lại.',
            'Nhưng hắn không lập tức ngủ, mà nhắm mắt yên lặng vận chuyển Hải Sơn Quyết, điều này đã trở thành thói quen của hắn.',
            'Mặc dù lúc tu hành băng hàn vô cùng, nhưng hắn vân không từ bỏ, nắm chặt hết thảy thời gian cố gắng tu luyện.',
            'Nhất là hôm nay Lôi Đội nói trước mười lăm tuổi Trúc Cơ, mặc dù hắn không thể so sánh với thiên kiêu trong lời kia, nhưng đáy lòng vẫn có một chút ý tưởng.',
            '"Ta năm nay mười bốn..." Hứa Thanh lẩm bẩm, tiếp tục tu luyện.',
            'Cứ như vậy, thời gian dần dần trôi qua, rất nhanh năm ngày trôi qua.',
            'Hứa Thanh đi theo những Thập Hoang giả này, vượt qua núi non, đi qua thảo nguyên.',
            'Trên đường có ba người nửa đường rời đi, điều này cũng chứng minh lời phán đoán lúc trước của Hứa Thanh, nhóm người bọn họ, là tổ hợp tạm thời ở cùng một chỗ.',
            'Cho đến ngày thứ bảy, hai Thập Hoang giả cầm đao cũng rời đi, chỉ còn lại hai người Hứa Thanh cùng Lôi Đội.',
            'Đêm hôm đó, dưới một ngọn núi, bên cạnh lửa trại, lão giả Lôi Đội nhìn Hứa Thanh đang ăn bánh bao, còn cẩn thận thu lại một nửa, chậm rãi mở miệng.',
            '“Tiểu hài tử, trưa mai, chúng ta có thể đến đích, đó là nơi ta sinh sống, là một doanh trại nơi Thập Hoang giả tụ tập.” Hứa Thanh ngẩng đầu, nhìn về phía lão giả.',
            'Lão giả nhìn xa xa, tiếp tục mở miệng.',
            '"Doanh địa của Thập Hoang giả, thường thường đều được thành lập bên cạnh cấm khu, cho nên bên ngoài doanh trại ở bên kia núi, cũng là một cấm khu.'
        ]
    },
    {
        label: 'Test 72',
        input: `"Bánh bao có ba cái, cầm trong tay rất nóng.Hứa Thanh do dự một chút, thấy mọi người bên cạnh đống lửa cũng đang ăn bánh bao giống nhau, vì thế đầu tiên là giả vờ ăn một miếng, quan sát những Thập Hoang giả kia, một lúc lâu sau phát hiện bọn họ vẫn như thường, hắn nhịn thật lâu, mới thật sự ăn một ngụm nhỏ, ngậm trong miệng chờ một lát.Xác định không có gì đáng ngại, lúc này mới chậm rãi nhai cho đến khi vỡ vụn, chậm rãi nuốt xuống.Lại đợi hồi lâu, sau khi lần thứ hai xác định không có gì đáng ngại, đáy lòng hắn thở phào nhẹ nhõm, rốt cuộc nhịn không được, cắn ăn từng ngụm. Tiếp theo hắn chần chờ một chút, lại từng ngụm từng ngụm nhỏ đem cái thứ hai cũng ăn xuống.Mặc dù bụng vẫn còn đói, nhưng hắn vẫn bọc lại cái bánh bao cuối cùng, cẩn thận đặt vào trong túi da của mình, giống như đặt kho báu.Rất nhanh sắc trời càng tối, Thập Hoang giả cũng lục tục trở lại trong lều trại, Lôi Đội giống như hôm qua, đem túi ngủ kia đưa cho hắn, trước khi đi nói một câu."Tặng ngươi.” Hứa Thanh ngẩng đầu, nhìn Lôi Đội, bỗng nhiên mở miệng."Tại sao?" "Tại sao cái gì mà tại sao? Ba cái bánh bao, một cái túi ngủ sao...!Không có tại sao, nếu ngươi có tâm, sau này cũng cho ta chút thức ăn là được.`,
        expected: [
            '"Bánh bao có ba cái, cầm trong tay rất nóng.',
            'Hứa Thanh do dự một chút, thấy mọi người bên cạnh đống lửa cũng đang ăn bánh bao giống nhau, vì thế đầu tiên là giả vờ ăn một miếng, quan sát những Thập Hoang giả kia, một lúc lâu sau phát hiện bọn họ vẫn như thường, hắn nhịn thật lâu, mới thật sự ăn một ngụm nhỏ, ngậm trong miệng chờ một lát.',
            'Xác định không có gì đáng ngại, lúc này mới chậm rãi nhai cho đến khi vỡ vụn, chậm rãi nuốt xuống.',
            'Lại đợi hồi lâu, sau khi lần thứ hai xác định không có gì đáng ngại, đáy lòng hắn thở phào nhẹ nhõm, rốt cuộc nhịn không được, cắn ăn từng ngụm.',
            'Tiếp theo hắn chần chờ một chút, lại từng ngụm từng ngụm nhỏ đem cái thứ hai cũng ăn xuống.',
            'Mặc dù bụng vẫn còn đói, nhưng hắn vẫn bọc lại cái bánh bao cuối cùng, cẩn thận đặt vào trong túi da của mình, giống như đặt kho báu.',
            'Rất nhanh sắc trời càng tối, Thập Hoang giả cũng lục tục trở lại trong lều trại, Lôi Đội giống như hôm qua, đem túi ngủ kia đưa cho hắn, trước khi đi nói một câu.',
            '“Tặng ngươi.” Hứa Thanh ngẩng đầu, nhìn Lôi Đội, bỗng nhiên mở miệng.',
            '"Tại sao?"',
            '"Tại sao cái gì mà tại sao?',
            'Ba cái bánh bao, một cái túi ngủ sao...!',
            'Không có tại sao, nếu ngươi có tâm, sau này cũng cho ta chút thức ăn là được.'
        ]
    },

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