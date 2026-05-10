// длина "<step_done/>" и "<task_done/>"
const MARKER_MAX_LEN = 12;

const STEP_DONE_RE = /<step_done\/>/g;
const TASK_DONE_RE = /<task_done\/>/g;
const STEP_DONE_STR = "<step_done/>";
const TASK_DONE_STR = "<task_done/>";

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
      return toSend.replace(STEP_DONE_RE, "").replace(TASK_DONE_RE, "");
    }
    return "";
  }

  /** Сбросить остаток буфера в конце стрима. */
  flush(): string {
    if (!this.streamBuffer) return "";
    const remaining = this.streamBuffer
      .replace(STEP_DONE_RE, "")
      .replace(TASK_DONE_RE, "");
    this.streamBuffer = "";
    return remaining;
  }

  /** Полный ответ модели с убранными маркерами и trim — для записи в БД. */
  getCleanedResponse(): string {
    return this.fullResponse
      .replace(STEP_DONE_RE, "")
      .replace(TASK_DONE_RE, "")
      .trim();
  }

  hasStepDone(): boolean {
    return this.fullResponse.includes(STEP_DONE_STR);
  }

  hasTaskDone(): boolean {
    return this.fullResponse.includes(TASK_DONE_STR);
  }
}
