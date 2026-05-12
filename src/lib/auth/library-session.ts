export interface LibraryStudent {
  id: string;
  email: string;
  display_name: string;
}

const STORAGE_KEY = "corvian_library_student";

export function getLibraryStudent(): LibraryStudent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.display_name === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLibraryStudent(student: LibraryStudent): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
}

export function clearLibraryStudent(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
