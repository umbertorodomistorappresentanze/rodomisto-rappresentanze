import { createElement, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarBlank } from "phosphor-react-native";

import { AppText } from "@/src/components/ui";
import { radius, spacing, useTheme } from "@/src/theme";

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(12, 0, 0, 0);
  return n;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmt(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parse(text: string, allowShortYear = true): Date | null {
  // Accetta G/M/AA(AA) con separatori / - . (es. 5/10/26, 05-10-2026)
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  if (m[3].length === 2 && !allowShortYear) return null;
  const dd = +m[1], mm = +m[2], yyyy = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
  if (d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}
/** Maschera di digitazione: accetta solo cifre e inserisce da sola le "/"
 *  (es. 12102026 -> 12/10/2026). Necessario perché sui telefoni la tastiera
 *  numerica spesso non ha il tasto "/" e la data veniva scartata. */
function maskDate(raw: string): string {
  if (/[/.-]/.test(raw)) {
    // l'utente scrive anche i separatori (es. 1/10/2026): completiamo solo
    // la seconda "/" se manca (12/102 -> 12/10/2)
    const parts = raw.split(/[/.-]/);
    if (parts.length === 2 && parts[1].length > 2) {
      return `${parts[0]}/${parts[1].slice(0, 2)}/${parts[1].slice(2, 6)}`;
    }
    return raw.slice(0, 10);
  }
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const QUICK = [
  { label: "Oggi", d: 0 },
  { label: "Ieri", d: 1 },
  { label: "2 gg fa", d: 2 },
  { label: "3 gg fa", d: 3 },
];

export function ActivityDateField({
  value,
  onChange,
  label = "Data dell'attività",
}: {
  value: Date;
  onChange: (d: Date) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [showPicker, setShowPicker] = useState(false);
  const [text, setText] = useState(fmt(value));
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);

  const focused = useRef(false);

  useEffect(() => {
    // Non riscrivere il testo mentre l'utente sta digitando.
    if (!focused.current) setText(fmt(value));
  }, [value]);

  const today = startOfDay(new Date());

  return (
    <View style={styles.wrap}>
      <AppText weight="medium" style={styles.label}>{label}</AppText>
      <View style={styles.chips}>
        {QUICK.map((q) => {
          const d = startOfDay(new Date(today.getTime() - q.d * 86400000));
          const active = sameDay(d, value);
          return (
            <Pressable
              key={q.label}
              testID={`activity-date-${q.d}`}
              onPress={() => { setError(null); onChange(d); }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <AppText weight="semibold" style={[styles.chipText, active && { color: colors.onBrand }]}>
                {q.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {Platform.OS === "web" && !typing ? (
        <View>
          <View style={styles.inputRow} testID="activity-date-calendar">
            <CalendarBlank size={18} color={colors.brand} weight="bold" />
            <AppText weight="semibold" style={styles.pickText}>{fmt(value)}</AppText>
            <AppText weight="semibold" style={styles.calHint}>Apri calendario</AppText>
            {/* Calendario nativo del browser/telefono: input date trasparente sopra la casella */}
            {createElement("input", {
              type: "date",
              "data-testid": "activity-date-native",
              "aria-label": "Apri calendario",
              value: toISODate(value),
              max: toISODate(new Date()),
              onClick: (e: any) => { setError(null); try { e.currentTarget.showPicker?.(); } catch { /* non supportato */ } },
              onChange: (e: any) => {
                const v: string = e.target.value;
                if (!v) return;
                const [y, m, d] = v.split("-").map(Number);
                const picked = new Date(y, m - 1, d);
                if (picked.getTime() > startOfDay(new Date()).getTime()) {
                  setError("La data non può essere futura.");
                  return;
                }
                setError(null);
                onChange(startOfDay(picked));
              },
              style: {
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                opacity: 0.011, cursor: "pointer", border: 0, padding: 0, margin: 0,
                fontSize: 16, colorScheme: "light",
              },
            })}
          </View>
          <Pressable testID="activity-date-type" onPress={() => setTyping(true)} hitSlop={8} style={styles.linkBtn}>
            <AppText weight="semibold" style={styles.link}>Oppure digita la data a mano</AppText>
          </Pressable>
        </View>
      ) : Platform.OS === "web" ? (
        <View>
        <View style={styles.inputRow}>
          <CalendarBlank size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="activity-date-input"
            autoFocus
            value={text}
            onChangeText={(raw) => {
              // cancellazione di un solo carattere: non rimettiamo subito la "/"
              const t = raw.length === text.length - 1 ? raw : maskDate(raw);
              setText(t);
              setError(null);
              // Durante la digitazione accettiamo solo l'anno a 4 cifre
              // (es. "05/10/20" non deve diventare 2020 mentre si scrive 2026).
              const p = parse(t, false);
              if (p && p.getTime() <= startOfDay(new Date()).getTime()) {
                setError(null);
                onChange(startOfDay(p));
              }
            }}
            onFocus={() => { focused.current = true; }}
            onBlur={() => {
              focused.current = false;
              const digits = text.replace(/\D/g, "");
              const p = parse(text) ?? (digits.length === 6 || digits.length === 8 ? parse(maskDate(digits)) : null);
              if (!p) {
                setError("Data non valida: usa GG/MM/AAAA. Resta impostato il " + fmt(value));
                setText(fmt(value));
              } else if (p.getTime() > startOfDay(new Date()).getTime()) {
                setError("La data non può essere futura. Resta impostato il " + fmt(value));
                setText(fmt(value));
              } else {
                setError(null);
                onChange(startOfDay(p));
                setText(fmt(p));
              }
            }}
            placeholder="GG/MM/AAAA"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            selectTextOnFocus
            style={styles.input}
          />
        </View>
          <Pressable testID="activity-date-use-calendar" onPress={() => setTyping(false)} hitSlop={8} style={styles.linkBtn}>
            <AppText weight="semibold" style={styles.link}>Usa il calendario</AppText>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable testID="activity-date-pick" onPress={() => setShowPicker(true)} style={styles.inputRow}>
            <CalendarBlank size={18} color={colors.brand} weight="bold" />
            <AppText weight="semibold" style={styles.pickText}>{fmt(value)}</AppText>
          </Pressable>
          {showPicker ? (
            <DateTimePicker
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "calendar"}
              locale="it-IT"
              value={value}
              maximumDate={new Date()}
              onChange={(_e, date) => {
                setShowPicker(false);
                if (date) onChange(startOfDay(date));
              }}
            />
          ) : null}
        </>
      )}
      {error ? <AppText testID="activity-date-error" style={styles.error}>{error}</AppText> : null}
      <AppText testID="activity-date-selected" style={styles.selected}>Data registrata: {fmt(value)}</AppText>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: c.surfaceSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: spacing.sm,
    },
    label: { fontSize: 13, color: c.onSurfaceTertiary },
    error: { fontSize: 12, color: c.error },
    calHint: { marginLeft: "auto", fontSize: 12, color: c.brand },
    linkBtn: { alignSelf: "flex-start", paddingVertical: spacing.xs, marginTop: 2 },
    link: { fontSize: 12, color: c.brand, textDecorationLine: "underline" },
    selected: { fontSize: 12, color: c.onSurfaceSecondary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: { backgroundColor: c.brand, borderColor: c.brand },
    chipText: { fontSize: 13, color: c.onSurface },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: 46,
    },
    input: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface, paddingVertical: 0 },
    pickText: { fontSize: 15, color: c.onSurface },
  });
}
