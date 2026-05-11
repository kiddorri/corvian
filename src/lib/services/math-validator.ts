// Серверная математическая валидация ответа ученика.
// Используется чтобы Мунин (Haiku) не отклонял эквивалентные формы:
//   "75%" == "3/4" == "0.75" == "0,75" == "6/8"
// Также: ответы вида "P(A) = 20/500 = 0,04" — извлекаем все
// число-подобные подстроки и пробуем каждую пару.

function normalize(s: string): number | null {
  if (typeof s !== "string") return null;
  const cleaned = s.trim().replace(/,/g, ".").replace(/\s/g, "");
  if (cleaned.length === 0) return null;

  // Процент: "75%" -> 0.75
  if (cleaned.endsWith("%")) {
    const num = parseFloat(cleaned.slice(0, -1));
    return Number.isNaN(num) ? null : num / 100;
  }

  // Дробь: "3/4" -> 0.75 (поддержка ведущего минуса: "-3/4")
  if (cleaned.includes("/")) {
    const parts = cleaned.split("/");
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
        return num / den;
      }
    }
    return null;
  }

  // Число: "0.75" -> 0.75
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

// Извлечь подстроки которые выглядят как числа: со знаком, дробной частью,
// дробью через "/", и/или процентом. Пробелы вокруг "/" учитываются.
function extractNumberLikes(s: string): string[] {
  if (typeof s !== "string") return [];
  const re =
    /-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+(?:[.,]\d+)?)?\s*%?/g;
  return Array.from(s.matchAll(re), (m) => m[0]);
}

export function isMathematicallyEqual(
  studentAnswer: string,
  correctAnswer: string,
): boolean {
  // Быстрый путь: целая строка как число (например ученик написал "3/4").
  const directS = normalize(studentAnswer);
  const directC = normalize(correctAnswer);
  if (
    directS !== null &&
    directC !== null &&
    Math.abs(directS - directC) < 0.001
  ) {
    return true;
  }

  // Общий путь: извлекаем число-подобные из обеих сторон и проверяем все пары.
  // Покрывает ответы вида "P(A) = 20/500 = 0,04" — выберется 0.04 из обеих.
  const studentNums = extractNumberLikes(studentAnswer)
    .map(normalize)
    .filter((n): n is number => n !== null);
  const correctNums = extractNumberLikes(correctAnswer)
    .map(normalize)
    .filter((n): n is number => n !== null);

  for (const sn of studentNums) {
    for (const cn of correctNums) {
      if (Math.abs(sn - cn) < 0.001) return true;
    }
  }

  return false;
}
