// длина "<step_done/>" / "<task_done/>" с запасом на пробелы и
// искажённый регистр (модель может написать "<step_done />" или "< STEP_DONE / >")
const MARKER_MAX_LEN = 20;

// Толерантные регексы — ловят <step_done/>, <step_done />, <STEP_DONE/>,
// <step-done/>, <  step_done  / >, любую комбинацию пробелов/регистра/дефиса.
const STEP_DONE_REGEX = /<\s*step[_-]?done\s*\/?\s*>/gi;
const TASK_DONE_REGEX = /<\s*task[_-]?done\s*\/?\s*>/gi;

function stripMarkers(text: string): string {
  return text
    .replace(STEP_DONE_REGEX, "")
    .replace(TASK_DONE_REGEX, "")
    .trim();
}

export class StreamParser {
  private fullResponse = "";
  private streamBuffer = "";

  /**
   * Принимает чанк из стрима. Возвращает безопасный текст без маркеров
   * (или пустую строку, если ещё нечего отдавать). Последние MARKER_MAX_LEN
   * символов остаются в буфере на случай частичного маркера на границе.
   */
  processChunk(chunk: string): string {
    this.fullResponse += chunk;
    this.streamBuffer += chunk;

    const safeEnd = this.streamBuffer.length - MARKER_MAX_LEN;
    if (safeEnd > 0) {
      const toSend = this.streamBuffer.slice(0, safeEnd);
      this.streamBuffer = this.streamBuffer.slice(safeEnd);
      return toSend
        .replace(STEP_DONE_REGEX, "")
        .replace(TASK_DONE_REGEX, "");
    }
    return "";
  }

  /** Сбросить остаток буфера в конце стрима. */
  flush(): string {
    if (!this.streamBuffer) return "";
    const remaining = this.streamBuffer
      .replace(STEP_DONE_REGEX, "")
      .replace(TASK_DONE_REGEX, "");
    this.streamBuffer = "";
    return remaining;
  }

  /** Полный ответ модели с убранными маркерами и trim — для записи в БД. */
  getCleanedResponse(): string {
    return stripMarkers(this.fullResponse);
  }

  hasStepDone(): boolean {
    // Глобальные regex хранят lastIndex между .test() — обязательно сбрасываем,
    // иначе второй вызов вернёт false.
    STEP_DONE_REGEX.lastIndex = 0;
    return STEP_DONE_REGEX.test(this.fullResponse);
  }

  hasTaskDone(): boolean {
    TASK_DONE_REGEX.lastIndex = 0;
    return TASK_DONE_REGEX.test(this.fullResponse);
  }
}
