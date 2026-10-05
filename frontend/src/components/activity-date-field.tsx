import { useEffect, useState } from "react";
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
function parse(text: string): Date | null {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = +m[1], mm = +m[2], yyyy = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
  if (d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
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
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [showPicker, setShowPicker] = useState(false);
  const [text, setText] = useState(fmt(value));

  useEffect(() => {
    setText(fmt(value));
  }, [value]);

  const today = startOfDay(new Date());

  return (
    <View style={styles.wrap}>
      <AppText weight="medium" style={styles.label}>Data dell&apos;attività</AppText>
      <View style={styles.chips}>
        {QUICK.map((q) => {
          const d = startOfDay(new Date(today.getTime() - q.d * 86400000));
          const active = sameDay(d, value);
          return (
            <Pressable
              key={q.label}
              testID={`activity-date-${q.d}`}
              onPress={() => onChange(d)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <AppText weight="semibold" style={[styles.chipText, active && { color: colors.onBrand }]}>
                {q.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {Platform.OS === "web" ? (
        <View style={styles.inputRow}>
          <CalendarBlank size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="activity-date-input"
            value={text}
            onChangeText={(t) => {
              setText(t);
              const p = parse(t);
              if (p) onChange(startOfDay(p));
            }}
            placeholder="GG/MM/AAAA"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
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
