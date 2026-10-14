//! Reminders for lessons and note deadlines (`settings.reminders`), shown as Windows notifications.
//!
//! One background thread sleeps until the next minute starts, reads the settings the store already holds in
//! memory and shows what became due during that minute: one wake a minute and a few comparisons, nothing a
//! laptop would notice. Times are local wall time (lessons: weekday + "HH:MM", deadlines: "YYYY-MM-DDTHH:MM").
//! Nothing is shown for the time the app was not running, and after sleep only the last few minutes count, so
//! opening a laptop in the morning does not replay the night's reminders. During the quiet hours reminders do
//! not pop up or sound; they go straight to the Windows notification centre.

use std::collections::HashSet;
use std::time::Duration;

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::lang::pick;
use crate::layout::STORE_FILE;

/// Reminders due longer ago than this (minutes) are dropped instead of shown late (sleep, a stopped clock).
const CATCH_UP_MIN: i64 = 5;

struct LocalNow {
    /// Minutes since 1970-01-01 00:00 local wall time.
    minute: i64,
    /// ISO weekday, 1 = Monday.
    weekday: i64,
    /// Minutes since local midnight.
    of_day: i64,
    /// Milliseconds until the next minute starts.
    ms_to_next: u64,
}

/// Days since 1970-01-01 of a civil date (H. Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn local_now() -> LocalNow {
    // SAFETY: plain Win32 call without pointers.
    let t = unsafe { GetLocalTime() };
    let day = days_from_civil(t.wYear as i64, t.wMonth as i64, t.wDay as i64);
    let of_day = t.wHour as i64 * 60 + t.wMinute as i64;
    let weekday = if t.wDayOfWeek == 0 { 7 } else { t.wDayOfWeek as i64 };
    let into_minute = t.wSecond as u64 * 1000 + t.wMilliseconds as u64;
    LocalNow { minute: day * 1440 + of_day, weekday, of_day, ms_to_next: 60_000 - into_minute.min(59_999) }
}

fn parse_hm(s: &str) -> Option<i64> {
    let (h, m) = s.split_once(':')?;
    let (h, m) = (h.trim().parse::<i64>().ok()?, m.trim().parse::<i64>().ok()?);
    ((0..24).contains(&h) && (0..60).contains(&m)).then_some(h * 60 + m)
}

/// "YYYY-MM-DDTHH:MM" to minutes since 1970 local.
fn parse_deadline(s: &str) -> Option<i64> {
    let (date, time) = s.split_once('T')?;
    let mut parts = date.split('-');
    let y = parts.next()?.parse::<i64>().ok()?;
    let m = parts.next()?.parse::<i64>().ok()?;
    let d = parts.next()?.parse::<i64>().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(days_from_civil(y, m, d) * 1440 + parse_hm(time)?)
}

fn num(v: &Value, key: &str, default: i64, min: i64, max: i64) -> i64 {
    v.get(key).and_then(Value::as_f64).map(|x| (x.round() as i64).clamp(min, max)).unwrap_or(default)
}

fn flag(v: &Value, key: &str, default: bool) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

/// Russian plural form, as `plural` in src/i18n/ru.ts.
fn plural<'a>(n: i64, one: &'a str, few: &'a str, many: &'a str) -> &'a str {
    let (n10, n100) = (n.abs() % 10, n.abs() % 100);
    if n10 == 1 && n100 != 11 {
        one
    } else if (2..=4).contains(&n10) && !(12..=14).contains(&n100) {
        few
    } else {
        many
    }
}

/// Kazakh: «10 минут», «2 сағат», «1 сағат 30 минут», «3 күн», «1 күн 2 сағат» (a noun after a number stays singular),
/// or with the last word in the ablative for «… кейін»: «10 минуттан», «2 сағаттан», «3 күннен».
fn span_kk(minutes: i64, ablative: bool) -> String {
    let (d, h, m) = (minutes / 1440, (minutes % 1440) / 60, minutes % 60);
    let (minute, hour, day) = if ablative { ("минуттан", "сағаттан", "күннен") } else { ("минут", "сағат", "күн") };
    match (d, h, m) {
        (0, 0, m) => format!("{m} {minute}"),
        (0, h, 0) => format!("{h} {hour}"),
        (0, h, m) => format!("{h} сағат {m} {minute}"),
        (d, 0, _) => format!("{d} {day}"),
        (d, h, _) => format!("{d} күн {h} {hour}"),
    }
}

/// The deadline's line: «Дедлайн через 2 часа», "Deadline in 2 hours", «Мерзімге 2 сағат қалды».
fn deadline_in(minutes: i64) -> String {
    if crate::lang::current() == crate::lang::Lang::Kk {
        return format!("Мерзімге {} қалды", span_kk(minutes, false));
    }
    format!("{} {}", pick("Дедлайн", "Deadline", "Мерзім"), in_time(minutes))
}

/// "через 10 минут", "через 2 часа", "через 1 ч 30 мин", "через 3 дня"; in English "in 10 minutes", "in 2 hours",
/// "in 1 h 30 min", "in 3 days"; in Kazakh «10 минуттан кейін», «1 сағат 30 минуттан кейін».
fn in_time(minutes: i64) -> String {
    let (d, h, m) = (minutes / 1440, (minutes % 1440) / 60, minutes % 60);
    if crate::lang::current() == crate::lang::Lang::Kk {
        return format!("{} кейін", span_kk(minutes, true));
    }
    if crate::lang::current() == crate::lang::Lang::En {
        let unit = |n: i64, one: &str, many: &str| format!("{n} {}", if n == 1 { one } else { many });
        let s = match (d, h, m) {
            (0, 0, m) => unit(m, "minute", "minutes"),
            (0, h, 0) => unit(h, "hour", "hours"),
            (0, h, m) => format!("{h} h {m} min"),
            (d, 0, _) => unit(d, "day", "days"),
            (d, h, _) => format!("{} {h} h", unit(d, "day", "days")),
        };
        return format!("in {s}");
    }
    let s = match (d, h, m) {
        (0, 0, m) => format!("{m} {}", plural(m, "минуту", "минуты", "минут")),
        (0, h, 0) => format!("{h} {}", plural(h, "час", "часа", "часов")),
        (0, h, m) => format!("{h} ч {m} мин"),
        (d, 0, _) => format!("{d} {}", plural(d, "день", "дня", "дней")),
        (d, h, _) => format!("{d} {} {h} ч", plural(d, "день", "дня", "дней")),
    };
    format!("через {s}")
}

/// First line of a note, kept short for the notification.
fn headline(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut out: String = line.chars().take(80).collect();
    if line.chars().count() > 80 {
        out.push('…');
    }
    out
}

/// Inside the quiet hours `from`..`to` (may wrap past midnight; equal times mean no quiet hours)?
fn quiet_now(rem: &Value, of_day: i64) -> bool {
    if !flag(rem, "quiet", false) {
        return false;
    }
    let (Some(from), Some(to)) = (text(rem, "quietFrom").and_then(parse_hm), text(rem, "quietTo").and_then(parse_hm)) else {
        return false;
    };
    if from <= to {
        (from..to).contains(&of_day)
    } else {
        of_day >= from || of_day < to
    }
}

struct Due {
    /// Identifies one reminder (item and its time), so it is shown once.
    key: String,
    title: String,
    body: String,
}

/// Lessons starting `before` minutes after a minute in (`from`, `now`]: today's and tomorrow's (a lesson at
/// 00:05 is reminded the evening before).
fn lessons_due(settings: &Value, rem: &Value, from: i64, now: &LocalNow, out: &mut Vec<Due>) {
    if !flag(rem, "lessons", true) {
        return;
    }
    let Some(lessons) = settings.pointer("/schedule/lessons").and_then(Value::as_array) else { return };
    let before = num(rem, "lessonBefore", 10, 0, 180);
    let private = settings.pointer("/schedule/privacy").and_then(Value::as_bool).unwrap_or(false);
    let midnight = now.minute - now.of_day;
    for offset in 0..2 {
        let weekday = (now.weekday - 1 + offset) % 7 + 1;
        for lesson in lessons {
            if lesson.get("day").and_then(Value::as_i64) != Some(weekday) {
                continue;
            }
            let Some(start) = text(lesson, "start").and_then(parse_hm) else { continue };
            let begins = midnight + offset * 1440 + start;
            let at = begins - before;
            // Shown late (after sleep): the text says the time really left; a lesson already started is skipped.
            let left = begins - now.minute;
            if at <= from || at > now.minute || left < 0 {
                continue;
            }
            let id = text(lesson, "id").unwrap_or("");
            let when = if left == 0 { pick("Начинается сейчас", "Starts now", "Қазір басталады").to_string() } else { capitalize(&in_time(left)) };
            let lesson_word = pick("Пара", "Class", "Сабақ");
            // Privacy on: neither the subject nor the room appears on screen.
            let (title, body) = match (private, text(lesson, "title"), text(lesson, "room")) {
                (true, _, _) => (lesson_word.to_string(), when),
                (false, title, Some(room)) => {
                    (title.unwrap_or(lesson_word).to_string(), format!("{when}, {} {room}", pick("аудитория", "room", "аудитория")))
                }
                (false, title, None) => (title.unwrap_or(lesson_word).to_string(), when),
            };
            out.push(Due { key: format!("l:{id}:{at}"), title, body });
        }
    }
}

/// Note deadlines: a first reminder `deadlineFirst` minutes before, then every `deadlineRepeat` minutes
/// (0 = no repeats) until the deadline, and one at the deadline itself when `atDeadline` is on. Done notes
/// and notes with reminders switched off (`remind: false`) are skipped.
fn deadlines_due(settings: &Value, rem: &Value, from: i64, now: &LocalNow, out: &mut Vec<Due>) {
    if !flag(rem, "deadlines", true) {
        return;
    }
    let Some(notes) = settings.pointer("/notes/notes").and_then(Value::as_array) else { return };
    let first = num(rem, "deadlineFirst", 1440, 0, 20_160);
    let repeat = num(rem, "deadlineRepeat", 0, 0, 10_080);
    let at_deadline = flag(rem, "atDeadline", true);
    let private = settings.pointer("/notes/privacy").and_then(Value::as_bool).unwrap_or(false);
    let (lo, hi) = (from + 1, now.minute);
    for note in notes {
        if flag(note, "done", false) || !flag(note, "remind", true) {
            continue;
        }
        let Some(deadline) = text(note, "deadline").and_then(parse_deadline) else { continue };
        let mut times: Vec<i64> = Vec::new();
        if first > 0 {
            let start = deadline - first;
            if (lo..=hi).contains(&start) {
                times.push(start);
            }
            if repeat > 0 {
                // start + k * repeat (k >= 1) before the deadline, within (from, now]: a handful at most.
                let last = hi.min(deadline - 1);
                let k_lo = ((lo - start + repeat - 1).div_euclid(repeat)).max(1);
                let k_hi = (last - start).div_euclid(repeat);
                for k in k_lo..=k_hi {
                    times.push(start + k * repeat);
                }
            }
        }
        if at_deadline && (lo..=hi).contains(&deadline) {
            times.push(deadline);
        }
        if times.is_empty() {
            continue;
        }
        let id = text(note, "id").unwrap_or("");
        let title = match (private, note.get("text").and_then(Value::as_str).map(headline)) {
            (false, Some(h)) if !h.is_empty() => h,
            _ => pick("Заметка", "Note", "Жазба").to_string(),
        };
        for at in times {
            // From the time really left: a reminder shown late (after sleep) must not promise more time.
            let left = deadline - now.minute;
            let body = if at >= deadline || left <= 0 {
                pick("Дедлайн наступил", "The deadline is now", "Мерзім жетті").to_string()
            } else {
                deadline_in(left)
            };
            out.push(Due { key: format!("n:{id}:{at}"), title: title.clone(), body });
        }
    }
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// Start the reminder thread (once, at startup).
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut shown: HashSet<String> = HashSet::new();
        let mut last = local_now().minute;
        loop {
            std::thread::sleep(Duration::from_millis(local_now().ms_to_next + 250));
            let now = local_now();
            if now.minute <= last {
                // The clock was set back (or the sleep woke early): count from here.
                last = now.minute;
                continue;
            }
            let from = last.max(now.minute - CATCH_UP_MIN);
            last = now.minute;
            let Some(settings) = app.store(STORE_FILE).ok().and_then(|s| s.get("settings")) else { continue };
            let rem = settings.get("reminders").cloned().unwrap_or(Value::Null);
            let quiet = quiet_now(&rem, now.of_day);
            let silent = !flag(&rem, "sound", true);
            let mut due = Vec::new();
            lessons_due(&settings, &rem, from, &now, &mut due);
            deadlines_due(&settings, &rem, from, &now, &mut due);
            for d in due {
                if shown.insert(d.key) {
                    let _ = crate::notify::show(&d.title, &d.body, silent, quiet);
                }
            }
            // Keys carry their own time and never come back; keep the set small.
            if shown.len() > 4096 {
                shown.clear();
            }
        }
    });
}

/// «Проверить уведомление» on the reminders page (honours the sound switch).
pub fn test(app: &AppHandle) -> Result<(), String> {
    let silent = app
        .store(STORE_FILE)
        .ok()
        .and_then(|s| s.get("settings"))
        .and_then(|s| s.pointer("/reminders/sound").and_then(Value::as_bool))
        .is_some_and(|sound| !sound);
    crate::notify::show("AITU Desk", pick("Так выглядят напоминания о парах и дедлайнах", "This is how reminders about classes and deadlines look", "Сабақтар мен мерзімдер туралы еске салғыштар осылай көрінеді"), silent, false)
}
