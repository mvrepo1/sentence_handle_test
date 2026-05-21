import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';


// ── Bước 1: Extract content ───────────────────────────────────────────
export function extractContent(html) {
  const $ = cheerio.load(html);
  const contentNode = $('#chapter-c');

  if (!contentNode.length) return null;

  contentNode.find('div, script, style, ins, a, iframe').remove();
  contentNode.find('br').replaceWith('\n');
  contentNode.find('p').each((_, el) => { $(el).after('\n\n'); });

  const rawText = contentNode.text();

  return rawText
    .replace(/"{2,}/g, '"')       // clean " rác từ <em> lồng nhau
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const splitIntoSentences = (text) => {
  if (!text || typeof text !== 'string') return [];
  text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

  // --- FIX LỖI THỪA NGOẶC KÉP (VD: "“ hoặc ”") ---
  text = text.replace(/["']([“「『”」』])/g, '$1');
  text = text.replace(/([“「『”」』])["']/g, '$1');

  // --- GIỚI HẠN REGEX SỬA NGOẶC ---
  text = text.replace(/“([^”"“\r\n]*?)"/g, '“$1”');
  text = text.replace(/"([^“"”\r\n]*?)”/g, '“$1”');
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

  const isParenthesisBalanced = (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length;
  const isSquareBracketBalanced = (text.match(/\[/g) || []).length === (text.match(/\]/g) || []).length;

  const splitSegment = (seg) => {
    const results = [];
    let current = '';
    let quoteLevel = 0;
    let parenthesisLevel = 0;
    let squareBracketLevel = 0;
    let hasOuterWords = false;
    let startedWithQuote = false;
    let i = 0;

    // =======================================================
    // --- FIX 5: BẮT CẶP NGOẶC CHUẨN XÁC BẰNG INDEX (STACK)
    // =======================================================
    const pairedOpenIndices = new Set();
    const pairedCloseIndices = new Set();

    // Ngoặc thông minh (Stack-based)
    const distinctPairs = { '“': '”', '「': '」', '『': '』' };
    for (const [open, close] of Object.entries(distinctPairs)) {
      const stack = [];
      for (let j = 0; j < seg.length; j++) {
        if (seg[j] === open) {
          stack.push(j);
        } else if (seg[j] === close) {
          if (stack.length > 0) {
            const openIdx = stack.pop();
            // Chống bắt cặp xuyên dòng để bảo vệ an toàn
            let hasNewline = false;
            for (let k = openIdx; k < j; k++) {
              if (seg[k] === '\n' || seg[k] === '\r') {
                hasNewline = true;
                break;
              }
            }
            if (!hasNewline) {
              pairedOpenIndices.add(openIdx);
              pairedCloseIndices.add(j);
            } else {
              stack.length = 0; // Hủy bắt cặp nếu chứa \n
            }
          }
        }
      }
    }

    // Ngoặc thường (Regex-based)
    const straightQuoteRegex = /"[^"\r\n]*[^\s"\r\n][^"\r\n]*"/g;
    let mMatch;
    while ((mMatch = straightQuoteRegex.exec(seg)) !== null) {
      pairedOpenIndices.add(mMatch.index);
      pairedCloseIndices.add(mMatch.index + mMatch[0].length - 1);
    }

    // =======================================================

    while (i < seg.length) {
      const ch = seg[i];

      if (ch === '(' && isParenthesisBalanced) parenthesisLevel++;
      else if (ch === ')' && isParenthesisBalanced) parenthesisLevel = Math.max(0, parenthesisLevel - 1);
      else if (ch === '[' && isSquareBracketBalanced) squareBracketLevel++;
      else if (ch === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);

      if (allQuotes.includes(ch)) {
        if (current.trim().replace(/^[\-\s]+/, '') === '') startedWithQuote = true;

        const isPairedOpen = pairedOpenIndices.has(i);
        const isPairedClose = pairedCloseIndices.has(i);

        if (isPairedOpen) {
          quoteLevel++;
        } else if (isPairedClose) {
          quoteLevel = Math.max(0, quoteLevel - 1);
        }

        current += ch;
        i++;

        if (quoteLevel === 0 && isPairedClose) {
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
                if (!pairedOpenIndices.has(nextCharIndex)) reallyOpen = false;
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
                if (rest[0] === '"' && pairedOpenIndices.has(i)) {
                  isAttachedCloseQuote = false;
                }

                const isAttachedWord = /^[\p{Ll}\p{N}]/u.test(rest) || isAttachedCloseQuote;

                if (!isAttachedWord && ((isUpperishStart(rest) && !isJustEllipsis) || allQuotes.includes(nextChar))) {
                  let shouldSplit = true;
                  const hasNewline = /^\s*[\r\n]/.test(rest);

                  if (/^["'“「『](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(current.trim())) {
                    shouldSplit = false;
                  }

                  if (shouldSplit && !allQuotes.includes(nextChar)) {
                    if (hasNewline) {
                      shouldSplit = true;
                    } else if (/[\p{L}\p{N}]/u.test(nextChar)) {
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
            if (nextCh === '"' && pairedOpenIndices.has(i)) break;
            if (nextCh === '"' && !pairedCloseIndices.has(i)) {
              const afterQuote = seg.slice(i + 1);
              if (/^[\p{L}\p{N}]/u.test(afterQuote)) break;
            }
            if (/["'”」』]/.test(nextCh)) {
              trailingQuotes += nextCh;
              i++;
            } else break;
          }

          const fullCurrent = tempCurrent + trailingQuotes;
          const rest = seg.slice(i);
          let canSplit = true;
          const hasNewline = /^\s*[\r\n]/.test(rest);

          if (trailingQuotes.length > 0) {
            canSplit = (!hasOuterWords || startedWithQuote);
            const nextNonSpaceMatch = rest.match(/^\s*(.)/);
            if (!canSplit && nextNonSpaceMatch) {
              const nextChar = nextNonSpaceMatch[1];
              if (openQuotes.includes(nextChar)) {
                let reallyOpen = true;
                if (nextChar === '"') {
                  const nextCharIndex = i + rest.indexOf('"');
                  if (!pairedOpenIndices.has(nextCharIndex)) reallyOpen = false;
                }
                if (reallyOpen) canSplit = true;
              }
            }

            let isAttachedCloseQuote = closeQuotes.includes(rest[0]);
            if (rest[0] === '"' && pairedOpenIndices.has(i)) {
              isAttachedCloseQuote = false;
            }

            if (/^[\p{L}\p{N}]/u.test(rest) || isAttachedCloseQuote) canSplit = false;

            if (canSplit) {
              if (hasNewline) {
                canSplit = true;
              } else if (nextNonSpaceMatch && !allQuotes.includes(nextNonSpaceMatch[1])) {
                const match = rest.match(/([.,;:!?…，；：])/);
                if (match && [',', ';', ':', '，', '；', '：'].includes(match[1])) {
                  canSplit = false;
                }
              }
            }
          }

          if (/^["'“「『](?:\s+|…+|\.+)?[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(fullCurrent.trim())) canSplit = false;
          if (/^["'“「『\-\s.!?…]+$/.test(fullCurrent.trim())) canSplit = false;

          const isUnicodeEllipsisOnly = /^\u2026+$/.test(punct);
          let upperCheck = false;

          if (isUnicodeEllipsisOnly) {
            if (isUpperishStartAfterSpace(rest)) upperCheck = true;
            else if (isUpperishStart(rest)) {
              if (!current.endsWith(' ')) upperCheck = true;
            }
          } else upperCheck = isUpperishStart(rest);

          if (/^[\p{Ll}\p{N}]/u.test(rest) && !isAttachedCloseQuote) canSplit = false;

          if (canSplit && (rest.trim().length === 0 || upperCheck || hasNewline)) {
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

  const rawSentences = splitSegment(text)
    .map(s => s.replace(/^[\s\u3164\u200B]+|[\s\u3164\u200B]+$/g, ''))
    .filter(s => s.replace(/["“”「」『』'.,!?…\-\s\u3164\u200B]/g, '').length > 0);

  const splitAnomaly = (anomalyText) => {
    let subResults = [];
    let current = '';
    let i = 0;

    let parenthesisLevel = 0;
    let squareBracketLevel = 0;

    const isUpperish = (ch) => {
      if (!ch) return false;
      return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
    };

    while (i < anomalyText.length) {
      const ch = anomalyText[i];
      current += ch;

      if (ch === '(') parenthesisLevel++;
      else if (ch === ')') parenthesisLevel = Math.max(0, parenthesisLevel - 1);
      else if (ch === '[') squareBracketLevel++;
      else if (ch === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);

      if (ch === '.') {
        let isEllipsis = false;
        if ((i > 0 && anomalyText[i - 1] === '.') || (i + 1 < anomalyText.length && anomalyText[i + 1] === '.')) {
          isEllipsis = true;
        }

        if (!isEllipsis) {
          while (i + 1 < anomalyText.length && /["'”」』]/.test(anomalyText[i + 1])) {
            i++;
            const nextCh = anomalyText[i];
            current += nextCh;
            if (nextCh === ')') parenthesisLevel = Math.max(0, parenthesisLevel - 1);
            else if (nextCh === ']') squareBracketLevel = Math.max(0, squareBracketLevel - 1);
          }

          const rest = anomalyText.slice(i + 1);
          const trimmedRest = rest.trim();

          if (parenthesisLevel === 0 && squareBracketLevel === 0) {
            let isStartOfNew = false;

            if (trimmedRest.length > 0 && !isAbbreviation(current)) {
              const firstChar = trimmedRest[0];

              if (isUpperish(firstChar)) {
                const endsWithQuote = /["'”」』]$/.test(current.trim());
                if (endsWithQuote) {
                  if (/^\s*[\r\n]/.test(rest) || /^["'“「『]/.test(firstChar)) {
                    isStartOfNew = true;
                  }
                } else {
                  isStartOfNew = true;
                }
              }
              else if (/^["'“「『]/.test(firstChar) && trimmedRest.length > 1 && isUpperish(trimmedRest[1])) {
                isStartOfNew = true;
              }
            }

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

  const finalSentences = [];
  for (const s of rawSentences) {
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

const verifySentencesPattern = (originalParagraph, sentences) => {
  if (!sentences || sentences.length === 0) return { pass: false, error: "Empty output" };

  // --- ĐỒNG BỘ TIỀN XỬ LÝ GIỐNG HỆT HÀM SPLIT ---
  let normalizedOrig = originalParagraph;
  if (normalizedOrig && typeof normalizedOrig === 'string') {
    normalizedOrig = normalizedOrig.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    normalizedOrig = normalizedOrig.replace(/“([^”]*?)"/g, '“$1”');
    normalizedOrig = normalizedOrig.replace(/"([^“]*?)”/g, '“$1”');
  }
  // ----------------------------------------------

  // 1. Kiểm tra tính bảo toàn (Data Integrity)
  const normalizeForComparison = (str) => str.replace(/["“”「」『』'.,!?…\-\s]/g, '');
  const originalCompare = normalizeForComparison(normalizedOrig);
  const outputCompare = normalizeForComparison(sentences.join(''));

  if (originalCompare !== outputCompare) {
    return { pass: false, error: "Data Mismatch: Nội dung chữ cái/số bị thay đổi hoặc mất mát." };
  }

  const specialPairs = { '“': '”', '「': '」', '『': '』' };

  const countChar = (str, char) => {
    let count = 0;
    for (let i = 0; i < str.length; i++) if (str[i] === char) count++;
    return count;
  };

  // Đếm trên chuỗi đã đồng bộ hóa dữ liệu ngoặc
  const origStraightQuotes = countChar(normalizedOrig, '"');
  const isOrigStraightBalanced = origStraightQuotes % 2 === 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();

    if (s.length === 0) return { pass: false, error: `Câu thứ ${i} bị rỗng.` };

    // 2. Kiểm tra ngoặc kép thẳng (nếu bản gốc cân bằng)
    if (isOrigStraightBalanced) {
      const sentenceStraightQuotes = countChar(s, '"');
      if (sentenceStraightQuotes % 2 !== 0) {
        return { pass: false, error: `Cắt phạm vào giữa cặp ngoặc thẳng (") tại câu: ${s}` };
      }
    }

    // 3. Kiểm tra tính cân bằng dấu ngoặc đặc biệt
    for (const [open, close] of Object.entries(specialPairs)) {
      const totalOpen = countChar(normalizedOrig, open);
      const totalClose = countChar(normalizedOrig, close);

      if (totalOpen === totalClose && totalOpen > 0) {
        const countOpen = countChar(s, open);
        const countClose = countChar(s, close);

        if (countOpen !== countClose && (countOpen > 0 || countClose > 0)) {
          return { pass: false, error: `Cắt phạm vào giữa cặp ngoặc ${open}${close} tại câu: ${s}` };
        }
      }
    }

    // 4. Kiểm tra dấu kết thúc câu (Bỏ qua câu cuối cùng vì có thể kết thúc lửng)
    if (i < sentences.length - 1) {
      const cleanEnd = s.replace(/["”」』\s]+$/, '');
      if (cleanEnd.length > 0) {
        const lastChar = cleanEnd.slice(-1);
        const validEnd = /[.!?…]/.test(lastChar);
        if (!validEnd) {
          return { pass: false, error: `Câu chưa kết thúc hợp lệ: ${s}` };
        }
      }
    }
  }

  return { pass: true };
};

const batchVerify = (paragraphs) => {
  const logs = {
    total: paragraphs.length,
    passed: 0,
    failed: []
  };

  paragraphs.forEach((p, index) => {
    const sentences = splitIntoSentences(p);
    const report = verifySentencesPattern(p, sentences);

    if (report.pass) {
      logs.passed++;
    } else {
      logs.failed.push({
        index,
        original: p,
        error: report.error,
        output: sentences
      });
    }
  });

  return logs;
};

async function crawlChapterContent(fullUrl) {
  try {
    const { data } = await axios.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://truyenfull.vision/',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const contentNode = $('#chapter-c');

    if (!contentNode.length) {
      console.log(`[WARN] Không tìm thấy #chapter-c: ${fullUrl}`);
      return { error: true, reason: 'NO_SELECTOR' };
    }

    const content = extractContent(data);
    if (!content) return { error: true, reason: 'NO_CONTENT' };

    const paragraphs = content.split('\n\n').filter(p => p.trim());
    fs.writeFile('paragraphs.txt', JSON.stringify(paragraphs, null, 2), (err) => {
      if (err) {
        console.error("Lỗi khi lưu file:", err);
      } else {
        console.log("Đã tạo file paragraphs thành công!");
      }
    });

    fs.readFile('paragraphs.txt', 'utf8', (err, data) => {
      if (err) {
        console.error("Lỗi khi đọc file:", err);
        return;
      }

      try {
        const paragraphsArray = JSON.parse(data);
        const result = batchVerify(paragraphsArray);
        console.log(`Đã check xong ${result.total} dòng. Lỗi: ${result.failed.length}`);
        if (result.failed.length > 0) {
          for (const error of result.failed) {
            console.log("-----lỗi:", error);
          }
        }

      } catch (parseErr) {
        console.error("Lỗi khi parse JSON:", parseErr);
      }
    });
  } catch (e) {
    console.log(e.message);
  }
}

// ── Chạy thử ─────────────────────────────────────────────────────────
const url = process.argv[2];
if (!url) {
  console.error('Usage: node crawl.mjs <url>');
  process.exit(1);
}

crawlChapterContent(url);
