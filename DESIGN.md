# DESIGN.md — Corvian Design System
## Философия
Тёмная, фиолетовая, чистая. Вдохновлено Linear и Brilliant. Эстетика «ворон в ночи» — не мрачная, а таинственная и умная. Минимализм, много воздуха, каждый элемент дышит.
Два правила:
1. Если можно убрать элемент без потери смысла — убери.
2. Фиолетовый используется точечно для акцентов, не заливкой.
---
## Палитра
### Основные цвета
```css
:root {
  /* Фоны */
  --bg:             #09070F;    /* основной фон (почти чёрный с фиолетовым подтоном) */
  --surface:        #0F0D17;    /* карточки, сайдбар */
  --surface-hover:  #141220;    /* ховер на карточках */
  --elevated:       #181525;    /* модалки, выпадашки, вложенные элементы */
  /* Бордеры */
  --border:         rgba(139, 92, 246, 0.08);   /* дефолтный */
  --border-hover:   rgba(139, 92, 246, 0.15);   /* при наведении */
  --border-active:  rgba(139, 92, 246, 0.25);   /* активный/фокус */
  /* Бренд */
  --purple:         #8B5CF6;    /* primary — кнопки, акценты, Мунин */
  --violet:         #7C3AED;    /* градиент кнопок (darker) */
  --indigo:         #818CF8;    /* Хугин, ссылки, secondary */
  /* Текст */
  --text:           #F4F4F5;    /* основной */
  --text-secondary: #A1A1AA;    /* второстепенный */
  --text-dim:       #71717A;    /* приглушённый, лейблы */
  --text-muted:     #52525B;    /* очень приглушённый, хинты */
  /* Семантические */
  --green:          #22C55E;    /* успех, завершено, правильно */
  --red:            #EF4444;    /* ошибка, пробел */
  --orange:         #F97316;    /* стрик, предупреждение */
  --amber:          #F59E0B;    /* в процессе */
  --blue:           #3B82F6;    /* информация */
}
```
### Tailwind конфиг
```js
// tailwind.config.ts — расширение цветов
colors: {
  corvian: {
    bg: '#09070F',
    surface: '#0F0D17',
    'surface-hover': '#141220',
    elevated: '#181525',
  },
  // Остальные цвета через стандартные Tailwind: violet-500, indigo-400 и т.д.
}
```
### Правила применения цветов
| Элемент | Цвет |
|---------|------|
| Фон страницы | `--bg` |
| Карточки, сайдбар | `--surface` |
| Ховер на карточке | `--surface-hover` |
| Модалки, вложенные блоки | `--elevated` |
| Основной текст | `--text` |
| Второстепенный текст | `--text-secondary` |
| Лейблы, подписи | `--text-dim` |
| Плейсхолдеры, хинты | `--text-muted` |
| Primary кнопка | градиент `--violet` → `--purple` |
| Ссылки | `--indigo` |
| Аватар/акцент Хугина | `--indigo` (🔵) |
| Аватар/акцент Мунина | `--purple` (🟣) |
| Стрик | `--orange` |
| Правильный ответ, завершено | `--green` |
| Ошибка, пробел | `--red` |
| В процессе | `--amber` |
---
## Типографика
### Шрифты
| Роль | Шрифт | Вес | Откуда |
|------|-------|-----|--------|
| Заголовки | DM Sans | 700 | Google Fonts |
| Основной текст | DM Sans | 400, 500 | Google Fonts |
| Моно (коды, цифры, метки) | Space Mono | 400, 700 | Google Fonts |
### Загрузка в Next.js
```tsx
import { DM_Sans, Space_Mono } from 'next/font/google';
const dmSans = DM_Sans({ subsets: ['latin', 'cyrillic'], variable: '--font-sans' });
const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });
```
### Размеры текста
Базовый: 14px. Масштаб 1.25 (minor third).
| Токен | Размер | Использование |
|-------|--------|--------------|
| `text-xs` | 11px | Таймстампы, бейджи |
| `text-sm` | 12.5px | Подписи, лейблы, хинты |
| `text-base` | 14px | Основной текст |
| `text-lg` | 16px | Подзаголовки карточек |
| `text-xl` | 20px | Заголовки секций |
| `text-2xl` | 25px | Заголовки страниц |
| `text-3xl` | 32px | Hero заголовки |
| `text-4xl` | 40px | Лендинг hero |
### Правила
- **Заголовки:** letter-spacing: -0.02em. Всегда DM Sans 700.
- **Моно:** использовать ТОЛЬКО для кодов класса, XP-чисел, процентов, таймстампов. Не для обычного текста.
- **Кириллица:** DM Sans поддерживает кириллицу. Space Mono — только латиница, для кириллических чисел использовать DM Sans 600.
---
## Компоненты
### Кнопки
**Primary:**
```
background: linear-gradient(135deg, var(--violet), var(--purple))
color: white
border-radius: 8px (маленькая) / 10px (обычная)
padding: 0.55rem 1.3rem (маленькая) / 0.85rem 2rem (обычная)
box-shadow: 0 0 20px rgba(124, 58, 237, 0.3)
hover: box-shadow 0 0 30px ..., translateY(-1px)
```
**Secondary:**
```
background: transparent
color: var(--text)
border: 1px solid var(--border)
hover: border-color var(--border-active), background rgba(139,92,246,0.05)
```
**Ghost:**
```
background: transparent
color: var(--text-secondary)
border: none
hover: background var(--surface-hover)
```
**AI/Generate:**
```
background: rgba(139,92,246,0.12)
color: var(--purple)
border: 1px solid var(--border-active)
Иконка ✦ перед текстом
```
### Карточки
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: 14px
padding: 1.5rem
hover: border-color var(--border-hover), translateY(-2px) (опционально)
transition: all 0.2s
```
### Инпуты
```
background: var(--bg)
border: 1px solid var(--border)
border-radius: 8px
padding: 0.65rem 0.85rem
color: var(--text)
focus: border-color var(--border-active), outline none
placeholder: var(--text-muted)
```
### Пиллы/Бейджи
```
display: inline-flex
padding: 0.2rem 0.6rem
border-radius: 999px
font-size: 0.7rem
font-weight: 600
background: {color}15  (15% opacity)
color: {color}
border: 1px solid {color}25
```
### Тогглы
```
width: 36px, height: 20px
border-radius: 10px
background: var(--purple) когда ON, var(--text-muted) когда OFF
Кружок: 16x16px, white, переезжает left 2px ↔ 18px
transition: 0.2s
```
### Сайдбар (учитель)
```
width: 220px
background: var(--surface)
border-right: 1px solid var(--border)
Навигация: кнопки полной ширины
Активная: background var(--purple) 12% opacity, цвет var(--purple), border-right 2px solid var(--purple)
```
### Нижняя навигация (ученик, мобайл)
```
position: fixed, bottom: 0
background: var(--surface)
border-top: 1px solid var(--border)
4 таба равной ширины
Активная: цвет var(--purple)
Неактивная: цвет var(--text-muted)
height: 56px
safe-area-inset-bottom для iPhone
```
---
## Чат
### Пузыри сообщений
**Ворон (слева):**
```
background: rgba(255,255,255,0.04)
border: 1px solid rgba(255,255,255,0.05)
border-radius: 12px 12px 12px 2px
color: var(--text-secondary)
max-width: 80%
```
**Ученик (справа):**
```
background: rgba(139,92,246,0.15)
border: 1px solid rgba(139,92,246,0.2)
border-radius: 12px 12px 2px 12px
color: var(--text)
max-width: 80%
```
### Аватары воронов
**Хугин:** 🔵 или кастомная иконка, цвет акцента `--indigo`
**Мунин:** 🟣 или кастомная иконка, цвет акцента `--purple`
Размер: 28x28px в чате, 20x20px в навигации.
### Typing indicator
Три точки, анимация pulsing:
```css
@keyframes typingDot {
  0%, 100% { opacity: 0.2; transform: translateY(0); }
  50% { opacity: 0.8; transform: translateY(-3px); }
}
/* Задержка: 0s, 0.2s, 0.4s для трёх точек */
```
### Поле ввода
```
position: sticky, bottom: 0
background: var(--surface)
border-top: 1px solid var(--border)
padding: 0.75rem
Текстовое поле: авто-высота, max 4 строки
Кнопка отправки: 36x36px, круглая, var(--purple), иконка ↑
```
---
## Анимации
### Переходы страниц
Не использовать тяжёлые page transitions. Достаточно:
- Fade-in контента при загрузке (opacity 0→1, 0.3s)
- Slide-in панелей справа (translateX 100%→0, 0.25s)
### Появление элементов (scroll)
```css
/* Intersection Observer trigger */
opacity: 0 → 1
transform: translateY(20px) → translateY(0)
transition: 0.6s ease
stagger: +0.1s на каждый элемент в списке
```
### Микро-взаимодействия
- Кнопки: `translateY(-1px)` при ховере, 0.2s
- Карточки: `translateY(-2px)` при ховере, 0.2s
- XP начисление: число подпрыгивает, зелёная вспышка
- Стрик: 🔥 слегка увеличивается, оранжевая вспышка
- Glow на primary кнопках: пульсирует мягко при ховере
### Переход Хугин → Мунин
```
Длительность: 2–3 секунды
1. Текущий чат fade-out (0.5s)
2. Экран с текстом "Хугин улетает..." + анимация (1s)
3. Фон плавно меняет оттенок (indigo → purple)
4. Текст "Мунин прилетает!" (0.5s)
5. Новый чат fade-in (0.5s)
```
---
## Spacing
Система на базе 4px:
| Токен | Значение | Использование |
|-------|----------|--------------|
| `space-1` | 4px | Внутри бейджей |
| `space-2` | 8px | Между мелкими элементами |
| `space-3` | 12px | Padding инпутов |
| `space-4` | 16px | Gap в сетках |
| `space-5` | 20px | Padding карточек (маленьких) |
| `space-6` | 24px | Padding карточек |
| `space-8` | 32px | Отступы между секциями |
| `space-10` | 40px | Padding страницы |
| `space-12` | 48px | Отступы между большими блоками |
| `space-16` | 64px | Вертикальные отступы секций |
---
## Адаптивность
### Breakpoints
```
mobile:  < 640px   — 1 колонка, нижняя навигация
tablet:  640–1024px — 1-2 колонки
desktop: ≥ 1024px  — полный layout, сайдбар
```
### Ученик
- **Мобайл (primary):** полноэкранные карточки, нижняя навигация 56px, чат full-screen
- **Десктоп:** центральная колонка max-width 700px, чат max-width 700px
### Учитель
- **Десктоп (primary):** сайдбар 220px + контент, сетки 2-4 колонки
- **Мобайл:** сайдбар скрыт за бургером, сетки 1 колонка, таблицы горизонтальный скролл
---
## Иконки
Использовать Lucide React (lucide-react). Не emoji для UI-элементов (кроме воронов Хугин/Мунин, где пока emoji как placeholder). Размер: 16px для инлайн, 20px для навигации, 24px для hero.
---
## Не делать
- Градиентный фиолетовый фон на весь блок — только точечные glow-акценты
- Белый текст на фиолетовом фоне — плохой контраст
- Чистый чёрный #000000 — всегда с фиолетовым подтоном
- Много теней — в тёмной теме иерархия через яркость, не тень
- Rounded-full на карточках — только на аватарах и бейджах
- Inter, Roboto, Arial — используем DM Sans + Space Mono
- Пестроту — максимум 2 акцентных цвета на экран (purple + один семантический)
