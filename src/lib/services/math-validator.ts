// Серверная математическая валидация ответа ученика.
// Используется чтобы Мунин (Haiku) не отклонял эквивалентные формы:
//   "75%" == "3/4" == "0.75" == "0,75" == "6/8"

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

export function isMathematicallyEqual(
  studentAnswer: string,
  correctAnswer: string,
): boolean {
  const studentVal = normalize(studentAnswer);
  const correctVal = normalize(correctAnswer);
  if (studentVal === null || correctVal === null) return false;
  return Math.abs(studentVal - correctVal) < 0.001;
}
