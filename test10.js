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

    // Fix: Dynamically match valid straight quote pairs
    // separating them into definitively opening vs definitively closing indices
    const openQuoteIndices = new Set();
    const closeQuoteIndices = new Set();
    const quoteRegex = /"[^"]*"/g;
    let mMatch;
    while ((mMatch = quoteRegex.exec(seg)) !== null) {
      openQuoteIndices.add(mMatch.index);
      closeQuoteIndices.add(mMatch.index + mMatch[0].length - 1);
    }

    while (i < seg.length) {
      const ch = seg[i];

      if (allQuotes.includes(ch)) {
        if (current.trim().replace(/^[\-\s]+/, '') === '') startedWithQuote = true;

        if (ch === '"') {
          // Accurate quoteLevel shifting using our pre-calculated indices
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
            const endingPunctMatch = current.trimEnd().match(/([.!?…]+)["”」』]+$/);

            if (endingPunctMatch && (!hasOuterWords || startedWithQuote)) {
              const punct = endingPunctMatch[1];
              const isJustEllipsis = /^(\.{2,}|…+)$/.test(punct);
              const textInsideQuote = current.replace(/^["'“「『\-\s]+/, '').replace(/["'”」』\s]+$/, '');
              const hasInternalSentence = /[.!?…]+[\s]+/.test(textInsideQuote);

              // Allows a split to occur if the immediate next text block is another quote.
              if ((!hasInternalSentence || allQuotes.includes(nextChar)) && !isAbbreviation(current)) {
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
          while (i < seg.length) {
            const nextCh = seg[i];

            // Fix: Prevent the loop from greedily consuming a straight OPENING quote
            // as if it was a trailing closing quote from the prior sentence.
            if (nextCh === '"' && openQuoteIndices.has(i)) {
              break;
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
            if (/^[\p{L}\p{N}]/u.test(rest)) {
              canSplit = false;
            }

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
    label: 'Test 56',
    input: `Trong cơn mưa, một cô gái xuất hiện như thế mang lại cho người ta một cảm giác thơm ngát và tao nhã."Sở Ngưng Thi!"Hắn ngẩng đầu nhìn người con gái yêu kiều trước mắt. Khuôn mặt xinh đẹp đó từng khiến hắn mê muội, nhưng bây giờ nó lại chỉ khiến hắn cảm thấy buồn nôn."Cô tới đây làm gì?""Ta đưa huynh về!", Sở Ngưng Thi lạnh nhạt nói."Đưa ta về? Bây giờ cô còn có lòng tốt thế sao?""Tần Ninh!"Sở Ngưng Thi mở miệng nói: "Huynh nên biết, nhà họ Lăng xứng đáng là bá chủ của nội thành Lăng Vân.Nhà họ Sở ta và nhà họ Tần huynh cộng lại cũng không phải là đối thủ của họ, Lăng Thế Thành là chính là cao thủ Thiên Môn cảnh, ta không có sự lựa chọn nào khác!""Không có lựa chọn?"Tần Ninh cười khẩy nói: "Sở Ngưng Thi à, cái cô gọi là không có sự lựa chọn chính là lừa Tần Ninh ta tới dãy núi Lăng Vân, để Lăng Thế Thành bắt ta rồi đích thân đoạt lấy Tinh Môn của ta để giao cho con trai Lăng Thiên của lão ta sao?""Để Tần Ninh ta trở thành một phế nhân, trở thành một kẻ phải chết, sau khi chết, còn phải chịu hàng ngàn dân chúng trong thành Lăng Vân phỉ nhổ sao?" "Tần Ninh!"Sở Ngưng Thi hít sâu rồi hét lên: "Nhà họ Tần của huynh không phải cũng khom lưng uốn gối với phủ thành chủ hay sao? Nếu ta không nghe theo thì nhà họ Sở của ta sẽ biến mất ở nội thành Lăng Vân, ngu nguội thì sống mà giỏi giang thì chết, huynh hiểu không? Muốn trách thì phải trách huynh đã thức tỉnh Tinh Môn!""Ha ha…"Tần Ninh cười lớn, vẻ mặt hung ác, điên cuồng gào lên: "Được lắm, được lắm, hay cho câu ngu nguội thì sống mà giỏi giang thì chết!""Nếu Tần Ninh ta không nghe lời nói ngớ ngẩn của cô thì sao lại bị bắt về Lăng phủ, bị cha con Lăng Thế Thành cướp đoạt Tinh Môn?""Huynh…quá là cứng đầu!""Cút!"Tần Ninh bỗng nhiên hét lên: "Kể cả ta chết ở đây thì cũng không cần kiểu quan tâm giả tạo của cô!""Hừ!"Sở Ngưng Thi hừ một tiếng, nói: "Con người Lăng Thiên có tài năng, đã được Thiên Tử Đảng của học viện Thiên Thần đế quốc coi trọng, Thiên Tử của Thiên Tử đảng muốn huy động vây cánh thế lực của gã nên tuyển Lăng Thiên làm học viên, nhưng chỉ có một điều kiện…"`,
    expected: [

    ]
  },
  {
    label: 'Test 57',
    input: '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…"Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất. Ầm ầm… Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ. Trêи đường cái, thân thể kia cũng dần lạnh lẽo.Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên. Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. … Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân."Hả?"Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường. Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch."Ta… không chết…"Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu."Không đúng, ta…'
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