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

  const openQuotes = ['"', '“', '「', '『'];
  const closeQuotes = ['"', '”', '」', '』'];
  const allQuotes = [...openQuotes, ...closeQuotes];

  // Danh sách từ viết tắt phổ biến
  const abbreviations = [
    'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'St', 'Jr', 'Sr',
    'Rev', 'Lt', 'Capt', 'Col', 'Gen', 'Sgt', 'Cpl', 'Pvt', 'Gov',
    'GS', 'PGS', 'TS', 'ThS', 'BS', 'KS', 'LS', 'Tp', 'TP'
  ];

  const isUpperishStart = (str) => /^["'“「『\-\s]*[\p{Lu}]/u.test(str);
  const isUpperishStartAfterSpace = (str) =>
    /^["'"\u300c\u300e\-]*\s+["'"\u300c\u300e\-\s]*[\p{Lu}]/u.test(str);

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

  const splitSegment = (seg) => {
    const results = [];
    let current = '';
    let quoteLevel = 0;
    let hasOuterWords = false;
    let startedWithQuote = false;
    let i = 0;

    const straightQuoteCount = countChar(seg, '"');
    const ignoreStraightQuotes = straightQuoteCount % 2 !== 0;

    while (i < seg.length) {
      const ch = seg[i];

      if (allQuotes.includes(ch)) {
        if (current.trim().replace(/^[\-\s]+/, '') === '') startedWithQuote = true;

        if (ch === '"') {
          if (!ignoreStraightQuotes) {
            if (quoteLevel > 0 && current.includes('"')) quoteLevel--;
            else quoteLevel++;
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
            const endingPunctMatch = current.trimEnd().match(/([.!?…]+)["”」』]+$/);

            if (endingPunctMatch && (!hasOuterWords || startedWithQuote)) {
              const punct = endingPunctMatch[1];
              const isJustEllipsis = /^(\.{2,}|…+)$/.test(punct);
              const textInsideQuote = current.replace(/^["'“「『\-\s]+/, '').replace(/["'”」』\s]+$/, '');
              const hasInternalSentence = /[.!?…]+[\s]+/.test(textInsideQuote);

              if (!hasInternalSentence && !isAbbreviation(current)) {
                const isAttachedWord = /^[\p{L}\p{N}]/u.test(rest);

                if (!isAttachedWord && ((isUpperishStart(rest) && !isJustEllipsis) || allQuotes.includes(nextChar))) {

                  let shouldSplit = true;
                  if (/^["'“「『](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(current.trim())) {
                    shouldSplit = false;
                  }

                  if (shouldSplit && !allQuotes.includes(nextChar)) {
                    const match = rest.match(/([.,;:!?…，；：])/);
                    if (match && [',', ';', ':', '，', '；', '：'].includes(match[1])) {
                      shouldSplit = false;
                    }
                  }

                  if (shouldSplit) {
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

      if (quoteLevel === 0 && /[.!?…]/.test(ch)) {
        let punct = '';
        while (i < seg.length && /[.!?…]/.test(seg[i])) {
          punct += seg[i];
          i++;
        }

        const tempCurrent = current + punct;

        if (!isAbbreviation(tempCurrent)) {
          let trailingQuotes = '';
          while (i < seg.length && /["'”」』]/.test(seg[i])) {
            trailingQuotes += seg[i];
            i++;
          }

          const fullCurrent = tempCurrent + trailingQuotes;
          const rest = seg.slice(i);

          let canSplit = true;
          if (trailingQuotes.length > 0) {
            canSplit = (!hasOuterWords || startedWithQuote);
            if (/^[\p{L}\p{N}]/u.test(rest)) {
              canSplit = false;
            }

            // Áp dụng lookahead cho trường hợp split tại dấu câu + ngoặc đóng
            if (canSplit) {
              const nextNonSpaceMatch = rest.match(/^\s*(.)/);
              if (nextNonSpaceMatch && !allQuotes.includes(nextNonSpaceMatch[1])) {
                const match = rest.match(/([.,;:!?…，；：])/);
                if (match && [',', ';', ':', '，', '；', '：'].includes(match[1])) {
                  canSplit = false;
                }
              }
            }
          }

          if (/^["'“「『](?:\s+|…+|\.+)[^.!?…]{1,15}[.!?…]+["”」』]*$/.test(fullCurrent.trim())) {
            canSplit = false;
          }

          if (/^["'“「『\-\s.!?…]+$/.test(fullCurrent.trim())) {
            canSplit = false;
          }

          const isUnicodeEllipsisOnly = /^\u2026+$/.test(punct);
          const upperCheck = isUnicodeEllipsisOnly ? isUpperishStartAfterSpace(rest) : isUpperishStart(rest);

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

      if (quoteLevel === 0 && /[\p{L}\p{N}]/u.test(ch)) hasOuterWords = true;
      current += ch;
      i++;
    }

    if (current.trim()) results.push(current.trim());
    return results;
  };

  return splitSegment(text)
    .map(s => s.trim())
    .filter(s => s.replace(/["“”「」『』'.,!?…\-\s]/g, '').length > 0);
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
