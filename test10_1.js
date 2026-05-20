const splitIntoSentences = (text) => {
  if (!text || typeof text !== 'string') return [];

    text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');


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

    // Dynamically match valid straight quote pairs
    // Ignore empty ("") or space-only ("  ") quotes to prevent parity breakage
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
            const endingPunctMatch = current.trimEnd().match(/([.!?…]+)["”」』]+$/);

            if (endingPunctMatch && (!hasOuterWords || startedWithQuote)) {
              const punct = endingPunctMatch[1];
              const isJustEllipsis = /^(\.{2,}|…+)$/.test(punct);
              const textInsideQuote = current.replace(/^["'“「『\-\s]+/, '').replace(/["'”」』\s]+$/, '');
              const hasInternalSentence = /[.!?…]+[\s]+/.test(textInsideQuote);

              if ((!hasInternalSentence || allQuotes.includes(nextChar)) && !isAbbreviation(current)) {
                // Check if the next segment is attached (no space between)
                const isAttachedWord = /^[\p{L}\p{N}]/u.test(rest) || closeQuotes.includes(rest[0]);

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

            // Prevent the loop from greedily consuming a straight OPENING quote
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

            // Prevent splitting if there's an attached letter, number, or quote with no leading space
            if (/^[\p{L}\p{N}]/u.test(rest) || closeQuotes.includes(rest[0])) {
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
    label: 'Test 57',
    input: '"Cha, con xin lỗi, con trai đã phụ lòng mong đợi của người. Con xin lỗi…"Một dòng nước mắt nóng hổi rơi xuống, ý thức của Tần Ninh cũng dần biến mất. Ầm ầm… Trêи trời cao, sấm gầm chớp giật, ngày càng mạnh mẽ. Trêи đường cái, thân thể kia cũng dần lạnh lẽo.Một tiếng rắc rắc vang lên, đúng lúc này, một tia sét đánh thẳng vào thân thể của thiếu niên. Bỗng nhiên, xuất hiện chín tia sáng vây quanh hắn, phát sáng rực rỡ rồi cuối cùng dung hoà vào trong cơ thể hắn và biến mất không còn chút bóng dáng. … Ngày hôm sau, trong một biệt viện của Tần phủ, thành Lăng Vân."Hả?"Bỗng chốc một âm thanh kinh ngạc, nghi ngờ vang lên, Tần Ninh tỉnh lại trêи giường. Nhưng, lúc này trong hai mắt Tần Ninh vẫn còn mơ hồ thấy rõ, vết máu trêи người cũng đã được rửa sạch."Ta… không chết…"Tần Ninh nhìn đôi tay mình, đầu óc cảm thấy khó hiểu."Không đúng, ta…',
    expected: [
      [
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
    input: `“Phương Nguyên, ngoan ngoãn giao Xuân Thu Thiền ra đây, ta sẽ cho ngươi chết dễ dàng!”“Phương lão ma, ngươi đừng hòng phản kháng, hôm nay các đại phái chính đạo chúng ta liên hợp lại chính là muốn đạp nát sào huyệt của ngươi. Ở đây đã bày sẵn thiên la địa võng, lần này ngươi nhất định phải đầu lìa khỏi cổ!”“Phương Nguyên, ngươi là tên ma đầu chết tiệt, ngươi vì luyện thành Xuân Thu Thiền đã giết ngàn vạn tính mệnh. Ngươi đã phạm phải tội nghiệt tày trời, không thể tha thứ!”“Ma đầu, ba trăm năm trước ngươi vũ nhục ta, cướp đi trong sạch của ta, giết cả nhà ta, giết cửu tộc ta. Từ thời khắc đó, ta hận không thể ăn thịt ngươi, uống máu ngươi! Hôm nay, ta muốn cho ngươi sống không bằng chết!!”....Phương Nguyên mặc một bộ trường bào xanh biếc rách nát, tóc tai bù xù, cả người đẫm máu, ngắm nhìn bốn phía xung quanh.Gió núi thổi tấm áo đẫm máu phất phơ, như chiến kỳ phần phật tung bay.Dòng máu đỏ tươi từ trong mấy trăm vết thương trên người tuôn ra ngoài. Chỉ mới đứng một lúc, dưới chân Phương Nguyên đã tích tụ một vũng máu lớn.Kẻ địch bao vây, hắn đã không còn đường sống.Đại cục đã định, hôm nay hắn chắc chắn phải chết.Phương Nguyên thấy rõ thế cục, nhưng mặc cho cái chết đã đến gần, vẻ mặt hắn vẫn không thay đổi, gương mặt bình thản.Đôi mắt hắn sâu thẳm, vẫn giống như trước kia, giống như một cái giếng cổ sâu không thấy đáy.Quần hùng chính đạo vây công hắn, không phải đường đường là trưởng môn một phái thì cũng là thiếu niên hào kiệt vang danh khắp nơi. Những người bao vây Phương Nguyên lúc này, người thì đang gầm thét, người thì đang cười lạnh, người thì nheo mắt cảnh giác, người thì che vết thương, sợ hãi mà nhìn.Bọn họ không hề động thủ, cũng vì e ngại Phương Nguyên sắp chết phản công.Cứ căng thẳng giằng co như vậy đã qua ba canh giờ. Trời chiều ngả về tây, ánh chiều tà đốt sườn núi, trong chốc lát sườn núi đã rực chói như lửa.Phương Nguyên vẫn yên lặng như tượng, bỗng từ từ xoay người.Quần hùng lập tức xôn xao một trận, đồng loạt lùi về sau một khoảng lớn.Lúc này, núi đá màu xám trắng dưới chân Phương Nguyên đã sớm bị máu tươi nhuộm đỏ thắm. Gương mặt tái nhợt vì mất máu quá nhiều, được ánh nắng chiều chiếu rọi bỗng nhiên trở nên tươi sáng.Nhìn khung cảnh mặt trời khuất núi xanh ở nơi này, Phương Nguyên cười khẽ một tiếng: “Thanh sơn lạc nhật, Thu nguyệt xuân phong. Đương chân thị triều như thanh ty mộ thành tuyết, thị phi thành bại chuyển đầu không.”\[Dịch: “Mặt trời lặn sau núi, gió xuân thổi ánh trăng. Quả thật là sáng sớm tóc đen chiều đã trắng, đúng sai thành bại hóa khói mây.” - Tác giả mượn một câu thơ trong bài “Lâm Giang Tiên” - Dương Thận.\]Khi nói lời này, trước mắt hắn chợt hiện ra những việc của kiếp trước trên địa cầu.Hắn vốn là học sinh Hoa Hạ trên địa cầu, tình cờ có cơ hội chuyển kiếp đến thế giới này. Nổi trôi nghiêng ngả ba trăm năm, tung hoành thế gian hơn hai trăm năm. Quãng thời gian hơn năm trăm năm dài đằng đẵng, nhưng cũng chỉ trôi qua trong một cái chớp mắt.Rất nhiều ký ức chôn sâu trong đáy lòng vẫn còn vẹn nguyên như thuở đầu, sinh động như thật mà hiện về trước mắt.“Cuối cùng vẫn thất bại sao.” Phương Nguyên cảm thán, có hơi bùi ngùi nhưng lại không hối hận.Kết quả như vậy, hắn sớm đã đoán được, cũng đã chuẩn bị tâm lý khi lựa chọn như vậy.Cái gọi là ma đạo, chính là không tu thiện quả, giết người phóng hoả, trời đất không dung, người đời đều là kẻ địch, thỏa sức tung hoành.“Nếu như Xuân Thu Thiền vừa mới luyện thành có hiệu quả, vậy thì kiếp sau vẫn muốn làm ma!” Nghĩ như vậy, Phương Nguyên không kiềm được cất tiếng cười to.“Lão ma, ngươi cười cái gì?”“Mọi người cẩn thận, ma đầu này chết đến nơi còn muốn phản công!”“Mau giao Xuân Thu Thiền ra đây!!”Quần hùng dồn ép, cùng nhau vọt đến. Đúng lúc này, tiếng ầm ầm chấn động đất trời vang lên, Phương Nguyên ngang nhiên tự bạo chính mình.....Mưa xuân rả rích, lặng yên tưới mát núi Thanh Mao.Đêm đã khuya, gió mát nhè nhẹ thổi mưa phùn lất phất.Núi Thanh Mao cũng không hoàn toàn tối om, từ sườn núi đến chân núi có rất nhiều đốm sáng lấp lánh tựa như đang khoác một dải băng ánh sáng rực rỡ.Nơi phát ra ánh sáng là những căn nhà sàn, mặc dù không thể gọi là vạn nhà lên đèn, nhưng cũng có quy mô đến hàng ngàn.Đây chính là sơn trại Cổ Nguyệt trên núi Thanh Mao, nơi khiến cho dãy núi vắng vẻ này tăng thêm một phần hơi thở con người.Ở khu trung tâm của sơn trại Cổ Nguyệt là một toà lầu các to lớn đẹp đẽ, vì lúc này nơi đó đang tổ chức lễ cúng tế mà đèn đuốc sáng choang, ánh sáng rực rỡ.“Liệt tổ liệt tông phù hộ, hy vọng trong đại điển Khai Khiếu lần này có thể có nhiều thiếu niên tư chất ưu tú hơn, tăng thêm dòng máu mới và hy vọng cho gia tộc!”Tộc trưởng Cổ Nguyệt có dáng vẻ trung niên, hai bên tóc mai điểm sương, mặc một bộ trang phục cúng tế trang trọng thuần một màu trắng. Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.Trước mặt ông ta là một bàn thờ thật cao sơn màu đen, bàn thờ có ba tầng, thờ phụng bài vị tổ tiên. Hai bên bài vị đặt lư hương đồng đỏ, nhang khói lượn lờ.Phía sau ông ta có hơn mười người cũng đang quỳ. Bọn họ mặc bộ đồ lễ rộng màu trắng, đều là gia lão trong gia tộc, những người chấp chưởng các phương diện quyền hành.Sau khi khấn vái một hồi, tộc trưởng Cổ Nguyệt dẫn đầu xoay người lại, hai tay đặt ngang nhau, lòng bàn tay áp xuống sàn, dập đầu. Vầng trán chạm vào trên sàn nhà nâu vàng, khẽ phát ra tiếng phịch phịch.Các gia lão sau lưng mỗi người đều là vẻ mặt nghiêm túc, cũng yên lặng làm theo.Lát sau, khắp nơi trong từ đường dòng họ đều vang ra âm thanh bộp bộp khi phần trán va vào sàn nhà.Lễ tế hoàn tất, mọi người thong thả đứng dậy từ trên sàn nhà rồi lẳng lặng đi ra khỏi từ đường trang nghiêm.Trong hành lang, các gia lão lặng lẽ thở phào nhẹ nhõm, bầu không khí thoáng dịu đi.Tiếng thảo luận dần dần vang lên.“Thời gian trôi qua thật là quá nhanh, chớp mắt đã một năm rồi.”“Đại điển Khai Khiếu lần trước giống như chỉ vừa mới hôm qua, còn rõ mồn một trước mắt đây.”“Ngày mai đã là đại điển Khai Khiếu mỗi năm một lần, không biết năm nay gia tộc sẽ xuất hiện nhân tài mới có năng lực như thế nào đây?”“Ôi, hy vọng là xuất hiện thiếu niên tư chất loại Giáp.(1) Bộ tộc Cổ Nguyệt chúng ta đã ba năm không xuất hiện thiên tài như vậy.”“Đúng vậy, mấy năm nay Bạch gia trại và Hùng gia trại đều xuất hiện rất nhiều thiên tài. Nhất là Bạch Ngưng Băng của Bạch gia trại, thiên tư thực sự là kinh khủng.”Không biết là ai đề cập đến cái tên Bạch Ngưng Băng này, trên mặt các gia lão không khỏi hiện lên vẻ âu lo.Tư chất của người này cực kỳ xuất sắc, chỉ trong thời gian hai năm ngắn ngủi đã tu hành thành cổ sư Tam chuyển. Trong thế hệ trẻ, người này có thể nói là một mình vượt xa mọi người. Thậm chí ngay cả thế hệ trước đó cũng cảm thấy được áp lực từ vị nhân tài mới xuất hiện này.Qua một thời gian, y nhất định là trụ cột của Bạch gia trại, ít nhất cũng là cường giả một mình đảm đương một phương. Không ai hoài nghi về điều này.“Nhưng mà trong các thiếu niên tham gia đại điển Khai Khiếu năm nay, cũng không phải không có hy vọng.”“Đúng vậy, trong một chi của họ Phương vừa xuất hiện một thiếu niên thiên tài. Ba tháng có thể nói, bốn tháng có thể đi, năm tuổi là có thể làm thơ, thông minh khác thường, tài hoa hơn người. Đáng tiếc là cha mẹ mất sớm, hiện tại đang được cậu mợ nuôi dưỡng.”“Ừ, đây là trí tuệ phát triển sớm, hơn nữa chí hướng lớn. Mấy năm nay hắn sáng tác vài bài như "Kính rượu", "Vịnh mai", còn có "Giang Thành tử", ta cũng đã nghe nói đến. Thật sự là thiên tài!”Tộc trưởng Cổ Nguyệt là người cuối cùng đi ra khỏi từ đường tổ tiên. Ông ta thong thả khép cửa lại, lập tức nghe được tiếng bàn luận của các gia lão trong hành lang.Chẳng cần tốn nhiều thời gian, ông ta đã biết rằng lúc này các gia lão đang nói về một vị thiếu niên tên là Cổ Nguyệt Phương Nguyên.Làm người đứng đầu một tộc, tất nhiên ông ta sẽ chú ý những con cháu nổi bật. Mà Cổ Nguyệt Phương Nguyên chính là người tỏa sáng nổi bật nhất trong lớp tiểu bối.Kinh nghiệm cho thấy, người có thiên phú dị bẩm như trí nhớ siêu phàm, hoặc là sức lực như người trưởng thành... thì thường có tư chất tu hành ưu tú.“Nếu như người này kiểm tra ra tư chất loại Giáp, đào tạo cho tốt, cũng chưa chắc không thể chống lại Bạch Ngưng Băng. Cho dù là tư chất loại Ất,(2) sau này nhất định cũng có thể một mình đảm đương một phương, trở thành lá cờ đầu của bộ tộc Cổ Nguyệt. Nhưng mà hắn hiểu chuyện sớm như vậy, khả năng là tư chất loại Ất không lớn, rất có thể chính là loại Giáp.” Ý nghĩ này vừa nảy sinh thì khoé miệng tộc trưởng Cổ Nguyệt không khỏi hơi nhếch lên, nở nụ cười mỉm.Ngay lập tức, ông ta ho khan một tiếng, nói với các vị gia lão: “Chư vị, thời gian đã không còn sớm, để đại điển ngày mai suôn sẻ, đêm nay xin hãy nghỉ ngơi thật tốt, điều dưỡng tinh thần.”Các gia lão nghe xong những lời này thì hơi nao nao, trong ánh mắt nhìn nhau cũng ẩn giấu sự cảnh giác.Lời nói này của tộc trưởng rất hàm súc, nhưng tất cả mọi người đều hiểu rõ.Hằng năm, vì tranh đoạt những hậu bối thiên tài này, các gia lão tranh giành lẫn nhau đến đỏ mặt tía tai, sứt đầu mẻ trán.Cho nên phải nghỉ ngơi dưỡng sức thật tốt, đợi một phen tranh đoạt vào ngày mai.Nhất là Cổ Nguyệt Phương Nguyên kia vô cùng có khả năng là tư chất loại Giáp, hơn nữa, cha mẹ của hắn đã qua đời, là một trong hai cô nhi còn sót lại của chi họ Phương. Nếu có thể thu nhận hắn, đào tạo cho tốt, vậy thì có thể đảm bảo chi mạch của mình trăm năm hưng thịnh không suy!“Nhưng mà, phải cảnh báo trước một câu. Tranh đoạt thì phải đường đường chính chính, không thể sử dụng âm mưu thủ đoạn, tổn hại tình đoàn kết gia tộc. Các vị gia lão xin hãy nhớ kĩ trong lòng!” Tộc trưởng nghiêm túc nhắn nhủ.“Không dám. Không dám.”“Nhất định nhớ kĩ trong lòng.”“Phải cáo từ rồi, tộc trưởng đại nhân xin dừng bước.”Các gia lão ôm những suy tính của riêng mình, từng người một tản đi.Không lâu sau, hành lang dài đã trở nên vắng vẻ. Mưa xuân tạt qua song cửa thổi sang đây, tộc trưởng nhẹ nhàng bước đi, tới trước cửa sổ.Ngay lập tức, không khí tươi mát ẩm ướt của núi rừng tràn đầy trong miệng, thấm vào ruột gan.Đây là tầng ba của lầu các, tộc trưởng phóng tầm mắt, hơn phân nửa sơn trại Cổ Nguyệt bao trọn trong một cái nhìn.Phần lớn mọi người trong trại vẫn chong đèn vào lúc đêm khuya như giờ này, điều này rất khác ngày thường.Ngày mai chính là đại điển Khai Khiếu, liên quan đến lợi ích bản thân mỗi người. Một bầu không khí hưng phấn, lo lắng bao phủ trái tim mọi người trong tộc, nên hiển nhiên có rất nhiều người ngủ không yên.“Đây là hy vọng tương lai của gia tộc.” Trong mắt phản chiếu ánh đèn, tộc trưởng thở dài một tiếng.Mà lúc này, cũng có một đôi mắt trong trẻo lẳng lặng nhìn những ánh đèn lập loè giữa đêm khuya này, cõi lòng ôm đầy tình cảm phức tạp.“Sơn trại Cổ Nguyệt, đây là năm trăm năm trước?! Xuân Thu Thiền quả nhiên có tác dụng...” Ánh mắt Phương Nguyên sâu thẳm. Hắn đứng bên cạnh cửa sổ, mặc cho gió mưa đập vào người.Tác dụng của Xuân Thu Thiền,(3) chính là nghịch chuyển thời gian. Nó đứng hàng thứ bảy trong Thập Đại Kì Cổ, tất nhiên không thể coi thường.Nói ngắn gọn, hắn đã sống lại.“Sử dụng Xuân Thu Thiền để sống lại, quay về năm trăm năm trước!” Phương Nguyên vươn tay, ánh mắt bình tĩnh nhìn bàn tay trẻ tuổi non nớt có phần tái nhợt của mình, sau đó từ từ nắm chặt lại, cố sức cảm nhận sự chân thật này.Tiếng mưa phùn đập vào trên cửa sổ vang bên tai, hắn từ từ nhắm mắt lại, sau một lúc lâu mới mở ra, thở dài một hơi: “Trải qua năm trăm năm, tưởng chừng là giấc mộng.”Nhưng hắn lại biết rõ, đây tuyệt đối không phải là giấc mộng.ㅤ(1) \[Loại Giáp: loại A, hạng nhất.\](2) \[Loại Ất: loại B, kém hơn loại Giáp 1 bậc.\](3) \[Thiền: ve sầu | Xuân Thu: thời gian (Đôi khi Xuân Thu được dùng để chỉ thời gian).\]`,
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
      'Ông ta quỳ gối trên sàn nhà màu nâu, thẳng lưng, hai tay chắp thành hình chữ thập ở trước người, nhắm mắt thành tâm khấn vái.',
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